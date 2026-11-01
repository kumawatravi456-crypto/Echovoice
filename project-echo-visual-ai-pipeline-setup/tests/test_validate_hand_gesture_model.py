from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

import joblib
import numpy as np

from scripts.train_hand_gesture_baseline import (
    DEFAULT_INPUT,
    FEATURE_COLUMNS,
    FIXED_LABEL_ORDER,
    build_models,
    load_dataset,
)
from scripts.validate_hand_gesture_model import validate_predictions


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "datasets/processed/models/hand_gestures/baseline_v1"
MODEL_PATH = MODEL_DIR / "model.joblib"
METADATA_PATH = MODEL_DIR / "model_metadata.json"


class ValidateHandGestureModelTests(unittest.TestCase):
    def test_metadata_and_feature_order_are_enforced(self):
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        self.assertEqual(metadata["feature_columns"], FEATURE_COLUMNS)
        self.assertEqual(metadata["class_labels"], list(FIXED_LABEL_ORDER))
        with tempfile.TemporaryDirectory() as tmp:
            bad_metadata = Path(tmp) / "metadata.json"
            metadata["feature_columns"] = list(reversed(FEATURE_COLUMNS))
            bad_metadata.write_text(json.dumps(metadata), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "feature_columns"):
                validate_predictions(DEFAULT_INPUT, MODEL_PATH, bad_metadata, Path(tmp) / "out.csv")

    def test_model_load_and_prediction_csv_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "predictions.csv"
            result = validate_predictions(DEFAULT_INPUT, MODEL_PATH, METADATA_PATH, output)
            self.assertTrue(output.is_file())
            self.assertEqual(len(result["rows"]), 27)
            self.assertEqual(result["confusion_matrix_label_order"], list(FIXED_LABEL_ORDER))
            with output.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 27)
            self.assertEqual(
                list(rows[0]),
                ["source_filename", "true_label", "predicted_label", "max_uncalibrated_model_probability"],
            )
            self.assertTrue(all(np.isfinite(float(row["max_uncalibrated_model_probability"])) for row in rows))

    def test_saved_predictions_match_fresh_full_data_pipeline(self):
        dataset = load_dataset(DEFAULT_INPUT)
        saved = joblib.load(MODEL_PATH)
        reference = build_models()["logistic_regression"]
        reference.fit(dataset["X"], dataset["y"])
        np.testing.assert_array_equal(saved.predict(dataset["X"]), reference.predict(dataset["X"]))
        with tempfile.TemporaryDirectory() as tmp:
            result = validate_predictions(DEFAULT_INPUT, MODEL_PATH, METADATA_PATH, Path(tmp) / "predictions.csv")
            self.assertTrue(result["matches_fresh_full_data_fit"])


if __name__ == "__main__":
    unittest.main()
