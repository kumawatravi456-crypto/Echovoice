#!/usr/bin/env python3
"""Extract deterministic, recording-level hand geometry and motion features."""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import tempfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_ROOT = PROJECT_ROOT / "datasets" / "processed" / "model_ready" / "hand_gestures"
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "datasets" / "processed" / "features" / "hand_gestures"
CLASS_COUNTS = {"YES": 7, "NO": 5, "HELP": 5, "WATER": 5, "STOP": 5}
SLOT_COUNT = 2
LANDMARK_COUNT = 21
SEQUENCE_LENGTH = 32
REQUIRED_KEYS = (
    "original_landmarks", "wrist_relative_landmarks", "normalized_landmarks",
    "detection_mask", "hand_validity_mask", "invalid_landmark_mask", "imputation_mask",
    "scale_validity_mask", "handedness", "handedness_score", "sequence_timestamps_ms",
    "source_frame_indices", "class_label", "source_filename", "source_relative_path",
    "source_fps", "timestamp_basis", "timestamp_resampling_method", "coordinate_convention",
)
INPUT_MANIFEST_FIELDS = (
    "source_filename", "source_relative_path", "class_label", "source_frame_count",
    "output_sequence_length", "detection_rate", "valid_hand_rate", "invalid_landmark_count",
    "timestamp_resampling_method", "output_filename", "processing_status", "error_or_warning",
)

DIGITS: dict[str, tuple[int, ...]] = {
    "thumb": (1, 2, 3, 4),
    "index": (5, 6, 7, 8),
    "middle": (9, 10, 11, 12),
    "ring": (13, 14, 15, 16),
    "pinky": (17, 18, 19, 20),
}
FINGER_ANGLE_TRIPLES: dict[str, tuple[tuple[int, int, int], ...]] = {
    "thumb": ((0, 1, 2), (1, 2, 3), (2, 3, 4)),
    "index": ((0, 5, 6), (5, 6, 7), (6, 7, 8)),
    "middle": ((0, 9, 10), (9, 10, 11), (10, 11, 12)),
    "ring": ((0, 13, 14), (13, 14, 15), (14, 15, 16)),
    "pinky": ((0, 17, 18), (17, 18, 19), (18, 19, 20)),
}
MCP = {"index": 5, "middle": 9, "ring": 13, "pinky": 17}
PALM_MCP_ORDER = (5, 9, 13, 17)


class FeatureInputError(ValueError):
    """Raised when an input archive or manifest fails validation."""


def _scalar_text(value: np.ndarray, key: str) -> str:
    if value.shape != () or value.dtype.kind not in "US":
        raise FeatureInputError(f"{key} must be a scalar Unicode/byte string")
    item = value.item()
    return item.decode("utf-8") if isinstance(item, bytes) else str(item)


def _angle_degrees(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float | None:
    """Internal angle at b in degrees, using 3D vectors; degenerate rays are missing."""
    first = a - b
    second = c - b
    n1 = float(np.linalg.norm(first))
    n2 = float(np.linalg.norm(second))
    if not math.isfinite(n1) or not math.isfinite(n2) or n1 <= 0 or n2 <= 0:
        return None
    cosine = float(np.dot(first, second) / (n1 * n2))
    if not math.isfinite(cosine):
        return None
    return math.degrees(math.acos(float(np.clip(cosine, -1.0, 1.0))))


def _distance(a: np.ndarray, b: np.ndarray) -> float | None:
    if not np.isfinite(a).all() or not np.isfinite(b).all():
        return None
    result = float(np.linalg.norm(a - b))
    return result if math.isfinite(result) else None


def _polygon_area_xy(points: np.ndarray) -> float | None:
    if points.shape[0] < 3 or not np.isfinite(points).all():
        return None
    x, y = points[:, 0], points[:, 1]
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2.0)


def _frame_geometry(points: np.ndarray) -> dict[str, float | None]:
    """Compute one frame's interpretable static features from normalized coordinates."""
    features: dict[str, float | None] = {}
    for digit, triples in FINGER_ANGLE_TRIPLES.items():
        for joint_i, triple in enumerate(triples, start=1):
            features[f"{digit}_joint{joint_i}_angle_deg"] = _angle_degrees(*(points[i] for i in triple))

    palm_center = np.mean(points[np.asarray((0, 5, 9, 13, 17))], axis=0)
    for digit, indices in DIGITS.items():
        tip = indices[-1]
        features[f"{digit}_tip_to_wrist_distance_norm"] = _distance(points[tip], points[0])
        features[f"{digit}_tip_to_palm_center_distance_norm"] = _distance(points[tip], palm_center)
        mcp = 1 if digit == "thumb" else MCP[digit]
        segment_sum = sum(
            float(np.linalg.norm(points[right] - points[left]))
            for left, right in zip((mcp, *indices[1:-1]), indices[1:])
        )
        chord = _distance(points[tip], points[mcp])
        ratio = chord / segment_sum if chord is not None and segment_sum > 0 and math.isfinite(segment_sum) else None
        features[f"{digit}_extension_ratio"] = float(np.clip(ratio, 0.0, 1.0)) if ratio is not None else None

    palm_center = np.asarray(palm_center, dtype=np.float64)
    features["palm_length_norm"] = _distance(points[0], points[9])
    features["palm_span_norm"] = _distance(points[5], points[17])
    features["wrist_to_palm_center_norm"] = _distance(points[0], palm_center)
    for left_i, left in enumerate(PALM_MCP_ORDER):
        for right in PALM_MCP_ORDER[left_i + 1 :]:
            features[f"mcp_{left}_to_{right}_distance_norm"] = _distance(points[left], points[right])
    palm_polygon = points[np.asarray((0, 5, 9, 13, 17)), :2]
    features["palm_projected_area_norm2"] = _polygon_area_xy(palm_polygon)

    axis = points[9, :2] - points[0, :2]
    axis_norm = float(np.linalg.norm(axis))
    if math.isfinite(axis_norm) and axis_norm > 0:
        features["palm_axis_orientation_sin"] = float(axis[1] / axis_norm)
        features["palm_axis_orientation_cos"] = float(axis[0] / axis_norm)
        features["palm_axis_orientation_deg"] = float(math.degrees(math.atan2(axis[1], axis[0])))
    else:
        features["palm_axis_orientation_sin"] = None
        features["palm_axis_orientation_cos"] = None
        features["palm_axis_orientation_deg"] = None
    return features


