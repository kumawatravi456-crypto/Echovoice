#!/usr/bin/env python3
"""One-shot MediaPipe VIDEO-mode and default-camera readiness diagnostic.

This performs exactly one initialization, one camera read, and at most one
detection call. Native process aborts cannot be caught by Python; do not retry
automatically if the process exits abnormally.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = PROJECT_ROOT / "models" / "hand_landmarker.task"


def _stage(label: str, detail: str) -> None:
    print(f"[{label}] {detail}", flush=True)


def run_diagnostic(model_path: Path, camera_index: int) -> int:
    capture: Any = None
    landmarker: Any = None
    current_stage = "imports"
    try:
        import cv2
        import mediapipe as mp
        import numpy as np
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

        _stage("IMPORT", f"OK: mediapipe {mp.__version__}, OpenCV {cv2.__version__}, NumPy {np.__version__}")

        current_stage = "model asset check"
        model_path = model_path.expanduser().resolve()
        if not model_path.is_file():
            raise FileNotFoundError(f"hand-landmarker model asset not found: {model_path}")
        _stage("MODEL", f"Asset present: {model_path} ({model_path.stat().st_size} bytes)")

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
        _stage("LANDMARKER", "Initializing VIDEO-mode HandLandmarker with CPU delegate...")
        landmarker = HandLandmarker.create_from_options(options)
        _stage("LANDMARKER", "OK: initialized")

        current_stage = "camera access"
        _stage("CAMERA", f"Opening camera index {camera_index}...")
        capture = cv2.VideoCapture(camera_index)
        if capture is None or not capture.isOpened():
            raise RuntimeError(f"could not open camera index {camera_index}")
        _stage("CAMERA", "OK: device opened")

        current_stage = "frame capture"
        success, frame = capture.read()
        if not success or frame is None:
            raise RuntimeError("camera opened but did not return a frame")
        _stage("FRAME", f"OK: captured one frame ({frame.shape[1]}x{frame.shape[0]})")

        current_stage = "detection"
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = landmarker.detect_for_video(image, 0)
        detected_count = len(result.hand_landmarks)
        _stage("DETECTION", f"OK: completed on one frame; hands detected={detected_count}")
        return 0
    except Exception as error:
        _stage("FAIL", f"{current_stage}: {type(error).__name__}: {error}")
        return 1
    finally:
        if capture is not None:
            try:
                capture.release()
                _stage("CLEANUP", "camera released")
            except Exception as error:
                _stage("CLEANUP WARNING", f"camera release failed: {type(error).__name__}: {error}")
        if landmarker is not None:
            try:
                landmarker.close()
                _stage("CLEANUP", "landmarker closed")
            except Exception as error:
                _stage("CLEANUP WARNING", f"landmarker close failed: {type(error).__name__}: {error}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--camera-index", type=int, default=0)
    args = parser.parse_args()
    return run_diagnostic(args.model, args.camera_index)


if __name__ == "__main__":
    raise SystemExit(main())
