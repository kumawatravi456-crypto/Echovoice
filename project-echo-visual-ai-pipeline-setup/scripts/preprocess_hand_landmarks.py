#!/usr/bin/env python3
"""Validate and convert extracted hand landmarks into fixed-length sequences."""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np

CLASSES = ("YES", "NO", "HELP", "WATER", "STOP")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_ROOT = PROJECT_ROOT / "datasets" / "processed" / "landmarks" / "hand_gestures"
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "datasets" / "processed" / "model_ready" / "hand_gestures"
REQUIRED_KEYS = (
    "landmarks", "detection_mask", "handedness", "handedness_score", "timestamps_ms",
    "source_fps", "timestamp_fps", "timestamp_basis", "class_label", "source_filename",
    "source_relative_path",
)
INPUT_MANIFEST_FIELDS = (
    "source_filename", "source_relative_path", "class_label", "frame_count",
    "detected_frame_count", "detection_rate", "fps", "output_filename", "status", "error",
)
OUTPUT_MANIFEST_FIELDS = (
    "source_filename", "source_relative_path", "class_label", "source_frame_count",
    "output_sequence_length", "detection_rate", "valid_hand_rate", "invalid_landmark_count",
    "timestamp_resampling_method", "output_filename", "processing_status", "error_or_warning",
)


class RecordError(ValueError):
    """Raised when an extracted NPZ cannot be safely preprocessed."""


def _text_scalar(value: np.ndarray, name: str) -> str:
    if value.shape != () or value.dtype.kind not in "US":
        raise RecordError(f"{name} must be a scalar Unicode/byte string")
    item = value.item()
    return item.decode("utf-8") if isinstance(item, bytes) else str(item)


def _numeric_scalar(value: np.ndarray, name: str) -> float:
    if value.shape != () or value.dtype.kind not in "iuf":
        raise RecordError(f"{name} must be a numeric scalar")
    return float(value.item())


def load_record(path: Path) -> dict[str, Any]:
    """Load one extraction archive without pickle and validate its core schema."""
    try:
        with np.load(path, allow_pickle=False) as archive:
            missing = [key for key in REQUIRED_KEYS if key not in archive.files]
            if missing:
                raise RecordError(f"missing required NPZ keys: {', '.join(missing)}")
            arrays = {key: np.array(archive[key], copy=True) for key in archive.files}
    except Exception as error:
        if isinstance(error, RecordError):
            raise
        raise RecordError(f"cannot read NPZ safely: {type(error).__name__}: {error}") from error

    for key, value in arrays.items():
        if value.dtype.kind == "O":
            raise RecordError(f"{key} uses a pickle-dependent object dtype")

    landmarks = arrays["landmarks"]
    if landmarks.ndim != 4 or landmarks.shape[1:] != (2, 21, 3):
        raise RecordError(f"landmarks must have shape (frames, 2, 21, 3); got {landmarks.shape}")
    if landmarks.dtype != np.float32:
        raise RecordError(f"landmarks must be float32; got {landmarks.dtype}")
    frame_count = landmarks.shape[0]
    if frame_count < 1:
        raise RecordError("landmarks contains no frames")

    expected_shapes = {
        "detection_mask": ((frame_count, 2), np.dtype(np.bool_)),
        "handedness": ((frame_count, 2), None),
        "handedness_score": ((frame_count, 2), np.dtype(np.float32)),
    }
    for key, (shape, dtype) in expected_shapes.items():
        value = arrays[key]
        if value.shape != shape:
            raise RecordError(f"{key} must have shape {shape}; got {value.shape}")
        if dtype is not None and value.dtype != dtype:
            raise RecordError(f"{key} must have dtype {dtype}; got {value.dtype}")
        if key == "handedness" and value.dtype.kind not in "US":
            raise RecordError(f"handedness must contain Unicode/byte strings; got {value.dtype}")

    # Timestamp shape, dtype, finiteness, and ordering are checked by
    # usable_timestamps; invalid time axes use the documented frame-index fallback.

    for key in ("source_fps", "timestamp_fps"):
        _numeric_scalar(arrays[key], key)
    for key in ("timestamp_basis", "class_label", "source_filename", "source_relative_path"):
        _text_scalar(arrays[key], key)

    return arrays