def _safe_mean(values: list[float]) -> float | None:
    return float(np.mean(values)) if values else None


def _safe_std(values: list[float]) -> float | None:
    return float(np.std(values, ddof=0)) if values else None


def _ordered_frame_features() -> list[str]:
    names: list[str] = []
    names.extend(f"{digit}_joint{joint}_angle_deg" for digit, triples in FINGER_ANGLE_TRIPLES.items() for joint in range(1, len(triples) + 1))
    for digit in DIGITS:
        names.extend((
            f"{digit}_tip_to_wrist_distance_norm",
            f"{digit}_tip_to_palm_center_distance_norm",
            f"{digit}_extension_ratio",
        ))
    names.extend(("palm_length_norm", "palm_span_norm", "wrist_to_palm_center_norm"))
    names.extend(f"mcp_{left}_to_{right}_distance_norm" for i, left in enumerate(PALM_MCP_ORDER) for right in PALM_MCP_ORDER[i + 1 :])
    names.extend(("palm_projected_area_norm2", "palm_axis_orientation_sin", "palm_axis_orientation_cos"))
    return names


FRAME_FEATURES = _ordered_frame_features()


def _read_input_manifest(input_root: Path) -> dict[str, dict[str, str]]:
    path = input_root / "manifest.csv"
    try:
        with path.open(newline="", encoding="utf-8") as source:
            reader = csv.DictReader(source)
            missing = [field for field in INPUT_MANIFEST_FIELDS if field not in (reader.fieldnames or [])]
            if missing:
                raise FeatureInputError(f"input manifest missing fields: {', '.join(missing)}")
            rows = list(reader)
    except (OSError, csv.Error, UnicodeError) as error:
        raise FeatureInputError(f"cannot read input manifest {path}: {error}") from error
    mapped: dict[str, dict[str, str]] = {}
    for row in rows:
        output_filename = (row.get("output_filename") or "").strip()
        rel = PurePosixPath(output_filename)
        if not output_filename or rel.is_absolute() or ".." in rel.parts or len(rel.parts) != 2 or rel.suffix.lower() != ".npz":
            raise FeatureInputError(f"unsafe or malformed output_filename in manifest: {output_filename!r}")
        key = rel.as_posix()
        if key in mapped:
            raise FeatureInputError(f"duplicate output_filename in input manifest: {key}")
        if row.get("processing_status") != "ok":
            raise FeatureInputError(f"input manifest record {key} is not ok: {row.get('processing_status')}")
        mapped[key] = row
    return mapped


