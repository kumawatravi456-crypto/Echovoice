"""FastAPI application factory for Project Echo."""

from __future__ import annotations

import logging
import asyncio
import math

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import Settings
from app.api.middleware import VideoUploadBodyLimitMiddleware
from app.services.hand_inference import HandInferenceService
from app.services.hand_classifier import HandClassifierService
from app.services.hand_landmarker import HandLandmarkerService
from app.services.conversation_generator import ConversationGeneratorService
from app.services.scribe_token import ScribeTokenService


logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or Settings.from_env()
    if (
        active_settings.hand_video_max_upload_bytes <= 0
        or not math.isfinite(active_settings.hand_video_max_duration_seconds)
        or active_settings.hand_video_max_duration_seconds <= 0
        or active_settings.hand_video_max_frames <= 0
        or active_settings.hand_video_max_width <= 0
        or active_settings.hand_video_max_height <= 0
        or not math.isfinite(active_settings.hand_detector_timeout_seconds)
        or active_settings.hand_detector_timeout_seconds <= 0
        or active_settings.hand_video_max_concurrent_jobs <= 0
        or not math.isfinite(active_settings.conversation_timeout_seconds)
        or active_settings.conversation_timeout_seconds <= 0
        or not math.isfinite(active_settings.conversation_gesture_max_age_seconds)
        or active_settings.conversation_gesture_max_age_seconds <= 0
    ):
        raise ValueError("hand video limits and concurrency must be positive")
    application = FastAPI(title="Project Echo API", version="0.1.0")
    application.state.settings = active_settings
    application.state.conversation_generator = ConversationGeneratorService(active_settings)
    application.state.scribe_token_service = ScribeTokenService(active_settings.elevenlabs_api_key)
    application.state.hand_video_job_semaphore = asyncio.Semaphore(active_settings.hand_video_max_concurrent_jobs)
    application.state.hand_landmarker = HandLandmarkerService(
        task_path=active_settings.hand_landmarker_task_path,
        timeout_seconds=active_settings.hand_detector_timeout_seconds,
    )
    application.state.hand_inference = None
    try:
        application.state.hand_classifier = HandClassifierService.load(
            active_settings.hand_model_path,
            active_settings.hand_metadata_path,
        )
        application.state.hand_model_error = None
        application.state.hand_inference = HandInferenceService(application.state.hand_classifier)
    except Exception as error:
        logger.exception("Hand classifier failed to load; API will start in degraded mode")
        application.state.hand_classifier = None
        application.state.hand_model_error = f"{type(error).__name__}: model artifacts are unavailable or invalid"
    application.include_router(router)
    application.add_middleware(
        VideoUploadBodyLimitMiddleware,
        max_request_bytes=active_settings.hand_video_max_upload_bytes + 64 * 1024,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_settings.frontend_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    return application


app = create_app()
