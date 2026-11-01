from __future__ import annotations

import csv
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np

from scripts.preprocess_hand_landmarks import (
    atomic_save_npz,
    preprocess_arrays,
    resample_indices,
    run_pipeline,
)


def make_arrays(frame_count: int = 3) -> dict[str, np.ndarray]:
    landmarks = np.zeros((frame_count, 2, 21, 3), dtype=np.float32)
    landmarks[:, 0, 1] = np.asarray([0.5, 0.25, -0.1], dtype=np.float32)
    landmarks[:, 0, 0] = np.asarray([0.1, 0.2, 0.3], dtype=np.float32)
    landmarks[:, 0, 9] = np.asarray([0.1, 1.2, 0.3], dtype=np.float32)  # unit wrist-to-MCP scale
    detection = np.zeros((frame_count, 2), dtype=np.bool_)
    detection[:, 0] = True
    handedness = np.full((frame_count, 2), "", dtype="U8")
    handedness[:, 0] = "Left"
    return {
        "landmarks": landmarks,
        "detection_mask": detection,
        "handedness": handedness,
        "handedness_score": detection.astype(np.float32),
        "timestamps_ms": np.arange(frame_count, dtype=np.int64) * 50,
        "source_fps": np.asarray(20.0, dtype=np.float32),
        "timestamp_fps": np.asarray(20.0, dtype=np.float32),
        "timestamp_basis": np.asarray("frame_index / timestamp_fps"),
        "class_label": np.asarray("YES"),
        "source_filename": np.asarray("clip.mp4"),
        "source_relative_path": np.asarray("YES/clip.mp4"),
    }


