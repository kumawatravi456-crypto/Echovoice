"""HTTP endpoints for service health and precomputed hand-feature inference."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from app.schemas import (
    ConversationGenerateRequest,
    ConversationGenerateResponse,
    HandFeaturesRequest,
    HandFeaturesResponse,
    HandVideoInferenceResponse,
    ScribeTokenResponse,
)
from app.services.conversation_generator import (
    ConversationGeneratorService,
    ConversationConfigurationError,
    ConversationProviderError,
    ConversationTimeoutError,
)
from app.services.scribe_token import ScribeProviderError, ScribeTokenConfigurationError
from app.services.hand_classifier import HandClassifierService, InvalidFeatureInput, ModelArtifactError
from app.services.hand_inference import HandInferenceService
from app.services.hand_landmarker import (
    DetectorTimeoutError,
    DetectorWorkerError,
    HandLandmarkerService,
    InvalidVideoContentError,
    InvalidVideoInputError,
    LandmarkOutputError,
    MissingTaskAssetError,
    VideoDimensionLimitError,
    VideoDurationLimitError,
    VideoFrameLimitError,
)
from app.services.landmark_validation import InsufficientLandmarkSequence


logger = logging.getLogger(__name__)
router = APIRouter()
VIDEO_TYPES_BY_EXTENSION = {
    ".mp4": {"video/mp4"},
    ".mov": {"video/quicktime"},
    ".avi": {"video/x-msvideo", "video/avi"},
    ".mkv": {"video/x-matroska"},
    ".webm": {"video/webm"},
}


class UploadTooLargeError(ValueError):
    pass


def _classifier(request: Request) -> HandClassifierService:
    service = request.app.state.hand_classifier
    if service is None:
        raise HTTPException(status_code=503, detail="Hand classifier is unavailable; check model status.")
    return service


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/v1/models/status")
def model_status(request: Request) -> dict[str, object]:
    service = request.app.state.hand_classifier
    if service is None:
        return {
            "status": "degraded",
            "models": {"hand_classifier": {"status": "unavailable", "error": request.app.state.hand_model_error}},
        }
    return {"status": "ready", "models": {"hand_classifier": service.status()}}


@router.get("/api/v1/transcription/scribe-token", response_model=ScribeTokenResponse)
async def create_scribe_token(request: Request, response: Response) -> ScribeTokenResponse:
    settings = request.app.state.settings
    origin = request.headers.get("origin")
    if not origin or origin.rstrip("/") not in settings.frontend_origins:
        raise HTTPException(status_code=403, detail="Transcription session cannot be started from this origin.")
    try:
        token = await request.app.state.scribe_token_service.create_token()
    except ScribeTokenConfigurationError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "scribe_not_configured", "message": "Live transcription is not configured."},
        ) from error
    except ScribeProviderError as error:
        logger.warning("Scribe token request failed (%s)", type(error.__cause__).__name__ if error.__cause__ else "provider")
        raise HTTPException(
            status_code=503,
            detail={"code": "scribe_unavailable", "message": "Live transcription is temporarily unavailable."},
        ) from error
    response.headers["Cache-Control"] = "no-store"
    return ScribeTokenResponse(token=token)


@router.post("/api/v1/inference/hand/features", response_model=HandFeaturesResponse)
def predict_hand_features(body: HandFeaturesRequest, request: Request) -> dict[str, object]:
    service = _classifier(request)
    try:
        return service.predict(body.features)
    except InvalidFeatureInput as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ModelArtifactError as error:
        logger.exception("Hand classifier prediction failed")
        raise HTTPException(status_code=503, detail="Hand classifier could not produce a prediction.") from error


@router.post("/api/v1/conversation/generate", response_model=ConversationGenerateResponse)
def generate_conversation_response(
    body: ConversationGenerateRequest,
    request: Request,
) -> ConversationGenerateResponse:
    service: ConversationGeneratorService = request.app.state.conversation_generator
    try:
        return service.generate(body)
    except ConversationConfigurationError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "conversation_not_configured", "message": "Conversation response generation is not configured."},
        ) from error
    except ConversationTimeoutError as error:
        raise HTTPException(
            status_code=504,
            detail={"code": "conversation_timeout", "message": "Conversation response generation timed out. Try again."},
        ) from error
    except ConversationProviderError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "conversation_unavailable", "message": "Conversation response generation is temporarily unavailable."},
        ) from error
    except Exception as error:
        logger.error("Unexpected conversation generation error: %s", type(error).__name__)
        raise HTTPException(
            status_code=503,
            detail={"code": "conversation_unavailable", "message": "Conversation response generation is temporarily unavailable."},
        ) from error


def _copy_bounded_upload(source: Any, destination: Path, max_bytes: int) -> int:
    """Stream the parser's spooled upload to disk without materializing it in memory."""
    source.seek(0)
    copied = 0
    with destination.open("wb") as output:
        while True:
            chunk = source.read(64 * 1024)
            if not chunk:
                break
            copied += len(chunk)
            if copied > max_bytes:
                raise UploadTooLargeError
            output.write(chunk)
    return copied