def load_record(path: Path, row: dict[str, str]) -> dict[str, Any]:
    """Load and validate one model-ready NPZ without enabling pickle."""
    try:
        with np.load(path, allow_pickle=False) as archive:
            missing = [key for key in REQUIRED_KEYS if key not in archive.files]
            if missing:
                raise FeatureInputError(f"missing required keys: {', '.join(missing)}")
            arrays = {key: np.array(archive[key], copy=True) for key in archive.files}
    except Exception as error:
        if isinstance(error, FeatureInputError):
            raise
        raise FeatureInputError(f"cannot read NPZ safely: {type(error).__name__}: {error}") from error
    for key, value in arrays.items():
        if value.dtype.kind == "O":
            raise FeatureInputError(f"{key} has pickle-dependent object dtype")

    landmarks = arrays["normalized_landmarks"]
    if landmarks.shape != (SEQUENCE_LENGTH, SLOT_COUNT, LANDMARK_COUNT, 3) or landmarks.dtype != np.float32:
        raise FeatureInputError(f"normalized_landmarks must be float32 (32, 2, 21, 3); got {landmarks.shape} {landmarks.dtype}")
    if arrays["original_landmarks"].shape != landmarks.shape or arrays["original_landmarks"].dtype != np.float32:
        raise FeatureInputError("original_landmarks shape/dtype does not match normalized_landmarks")
    if arrays["wrist_relative_landmarks"].shape != landmarks.shape or arrays["wrist_relative_landmarks"].dtype != np.float32:
        raise FeatureInputError("wrist_relative_landmarks shape/dtype does not match normalized_landmarks")

    expected = {
        "detection_mask": ((32, 2), np.dtype(np.bool_)),
        "hand_validity_mask": ((32, 2), np.dtype(np.bool_)),
        "scale_validity_mask": ((32, 2), np.dtype(np.bool_)),
        "imputation_mask": ((32, 2), np.dtype(np.bool_)),
        "invalid_landmark_mask": ((32, 2, 21), np.dtype(np.bool_)),
        "handedness": ((32, 2), None),
        "handedness_score": ((32, 2), np.dtype(np.float32)),
        "sequence_timestamps_ms": ((32,), None),
        "source_frame_indices": ((32,), None),
    }
    for key, (shape, dtype) in expected.items():
        value = arrays[key]
        if value.shape != shape or (dtype is not None and value.dtype != dtype):
            raise FeatureInputError(f"{key} must have shape/dtype {shape}/{dtype}; got {value.shape}/{value.dtype}")
    if arrays["handedness"].dtype.kind not in "US":
        raise FeatureInputError("handedness must contain strings")
    if arrays["sequence_timestamps_ms"].dtype.kind not in "iuf":
        raise FeatureInputError("sequence_timestamps_ms must be numeric")
    if arrays["source_frame_indices"].dtype.kind not in "iu":
        raise FeatureInputError("source_frame_indices must be integer")

    for key in ("class_label", "source_filename", "source_relative_path"):
        _scalar_text(arrays[key], key)
    label = _scalar_text(arrays["class_label"], "class_label").upper()
    source_filename = _scalar_text(arrays["source_filename"], "source_filename")
    source_relative_path = _scalar_text(arrays["source_relative_path"], "source_relative_path")
    relative_npz = path.relative_to(path.parents[1]).as_posix()
    relative_video = PurePosixPath(relative_npz).with_suffix(".mp4").as_posix()
    if label != path.parent.name.upper() or label != row.get("class_label", "").upper():
        raise FeatureInputError(f"class label metadata does not match path/manifest for {path}")
    if source_filename != row.get("source_filename") or source_filename != PurePosixPath(relative_video).name:
        raise FeatureInputError(f"source filename metadata does not match path/manifest for {path}")
    if source_relative_path != row.get("source_relative_path") or source_relative_path != relative_video:
        raise FeatureInputError(f"source path metadata does not match path/manifest for {path}")
    if row.get("output_sequence_length") != str(SEQUENCE_LENGTH):
        raise FeatureInputError(f"manifest output_sequence_length is not {SEQUENCE_LENGTH} for {path}")

    original = arrays["original_landmarks"]
    actual_invalid = ~np.isfinite(original).all(axis=-1)
    if not np.array_equal(actual_invalid, arrays["invalid_landmark_mask"]):
        raise FeatureInputError(f"invalid_landmark_mask does not match original coordinates for {path}")
    finite_hand = ~actual_invalid.any(axis=-1)
    wrist, middle_mcp = original[:, :, 0], original[:, :, 9]
    scale = np.linalg.norm(middle_mcp - wrist, axis=-1)
    expected_scale = (
        (arrays["detection_mask"] | arrays["imputation_mask"])
        & np.isfinite(wrist).all(axis=-1)
        & np.isfinite(middle_mcp).all(axis=-1)
        & np.isfinite(scale)
        & (scale > 0)
    )
    if not np.array_equal(expected_scale, arrays["scale_validity_mask"]):
        raise FeatureInputError(f"scale_validity_mask does not match coordinate scale for {path}")
    expected_hand_validity = arrays["detection_mask"] & finite_hand & arrays["scale_validity_mask"]
    if not np.array_equal(expected_hand_validity, arrays["hand_validity_mask"]):
        raise FeatureInputError(f"hand_validity_mask is inconsistent for {path}")
    if np.any(arrays["hand_validity_mask"] & ~np.isfinite(landmarks).all(axis=(-1, -2))):
        raise FeatureInputError(f"valid hand slot has nonfinite normalized coordinates for {path}")
    if not np.isfinite(arrays["sequence_timestamps_ms"].astype(np.float64)).all():
        raise FeatureInputError(f"timestamps contain nonfinite values for {path}")
    if arrays["source_frame_indices"].min() < 0:
        raise FeatureInputError(f"source_frame_indices contains a negative index for {path}")
    return arrays


def _feature_key(prefix: str, name: str) -> str:
    return f"{prefix}_{name}"


def _put_numeric(row: dict[str, Any], name: str, value: float | int | None) -> None:
    if value is None or not math.isfinite(float(value)):
        row[name] = ""
        row[f"{name}_available"] = 0
    else:
        row[name] = int(value) if isinstance(value, (int, np.integer)) else float(value)
        row[f"{name}_available"] = 1


