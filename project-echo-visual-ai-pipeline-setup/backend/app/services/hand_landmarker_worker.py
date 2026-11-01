"""Child-process worker. MediaPipe imports and native graph init live here only."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Any


class _VideoRejected(Exception):
    exit_code = 2


class _DurationExceeded(_VideoRejected):
    exit_code = 3


class _FrameLimitExceeded(_VideoRejected):
    exit_code = 4


class _DimensionLimitExceeded(_VideoRejected):
    exit_code = 5


def validate_decoded_frame(
    frame: Any,
    frame_index: int,
    timestamp_ms: int,
    *,
    video_position_ms: float | None = None,
    max_duration_seconds: float | None,
    max_frames: int | None,
    max_width: int | None,
    max_height: int | None,
) -> None:
    """Apply hard limits to decoded frames, independently of container claims."""
    if max_frames is not None and frame_index >= max_frames:
        raise _FrameLimitExceeded("decoded frame count exceeds configured limit")
    if max_duration_seconds is not None and timestamp_ms >= max_duration_seconds * 1000.0:
        raise _DurationExceeded("decoded timestamps exceed configured duration")
    if (
        max_duration_seconds is not None
        and video_position_ms is not None
        and math.isfinite(video_position_ms)
        and video_position_ms > max_duration_seconds * 1000.0
    ):
        raise _DurationExceeded("decoder presentation timestamp exceeds configured duration")
    shape = getattr(frame, "shape", ())
    if len(shape) < 2 or int(shape[0]) <= 0 or int(shape[1]) <= 0:
        raise _VideoRejected("decoded frame has invalid dimensions")
    if max_width is not None and int(shape[1]) > max_width:
        raise _DimensionLimitExceeded("decoded frame width exceeds configured limit")
    if max_height is not None and int(shape[0]) > max_height:
        raise _DimensionLimitExceeded("decoded frame height exceeds configured limit")


def stage(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def run(
    video_path: Path,
    model_path: Path,
    output_path: Path,
    *,
    max_duration_seconds: float | None = None,
    max_frames: int | None = None,
    max_width: int | None = None,
    max_height: int | None = None,
) -> int:
    capture: Any = None
    landmarker: Any = None
    current_stage = "imports"
    try:
        import cv2
        import mediapipe as mp
        import numpy as np
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

        stage(f"[IMPORT] MediaPipe {mp.__version__}; OpenCV {cv2.__version__}; NumPy {np.__version__}")
        current_stage = "model asset validation"
        if not model_path.is_file() or model_path.stat().st_size == 0:
            raise FileNotFoundError(f"hand-landmarker model asset is missing or empty: {model_path}")
        stage(f"[MODEL] task asset present: {model_path}")

        current_stage = "video open"
        capture = cv2.VideoCapture(str(video_path))
        if capture is None or not capture.isOpened():
            raise _VideoRejected("OpenCV could not open the video file")
        stage("[VIDEO] opened")

        reported_fps = float(capture.get(cv2.CAP_PROP_FPS))
        if math.isfinite(reported_fps) and reported_fps > 0:
            timestamp_fps = reported_fps
        else:
            reported_fps = 0.0
            if max_duration_seconds is not None:
                raise _VideoRejected("video duration cannot be validated without a usable frame rate")
            timestamp_fps = 30.0

        # Container metadata can reject obvious over-limit files early, but decoded
        # frame count, timestamps, and actual pixel dimensions are checked below too.
        if max_frames is not None:
            reported_frames = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            if math.isfinite(reported_frames) and reported_frames > max_frames:
                raise _FrameLimitExceeded("container frame count exceeds configured limit")
        if max_duration_seconds is not None:
            reported_frames = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            if (
                math.isfinite(reported_frames)
                and reported_frames > 0
                and reported_frames / timestamp_fps > max_duration_seconds
            ):
                raise _DurationExceeded("container duration estimate exceeds configured limit")
        if max_width is not None and max_height is not None:
            reported_width = float(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            reported_height = float(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if (
                (math.isfinite(reported_width) and reported_width > max_width)
                or (math.isfinite(reported_height) and reported_height > max_height)
            ):
                raise _DimensionLimitExceeded("container dimensions exceed configured limit")

        current_stage = "landmarker initialization"
        options = HandLandmarkerOptions(
            base_options=BaseOptions(
                model_asset_path=str(model_path),
                delegate=BaseOptions.Delegate.CPU,
            ),
            running_mode=RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        stage("[LANDMARKER] initializing VIDEO mode with CPU delegate; num_hands=2")
        landmarker = HandLandmarker.create_from_options(options)
        stage("[LANDMARKER] initialized")

        current_stage = "frame detection"
        landmark_frames: list[Any] = []
        detection_frames: list[Any] = []
        handedness_frames: list[Any] = []
        handedness_score_frames: list[Any] = []
        timestamps: list[int] = []
        previous_timestamp = -1
        frame_index = 0
        while True:
            success, frame = capture.read()
            if not success:
                break
            if frame is None:
                raise _VideoRejected("video contains an empty decoded frame")

            timestamp_ms = max(previous_timestamp + 1, int(round(frame_index * 1000.0 / timestamp_fps)))
            position_ms = float(capture.get(cv2.CAP_PROP_POS_MSEC))
            validate_decoded_frame(
                frame,
                frame_index,
                timestamp_ms,
                video_position_ms=position_ms,
                max_duration_seconds=max_duration_seconds,
                max_frames=max_frames,
                max_width=max_width,
                max_height=max_height,
            )
            previous_timestamp = timestamp_ms
            rgb_frame = np.ascontiguousarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            frame_landmarks = np.zeros((2, 21, 3), dtype=np.float32)
            frame_mask = np.zeros((2,), dtype=np.bool_)
            frame_handedness = np.full((2,), "", dtype="U8")
            frame_handedness_score = np.zeros((2,), dtype=np.float32)
            for hand_index, points in enumerate(result.hand_landmarks[:2]):
                if len(points) != 21:
                    continue
                frame_landmarks[hand_index] = np.asarray(
                    [(point.x, point.y, point.z) for point in points], dtype=np.float32
                )
                frame_mask[hand_index] = True
                if hand_index < len(result.handedness) and result.handedness[hand_index]:
                    category = result.handedness[hand_index][0]
                    frame_handedness[hand_index] = category.category_name or category.display_name or ""
                    frame_handedness_score[hand_index] = float(category.score)

            landmark_frames.append(frame_landmarks)
            detection_frames.append(frame_mask)
            handedness_frames.append(frame_handedness)
            handedness_score_frames.append(frame_handedness_score)
            timestamps.append(timestamp_ms)
            frame_index += 1

        if not timestamps:
            raise _VideoRejected("video opened but yielded no decodable frames")
        if max_duration_seconds is not None and frame_index / timestamp_fps > max_duration_seconds:
            raise _DurationExceeded("decoded frame count and rate exceed configured duration")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            output_path,
            landmarks=np.stack(landmark_frames, axis=0),
            detection_mask=np.stack(detection_frames, axis=0),
            handedness=np.stack(handedness_frames, axis=0),
            handedness_score=np.stack(handedness_score_frames, axis=0),
            timestamps_ms=np.asarray(timestamps, dtype=np.int64),
            source_fps=np.asarray(reported_fps, dtype=np.float32),
            timestamp_fps=np.asarray(timestamp_fps, dtype=np.float32),
            timestamp_basis=np.asarray("frame_index / timestamp_fps"),
            class_label=np.asarray("UNKNOWN"),
            source_filename=np.asarray(video_path.name),
            source_relative_path=np.asarray(f"inference/{video_path.name}"),
        )
        detected = int(np.count_nonzero(np.any(np.stack(detection_frames, axis=0), axis=1)))
        stage(f"[DETECTION] complete: {frame_index} frames; hands present in {detected} frames")
        return 0
    except _VideoRejected as error:
        stage(f"[REJECTED] {type(error).__name__}")
        return error.exit_code
    except Exception as error:
        stage(f"[ERROR] {current_stage}: {type(error).__name__}: {error}")
        return 1
    finally:
        if capture is not None:
            try:
                capture.release()
                stage("[CLEANUP] camera released")
            except Exception as error:
                stage(f"[CLEANUP WARNING] camera release: {type(error).__name__}: {error}")
        if landmarker is not None:
            try:
                landmarker.close()
                stage("[CLEANUP] landmarker closed")
            except Exception as error:
                stage(f"[CLEANUP WARNING] landmarker close: {type(error).__name__}: {error}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-duration-seconds", type=float)
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--max-width", type=int)
    parser.add_argument("--max-height", type=int)
    args = parser.parse_args()
    return run(
        args.video.expanduser().resolve(),
        args.model.expanduser().resolve(),
        args.output.expanduser().resolve(),
        max_duration_seconds=args.max_duration_seconds,
        max_frames=args.max_frames,
        max_width=args.max_width,
        max_height=args.max_height,
    )


if __name__ == "__main__":
    raise SystemExit(main())
