#!/usr/bin/env python3
"""Read-only inventory of dataset files and media metadata."""

from __future__ import annotations

import argparse
import os
from collections import Counter
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mpeg", ".mpg"}


def image_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        from PIL import Image

        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return image.size
    except ImportError:
        return None
    except Exception:
        return (-1, -1)


def video_metadata(path: Path) -> dict[str, float | int] | None:
    try:
        import cv2  # Optional: install opencv-python to inspect video metadata.
    except ImportError:
        return None
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            return {"unreadable": 1}
        return {
            "width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "frames": int(capture.get(cv2.CAP_PROP_FRAME_COUNT)),
            "fps": round(float(capture.get(cv2.CAP_PROP_FPS)), 3),
        }
    finally:
        capture.release()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(os.environ.get("ECHO_DATASET_ROOT", "datasets")),
        help="Dataset root (default: ECHO_DATASET_ROOT or ./datasets).",
    )
    parser.add_argument(
        "--expected-paths",
        type=Path,
        help="Optional text file listing expected root-relative paths, one per line.",
    )
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        parser.error(f"dataset root is not a directory: {root}")

    files = sorted(path for path in root.rglob("*") if path.is_file())
    print(f"Dataset root: {root}")
    print(f"Files: {len(files)}")
    print("Extensions:")
    for extension, count in sorted(Counter(p.suffix.lower() or "[no extension]" for p in files).items()):
        print(f"  {extension}: {count}")

    print("Directory structure:")
    print(f"  {root.name}/")
    for directory in sorted(p for p in root.rglob("*") if p.is_dir()):
        print(f"  {directory.relative_to(root)}/")

    unreadable: list[str] = []
    print("Media metadata:")
    pillow_available = True
    cv2_available = True
    for path in files:
        relative = path.relative_to(root)
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            size = image_dimensions(path)
            if size is None:
                pillow_available = False
            elif size == (-1, -1):
                unreadable.append(str(relative))
                print(f"  {relative}: unreadable image")
            else:
                print(f"  {relative}: image {size[0]}x{size[1]}")
        elif suffix in VIDEO_SUFFIXES:
            metadata = video_metadata(path)
            if metadata is None:
                cv2_available = False
            elif metadata.get("unreadable"):
                unreadable.append(str(relative))
                print(f"  {relative}: unreadable video")
            else:
                print(f"  {relative}: video {metadata}")

    if not pillow_available:
        print("  Image dimensions skipped: install requirements.txt (Pillow).")
    if not cv2_available:
        print("  Video metadata skipped: optional OpenCV is not installed.")

    missing: list[str] = []
    if args.expected_paths:
        expected_file = args.expected_paths.expanduser()
        try:
            expected = [
                line.strip()
                for line in expected_file.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.lstrip().startswith("#")
            ]
        except OSError as error:
            parser.error(f"cannot read expected-paths file: {error}")
        for item in expected:
            candidate = (root / item).resolve()
            if not candidate.is_relative_to(root) or not candidate.exists():
                missing.append(item)

    print(f"Unreadable files: {len(unreadable)}")
    for item in unreadable:
        print(f"  {item}")
    print(f"Missing expected paths: {len(missing)}")
    for item in missing:
        print(f"  {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