def extract_record_features(arrays: dict[str, Any]) -> dict[str, Any]:
    """Return exactly one finite-or-blank feature row for one recording."""
    label = _scalar_text(arrays["class_label"], "class_label").upper()
    source_filename = _scalar_text(arrays["source_filename"], "source_filename")
    source_path = _scalar_text(arrays["source_relative_path"], "source_relative_path")
    recording_id = PurePosixPath(source_filename).stem
    row: dict[str, Any] = {
        "recording_id": recording_id,
        "source_filename": source_filename,
        "source_relative_path": source_path,
        "class_label": label,
    }
    coords = arrays["normalized_landmarks"]
    original = arrays["original_landmarks"]
    valid = arrays["hand_validity_mask"]
    detection = arrays["detection_mask"]
    handedness = arrays["handedness"]
    timestamps = arrays["sequence_timestamps_ms"].astype(np.float64)
    frame_indices = arrays["source_frame_indices"].astype(np.float64)

    ts_valid = bool(np.isfinite(timestamps).all() and (len(timestamps) < 2 or np.all(np.diff(timestamps) > 0)))
    try:
        source_fps = float(np.asarray(arrays["source_fps"]).item())
    except (KeyError, ValueError):
        source_fps = float("nan")
    fps_valid = math.isfinite(source_fps) and source_fps > 0
    if ts_valid:
        time_s = (timestamps - timestamps[0]) / 1000.0
        time_basis = "sequence_timestamps_ms"
    elif fps_valid and np.all(np.diff(frame_indices) >= 0):
        time_s = (frame_indices - frame_indices[0]) / source_fps
        time_basis = "source_frame_indices/source_fps"
    else:
        time_s = None
        time_basis = "unavailable"

    _put_numeric(row, "overall_valid_hand_frame_ratio", float(valid.mean()))
    row["temporal_time_basis"] = time_basis
    for slot in range(SLOT_COUNT):
        prefix = f"slot{slot}"
        slot_valid_indices = np.flatnonzero(valid[:, slot])
        valid_count = int(valid[:, slot].sum())
        _put_numeric(row, f"{prefix}_valid_frame_count", valid_count)
        _put_numeric(row, f"{prefix}_missing_frame_count", int(valid.shape[0] - valid_count))
        _put_numeric(row, f"{prefix}_valid_frame_ratio", valid_count / valid.shape[0])

        labels = [str(value) for value in handedness[detection[:, slot], slot] if str(value)]
        if labels:
            counts = Counter(labels)
            mode = min((name for name, count in counts.items() if count == max(counts.values())), key=str.casefold)
            _put_numeric(row, f"{prefix}_handedness_consistency", counts[mode] / len(labels))
            row[f"{prefix}_handedness_mode"] = mode
            row[f"{prefix}_handedness_mode_available"] = 1
        else:
            _put_numeric(row, f"{prefix}_handedness_consistency", None)
            row[f"{prefix}_handedness_mode"] = ""
            row[f"{prefix}_handedness_mode_available"] = 0

        static_by_name: dict[str, list[float]] = {name: [] for name in FRAME_FEATURES}
        geometry_by_frame: dict[int, dict[str, float | None]] = {}
        for frame in slot_valid_indices:
            geometry = _frame_geometry(coords[frame, slot])
            geometry_by_frame[int(frame)] = geometry
            for name, value in geometry.items():
                if name in static_by_name and value is not None and math.isfinite(value):
                    static_by_name[name].append(float(value))
        for name in FRAME_FEATURES:
            _put_numeric(row, f"{prefix}_{name}_mean", _safe_mean(static_by_name[name]))
            _put_numeric(row, f"{prefix}_{name}_std", _safe_std(static_by_name[name]))

        # Circular orientation mean is represented with mean sine/cosine; avoid averaging angles across wraparound.
        sin_values = static_by_name["palm_axis_orientation_sin"]
        cos_values = static_by_name["palm_axis_orientation_cos"]
        sin_mean, cos_mean = _safe_mean(sin_values), _safe_mean(cos_values)
        circular_mean = None
        if sin_mean is not None and cos_mean is not None and (sin_mean != 0 or cos_mean != 0):
            circular_mean = math.degrees(math.atan2(sin_mean, cos_mean))
        _put_numeric(row, f"{prefix}_palm_axis_circular_mean_deg", circular_mean)

        # Frame-to-frame motion is computed only for adjacent frames with valid observations in this slot.
        pair_specs: list[tuple[int, int, int, float | None]] = []
        for frame in range(coords.shape[0] - 1):
            if not (valid[frame, slot] and valid[frame + 1, slot]):
                continue
            delta_t = None if time_s is None else float(time_s[frame + 1] - time_s[frame])
            if delta_t is not None and (not math.isfinite(delta_t) or delta_t <= 0):
                continue
            pair_specs.append((frame, frame + 1, frame, delta_t))

        all_displacements: list[float] = []
        interval_magnitudes: list[float] = []
        speed_magnitudes: list[float] = []
        wrist_steps: list[float] = []
        wrist_speeds: list[float] = []
        digit_speeds: dict[str, list[float]] = {digit: [] for digit in DIGITS}
        angle_changes: dict[str, list[float]] = {digit: [] for digit in DIGITS}
        for left, right, _, delta_t in pair_specs:
            point_delta = coords[right, slot] - coords[left, slot]
            displacement = np.linalg.norm(point_delta, axis=-1)
            point_means = displacement[np.isfinite(displacement)]
            if point_means.size:
                interval_mean = float(np.mean(point_means))
                all_displacements.extend(float(value) for value in point_means)
                interval_magnitudes.append(interval_mean)
                if delta_t is not None:
                    speed_magnitudes.append(interval_mean / delta_t)
            wrist_delta = original[right, slot, 0, :2] - original[left, slot, 0, :2]
            wrist_distance = float(np.linalg.norm(wrist_delta)) if np.isfinite(wrist_delta).all() else float("nan")
            if math.isfinite(wrist_distance):
                wrist_steps.append(wrist_distance)
                if delta_t is not None:
                    wrist_speeds.append(wrist_distance / delta_t)
            for digit, indices in DIGITS.items():
                digit_delta = displacement[np.asarray(indices)]
                digit_delta = digit_delta[np.isfinite(digit_delta)]
                if digit_delta.size and delta_t is not None:
                    digit_speeds[digit].append(float(np.mean(digit_delta)) / delta_t)
            left_geometry = geometry_by_frame.get(left) or _frame_geometry(coords[left, slot])
            right_geometry = geometry_by_frame.get(right) or _frame_geometry(coords[right, slot])
            for digit, triples in FINGER_ANGLE_TRIPLES.items():
                for joint_i in range(1, len(triples) + 1):
                    key = f"{digit}_joint{joint_i}_angle_deg"
                    a, b = left_geometry.get(key), right_geometry.get(key)
                    if a is not None and b is not None:
                        angle_changes[digit].append(abs(float(b) - float(a)))

        _put_numeric(row, f"{prefix}_mean_landmark_displacement_norm", _safe_mean(all_displacements))
        _put_numeric(row, f"{prefix}_std_landmark_displacement_norm", _safe_std(all_displacements))
        _put_numeric(row, f"{prefix}_mean_motion_magnitude_norm_per_s", _safe_mean(speed_magnitudes))
        _put_numeric(row, f"{prefix}_max_motion_magnitude_norm_per_s", max(speed_magnitudes) if speed_magnitudes else None)
        variation = [abs(b - a) for a, b in zip(interval_magnitudes, interval_magnitudes[1:])]
        _put_numeric(row, f"{prefix}_motion_variation_norm_per_interval", _safe_mean(variation))
        _put_numeric(row, f"{prefix}_valid_motion_interval_count", len(pair_specs))
        for digit in DIGITS:
            _put_numeric(row, f"{prefix}_{digit}_mean_motion_norm_per_s", _safe_mean(digit_speeds[digit]))
            _put_numeric(row, f"{prefix}_{digit}_max_motion_norm_per_s", max(digit_speeds[digit]) if digit_speeds[digit] else None)
            _put_numeric(row, f"{prefix}_{digit}_mean_abs_joint_angle_change_deg", _safe_mean(angle_changes[digit]))

        valid_wrist_frames = [int(i) for i in slot_valid_indices if np.isfinite(original[i, slot, 0, :2]).all()]
        wrist_positions = original[valid_wrist_frames, slot, 0, :2] if valid_wrist_frames else np.empty((0, 2))
        # Sum only consecutive valid wrist pairs; do not silently bridge a missing interval.
        wrist_path = float(sum(wrist_steps)) if wrist_steps else None
        _put_numeric(row, f"{prefix}_wrist_path_length_image_norm", wrist_path)
        _put_numeric(row, f"{prefix}_wrist_mean_step_image_norm", _safe_mean(wrist_steps))
        _put_numeric(row, f"{prefix}_wrist_mean_speed_image_norm_per_s", _safe_mean(wrist_speeds))
        _put_numeric(row, f"{prefix}_wrist_max_speed_image_norm_per_s", max(wrist_speeds) if wrist_speeds else None)
        endpoint_delta = (
            float(np.linalg.norm(wrist_positions[-1] - wrist_positions[0]))
            if len(wrist_positions) > 1 else None
        )
        _put_numeric(row, f"{prefix}_wrist_start_to_end_displacement_image_norm", endpoint_delta)
        _put_numeric(row, f"{prefix}_wrist_valid_position_count", len(valid_wrist_frames))

    return row


