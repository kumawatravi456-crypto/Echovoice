from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

import numpy as np

from scripts.train_hand_gesture_baseline import (
    EXPECTED_CLASS_COUNTS,
    FEATURE_COLUMNS,
    FIXED_LABEL_ORDER,
    DatasetValidationError,
    _compute_metrics,
    build_models,
    evaluate_baselines,
    load_dataset,
    validate_feature_allowlist,
)


def write_synthetic_features(path: Path) -> None:
    labels = ["YES"] * 7 + ["NO"] * 5 + ["HELP"] * 5 + ["WATER"] * 5 + ["STOP"] * 5
    fields = [
        "recording_id", "source_filename", "source_relative_path", "class_label",
        "feature_row", "temporal_time_basis", "slot0_valid_frame_ratio",
        "slot0_handedness_mode", "slot0_thumb_joint2_angle_deg_mean_available",
        "slot1_index_joint1_angle_deg_mean", *FEATURE_COLUMNS,
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, label in enumerate(labels):
            recording_id = f"recording_{index:02d}"
            row = {
                "recording_id": recording_id,
                "source_filename": f"{recording_id}.mp4",
                "source_relative_path": f"{label}/{recording_id}.mp4",
                "class_label": label,
                "feature_row": index,
                "temporal_time_basis": "sequence_timestamps_ms",
                "slot0_valid_frame_ratio": 1.0,
                "slot0_handedness_mode": "Right",
                "slot0_thumb_joint2_angle_deg_mean_available": 1,
                "slot1_index_joint1_angle_deg_mean": 99.0,
            }
            for feature_index, feature in enumerate(FEATURE_COLUMNS):
                row[feature] = 0.25 * index + 0.03 * feature_index + (label == "YES") * 0.1
            writer.writerow(row)


class HandGestureBaselineTests(unittest.TestCase):
    def test_exact_feature_allowlist_enforcement(self):
        validate_feature_allowlist(FEATURE_COLUMNS)
        with self.assertRaises(DatasetValidationError):
            validate_feature_allowlist([*FEATURE_COLUMNS, "slot0_valid_frame_ratio"])
        with self.assertRaises(DatasetValidationError):
            validate_feature_allowlist(["class_label", *FEATURE_COLUMNS[1:]])
        with self.assertRaises(DatasetValidationError):
            validate_feature_allowlist([*FEATURE_COLUMNS[:-1], "output_filename"])
        with self.assertRaises(DatasetValidationError):
            validate_feature_allowlist([*FEATURE_COLUMNS[:-1], "slot1_index_joint1_angle_deg_mean"])
        with self.assertRaises(DatasetValidationError):
            validate_feature_allowlist(FEATURE_COLUMNS[::-1])

    def test_loader_builds_recording_level_x_from_only_seven_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "features.csv"
            write_synthetic_features(path)
            data = load_dataset(path)
            self.assertEqual(data["X"].shape, (27, 7))
            self.assertEqual(data["feature_columns"], FEATURE_COLUMNS)
            self.assertEqual(data["y"].shape, (27,))
            self.assertEqual(data["class_counts"], EXPECTED_CLASS_COUNTS)
            self.assertTrue(np.isfinite(data["X"]).all())

    def test_recording_level_fold_integrity_and_one_oof_prediction_per_recording(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "features.csv"
            write_synthetic_features(path)
            data = load_dataset(path)
            evaluated = evaluate_baselines(data)
            for model in evaluated["models"].values():
                self.assertEqual(len(model["predictions"]), 27)
                self.assertEqual(len(model["prediction_folds"]), 27)
            test_occurrences = np.zeros(27, dtype=int)
            for fold in evaluated["models"]["logistic_regression"]["fold_fits"]:
                train = fold["train_indices"]
                test = fold["test_indices"]
                self.assertFalse(set(data["recording_id"][i] for i in train) & set(data["recording_id"][i] for i in test))
                test_occurrences[test] += 1
            np.testing.assert_array_equal(test_occurrences, np.ones(27, dtype=int))

    def test_scaler_is_fitted_on_training_fold_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "features.csv"
            write_synthetic_features(path)
            data = load_dataset(path)
            evaluated = evaluate_baselines(data)
            global_mean = data["X"].mean(axis=0)
            for fold in evaluated["models"]["logistic_regression"]["fold_fits"]:
                estimator = fold["estimator"]
                scaler = estimator.named_steps["standard_scaler"]
                train_mean = data["X"][fold["train_indices"]].mean(axis=0)
                np.testing.assert_allclose(scaler.mean_, train_mean)
                self.assertFalse(np.allclose(scaler.mean_, global_mean))
            models = build_models()
            self.assertEqual(list(models), ["dummy_most_frequent", "logistic_regression"])
            self.assertEqual(list(models["logistic_regression"].named_steps), ["standard_scaler", "logistic_regression"])

    def test_confusion_matrix_uses_fixed_label_order(self):
        y_true = np.asarray(["YES", "HELP", "NO", "STOP", "WATER"])
        y_pred = np.asarray(["YES", "NO", "NO", "WATER", "WATER"])
        metrics = _compute_metrics(y_true, y_pred)
        self.assertEqual(metrics["confusion_matrix_label_order"], list(FIXED_LABEL_ORDER))
        np.testing.assert_array_equal(
            metrics["confusion_matrix"],
            [
                [0, 1, 0, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1],
            ],
        )

    def test_cross_validation_predictions_and_metrics_are_reproducible(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "features.csv"
            write_synthetic_features(path)
            data = load_dataset(path)
            first = evaluate_baselines(data)
            second = evaluate_baselines(data)
            for name in first["models"]:
                np.testing.assert_array_equal(first["models"][name]["predictions"], second["models"][name]["predictions"])
                np.testing.assert_array_equal(first["models"][name]["prediction_folds"], second["models"][name]["prediction_folds"])
                self.assertEqual(first["models"][name]["metrics"], second["models"][name]["metrics"])
            self.assertEqual(first["folds"], second["folds"])


if __name__ == "__main__":
    unittest.main()
