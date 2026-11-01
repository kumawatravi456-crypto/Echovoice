#!/usr/bin/env python3
"""Preview the default camera with MediaPipe Tasks hand landmarks.

Frames are processed in memory and are never saved or transmitted.
"""

from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/latest/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "hand_landmarker.task"


def ensure_model_asset(model_path: Path) -> bool:
    """Use an existing model or fetch it from Google's official model storage."""
    if model_path.exists():
        if not model_path.is_file() or model_path.stat().st_size == 0:
            print(f"Model asset exists but is not a usable file: {model_path}", file=sys.stderr)
            return False
        return True

    temporary_path = model_path.with_name(model_path.name + ".download")
    try:
        model_path.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(
            MODEL_URL,
            headers={"User-Agent": "ProjectEcho-HandTracking/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            with temporary_path.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
        if temporary_path.stat().st_size == 0:
            raise OSError("Google returned an empty model file")
        temporary_path.replace(model_path)
        print(f"Downloaded official MediaPipe model to {model_path}")
        return True
    except (OSError, urllib.error.URLError, TimeoutError) as error:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass
        print(
            "Could not download the official MediaPipe hand-landmarker model. "
            f"Source: {MODEL_URL}\nDetails: {error}",
            file=sys.stderr,
        )
        return False


def draw_landmarks(frame, result, connections, cv2) -> None:
    """Draw each detected hand's 21 points and skeleton connections."""
    height, width = frame.shape[:2]
    for hand_landmarks in result.hand_landmarks:
        points = [
            (round(landmark.x * width), round(landmark.y * height))
            for landmark in hand_landmarks
        ]
        for connection in connections:
            cv2.line(
                frame,
                points[connection.start],
                points[connection.end],
                (80, 220, 80),
                2,
                cv2.LINE_AA,
            )
        for point in points:
            cv2.circle(frame, point, 4, (40, 80, 255), -1, cv2.LINE_AA)


def main() -> int:
    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import (
            HandLandmarker,
            HandLandmarkerOptions,
            HandLandmarkerResult,
            HandLandmarksConnections,
            RunningMode,
        )
    except ImportError as error:
        print(
            "OpenCV or the MediaPipe Tasks API is unavailable in this Python "
            f"environment: {error}",
            file=sys.stderr,
        )
        return 1

    if not ensure_model_asset(MODEL_PATH):
        return 1

    landmarker = None
    camera = None
    try:
        try:
            options = HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
                running_mode=RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            landmarker = HandLandmarker.create_from_options(options)
        except Exception as error:
            print(f"Could not initialize MediaPipe Hand Landmarker: {error}", file=sys.stderr)
            return 1

        try:
            camera = cv2.VideoCapture(0)
        except (cv2.error, OSError) as error:
            print(f"Could not access camera device 0: {error}", file=sys.stderr)
            return 1

        if camera is None or not camera.isOpened():
            print(
                "Camera device 0 is unavailable or access was denied. Check that a "
                "camera is connected, quit apps currently using it, and allow camera "
                "access for the terminal or IDE in macOS System Settings > Privacy & "
                "Security > Camera.",
                file=sys.stderr,
            )
            return 1

        window_name = "Project Echo - Hand Tracking (q to quit)"
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        connections = HandLandmarksConnections.HAND_CONNECTIONS
        previous_timestamp_ms = -1

        while True:
            try:
                success, frame = camera.read()
            except (cv2.error, OSError) as error:
                print(f"Camera read failed: {error}", file=sys.stderr)
                return 1

            if not success or frame is None:
                print(
                    "Camera stopped returning frames. Check camera permission and "
                    "whether another app is using it.",
                    file=sys.stderr,
                )
                return 1

            try:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                timestamp_ms = max(previous_timestamp_ms + 1, int(time.monotonic() * 1000))
                previous_timestamp_ms = timestamp_ms
                result: HandLandmarkerResult = landmarker.detect_for_video(
                    mp_image,
                    timestamp_ms,
                )
            except Exception as error:
                print(f"MediaPipe hand detection failed: {error}", file=sys.stderr)
                return 1

            draw_landmarks(frame, result, connections, cv2)
            cv2.putText(
                frame,
                f"Hands detected: {len(result.hand_landmarks)}",
                (16, 32),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
                cv2.LINE_AA,
            )
            cv2.imshow(window_name, frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    except KeyboardInterrupt:
        print("\nCamera preview stopped.")
    except (cv2.error, OSError) as error:
        print(f"Camera preview failed: {error}", file=sys.stderr)
        return 1
    finally:
        if camera is not None:
            camera.release()
        if landmarker is not None:
            try:
                landmarker.close()
            except Exception as error:
                print(f"Could not close MediaPipe Hand Landmarker cleanly: {error}", file=sys.stderr)
        try:
            cv2.destroyAllWindows()
        except cv2.error:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