def _feature_columns() -> list[str]:
    columns = ["recording_id", "source_filename", "source_relative_path", "class_label", "overall_valid_hand_frame_ratio", "overall_valid_hand_frame_ratio_available", "temporal_time_basis"]
    for slot in range(SLOT_COUNT):
        p = f"slot{slot}"
        for name in ("valid_frame_count", "missing_frame_count", "valid_frame_ratio", "handedness_consistency"):
            key = f"{p}_{name}"
            columns.extend((key, f"{key}_available"))
        columns.extend((f"{p}_handedness_mode", f"{p}_handedness_mode_available"))
        for feature in FRAME_FEATURES:
            for stat in ("mean", "std"):
                key = f"{p}_{feature}_{stat}"
                columns.extend((key, f"{key}_available"))
        key = f"{p}_palm_axis_circular_mean_deg"
        columns.extend((key, f"{key}_available"))
        motion_names = [
            "mean_landmark_displacement_norm", "std_landmark_displacement_norm",
            "mean_motion_magnitude_norm_per_s", "max_motion_magnitude_norm_per_s",
            "motion_variation_norm_per_interval", "valid_motion_interval_count",
        ]
        for digit in DIGITS:
            motion_names.extend((f"{digit}_mean_motion_norm_per_s", f"{digit}_max_motion_norm_per_s", f"{digit}_mean_abs_joint_angle_change_deg"))
        motion_names.extend((
            "wrist_path_length_image_norm", "wrist_mean_step_image_norm",
            "wrist_mean_speed_image_norm_per_s", "wrist_max_speed_image_norm_per_s",
            "wrist_start_to_end_displacement_image_norm", "wrist_valid_position_count",
        ))
        for name in motion_names:
            key = f"{p}_{name}"
            columns.extend((key, f"{key}_available"))
    return columns


FEATURE_COLUMNS = _feature_columns()


