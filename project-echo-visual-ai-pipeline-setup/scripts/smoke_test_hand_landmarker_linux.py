#!/usr/bin/env python3
"""Linux-only smoke test for isolated MediaPipe hand detection on a short clip."""

from __future__ import annotations

import argparse
import platform
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings  # noqa: E402
from app.services.hand_landmarker import HandLandmarkerService  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True, help="Short sample video; ideally no longer than 5 seconds.")
    parser.add_argument("--model", type=Path, default=Settings.from_env().hand_landmarker_task_path)
    parser.add_argument("--timeout", type=float, default=120.0)
    args = parser.parse_args()

    if platform.system() != "Linux":
        print("FAIL: this smoke test is Linux-only; MediaPipe will not be initialized on this platform.", file=sys.stderr)
        return 2
    try:
        import cv2

        capture = cv2.VideoCapture(str(args.video.expanduser().resolve()))
        if capture is None or not capture.isOpened():
            raise RuntimeError("OpenCV could not open the sample video")
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        capture.release()
        if frame_count < 1 or fps <= 0 or frame_count / fps > 5.0:
            raise ValueError(f"sample must be between 0 and 5 seconds; reported duration={frame_count / fps if fps > 0 else 'unknown'}")

        service = HandLandmarkerService(args.model, timeout_seconds=args.timeout)
        output = service.process_video(args.video)
        frames = output["landmarks"].shape[0]
        detected = int(output["detection_mask"].any(axis=1).sum())
        print(f"PASS: initialized detector and processed {frames} frames from {args.video}")
        print(f"Landmarks={output['landmarks'].shape}; hands detected in {detected} frames.")
        print(f"Timestamps strictly increasing: {frames < 2 or bool((output['timestamps_ms'][1:] > output['timestamps_ms'][:-1]).all())}")
        return 0
    except Exception as error:
        print(f"FAIL: {type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
