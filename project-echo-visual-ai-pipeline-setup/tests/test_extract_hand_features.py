from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from scripts.extract_hand_features import (
    CLASS_COUNTS,
    FEATURE_COLUMNS,
    _angle_degrees,
    _distance,
    extract_record_features,
    run_pipeline,
)


def make_arrays(label: str = "YES", filename: str = "clip.mp4", frame_count: int = 32) -> dict[str, np.ndarray]:
    original = np.zeros((frame_count, 2, 21, 3), dtype=np.float32)
    normalized = np.zeros_like(original)
    # A nonzero scale and simple nondegenerate hand shape in each frame.
    base = np.asarray([
        [0.0, 0.0, 0.0], [0.1, -0.1, 0], [0.2, -0.2, 0], [0.3, -0.2, 0], [0.4, -0.1, 0],
        [0.3, 0.1, 0], [0.3, 0.3, 0], [0.3, 0.5, 0], [0.3, 0.7, 0],
        [0.0, 0.1, 0], [0.0, 0.3, 0], [0.0, 0.5, 0], [0.0, 0.7, 0],
        [-0.2, 0.1, 0], [-0.2, 0.3, 0], [-0.2, 0.5, 0], [-0.2, 0.7, 0],
        [-0.4, 0.1, 0], [-0.4, 0.3, 0], [-0.4, 0.5, 0], [-0.4, 0.7, 0],
    ], dtype=np.float32)
    for frame in range(frame_count):
        normalized[frame, 0] = base
        normalized[frame, 0, :, 0] += frame * 0.1
        original[frame, 0] = base
        original[frame, 0, :, 0] += frame * 0.1
    detection = np.zeros((frame_count, 2), dtype=np.bool_)
    detection[:, 0] = True
    handedness = np.full((frame_count, 2), "", dtype="U8")
    handedness[:, 0] = "Left"
    valid = detection.copy()
    scale_valid = detection.copy()
    invalid = np.zeros((frame_count, 2, 21), dtype=np.bool_)
    # Unavailable slot derived coordinates are NaN; original extractor retains finite raw defaults.
    normalized[:, 1] = np.nan
    return {
        "original_landmarks": original,
        "wrist_relative_landmarks": normalized.copy(),
        "normalized_landmarks": normalized,
        "detection_mask": detection,
        "hand_validity_mask": valid,
        "invalid_landmark_mask": invalid,
        "imputation_mask": np.zeros_like(detection),
        "scale_validity_mask": scale_valid,
        "handedness": handedness,
        "handedness_score": detection.astype(np.float32),
        "sequence_timestamps_ms": np.arange(frame_count, dtype=np.int64) * 2000,
        "source_frame_indices": np.arange(frame_count, dtype=np.int64),
        "class_label": np.asarray(label),
        "source_filename": np.asarray(filename),
        "source_relative_path": np.asarray(f"{label}/{filename}"),
        "source_fps": np.asarray(20.0, dtype=np.float32),
        "timestamp_basis": np.asarray("test timestamps"),
        "timestamp_resampling_method": np.asarray("test"),
        "coordinate_convention": np.asarray("test convention"),
    }