def _definition_for_column(column: str) -> dict[str, str]:
    """Return a concrete formula and unit for a numeric or categorical feature column."""
    name = column.removeprefix("slot0_").removeprefix("slot1_")
    if name == "overall_valid_hand_frame_ratio":
        return {"formula": "sum(hand_validity_mask) divided by all frame-slot positions across both slots in this 32-frame sequence.", "units": "ratio in [0,1]", "aggregation": "one value per recording"}
    if name in {"valid_frame_count", "missing_frame_count", "valid_frame_ratio"}:
        formulas = {
            "valid_frame_count": "Count of frames with hand_validity_mask true for this slot.",
            "missing_frame_count": "32 minus valid_frame_count for this slot.",
            "valid_frame_ratio": "valid_frame_count divided by 32 for this slot.",
        }
        units = "ratio in [0,1]" if name.endswith("ratio") else "frames"
        return {"formula": formulas[name], "units": units, "aggregation": "one value per recording"}
    if name == "handedness_mode":
        return {"formula": "Most frequent nonempty handedness label among detected observations for this slot; ties are resolved alphabetically, case-insensitively.", "units": "category (Left/Right when provided)", "aggregation": "one value per recording"}
    if name == "handedness_consistency":
        return {"formula": "Count of the modal nonempty handedness label divided by all nonempty handedness labels among detected observations for this slot.", "units": "ratio in [0,1]", "aggregation": "one value per recording"}
    if name == "palm_axis_circular_mean_deg":
        return {"formula": "atan2(mean(sin(theta)), mean(cos(theta))) for valid-frame image-plane wrist-to-middle-MCP angles.", "units": "degrees in image x-y plane (y increases downward)", "aggregation": "circular mean over valid frames"}

    aggregate = None
    base = name
    for suffix in ("_mean", "_std"):
        if name.endswith(suffix) and name[:-len(suffix)] in FRAME_FEATURES:
            base = name[:-len(suffix)]
            aggregate = "arithmetic mean" if suffix == "_mean" else "population standard deviation (ddof=0)"
            break
    if base in FRAME_FEATURES:
        if base.endswith("_angle_deg"):
            formula, units = "Internal angle at the named joint, acos((a-b) dot (c-b) / (|a-b||c-b|)) using the three landmark indices for that digit and joint.", "degrees"
        elif "tip_to_wrist" in base:
            formula, units = "Euclidean distance from the digit tip to wrist landmark 0 in scale-normalized coordinates.", "normalized-coordinate units"
        elif "tip_to_palm_center" in base:
            formula, units = "Euclidean distance from the digit tip to the mean of wrist and four MCP landmarks (0,5,9,13,17) in scale-normalized coordinates.", "normalized-coordinate units"
        elif base.endswith("_extension_ratio"):
            formula, units = "Tip-to-base chord length divided by the sum of adjacent digit-segment lengths (thumb base is CMC landmark 1; other bases are MCP landmarks); bounded to [0,1].", "unitless ratio"
        elif base == "palm_length_norm":
            formula, units = "Euclidean distance from wrist landmark 0 to middle-finger MCP landmark 9.", "normalized-coordinate units"
        elif base == "palm_span_norm":
            formula, units = "Euclidean distance between index MCP landmark 5 and pinky MCP landmark 17.", "normalized-coordinate units"
        elif base == "wrist_to_palm_center_norm":
            formula, units = "Euclidean distance from wrist to the mean of wrist and MCP landmarks (0,5,9,13,17).", "normalized-coordinate units"
        elif base.startswith("mcp_"):
            formula, units = "Euclidean distance between the two MCP landmark indices encoded in the column name.", "normalized-coordinate units"
        elif base == "palm_projected_area_norm2":
            formula, units = "Absolute shoelace area of polygon (wrist, index MCP, middle MCP, ring MCP, pinky MCP) in normalized x-y coordinates.", "normalized-coordinate units squared"
        elif base == "palm_axis_orientation_sin":
            formula, units = "Sine of atan2(middle-MCP_y-wrist_y, middle-MCP_x-wrist_x).", "unitless"
        elif base == "palm_axis_orientation_cos":
            formula, units = "Cosine of atan2(middle-MCP_y-wrist_y, middle-MCP_x-wrist_x).", "unitless"
        else:
            formula, units = "atan2(middle-MCP_y-wrist_y, middle-MCP_x-wrist_x) in normalized image x-y coordinates (image y increases downward).", "degrees"
        return {"formula": formula, "units": units, "aggregation": f"{aggregate} over valid frames"}

    formulas = {
        "mean_landmark_displacement_norm": ("Mean Euclidean displacement across all 21 landmarks and all adjacent valid frame pairs in this slot.", "normalized-coordinate units"),
        "std_landmark_displacement_norm": ("Population standard deviation of Euclidean displacement across all 21 landmarks and all adjacent valid frame pairs in this slot.", "normalized-coordinate units"),
        "mean_motion_magnitude_norm_per_s": ("Mean across adjacent valid pairs of mean 21-landmark displacement divided by elapsed timestamp seconds.", "normalized-coordinate units per second"),
        "max_motion_magnitude_norm_per_s": ("Maximum across adjacent valid pairs of mean 21-landmark displacement divided by elapsed timestamp seconds.", "normalized-coordinate units per second"),
        "motion_variation_norm_per_interval": ("Mean absolute difference between successive valid-pair mean landmark displacements; not time-normalized.", "normalized-coordinate units per interval"),
        "valid_motion_interval_count": ("Number of adjacent frame pairs for which this hand slot is valid in both frames.", "intervals"),
        "wrist_path_length_image_norm": ("Sum of image-normalized x-y wrist displacements over adjacent valid frame pairs; missing pairs are not bridged.", "image-normalized coordinate units"),
        "wrist_mean_step_image_norm": ("Mean image-normalized x-y wrist displacement over adjacent valid frame pairs.", "image-normalized coordinate units"),
        "wrist_mean_speed_image_norm_per_s": ("Mean image-normalized x-y wrist displacement divided by elapsed seconds over adjacent valid pairs.", "image-normalized coordinate units per second"),
        "wrist_max_speed_image_norm_per_s": ("Maximum image-normalized x-y wrist displacement divided by elapsed seconds over adjacent valid pairs.", "image-normalized coordinate units per second"),
        "wrist_start_to_end_displacement_image_norm": ("Euclidean image-normalized x-y displacement between the first and last valid wrist observations in this slot.", "image-normalized coordinate units"),
        "wrist_valid_position_count": ("Number of valid frames with a finite x-y wrist position in this slot.", "frames"),
    }
    for digit in DIGITS:
        formulas[f"{digit}_mean_motion_norm_per_s"] = (f"Mean per-valid-pair average landmark speed over the {digit} landmarks (four points), using elapsed timestamp seconds.", "normalized-coordinate units per second")
        formulas[f"{digit}_max_motion_norm_per_s"] = (f"Maximum per-valid-pair average landmark speed over the {digit} landmarks (four points), using elapsed timestamp seconds.", "normalized-coordinate units per second")
        formulas[f"{digit}_mean_abs_joint_angle_change_deg"] = (f"Mean absolute frame-to-frame change across the three internal {digit} joint angles over adjacent valid frame pairs.", "degrees per interval")
    if name in formulas:
        formula, units = formulas[name]
        return {"formula": formula, "units": units, "aggregation": "recording-level summary"}
    raise FeatureInputError(f"no metadata definition for feature column {column}")