def _process_video_upload(
    upload_file: Any,
    suffix: str,
    max_upload_bytes: int,
    max_duration_seconds: float,
    max_frames: int,
    max_width: int,
    max_height: int,
    detector: HandLandmarkerService,
    inference: HandInferenceService,
) -> dict[str, Any]:
    """Own the request-scoped video file and run blocking work in its caller thread."""
    with tempfile.TemporaryDirectory(prefix="echo-hand-upload-") as temporary_directory:
        video_path = Path(temporary_directory) / f"upload{suffix}"
        _copy_bounded_upload(upload_file, video_path, max_upload_bytes)
        raw_arrays = detector.process_video(
            video_path,
            max_duration_seconds=max_duration_seconds,
            max_frames=max_frames,
            max_width=max_width,
            max_height=max_height,
        )
        result = inference.predict_landmarks(raw_arrays)
        detection_mask = raw_arrays["detection_mask"]
        frames_processed = int(detection_mask.shape[0])
        frames_with_hands = int(detection_mask.any(axis=1).sum())
        frames_with_slot0 = int(detection_mask[:, 0].sum())
        warnings = ["Model scores are uncalibrated and are not reliable confidence estimates."]
        if frames_with_hands < frames_processed:
            warnings.append("No hand was detected in every frame.")
        if frames_with_slot0 < frames_processed:
            warnings.append("Slot 0 was not valid in every frame; the trained classifier uses slot 0 geometry.")
        return {
            "frames_processed": frames_processed,
            "frames_with_detected_hands": frames_with_hands,
            "frames_with_valid_slot0_observations": frames_with_slot0,
            "predicted_label": result.classifier_result["predicted_label"],
            "uncalibrated_scores": result.classifier_result["uncalibrated_scores"],
            "warnings": warnings,
        }


def _video_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


@router.post("/api/v1/inference/hand/video", response_model=HandVideoInferenceResponse)
async def predict_hand_video(
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    settings = request.app.state.settings
    filename = file.filename or ""
    suffix = Path(filename).suffix.casefold()
    accepted_mimes = VIDEO_TYPES_BY_EXTENSION.get(suffix)
    if accepted_mimes is None or (file.content_type or "").casefold() not in accepted_mimes:
        await file.close()
        raise _video_error(415, "unsupported_video_type", "Use a supported video extension and matching video MIME type.")

    detector = request.app.state.hand_landmarker
    inference = request.app.state.hand_inference
    if detector is None or inference is None:
        await file.close()
        raise _video_error(503, "hand_inference_unavailable", "Hand video inference is unavailable.")

    semaphore = request.app.state.hand_video_job_semaphore
    if semaphore.locked():
        await file.close()
        raise _video_error(429, "detector_busy", "Hand video inference capacity is currently full.")
    try:
        await semaphore.acquire()
    except BaseException:
        await file.close()
        raise
    try:
        try:
            result = await run_in_threadpool(
                _process_video_upload,
                file.file,
                suffix,
                settings.hand_video_max_upload_bytes,
                settings.hand_video_max_duration_seconds,
                settings.hand_video_max_frames,
                settings.hand_video_max_width,
                settings.hand_video_max_height,
                detector,
                inference,
            )
        except UploadTooLargeError as error:
            limit_mb = settings.hand_video_max_upload_bytes / (1024 * 1024)
            raise _video_error(
                413, "upload_too_large", f"Video upload exceeds the {limit_mb:g} MB size limit."
            ) from error
        except (VideoDurationLimitError, VideoFrameLimitError, VideoDimensionLimitError) as error:
            if isinstance(error, VideoDurationLimitError):
                code = "video_too_long"
                message = f"Video duration exceeds the {settings.hand_video_max_duration_seconds:g}-second limit."
            elif isinstance(error, VideoFrameLimitError):
                code = "too_many_frames"
                message = f"Video exceeds the {settings.hand_video_max_frames} decoded-frame limit."
            else:
                code = "video_dimensions_too_large"
                message = (
                    f"Video dimensions exceed {settings.hand_video_max_width} × "
                    f"{settings.hand_video_max_height}."
                )
            raise _video_error(413, code, message) from error
        except (InvalidVideoContentError, InvalidVideoInputError) as error:
            raise _video_error(422, "invalid_video", "The uploaded file is not a readable video.") from error
        except InsufficientLandmarkSequence as error:
            raise _video_error(422, "no_usable_hand_sequence", "No usable slot-0 hand sequence was detected.") from error
        except DetectorTimeoutError as error:
            logger.error(
                "Isolated hand detector timed out: message=%s stdout=%r stderr=%r",
                str(error),
                error.stdout,
                error.stderr,
            )
            raise _video_error(504, "detector_timeout", "Hand landmark detection timed out.")
        except MissingTaskAssetError as error:
            raise _video_error(503, "detector_unavailable", "Hand landmark detection is unavailable.") from error
        except LandmarkOutputError as error:
            logger.warning("Hand detector returned invalid landmark output")
            raise _video_error(503, "detector_output_invalid", "Hand landmark detection returned invalid output.") from error
        except DetectorWorkerError as error:
            logger.error(
                "Isolated hand detector worker failed: type=%s exit_code=%s message=%s stdout=%r stderr=%r",
                type(error).__name__,
                error.exit_code,
                str(error),
                error.stdout,
                error.stderr,
            )
            raise _video_error(503, "detector_failed", "Hand landmark detection failed.") from error
        except Exception as error:
            logger.exception("Unexpected hand video inference failure")
            raise _video_error(503, "inference_failed", "Hand video inference could not be completed.") from error
        return result
    finally:
        semaphore.release()
        await file.close()