class ExtractHandFeaturesTests(unittest.TestCase):
    def test_angle_and_distance_calculation(self):
        self.assertAlmostEqual(_angle_degrees(np.asarray([1., 0, 0]), np.zeros(3), np.asarray([0., 1, 0])), 90.0)
        self.assertAlmostEqual(_distance(np.asarray([1., 2, 3]), np.zeros(3)), np.sqrt(14))
        self.assertIsNone(_angle_degrees(np.zeros(3), np.zeros(3), np.ones(3)))

    def test_missing_hand_has_blank_geometry_and_separate_reliability(self):
        row = extract_record_features(make_arrays())
        self.assertEqual(row["slot0_valid_frame_count"], 32)
        self.assertEqual(row["slot1_valid_frame_count"], 0)
        self.assertEqual(row["slot1_index_joint1_angle_deg_mean"], "")
        self.assertEqual(row["slot1_index_joint1_angle_deg_mean_available"], 0)
        self.assertEqual(row["slot0_index_joint1_angle_deg_mean_available"], 1)
        self.assertEqual(row["overall_valid_hand_frame_ratio"], 0.5)

    def test_no_nan_or_inf_values_are_written_to_feature_row(self):
        row = extract_record_features(make_arrays())
        for value in row.values():
            self.assertFalse(isinstance(value, float) and not np.isfinite(value))

    def test_temporal_motion_and_timestamp_based_rate(self):
        row = extract_record_features(make_arrays())
        # Coordinate changes by 0.1 per 2 seconds: timestamp-based rate is 0.05/s.
        self.assertAlmostEqual(row["slot0_mean_motion_magnitude_norm_per_s"], 0.05)
        self.assertAlmostEqual(row["slot0_index_mean_motion_norm_per_s"], 0.05)
        self.assertEqual(row["temporal_time_basis"], "sequence_timestamps_ms")
        self.assertAlmostEqual(row["slot0_wrist_start_to_end_displacement_image_norm"], 3.1, places=6)

    def test_hand_slots_are_independent(self):
        arrays = make_arrays()
        row = extract_record_features(arrays)
        self.assertEqual(row["slot0_valid_frame_count"], 32)
        self.assertEqual(row["slot1_valid_frame_count"], 0)
        self.assertEqual(row["slot0_valid_frame_ratio"], 1.0)
        self.assertEqual(row["slot1_valid_frame_ratio"], 0.0)

    def test_stable_column_order_and_deterministic_values(self):
        arrays = make_arrays()
        first = extract_record_features(arrays)
        second = extract_record_features(arrays)
        self.assertEqual(list(first), FEATURE_COLUMNS)
        self.assertEqual(list(second), FEATURE_COLUMNS)
        self.assertEqual(first, second)

    def test_pipeline_writes_one_row_per_recording_with_metadata_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_root = root / "input"
            output_root = root / "output"
            manifest_rows = []
            for label, count in CLASS_COUNTS.items():
                (input_root / label).mkdir(parents=True)
                for index in range(count):
                    filename = f"{label.lower()}_{index}.npz"
                    arrays = make_arrays(label, filename.removesuffix(".npz") + ".mp4")
                    arrays["source_relative_path"] = np.asarray(f"{label}/{filename.removesuffix('.npz')}.mp4")
                    with (input_root / label / filename).open("wb") as handle:
                        np.savez_compressed(handle, **arrays)
                    manifest_rows.append({
                        "source_filename": filename.removesuffix(".npz") + ".mp4",
                        "source_relative_path": f"{label}/{filename.removesuffix('.npz')}.mp4",
                        "class_label": label,
                        "source_frame_count": 100,
                        "output_sequence_length": 32,
                        "detection_rate": 1.0,
                        "valid_hand_rate": 0.5,
                        "invalid_landmark_count": 0,
                        "timestamp_resampling_method": "timestamp_nearest",
                        "output_filename": f"{label}/{filename}",
                        "processing_status": "ok",
                        "error_or_warning": "",
                    })
            fields = list(manifest_rows[0])
            with (input_root / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(manifest_rows)

            summary = run_pipeline(input_root, output_root)
            self.assertEqual(summary["recordings"], 27)
            with (output_root / "features.csv").open(newline="", encoding="utf-8") as handle:
                feature_rows = list(csv.DictReader(handle))
            with (output_root / "feature_manifest.csv").open(newline="", encoding="utf-8") as handle:
                output_manifest = list(csv.DictReader(handle))
            metadata = json.loads((output_root / "feature_metadata.json").read_text())
            self.assertEqual(len(feature_rows), 27)
            self.assertEqual(len(output_manifest), 27)
            self.assertEqual(len({row["recording_id"] for row in feature_rows}), 27)
            self.assertEqual(metadata["validation"]["validated_recordings"], 27)
            self.assertEqual(len(metadata["csv_columns"]), len(FEATURE_COLUMNS))


if __name__ == "__main__":
    unittest.main()