def _metadata() -> dict[str, Any]:
    feature_columns = [
        col for col in FEATURE_COLUMNS
        if not col.endswith("_available")
        and col not in {"recording_id", "source_filename", "source_relative_path", "class_label", "temporal_time_basis"}
    ]
    numeric_columns = [col for col in feature_columns if not col.endswith("_handedness_mode")]
    definitions = {col: _definition_for_column(col) for col in feature_columns}
    return {
        "schema_version": "1.0",
        "input": {"root": "datasets/processed/model_ready/hand_gestures", "expected_recordings": 27, "classes": CLASS_COUNTS, "sequence_shape": [32, 2, 21, 3], "participant_count": 1},
        "generalization_note": "All current recordings are from one participant; these features do not establish participant-independent generalization.",
        "outputs": ["features.csv", "feature_metadata.json", "feature_manifest.csv"],
        "row_unit": "one original recording; never one row per frame",
        "coordinate_convention": "Static geometry uses normalized_landmarks: wrist-relative and divided by the Euclidean wrist-to-middle-MCP distance. Wrist trajectory uses original_landmarks x-y image-normalized coordinates. Neither represents physical distance.",
        "landmark_definitions": {"wrist": 0, "thumb": [1, 2, 3, 4], "index": [5, 6, 7, 8], "middle": [9, 10, 11, 12], "ring": [13, 14, 15, 16], "pinky": [17, 18, 19, 20], "finger_angles": "Three internal angles per digit at successive joints; angle vertices are listed in FINGER_ANGLE_TRIPLES in the extractor."},
        "features": definitions,
        "temporal_policy": "Frame-to-frame features use only adjacent frames where the same slot has hand_validity_mask true in both. Timestamps in milliseconds are used when finite and strictly increasing; otherwise frame-index differences/source_fps are used if available. Motion rates are normalized-coordinate units per second, never real-world speed. Wrist path uses original normalized image x-y coordinates.",
        "missing_data_policy": "No interpolation. Geometry uses only valid hand frames. Temporal transitions require two adjacent valid observations in the same slot. Unavailable feature values are blank in CSV and have a paired *_available=0 indicator. No missing coordinates are zero-filled. Reliability counts/ratios are always available; handedness mode/consistency are unavailable if no labeled detections exist.",
        "hand_policy": "Two slots are processed independently and retained as slot0 and slot1; no slot swapping or left/right merging. Handedness mode and consistency are provided per slot.",
        "static_summary_policy": "For per-frame static features, store mean and population standard deviation over valid frames. Orientation has circular mean represented by sine/cosine means and a circular mean angle.",
        "csv_columns": FEATURE_COLUMNS,
        "numeric_feature_count": len(numeric_columns),
        "categorical_feature_count": len(feature_columns) - len(numeric_columns),
        "feature_count": len(feature_columns),
    }


def _units_for_column(column: str) -> str:
    if column.endswith("_ratio") or column.endswith("_consistency"):
        return "ratio in [0,1]"
    if "_count" in column:
        return "count"
    if "_per_s" in column:
        return "normalized-coordinate units per second"
    if "_angle" in column or "orientation" in column:
        return "degrees"
    if "area" in column:
        return "normalized-coordinate units squared"
    if "displacement" in column or "distance" in column or "length" in column or "span" in column or "path" in column or "step" in column:
        return "normalized-coordinate units"
    return "unitless"


