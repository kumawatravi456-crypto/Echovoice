#!/usr/bin/env python3
"""Extract MediaPipe Tasks hand landmarks from custom gesture MP4 videos."""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

CLASSES = ("YES", "NO", "HELP", "WATER", "STOP")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_ROOT = PROJECT_ROOT / "datasets" / "custom" / "hand_gestures"
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "datasets" / "processed" / "landmarks" / "hand_gestures"
DEFAULT_MODEL = PROJECT_ROOT / "models" / "hand_landmarker.task"
MANIFEST_FIELDS = (
    "source_filename",
    "source_relative_path",
    "class_label",
    "frame_count",
    "detected_frame_count",
    "detection_rate",
    "fps",
    "output_filename",
    "status",
    "error",
)


def atomic_save_npz(path: Path, **arrays: Any) -> None:
    """Write a compressed NPZ atomically so interrupted work leaves no partial file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".npz.tmp", prefix=f".{path.stem}.", dir=path.parent, delete=False
        ) as output:
            temp_name = output.name
            import numpy as np

            np.savez_compressed(output, **arrays)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def write_manifest(path: Path, rows: list[dict[str, Any]]) -> None:
    """Atomically save an inventory including errors and low-detection outcomes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", newline="", encoding="utf-8", prefix=f".{path.stem}.",
            suffix=".tmp", dir=path.parent, delete=False,
        ) as output:
            temp_name = output.name
            writer = csv.DictWriter(output, fieldnames=MANIFEST_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def empty_manifest_row(source: Path, input_root: Path, gesture: str) -> dict[str, Any]:
    return {
        "source_filename": source.name,
        "source_relative_path": source.relative_to(input_root).as_posix(),
        "class_label": gesture,
        "frame_count": 0,
        "detected_frame_count": 0,
        "detection_rate": 0.0,
        "fps": 0.0,
        "output_filename": "",
        "status": "error",
        "error": "",
    }


def extract_video(
    source: Path,
    input_root: Path,
    output_root: Path,
    model_path: Path,
    low_rate_threshold: float,
) -> tuple[dict[str, Any], str | None]:
    import cv2
    import mediapipe as mp
    import numpy as np
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

    relative_path = source.relative_to(input_root)
    gesture = relative_path.parts[0].upper()
    output_path = output_root / gesture / f"{source.stem}.npz"
    row = empty_manifest_row(source, input_root, gesture)
    capture = None
    landmarker = None
    landmark_frames: list[Any] = []
    detection_frames: list[Any] = []
    handedness_frames: list[Any] = []
    handedness_score_frames: list[Any] = []
    timestamps: list[int] = []
    reported_fps = 0.0
    timestamp_fps = 30.0
    previous_timestamp = -1

    try:
        # Remove any prior result before processing so a failed or native-aborted
        # run cannot leave an old NPZ looking like a fresh extraction.
        output_path.unlink(missing_ok=True)
        capture = cv2.VideoCapture(str(source))
        if capture is None or not capture.isOpened():
            raise RuntimeError("OpenCV could not open the video file")

        reported_fps = float(capture.get(cv2.CAP_PROP_FPS))
        if math.isfinite(reported_fps) and reported_fps > 0:
            timestamp_fps = reported_fps
        else:
            reported_fps = 0.0

        options = HandLandmarkerOptions(
            # Explicit CPU execution avoids native Metal/GL context setup in this
            # offline batch pipeline and makes runs consistent on macOS hosts.
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
        # A fresh VIDEO-mode task per file lets source-relative timestamps start at zero.
        landmarker = HandLandmarker.create_from_options(options)

        frame_index = 0
        while True:
            success, frame = capture.read()
            if not success:
                break
            if frame is None:
                raise RuntimeError(f"Decoded frame {frame_index} is empty")

            timestamp_ms = max(previous_timestamp + 1, int(round(frame_index * 1000.0 / timestamp_fps)))
            previous_timestamp = timestamp_ms
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
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
                    [(point.x, point.y, point.z) for point in points],
                    dtype=np.float32,
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

        row["frame_count"] = len(timestamps)
        row["fps"] = reported_fps
        if not timestamps:
            raise RuntimeError("Video opened but yielded no decodable frames")

        mask_array = np.stack(detection_frames, axis=0)
        detected_frame_count = int(np.count_nonzero(np.any(mask_array, axis=1)))
        detection_rate = detected_frame_count / len(timestamps)
        row["detected_frame_count"] = detected_frame_count
        row["detection_rate"] = round(detection_rate, 6)

        atomic_save_npz(
            output_path,
            landmarks=np.stack(landmark_frames, axis=0),  # [frames, 2 hands, 21 points, xyz]
            detection_mask=mask_array,  # [frames, 2 hands]; False means no detection
            handedness=np.stack(handedness_frames, axis=0),  # [frames, 2 hands], Left/Right/empty
            handedness_score=np.stack(handedness_score_frames, axis=0),  # [frames, 2 hands]
            timestamps_ms=np.asarray(timestamps, dtype=np.int64),
            source_fps=np.asarray(reported_fps, dtype=np.float32),
            timestamp_fps=np.asarray(timestamp_fps, dtype=np.float32),
            timestamp_basis=np.asarray("frame_index / timestamp_fps"),
            class_label=np.asarray(gesture),
            source_filename=np.asarray(source.name),
            source_relative_path=np.asarray(relative_path.as_posix()),
        )
        row["output_filename"] = output_path.relative_to(output_root).as_posix()
        row["status"] = "ok" if detection_rate >= low_rate_threshold else "low_detection_rate"
        message = None
        if detection_rate < low_rate_threshold:
            message = (
                f"LOW DETECTION: {relative_path} detected in {detected_frame_count}/"
                f"{len(timestamps)} frames ({detection_rate:.1%})"
            )
        return row, message
    except Exception as error:
        row["frame_count"] = len(timestamps)
        row["fps"] = reported_fps
        if timestamps:
            mask_array = np.stack(detection_frames, axis=0)
            row["detected_frame_count"] = int(np.count_nonzero(np.any(mask_array, axis=1)))
            row["detection_rate"] = round(row["detected_frame_count"] / len(timestamps), 6)
        row["error"] = f"{type(error).__name__}: {error}"
        try:
            output_path.unlink(missing_ok=True)
        except OSError as cleanup_error:
            row["error"] += f"; failed to remove stale output: {type(cleanup_error).__name__}: {cleanup_error}"
        return row, f"ERROR: {source.relative_to(input_root)}: {row['error']}"
    finally:
        if capture is not None:
            capture.release()
        if landmarker is not None:
            landmarker.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", type=Path, default=DEFAULT_INPUT_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument(
        "--video",
        type=Path,
        help="Process only this MP4 within --input-root (for a focused validation run).",
    )
    parser.add_argument(
        "--low-rate-threshold",
        type=float,
        default=0.5,
        help="Report videos with a lower detected-frame rate (default: 0.5).",
    )
    args = parser.parse_args()

    input_root = args.input_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    model_path = args.model.expanduser().resolve()
    if not input_root.is_dir():
        parser.error(f"input directory does not exist: {input_root}")
    if not model_path.is_file() or model_path.stat().st_size == 0:
        print(f"MediaPipe hand-landmarker model is missing or empty: {model_path}", file=sys.stderr)
        return 1
    if not 0 <= args.low_rate_threshold <= 1:
        parser.error("low-rate-threshold must be between 0 and 1")

    if args.video is not None:
        selected_video = args.video.expanduser().resolve()
        try:
            relative_video = selected_video.relative_to(input_root)
        except ValueError:
            parser.error(f"selected video must be inside input directory: {input_root}")
        if (
            not selected_video.is_file()
            or selected_video.suffix.lower() != ".mp4"
            or not relative_video.parts
            or relative_video.parts[0].upper() not in CLASSES
        ):
            parser.error("--video must be an existing MP4 inside one of the five gesture folders")
        sources = [selected_video]
    else:
        sources = [
            path
            for gesture in CLASSES
            for path in sorted((input_root / gesture).rglob("*"))
            if (input_root / gesture).is_dir() and path.is_file() and path.suffix.lower() == ".mp4"
        ]
    if not sources:
        print(f"No MP4 videos found under the five gesture folders in {input_root}", file=sys.stderr)
        return 1

    rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    manifest_path = output_root / "manifest.csv"
    for index, source in enumerate(sources, start=1):
        print(f"[{index}/{len(sources)}] {source.relative_to(input_root)}")
        row, message = extract_video(
            source,
            input_root,
            output_root,
            model_path,
            args.low_rate_threshold,
        )
        rows.append(row)
        write_manifest(manifest_path, rows)
        if message:
            warnings.append(message)
            print(message, file=sys.stderr)

    successful = sum(row["status"] in ("ok", "low_detection_rate") for row in rows)
    total_frames = sum(int(row["frame_count"]) for row in rows)
    detected_frames = sum(int(row["detected_frame_count"]) for row in rows)
    print(
        f"Finished: {successful}/{len(sources)} videos processed; "
        f"{total_frames} frames; {detected_frames} frames with at least one hand."
    )
    print(f"Manifest: {manifest_path}")
    if warnings:
        print(f"Warnings/errors: {len(warnings)} (see messages above)")
    return 0 if successful == len(sources) else 2


if __name__ == "__main__":
    raise SystemExit(main())