def usable_timestamps(timestamps: np.ndarray, frame_count: int) -> bool:
    """Return whether timestamps define a finite, strictly increasing time axis."""
    if timestamps.ndim != 1 or timestamps.shape[0] != frame_count or timestamps.dtype.kind not in "iuf":
        return False
    as_float = timestamps.astype(np.float64, copy=False)
    return bool(np.isfinite(as_float).all() and (frame_count == 1 or np.all(np.diff(as_float) > 0)))


def _nearest_indices(axis: np.ndarray, targets: np.ndarray) -> np.ndarray:
    right = np.searchsorted(axis, targets, side="left")
    right = np.clip(right, 0, len(axis) - 1)
    left = np.clip(right - 1, 0, len(axis) - 1)
    # Ties select the earlier source frame for deterministic ordering.
    choose_right = np.abs(axis[right] - targets) < np.abs(targets - axis[left])
    return np.where(choose_right, right, left).astype(np.int64)


def _positive_fps(timestamp_fps: float, source_fps: float) -> tuple[float, str]:
    if math.isfinite(timestamp_fps) and timestamp_fps > 0:
        return timestamp_fps, "timestamp_fps"
    if math.isfinite(source_fps) and source_fps > 0:
        return source_fps, "source_fps"
    return 30.0, "documented_30_fps_default"


def _interpolate_gaps(
    working: np.ndarray,
    detection_mask: np.ndarray,
    handedness: np.ndarray,
    initially_valid: np.ndarray,
    axis: np.ndarray,
    max_gap: int,
) -> np.ndarray:
    """Interpolate only bounded missing-detection runs with same-slot, same-hand endpoints."""
    imputation_mask = np.zeros(detection_mask.shape, dtype=np.bool_)
    if max_gap <= 0:
        return imputation_mask

    frame_count = detection_mask.shape[0]
    for hand_slot in range(2):
        frame = 0
        while frame < frame_count:
            if detection_mask[frame, hand_slot]:
                frame += 1
                continue
            start = frame
            while frame < frame_count and not detection_mask[frame, hand_slot]:
                frame += 1
            end = frame  # half-open missing interval [start, end)
            gap_length = end - start
            left, right = start - 1, end
            if (
                gap_length == 0 or gap_length > max_gap or left < 0 or right >= frame_count
                or not initially_valid[left, hand_slot] or not initially_valid[right, hand_slot]
            ):
                continue
            left_label = str(handedness[left, hand_slot])
            right_label = str(handedness[right, hand_slot])
            if not left_label or left_label != right_label:
                continue
            span = float(axis[right] - axis[left])
            if not math.isfinite(span) or span <= 0:
                continue
            for index in range(start, end):
                alpha = float(axis[index] - axis[left]) / span
                working[index, hand_slot] = (
                    (1.0 - alpha) * working[left, hand_slot] + alpha * working[right, hand_slot]
                ).astype(np.float32)
                imputation_mask[index, hand_slot] = True
    return imputation_mask