def _atomic_write(path: Path, writer: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False) as handle:
            temp_name = handle.name
            writer(handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def run_pipeline(input_root: Path = DEFAULT_INPUT_ROOT, output_root: Path = DEFAULT_OUTPUT_ROOT) -> dict[str, Any]:
    input_root = input_root.expanduser().resolve()
    output_root = output_root.expanduser().resolve()
    if not input_root.is_dir():
        raise FeatureInputError(f"input directory does not exist: {input_root}")
    if input_root == output_root or input_root in output_root.parents or output_root in input_root.parents:
        raise FeatureInputError("input and output roots must be separate, non-overlapping directories")
    manifest_map = _read_input_manifest(input_root)
    records = sorted(path for path in input_root.glob("*/*.npz") if path.is_file())
    if len(records) != sum(CLASS_COUNTS.values()):
        raise FeatureInputError(f"expected 27 input NPZ files, found {len(records)}")
    class_counts = Counter(path.parent.name.upper() for path in records)
    if dict(class_counts) != CLASS_COUNTS:
        raise FeatureInputError(f"class distribution differs from expected {CLASS_COUNTS}: {dict(class_counts)}")
    record_paths = {path.relative_to(input_root).as_posix() for path in records}
    if record_paths != set(manifest_map):
        missing = sorted(set(manifest_map) - record_paths)
        extra = sorted(record_paths - set(manifest_map))
        raise FeatureInputError(f"input manifest/files differ; missing files={missing}, unlisted files={extra}")

    loaded: list[tuple[Path, dict[str, str], dict[str, Any]]] = []
    seen_ids: set[str] = set()
    for path in records:
        rel = path.relative_to(input_root).as_posix()
        row = manifest_map[rel]
        arrays = load_record(path, row)
        recording_id = PurePosixPath(_scalar_text(arrays["source_filename"], "source_filename")).stem
        if recording_id in seen_ids:
            raise FeatureInputError(f"duplicate recording identifier: {recording_id}")
        seen_ids.add(recording_id)
        try:
            source_frames = int(row["source_frame_count"])
            manifest_valid_rate = float(row["valid_hand_rate"])
        except (KeyError, TypeError, ValueError) as error:
            raise FeatureInputError(f"invalid source stats in input manifest for {rel}: {error}") from error
        if source_frames < 1 or not math.isfinite(manifest_valid_rate) or not 0 <= manifest_valid_rate <= 1:
            raise FeatureInputError(f"invalid source stats in input manifest for {rel}")
        loaded.append((path, row, arrays))

    # Validate and calculate every row before creating any final output path.
    feature_rows: list[dict[str, Any]] = []
    manifest_rows: list[dict[str, Any]] = []
    for path, source_row, arrays in loaded:
        row = extract_record_features(arrays)
        if list(row) != FEATURE_COLUMNS:
            # dict insertion order is part of the reproducible CSV schema.
            raise FeatureInputError(f"internal feature-column order mismatch for {path}")
        for name, value in row.items():
            if isinstance(value, float) and not math.isfinite(value):
                raise FeatureInputError(f"nonfinite feature {name} in {path}")
        feature_rows.append(row)
        numeric_columns = [
            key for key in row
            if not key.endswith("_available")
            and key not in {"recording_id", "source_filename", "source_relative_path", "class_label", "temporal_time_basis"}
            and not key.endswith("_handedness_mode")
        ]
        manifest_rows.append({
            "recording_id": row["recording_id"],
            "source_filename": row["source_filename"],
            "source_relative_path": row["source_relative_path"],
            "class_label": row["class_label"],
            "feature_row": len(feature_rows) - 1,
            "processing_status": "ok",
            "available_numeric_feature_count": sum(row.get(f"{key}_available") == 1 for key in numeric_columns),
            "total_numeric_feature_count": len(numeric_columns),
            "error_or_warning": "",
        })

    output_root.mkdir(parents=True, exist_ok=True)
    features_path = output_root / "features.csv"
    manifest_path = output_root / "feature_manifest.csv"
    metadata_path = output_root / "feature_metadata.json"
    def write_features(handle: Any) -> None:
        writer = csv.DictWriter(handle, fieldnames=FEATURE_COLUMNS, extrasaction="raise")
        writer.writeheader()
        writer.writerows(feature_rows)
    def write_manifest(handle: Any) -> None:
        fields = ("recording_id", "source_filename", "source_relative_path", "class_label", "feature_row", "processing_status", "available_numeric_feature_count", "total_numeric_feature_count", "error_or_warning")
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="raise")
        writer.writeheader()
        writer.writerows(manifest_rows)
    _atomic_write(features_path, write_features)
    _atomic_write(manifest_path, write_manifest)
    metadata = _metadata()
    metadata["validation"] = {"validated_recordings": len(loaded), "class_counts": dict(sorted(class_counts.items())), "generated_feature_rows": len(feature_rows)}
    _atomic_write(metadata_path, lambda handle: json.dump(metadata, handle, indent=2, sort_keys=False, ensure_ascii=False) or handle.write("\n"))
    return {
        "recordings": len(feature_rows),
        "feature_columns": len(FEATURE_COLUMNS),
        "numeric_feature_count": metadata["numeric_feature_count"],
        "categorical_feature_count": metadata["categorical_feature_count"],
        "feature_count": metadata["feature_count"],
        "outputs": [str(features_path), str(metadata_path), str(manifest_path)],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", type=Path, default=DEFAULT_INPUT_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()
    try:
        summary = run_pipeline(args.input_root, args.output_root)
    except (OSError, FeatureInputError, ValueError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(
        f"Generated {summary['recordings']} recording-level rows, "
        f"{summary['feature_count']} feature values ({summary['numeric_feature_count']} numeric, "
        f"{summary['categorical_feature_count']} categorical), {summary['feature_columns']} CSV columns"
    )
    for path in summary["outputs"]:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