class PreprocessHandLandmarksTests(unittest.TestCase):
    def test_wrist_relative_coordinates(self):
        result, _ = preprocess_arrays(make_arrays(), sequence_length=3)
        np.testing.assert_allclose(
            result["wrist_relative_landmarks"][0, 0, 1],
            np.asarray([0.4, 0.05, -0.4], dtype=np.float32),
        )

    def test_scale_normalization_uses_wrist_to_middle_mcp(self):
        result, _ = preprocess_arrays(make_arrays(), sequence_length=3)
        np.testing.assert_allclose(
            result["normalized_landmarks"][0, 0, 1],
            np.asarray([0.4, 0.05, -0.4], dtype=np.float32),
        )

    def test_zero_scale_invalidates_normalized_hand(self):
        arrays = make_arrays()
        arrays["landmarks"][:, 0, 9] = arrays["landmarks"][:, 0, 0]
        result, stats = preprocess_arrays(arrays, sequence_length=3)
        self.assertFalse(result["scale_validity_mask"][:, 0].any())
        self.assertFalse(result["hand_validity_mask"][:, 0].any())
        self.assertTrue(np.isnan(result["normalized_landmarks"][:, 0]).all())
        self.assertEqual(stats["invalid_scale_count"], 3)

    def test_missing_hand_is_distinct_from_invalid_landmarks(self):
        arrays = make_arrays()
        result, _ = preprocess_arrays(arrays, sequence_length=3)
        self.assertFalse(result["detection_mask"][:, 1].any())
        self.assertFalse(result["hand_validity_mask"][:, 1].any())
        self.assertFalse(result["invalid_landmark_mask"][:, 1].any())
        self.assertTrue(np.isnan(result["normalized_landmarks"][:, 1]).all())

    def test_nonfinite_landmark_is_flagged_without_clipping_or_replacement(self):
        arrays = make_arrays()
        arrays["landmarks"][1, 0, 4, 2] = np.nan
        original = arrays["landmarks"].copy()
        result, stats = preprocess_arrays(arrays, sequence_length=3)
        self.assertTrue(result["invalid_landmark_mask"][1, 0, 4])
        self.assertFalse(result["hand_validity_mask"][1, 0])
        self.assertTrue(np.isnan(result["normalized_landmarks"][1, 0, 4, 2]))
        np.testing.assert_array_equal(result["original_landmarks"], original)
        self.assertEqual(stats["invalid_landmark_count"], 1)

    def test_short_gap_interpolation_is_optional_and_explicit(self):
        arrays = make_arrays()
        arrays["detection_mask"][1, 0] = False
        arrays["handedness"][1, 0] = ""
        arrays["landmarks"][2, 0, 1, 0] = 0.9
        no_fill, _ = preprocess_arrays(arrays, sequence_length=3)
        filled, stats = preprocess_arrays(arrays, 3, True, 1)
        self.assertFalse(no_fill["imputation_mask"].any())
        self.assertTrue(filled["imputation_mask"][1, 0])
        self.assertFalse(filled["detection_mask"][1, 0])
        self.assertFalse(filled["hand_validity_mask"][1, 0])
        self.assertTrue(np.isfinite(filled["normalized_landmarks"][1, 0]).all())
        self.assertEqual(stats["imputed_hand_count"], 1)

    def test_timestamp_resampling_uses_time_axis(self):
        indices, sequence_times, method, _ = resample_indices(
            3, 4, np.asarray([0, 10, 1000], dtype=np.int64), 20.0, 20.0
        )
        np.testing.assert_array_equal(indices, [0, 1, 2, 2])
        np.testing.assert_array_equal(sequence_times, [0, 333, 667, 1000])
        self.assertEqual(method, "timestamp_nearest")

    def test_invalid_timestamp_order_falls_back_to_frame_index(self):
        indices, sequence_times, method, basis = resample_indices(
            3, 3, np.asarray([0, 0, 100], dtype=np.int64), 10.0, 20.0
        )
        np.testing.assert_array_equal(indices, [0, 1, 2])
        np.testing.assert_array_equal(sequence_times, [0, 100, 200])
        self.assertEqual(method, "frame_index_nearest_fallback")
        self.assertEqual(basis, "frame_index/timestamp_fps")

    def test_timestamp_shape_failure_uses_fallback(self):
        arrays = make_arrays()
        arrays["timestamps_ms"] = np.asarray([1], dtype=np.int64)
        _, stats = preprocess_arrays(arrays, sequence_length=4)
        self.assertEqual(stats["timestamp_resampling_method"], "frame_index_nearest_fallback")
        self.assertTrue(stats["timestamp_warning"])

    def test_short_and_long_recordings_produce_fixed_length(self):
        short, _ = preprocess_arrays(make_arrays(2), sequence_length=5)
        long, _ = preprocess_arrays(make_arrays(10), sequence_length=4)
        self.assertEqual(short["original_landmarks"].shape, (5, 2, 21, 3))
        self.assertEqual(long["original_landmarks"].shape, (4, 2, 21, 3))
        self.assertTrue(np.all(np.diff(short["source_frame_indices"]) >= 0))
        self.assertTrue(np.all(np.diff(long["source_frame_indices"]) >= 0))

    def test_output_is_deterministic(self):
        arrays = make_arrays(7)
        first, _ = preprocess_arrays(arrays, sequence_length=5)
        second, _ = preprocess_arrays(arrays, sequence_length=5)
        for key in first:
            np.testing.assert_array_equal(first[key], second[key])

    def test_pipeline_preserves_source_npz_and_writes_pickle_free_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_root = root / "landmarks"
            class_dir = input_root / "YES"
            class_dir.mkdir(parents=True)
            source = class_dir / "clip.npz"
            arrays = make_arrays(4)
            atomic_save_npz(source, arrays)
            before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            with (input_root / "manifest.csv").open("w", newline="", encoding="utf-8") as output:
                writer = csv.DictWriter(output, fieldnames=(
                    "source_filename", "source_relative_path", "class_label", "frame_count",
                    "detected_frame_count", "detection_rate", "fps", "output_filename", "status", "error",
                ))
                writer.writeheader()
                writer.writerow({
                    "source_filename": "clip.mp4", "source_relative_path": "YES/clip.mp4",
                    "class_label": "YES", "frame_count": 4, "detected_frame_count": 4,
                    "detection_rate": 1.0, "fps": 20.0, "output_filename": "YES/clip.npz", "status": "ok", "error": "",
                })
            output_root = root / "model_ready"
            rows, counts = run_pipeline(input_root, output_root, sequence_length=6, overwrite=True)
            self.assertEqual(counts["error"], 0)
            self.assertEqual(rows[-1]["processing_status"], "ok")
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before_hash)
            out_path = output_root / "YES" / "clip.npz"
            with np.load(out_path, allow_pickle=False) as saved:
                self.assertEqual(saved["original_landmarks"].shape, (6, 2, 21, 3))
                self.assertTrue(all(saved[key].dtype.kind != "O" for key in saved.files))
            self.assertTrue((output_root / "manifest.csv").is_file())


if __name__ == "__main__":
    unittest.main()