def resample_indices(
    frame_count: int,
    sequence_length: int,
    timestamps_ms: np.ndarray,
    timestamp_fps: float,
    source_fps: float,
) -> tuple[np.ndarray, np.ndarray, str, str]:
    """Nearest-frame resampling on a uniform time or frame-index grid."""
    if frame_count < 1 or sequence_length < 1:
        raise ValueError("frame_count and sequence_length must be positive")
    if usable_timestamps(timestamps_ms, frame_count):
        axis = timestamps_ms.astype(np.float64)
        targets = np.linspace(axis[0], axis[-1], sequence_length, dtype=np.float64)
        indices = _nearest_indices(axis, targets)
        seq_timestamps = np.rint(targets).astype(np.int64)
        return indices, seq_timestamps, "timestamp_nearest", "source_timestamps_ms"

    index_axis = np.arange(frame_count, dtype=np.float64)
    target_indices = np.linspace(0.0, float(frame_count - 1), sequence_length, dtype=np.float64)
    indices = _nearest_indices(index_axis, target_indices)
    fps, fps_basis = _positive_fps(timestamp_fps, source_fps)
    seq_timestamps = np.rint(target_indices * (1000.0 / fps)).astype(np.int64)
    return indices, seq_timestamps, "frame_index_nearest_fallback", f"frame_index/{fps_basis}"


