from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import joblib
import numpy as np

from scripts.export_hand_gesture_model import export_model
from scripts.train_hand_gesture_baseline import FEATURE_COLUMNS, FIXED_LABEL_ORDER


def write_synthetic_features(path: Path) -> None:
    labels = ["YES"] * 7 + ["NO"] * 5 + ["HELP"] * 5 + ["WATER"] * 5 + ["STOP"] * 5
    fields = ["recording_id", "source_filename", "source_relative_path", "class_label", *FEATURE_COLUMNS]
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
            }
            for feature_index, feature in enumerate(FEATURE_COLUMNS):
                row[feature] = 0.25 * index + 0.03 * feature_index + (label == "YES") * 0.1
            writer.writerow(row)


class HandGestureModelExportTests(unittest.TestCase):
    def test_creates_model_and_metadata_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "features.csv"
            output = root / "artifacts"
            write_synthetic_features(source)
            result = export_model(source, output)
            self.assertTrue((output / "model.joblib").is_file())
            self.assertTrue((output / "model_metadata.json").is_file())
            self.assertEqual(result["model_path"], (output / "model.joblib").resolve())
            metadata = json.loads((output / "model_metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["training_row_count"], 27)
            self.assertEqual(metadata["class_labels"], list(FIXED_LABEL_ORDER))

    def test_metadata_preserves_exact_feature_order_and_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "features.csv"
            write_synthetic_features(source)
            export_model(source, root / "artifacts")
            metadata = json.loads((root / "artifacts/model_metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["feature_columns"], FEATURE_COLUMNS)
            self.assertEqual(metadata["random_state"], 42)
            self.assertEqual(metadata["class_counts"], {"HELP": 5, "NO": 5, "STOP": 5, "WATER": 5, "YES": 7})
            self.assertEqual(metadata["model_configuration"]["steps"][1]["C"], 1.0)
            self.assertEqual(metadata["model_configuration"]["steps"][1]["class_weight"], "balanced")

    def test_reload_prediction_and_probability_shapes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "features.csv"
            write_synthetic_features(source)
            export_model(source, root / "artifacts")
            with source.open(newline="", encoding="utf-8") as handle:
                row = next(csv.DictReader(handle))
            sample = np.asarray([[float(row[name]) for name in FEATURE_COLUMNS]], dtype=np.float64)
            model = joblib.load(root / "artifacts/model.joblib")
            predictions = model.predict(sample)
            probabilities = model.predict_proba(sample)
            self.assertEqual(predictions.shape, (1,))
            self.assertEqual(probabilities.shape, (1, len(FIXED_LABEL_ORDER)))
            self.assertTrue(np.isfinite(probabilities).all())

    def test_fresh_process_can_reload_and_predict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "features.csv"
            write_synthetic_features(source)
            export_model(source, root / "artifacts")
            code = (
                "import csv,json,joblib,numpy as np,sys; "
                "m=joblib.load(sys.argv[1]); "
                "r=next(csv.DictReader(open(sys.argv[2],newline='',encoding='utf-8'))); "
                f"cols={FEATURE_COLUMNS!r}; "
                "x=np.asarray([[float(r[c]) for c in cols]],dtype=np.float64); "
                "p=m.predict(x); q=m.predict_proba(x); "
                "print(json.dumps({'predictions':p.tolist(),'shape':list(q.shape),'finite':bool(np.isfinite(q).all())}))"
            )
            result = subprocess.run(
                [sys.executable, "-c", code, str(root / "artifacts/model.joblib"), str(source)],
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout)
            self.assertEqual(len(payload["predictions"]), 1)
            self.assertEqual(payload["shape"], [1, len(FIXED_LABEL_ORDER)])
            self.assertTrue(payload["finite"])


if __name__ == "__main__":
    unittest.main()
