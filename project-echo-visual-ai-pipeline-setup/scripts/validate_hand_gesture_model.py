#!/usr/bin/env python3
"""Check a saved hand gesture model on existing recording-level features."""

from __future__ import annotations

import argparse
import csv
import json
import os
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import confusion_matrix

try:
    from .train_hand_gesture_baseline import (
        DEFAULT_INPUT,
        FEATURE_COLUMNS,
        FIXED_LABEL_ORDER,
        build_models,
        load_dataset,
    )
except ImportError:  # pragma: no cover - direct script invocation
    from train_hand_gesture_baseline import (
        DEFAULT_INPUT,
        FEATURE_COLUMNS,
        FIXED_LABEL_ORDER,
        build_models,
        load_dataset,
    )


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_DIR = PROJECT_ROOT / "datasets" / "processed" / "models" / "hand_gestures" / "baseline_v1"
DEFAULT_OUTPUT = PROJECT_ROOT / "datasets" / "processed" / "evaluation" / "hand_gestures" / "baseline_v1" / "full_fit_training_predictions.csv"
CSV_FIELDS = ("source_filename", "true_label", "predicted_label", "max_uncalibrated_model_probability")


def _atomic_write_predictions(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temp_name = handle.name
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="raise")
            writer.writeheader()
            writer.writerows(rows)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def validate_predictions(
    input_path: Path,
    model_path: Path,
    metadata_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    """Run all rows, compare to a fresh full-data fit, and save a new CSV."""
    metadata = json.loads(metadata_path.expanduser().resolve().read_text(encoding="utf-8"))
    if metadata.get("feature_columns") != FEATURE_COLUMNS:
        raise ValueError("model metadata feature_columns do not match the exact baseline allowlist and order")
    if metadata.get("class_labels") != list(FIXED_LABEL_ORDER):
        raise ValueError("model metadata class_labels do not match the baseline label order")

    dataset = load_dataset(input_path)
    if dataset["feature_columns"] != FEATURE_COLUMNS:
        raise ValueError("feature loader returned an unexpected feature order")
    X = np.asarray(dataset["X"], dtype=np.float64)
    y = np.asarray(dataset["y"], dtype=str)
    if len(y) != 27 or metadata.get("training_row_count") != len(y):
        raise ValueError("expected the saved model and feature dataset to contain 27 rows")

    model = joblib.load(model_path.expanduser().resolve())
    saved_classes = [str(value) for value in getattr(model, "classes_", [])]
    if saved_classes != list(metadata.get("estimator_classes", [])):
        raise ValueError("loaded estimator classes do not match model metadata")
    predictions = np.asarray(model.predict(X), dtype=str)
    probabilities = np.asarray(model.predict_proba(X), dtype=np.float64)
    if predictions.shape != (len(y),):
        raise ValueError(f"model predictions must have shape ({len(y)},); got {predictions.shape}")
    if probabilities.shape != (len(y), len(FIXED_LABEL_ORDER)) or not np.isfinite(probabilities).all():
        raise ValueError(f"model probabilities must be finite with shape ({len(y)}, 5); got {probabilities.shape}")
    if not set(predictions).issubset(FIXED_LABEL_ORDER):
        raise ValueError("model produced a label outside the expected five classes")

    # This is an in-sample consistency check, not another validation estimate.
    reference = build_models()["logistic_regression"]
    reference.fit(X, y)
    reference_predictions = np.asarray(reference.predict(X), dtype=str)
    if not np.array_equal(predictions, reference_predictions):
        raise ValueError("saved-model predictions differ from a fresh full-data fit using the baseline configuration")

    rows = [
        {
            "source_filename": dataset["source_filename"][index],
            "true_label": str(y[index]),
            "predicted_label": str(predictions[index]),
            "max_uncalibrated_model_probability": float(np.max(probabilities[index])),
        }
        for index in range(len(y))
    ]
    output_path = output_path.expanduser().resolve()
    if output_path.exists():
        raise FileExistsError(f"refusing to overwrite existing output: {output_path}")
    _atomic_write_predictions(output_path, rows)

    matrix = confusion_matrix(y, predictions, labels=FIXED_LABEL_ORDER)
    return {
        "output_path": output_path,
        "rows": rows,
        "class_prediction_counts": {label: int(Counter(predictions.tolist()).get(label, 0)) for label in FIXED_LABEL_ORDER},
        "confusion_matrix_label_order": list(FIXED_LABEL_ORDER),
        "confusion_matrix": matrix.astype(int).tolist(),
        "matches_fresh_full_data_fit": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_DIR / "model.joblib")
    parser.add_argument("--metadata", type=Path, default=DEFAULT_MODEL_DIR / "model_metadata.json")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        result = validate_predictions(args.input, args.model, args.metadata, args.output)
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"ERROR: {type(error).__name__}: {error}\n")

    print(f"Wrote {len(result['rows'])} in-sample predictions to {result['output_path']}")
    print("Per-class predicted counts:")
    for label, count in result["class_prediction_counts"].items():
        print(f"  {label}: {count}")
    print("Confusion matrix (rows=true, columns=predicted; HELP, NO, STOP, WATER, YES):")
    for label, row in zip(result["confusion_matrix_label_order"], result["confusion_matrix"]):
        print(f"  {label}: {row}")
    print("Saved-model predictions match a fresh full-data fit: yes")
    print("Maximum probabilities are uncalibrated model probabilities.")
    print("These are training-set predictions, not test accuracy or independent validation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