def preprocess_arrays(
    arrays: dict[str, Any],
    sequence_length: int = 32,
    short_gap_interpolation: bool = False,
    max_interpolation_gap_frames: int = 2,
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Create a single model-ready sequence while retaining source validity masks."""
    if sequence_length < 1:
        raise ValueError("sequence_length must be at least 1")
    if max_interpolation_gap_frames < 0:
        raise ValueError("max_interpolation_gap_frames cannot be negative")

    original = np.asarray(arrays["landmarks"], dtype=np.float32).copy()
    detection = np.asarray(arrays["detection_mask"], dtype=np.bool_).copy()
    handedness = np.asarray(arrays["handedness"]).copy()
    handedness_score = np.asarray(arrays["handedness_score"], dtype=np.float32).copy()
    timestamps = np.asarray(arrays["timestamps_ms"]).copy()
    frame_count = original.shape[0]
    source_fps = float(np.asarray(arrays["source_fps"]).item())
    timestamp_fps = float(np.asarray(arrays["timestamp_fps"]).item())

    invalid_landmark_mask = ~np.isfinite(original).all(axis=-1)  # [frames, hands, landmarks]
    finite_hand = ~invalid_landmark_mask.any(axis=-1)
    wrist = original[:, :, 0, :]
    middle_mcp = original[:, :, 9, :]
    endpoints_finite = np.isfinite(wrist).all(axis=-1) & np.isfinite(middle_mcp).all(axis=-1)
    initial_scale = np.linalg.norm(middle_mcp - wrist, axis=-1)
    initial_scale_valid = endpoints_finite & np.isfinite(initial_scale) & (initial_scale > 0)
    initially_valid = detection & finite_hand & initial_scale_valid

    time_axis_valid = usable_timestamps(timestamps, frame_count)
    interpolation_axis = (
        timestamps.astype(np.float64)
        if time_axis_valid
        else np.arange(frame_count, dtype=np.float64)
    )
    working = original.copy()
    imputation = np.zeros(detection.shape, dtype=np.bool_)
    if short_gap_interpolation:
        imputation = _interpolate_gaps(
            working, detection, handedness, initially_valid, interpolation_axis,
            max_interpolation_gap_frames,
        )

    usable_coordinates = detection | imputation
    wrist_relative = np.full(original.shape, np.nan, dtype=np.float32)
    normalized = np.full(original.shape, np.nan, dtype=np.float32)
    scale = np.linalg.norm(working[:, :, 9, :] - working[:, :, 0, :], axis=-1)
    scale_valid = (
        usable_coordinates
        & np.isfinite(working[:, :, 0, :]).all(axis=-1)
        & np.isfinite(working[:, :, 9, :]).all(axis=-1)
        & np.isfinite(scale)
        & (scale > 0)
    )

    for frame in range(frame_count):
        for slot in range(2):
            if not usable_coordinates[frame, slot]:
                continue
            wrist_xyz = working[frame, slot, 0]
            if not np.isfinite(wrist_xyz).all():
                continue
            finite_points = np.isfinite(working[frame, slot]).all(axis=-1)
            wrist_relative[frame, slot, finite_points] = working[frame, slot, finite_points] - wrist_xyz
            if scale_valid[frame, slot]:
                normalized[frame, slot, finite_points] = (
                    wrist_relative[frame, slot, finite_points] / scale[frame, slot]
                )

    hand_validity = detection & finite_hand & scale_valid
    source_detection_rate = float(np.any(detection, axis=1).mean())
    source_valid_hand_rate = float(hand_validity.mean())
    invalid_landmark_count = int(invalid_landmark_mask.sum())

    indices, seq_timestamps, method, resampling_basis = resample_indices(
        frame_count, sequence_length, timestamps, timestamp_fps, source_fps,
    )
    source_basis = _text_scalar(np.asarray(arrays["timestamp_basis"]), "timestamp_basis")
    basis = f"{source_basis}; resampled_on={resampling_basis}"
    outputs = {
        "original_landmarks": original[indices],
        "wrist_relative_landmarks": wrist_relative[indices],
        "normalized_landmarks": normalized[indices],
        "detection_mask": detection[indices],
        "hand_validity_mask": hand_validity[indices],
        "invalid_landmark_mask": invalid_landmark_mask[indices],
        "imputation_mask": imputation[indices],
        "scale_validity_mask": scale_valid[indices],
        "handedness": handedness[indices],
        "handedness_score": handedness_score[indices],
        "sequence_timestamps_ms": seq_timestamps,
        "source_frame_indices": indices.astype(np.int64),
        "class_label": np.asarray(_text_scalar(np.asarray(arrays["class_label"]), "class_label")),
        "source_filename": np.asarray(_text_scalar(np.asarray(arrays["source_filename"]), "source_filename")),
        "source_relative_path": np.asarray(_text_scalar(np.asarray(arrays["source_relative_path"]), "source_relative_path")),
        "source_fps": np.asarray(source_fps, dtype=np.float32),
        "timestamp_basis": np.asarray(basis),
        "timestamp_resampling_method": np.asarray(method),
        "coordinate_convention": np.asarray(
            "original normalized image x,y,z; wrist_relative=landmark-wrist; "
            "normalized=wrist_relative/euclidean_distance(wrist,middle_MCP_9); "
            "no clipping, mirroring, or hand-slot swapping"
        ),
    }
    # All serialized arrays are numeric, boolean, or Unicode; never object dtype.
    if any(value.dtype.kind == "O" for value in outputs.values()):
        raise RecordError("internal error: output contains a pickle-dependent object array")
    stats = {
        "source_frame_count": frame_count,
        "output_sequence_length": sequence_length,
        "detection_rate": source_detection_rate,
        "valid_hand_rate": source_valid_hand_rate,
        "invalid_landmark_count": invalid_landmark_count,
        "timestamp_resampling_method": method,
        "timestamp_warning": "timestamps invalid or non-monotonic; used frame-index fallback" if not time_axis_valid else "",
        "invalid_scale_count": int((detection & ~initial_scale_valid).sum()),
        "imputed_hand_count": int(imputation.sum()),
    }
    return outputs, stats


def atomic_save_npz(path: Path, arrays: dict[str, np.ndarray]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".npz.tmp", prefix=f".{path.stem}.", dir=path.parent, delete=False
        ) as output:
            temp_name = output.name
            np.savez_compressed(output, **arrays)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def write_manifest(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", newline="", encoding="utf-8", prefix=f".{path.stem}.",
            suffix=".tmp", dir=path.parent, delete=False,
        ) as output:
            temp_name = output.name
            writer = csv.DictWriter(output, fieldnames=OUTPUT_MANIFEST_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def _empty_row(
    source_filename: str = "",
    source_relative_path: str = "",
    class_label: str = "",
    status: str = "error",
    message: str = "",
) -> dict[str, Any]:
    return {
        "source_filename": source_filename,
        "source_relative_path": source_relative_path,
        "class_label": class_label,
        "source_frame_count": 0,
        "output_sequence_length": 0,
        "detection_rate": 0.0,
        "valid_hand_rate": 0.0,
        "invalid_landmark_count": 0,
        "timestamp_resampling_method": "",
        "output_filename": "",
        "processing_status": status,
        "error_or_warning": message,
    }


def _safe_manifest_relative(value: str) -> PurePosixPath | None:
    candidate = PurePosixPath(value)
    if not value or candidate.is_absolute() or ".." in candidate.parts or len(candidate.parts) < 2:
        return None
    return candidate


def run_pipeline(
    input_root: Path,
    output_root: Path,
    sequence_length: int = 32,
    short_gap_interpolation: bool = False,
    max_interpolation_gap_frames: int = 2,
    overwrite: bool = False,
    dry_run: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    input_root = input_root.expanduser().resolve()
    output_root = output_root.expanduser().resolve()
    if not input_root.is_dir():
        raise ValueError(f"input directory does not exist: {input_root}")
    if (
        input_root == output_root
        or input_root in output_root.parents
        or output_root in input_root.parents
    ):
        raise ValueError("output-root and input-root must be separate, non-overlapping trees")
    if sequence_length < 1:
        raise ValueError("sequence-length must be at least 1")
    if max_interpolation_gap_frames < 0:
        raise ValueError("max interpolation gap cannot be negative")

    manifest_path = input_root / "manifest.csv"
    global_rows: list[dict[str, Any]] = []
    manifest_map: dict[str, dict[str, str]] = {}
    manifest_sources: dict[str, list[str]] = {}
    if not manifest_path.is_file():
        global_rows.append(_empty_row(status="warning", message=f"missing extraction manifest: {manifest_path}"))
    else:
        try:
            with manifest_path.open(newline="", encoding="utf-8") as source_manifest:
                reader = csv.DictReader(source_manifest)
                missing_fields = [field for field in INPUT_MANIFEST_FIELDS if field not in (reader.fieldnames or [])]
                if missing_fields:
                    global_rows.append(_empty_row(status="error", message=f"manifest missing fields: {', '.join(missing_fields)}"))
                else:
                    for row in reader:
                        rel = (row.get("source_relative_path") or "").strip()
                        safe_rel = _safe_manifest_relative(rel)
                        if safe_rel is None:
                            global_rows.append(_empty_row(
                                row.get("source_filename", ""), rel, row.get("class_label", ""),
                                "error", "unsafe or malformed source_relative_path in extraction manifest",
                            ))
                            continue
                        key = safe_rel.as_posix()
                        manifest_sources.setdefault(row.get("source_filename", ""), []).append(key)
                        if key in manifest_map:
                            global_rows.append(_empty_row(
                                row.get("source_filename", ""), key, row.get("class_label", ""),
                                "error", "duplicate source_relative_path in extraction manifest",
                            ))
                            continue
                        manifest_map[key] = row
        except (OSError, csv.Error, UnicodeError) as error:
            global_rows.append(_empty_row(status="error", message=f"cannot read extraction manifest: {error}"))

    for filename, paths in manifest_sources.items():
        if filename and len(set(paths)) > 1:
            global_rows.append(_empty_row(
                filename, ",".join(sorted(set(paths))), "", "error",
                "duplicate source filename appears at multiple paths in extraction manifest",
            ))

    for class_name in CLASSES:
        if not (input_root / class_name).is_dir():
            global_rows.append(_empty_row(class_label=class_name, status="warning", message=f"missing class folder: {class_name}"))

    discovered = sorted(path for path in input_root.rglob("*.npz") if path.is_file() and path.name != "manifest.csv")
    files_by_video: dict[str, list[Path]] = {}
    staged: list[dict[str, Any]] = []
    for path in discovered:
        relative_npz = path.relative_to(input_root)
        relative_video = relative_npz.with_suffix(".mp4").as_posix()
        class_label = relative_npz.parts[0].upper() if relative_npz.parts else ""
        output_rel = relative_npz.with_suffix(".npz")
        output_path = output_root / output_rel
        manifest_row = manifest_map.get(relative_video)
        warnings: list[str] = []
        if class_label not in CLASSES:
            global_rows.append(_empty_row(path.name, relative_video, class_label, "error", "NPZ found under unexpected class folder"))
            continue
        files_by_video.setdefault(relative_video, []).append(path)
        if manifest_row is None:
            warnings.append("NPZ source is missing from extraction manifest")

        try:
            arrays = load_record(path)
            embedded_label = _text_scalar(arrays["class_label"], "class_label").upper()
            embedded_source = _text_scalar(arrays["source_relative_path"], "source_relative_path")
            embedded_filename = _text_scalar(arrays["source_filename"], "source_filename")
            expected_filename = PurePosixPath(relative_video).name
            if embedded_label != class_label:
                raise RecordError(f"class_label metadata {embedded_label!r} does not match folder {class_label!r}")
            if embedded_source != relative_video:
                raise RecordError(f"source_relative_path metadata {embedded_source!r} does not match NPZ location {relative_video!r}")
            if embedded_filename != expected_filename:
                raise RecordError(f"source_filename metadata {embedded_filename!r} does not match NPZ location {expected_filename!r}")
            if manifest_row is not None:
                if manifest_row.get("class_label", "").upper() != class_label:
                    warnings.append("manifest class label differs from NPZ folder")
                if manifest_row.get("source_filename", "") != embedded_filename:
                    warnings.append("manifest source filename differs from NPZ metadata")
                try:
                    if int(manifest_row.get("frame_count", "")) != arrays["landmarks"].shape[0]:
                        warnings.append("manifest frame count differs from NPZ")
                except (TypeError, ValueError):
                    warnings.append("manifest frame_count is not an integer")
                try:
                    manifest_rate = float(manifest_row.get("detection_rate", ""))
                    actual_rate = float(np.any(arrays["detection_mask"], axis=1).mean())
                    if not math.isfinite(manifest_rate) or abs(manifest_rate - actual_rate) > 1e-5:
                        warnings.append("manifest detection rate differs from NPZ")
                except (TypeError, ValueError):
                    warnings.append("manifest detection_rate is not numeric")
            staged.append({
                "path": path, "relative_video": relative_video, "class_label": class_label,
                "output_path": output_path, "arrays": arrays, "warnings": warnings,
                "source_filename": embedded_filename,
            })
        except (RecordError, KeyError) as error:
            row = _empty_row(path.with_suffix(".mp4").name, relative_video, class_label, "error", str(error))
            if not dry_run:
                try:
                    output_path.unlink(missing_ok=True)
                except OSError as cleanup_error:
                    row["error_or_warning"] += f"; failed to remove stale derived output: {cleanup_error}"
            global_rows.append(row)

    for rel, paths in files_by_video.items():
        if len(paths) > 1:
            global_rows.append(_empty_row(
                PurePosixPath(rel).name, rel, PurePosixPath(rel).parts[0].upper(), "error",
                "duplicate NPZ files map to the same source recording",
            ))

    metadata_sources: dict[str, list[dict[str, Any]]] = {}
    metadata_filenames: dict[str, list[dict[str, Any]]] = {}
    for item in staged:
        metadata_sources.setdefault(item["relative_video"], []).append(item)
        metadata_filenames.setdefault(item["source_filename"], []).append(item)
    duplicates = set()
    for collection in (metadata_sources, metadata_filenames):
        for entries in collection.values():
            if len(entries) > 1:
                duplicates.update(id(entry) for entry in entries)

    rows = list(global_rows)
    for index, item in enumerate(staged, start=1):
        path: Path = item["path"]
        rel: str = item["relative_video"]
        label: str = item["class_label"]
        output_path: Path = item["output_path"]
        print(f"[{index}/{len(staged)}] {rel}")
        if id(item) in duplicates:
            row = _empty_row(item["source_filename"], rel, label, "error", "duplicate source recording metadata across NPZ files")
            if not dry_run:
                try:
                    output_path.unlink(missing_ok=True)
                except OSError as cleanup_error:
                    row["error_or_warning"] += f"; failed to remove stale derived output: {cleanup_error}"
            rows.append(row)
            continue

        try:
            outputs, stats = preprocess_arrays(
                item["arrays"], sequence_length, short_gap_interpolation,
                max_interpolation_gap_frames,
            )
            warnings = list(item["warnings"])
            warnings.extend(filter(None, (
                stats["timestamp_warning"],
                f"{stats['invalid_scale_count']} detected hand slots have invalid/zero scale" if stats["invalid_scale_count"] else "",
                f"{stats['imputed_hand_count']} hand slots were short-gap imputed" if stats["imputed_hand_count"] else "",
                "no valid detected hands in this recording" if not np.any(outputs["hand_validity_mask"]) else "",
            )))
            output_rel = output_path.relative_to(output_root).as_posix()
            if dry_run:
                status = "warning" if warnings else "dry_run_ok"
            elif output_path.exists() and not overwrite:
                status = "skipped_existing"
                warnings.append("output exists; use --overwrite to replace it")
            else:
                atomic_save_npz(output_path, outputs)
                status = "warning" if warnings else "ok"
            rows.append({
                "source_filename": item["source_filename"],
                "source_relative_path": rel,
                "class_label": label,
                "source_frame_count": stats["source_frame_count"],
                "output_sequence_length": stats["output_sequence_length"],
                "detection_rate": round(stats["detection_rate"], 6),
                "valid_hand_rate": round(stats["valid_hand_rate"], 6),
                "invalid_landmark_count": stats["invalid_landmark_count"],
                "timestamp_resampling_method": stats["timestamp_resampling_method"],
                "output_filename": output_rel if status not in ("error",) else "",
                "processing_status": status,
                "error_or_warning": "; ".join(warnings),
            })
        except (RecordError, ValueError, FloatingPointError) as error:
            try:
                if not dry_run:
                    output_path.unlink(missing_ok=True)
            except OSError as cleanup_error:
                error = RecordError(f"{error}; failed to remove stale derived output: {cleanup_error}")
            rows.append(_empty_row(item["source_filename"], rel, label, "error", str(error)))

    for rel, manifest_row in manifest_map.items():
        expected_npz = input_root / PurePosixPath(rel).with_suffix(".npz")
        if not expected_npz.is_file():
            rows.append(_empty_row(
                manifest_row.get("source_filename", ""), rel, manifest_row.get("class_label", ""),
                "error", "extraction manifest lists a source whose NPZ file is missing",
            ))

    if not discovered:
        rows.append(_empty_row(status="error", message=f"no NPZ records found under {input_root}"))
    if not dry_run:
        write_manifest(output_root / "manifest.csv", rows)
    counts = {
        "ok": sum(row["processing_status"] in ("ok", "dry_run_ok", "skipped_existing") for row in rows),
        "warning": sum(row["processing_status"] == "warning" for row in rows),
        "error": sum(row["processing_status"] == "error" for row in rows),
    }
    return rows, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", type=Path, default=DEFAULT_INPUT_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--sequence-length", type=int, default=32)
    parser.add_argument("--short-gap-interpolation", action="store_true")
    parser.add_argument("--max-interpolation-gap-frames", type=int, default=2)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Validate and preprocess in memory without writing files.")
    args = parser.parse_args()
    try:
        _, counts = run_pipeline(
            args.input_root, args.output_root, args.sequence_length,
            args.short_gap_interpolation, args.max_interpolation_gap_frames,
            args.overwrite, args.dry_run,
        )
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    mode = "Dry run" if args.dry_run else "Finished"
    print(f"{mode}: {counts['ok']} processed/validated, {counts['warning']} warnings, {counts['error']} errors")
    if not args.dry_run:
        print(f"Manifest: {args.output_root.expanduser().resolve() / 'manifest.csv'}")
    return 2 if counts["error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
