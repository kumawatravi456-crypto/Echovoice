#!/usr/bin/env python3
"""Record consented Project Echo prototype hand-gesture clips locally."""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

GESTURES = {
    ord("1"): "YES",
    ord("2"): "NO",
    ord("3"): "HELP",
    ord("4"): "WATER",
    ord("5"): "STOP",
}
OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "datasets" / "custom" / "hand_gestures"
WINDOW_NAME = "Project Echo - Gesture Recorder"


def draw_text(frame, lines: list[str], cv2, *, recording: bool = False) -> None:
    """Draw readable local-only UI over the camera preview."""
    y = 30
    for line in lines:
        cv2.putText(
            frame,
            line,
            (16, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        y += 28
    if recording:
        cv2.circle(frame, (frame.shape[1] - 30, 30), 10, (0, 0, 255), -1)


def unique_clip_path(class_dir: Path) -> Path:
    """Choose a fresh filename so this tool never overwrites a clip."""
    while True:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        candidate = class_dir / f"{stamp}_{uuid.uuid4().hex[:8]}.mp4"
        if not candidate.exists():
            return candidate


def read_startup_frame(camera, cv2, attempts: int = 10, delay: float = 0.2):
    """Give the camera time to warm up and retry a few initial empty reads."""
    last_error = None
    for attempt in range(attempts):
        try:
            success, frame = camera.read()
        except (cv2.error, OSError) as error:
            last_error = error
            success, frame = False, None
        if success and frame is not None:
            return frame, None
        if attempt + 1 < attempts:
            time.sleep(delay)
    return None, last_error


def countdown(camera, cv2, gesture: str, seconds: int) -> bool:
    """Show a countdown without writing camera frames to disk."""
    end_at = time.monotonic() + seconds
    while True:
        success, frame = camera.read()
        if not success or frame is None:
            raise RuntimeError("Camera failed to return a frame during the countdown.")
        remaining = int(end_at - time.monotonic()) + 1
        if remaining <= 0:
            return True
        draw_text(
            frame,
            [f"Gesture: {gesture}", f"Recording begins in {remaining}", "q: cancel and quit"],
            cv2,
        )
        cv2.imshow(WINDOW_NAME, frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            return False


def record_clip(camera, cv2, gesture: str, duration: float, fps: float) -> Path | None:
    """Write one clip after explicit user start; remove it if the take is incomplete."""
    class_dir = OUTPUT_ROOT / gesture
    class_dir.mkdir(parents=True, exist_ok=True)
    clip_path = unique_clip_path(class_dir)
    writer = None
    completed = False
    start_at = time.monotonic()

    try:
        success, first_frame = camera.read()
        if not success or first_frame is None:
            raise RuntimeError("Camera failed to return its first frame for recording.")

        height, width = first_frame.shape[:2]
        writer = cv2.VideoWriter(
            str(clip_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )
        if not writer.isOpened():
            raise RuntimeError("OpenCV could not initialize the MP4 video writer.")

        frame = first_frame
        while True:
            elapsed = time.monotonic() - start_at
            if elapsed >= duration:
                completed = True
                break

            # Store only the camera frame; the recording indicator is preview-only.
            writer.write(frame)
            preview = frame.copy()
            remaining = max(0.0, duration - elapsed)
            draw_text(
                preview,
                [f"RECORDING: {gesture}", f"Time remaining: {remaining:.1f}s", "q: discard and quit"],
                cv2,
                recording=True,
            )
            cv2.imshow(WINDOW_NAME, preview)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                return None

            success, frame = camera.read()
            if not success or frame is None:
                raise RuntimeError("Camera failed while recording the clip.")

        return clip_path
    finally:
        if writer is not None:
            writer.release()
        if not completed:
            try:
                clip_path.unlink(missing_ok=True)
            except OSError as error:
                print(f"Could not remove incomplete take {clip_path}: {error}", file=sys.stderr)


def review_status(camera, cv2, message: str) -> bool:
    """Show a completed or discarded take status; return False to quit."""
    while True:
        success, frame = camera.read()
        if not success or frame is None:
            raise RuntimeError("Camera failed to return a frame while reviewing status.")
        draw_text(frame, [message, "c: continue   q: quit"], cv2)
        cv2.imshow(WINDOW_NAME, frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("c"):
            return True
        if key == ord("q"):
            return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=float, default=4.0, help="Clip length in seconds (default: 4).")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before each take (default: 3).")
    parser.add_argument("--fps", type=float, default=20.0, help="Saved video frame rate (default: 20).")
    args = parser.parse_args()
    if args.duration <= 0 or args.countdown < 0 or args.fps <= 0:
        parser.error("duration and fps must be positive; countdown cannot be negative")

    print(
        "Record only with the participant's informed consent for video recording "
        "and ML experimentation. Participation must be voluntary; recordings are "
        "prototype data, not clinical evidence."
    )
    try:
        consent_confirmation = input("Type YES to confirm consent is in place and continue: ")
    except EOFError:
        print("No confirmation received; camera was not opened.", file=sys.stderr)
        return 1
    if consent_confirmation.strip() != "YES":
        print("Consent was not confirmed; camera was not opened.")
        return 0

    try:
        import cv2
    except ImportError as error:
        print(f"OpenCV is unavailable in this Python environment: {error}", file=sys.stderr)
        return 1

    camera = None
    try:
        try:
            camera = cv2.VideoCapture(0)
        except (cv2.error, OSError) as error:
            print(f"Could not open camera device 0: {error}", file=sys.stderr)
            return 1

        if camera is None or not camera.isOpened():
            print(
                "Camera could not be opened at device index 0. Check the camera "
                "connection and allow camera access for the terminal or IDE in macOS "
                "System Settings > Privacy & Security > Camera.",
                file=sys.stderr,
            )
            return 1

        # Match the working preview script: create the OpenCV window before
        # attempting the first frame read.
        cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
        startup_frame, startup_error = read_startup_frame(camera, cv2)
        if startup_frame is None:
            detail = f" Last OpenCV error: {startup_error}" if startup_error else ""
            print(
                "Camera opened, but returned no frames after 10 startup attempts. "
                "Check macOS camera permission and whether another app is using "
                f"the camera.{detail}",
                file=sys.stderr,
            )
            return 1

        selected_gesture: str | None = None
        status = "No recordings are saved until you press r."
        frame = startup_frame

        while True:
            gesture_lines = [f"{key + 1}: {name}" for key, name in enumerate(GESTURES.values())]
            selected_text = selected_gesture or "(none)"
            count = (
                len(list((OUTPUT_ROOT / selected_gesture).glob("*.mp4")))
                if selected_gesture and (OUTPUT_ROOT / selected_gesture).is_dir()
                else 0
            )
            draw_text(
                frame,
                [
                    f"Selected: {selected_text}   Existing clips: {count}",
                    *gesture_lines,
                    "Prototype goal: 30-50 clips/class (not a clinical benchmark)",
                    status,
                    "Select 1-5   r: start countdown and record   q: quit",
                ],
                cv2,
            )
            cv2.imshow(WINDOW_NAME, frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break

            try:
                success, next_frame = camera.read()
            except (cv2.error, OSError) as error:
                print(f"Camera failed during preview: {error}", file=sys.stderr)
                return 1
            if not success or next_frame is None:
                print("Camera failed during preview after startup.", file=sys.stderr)
                return 1
            frame = next_frame

            if key in GESTURES:
                selected_gesture = GESTURES[key]
                status = f"Selected {selected_gesture}. Press r when ready."
                continue
            if key != ord("r"):
                continue
            if selected_gesture is None:
                status = "Choose a gesture class (1-5) before recording."
                continue

            if not countdown(camera, cv2, selected_gesture, args.countdown):
                break

            try:
                clip_path = record_clip(camera, cv2, selected_gesture, args.duration, args.fps)
            except (cv2.error, OSError, RuntimeError) as error:
                print(f"Recording failed: {error}", file=sys.stderr)
                status = f"Recording failed: {error}"
                if not review_status(camera, cv2, status):
                    break
                continue

            if clip_path is None:
                status = "Take discarded; no complete recording was kept."
                break
            status = f"Saved: {clip_path.relative_to(OUTPUT_ROOT)}"
            if not review_status(camera, cv2, status):
                break

    except KeyboardInterrupt:
        print("\nRecording tool stopped.")
    except (cv2.error, OSError, RuntimeError) as error:
        print(f"Camera or recording error: {error}", file=sys.stderr)
        return 1
    finally:
        if camera is not None:
            camera.release()
        try:
            cv2.destroyAllWindows()
        except cv2.error:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
