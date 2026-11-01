#!/usr/bin/env python3
"""Fit and persist the final full-data hand gesture inference pipeline."""

from __future__ import annotations

import argparse
import json
import os
import platform
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn

try:  # Support both `python -m scripts.export_hand_gesture_model` and direct execution.
    from .train_hand_gesture_baseline import (
        DEFAULT_INPUT,
        FEATURE_COLUMNS,
        FIXED_LABEL_ORDER,
        RANDOM_STATE,
        build_models,
        load_dataset,
        validate_feature_allowlist,
    )
except ImportError:  # pragma: no cover - exercised by direct script invocation
    from train_hand_gesture_baseline import (
        DEFAULT_INPUT,
        FEATURE_COLUMNS,
        FIXED_LABEL_ORDER,
        RANDOM_STATE,
        build_models,
        load_dataset,
        validate_feature_allowlist,
    )


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT_ROOT / "datasets" / "processed" / "models" / "hand_gestures" / "baseline_v1"


def _atomic_joblib_dump(model: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent, delete=False
        ) as handle:
            temp_name = handle.name
        joblib.dump(model, temp_name, compress=3)
        with open(temp_name, "rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def _atomic_json_dump(data: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", prefix=f".{path.stem}.", suffix=".tmp",
            dir=path.parent, delete=False,
        ) as handle:
            temp_name = handle.name
            json.dump(data, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def _model_configuration(model: Any) -> dict[str, Any]:
    classifier = model.named_steps["logistic_regression"]
    scaler = model.named_steps["standard_scaler"]
    return {
        "estimator": "sklearn.pipeline.Pipeline",
        "steps": [
            {"name": "standard_scaler", "class": "sklearn.preprocessing.StandardScaler", "with_mean": scaler.with_mean, "with_std": scaler.with_std},
            {
                "name": "logistic_regression",
                "class": "sklearn.linear_model.LogisticRegression",
                "C": classifier.C,
                "class_weight": classifier.class_weight,
                "max_iter": classifier.max_iter,
                "random_state": classifier.random_state,
                "solver": classifier.solver,
            },
        ],
        "fit_scope": "all validated recording-level rows for final inference artifact; evaluation artifacts are unchanged",
        "random_state": RANDOM_STATE,
    }


def export_model(input_path: Path = DEFAULT_INPUT, output_dir: Path = DEFAULT_OUTPUT) -> dict[str, Any]:
    """Fit the prescribed pipeline on all validated rows and atomically save it."""
    validate_feature_allowlist(FEATURE_COLUMNS)
    dataset = load_dataset(input_path)
    X = np.asarray(dataset["X"], dtype=np.float64)
    y = np.asarray(dataset["y"], dtype=str)
    if not np.isfinite(X).all():
        raise ValueError("selected training features contain missing or infinite values")

    model = build_models()["logistic_regression"]
    model.fit(X, y)
    if list(model.classes_) != sorted(FIXED_LABEL_ORDER):
        raise ValueError(f"fitted class order differs from expected labels: {list(model.classes_)}")

    output_dir = output_dir.expanduser().resolve()
    model_path = output_dir / "model.joblib"
    metadata_path = output_dir / "model_metadata.json"
    metadata = {
        "artifact_format": "joblib serialized scikit-learn Pipeline",
        "model_file": model_path.name,
        "feature_columns": list(FEATURE_COLUMNS),
        "class_labels": list(FIXED_LABEL_ORDER),
        "estimator_classes": [str(value) for value in model.classes_],
        "training_row_count": int(len(y)),
        "class_counts": {label: int(dataset["class_counts"][label]) for label in FIXED_LABEL_ORDER},
        "model_configuration": _model_configuration(model),
        "random_state": RANDOM_STATE,
        "software_versions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scikit_learn": sklearn.__version__,
            "joblib": joblib.__version__,
        },
        "probability_note": "predict_proba outputs are model probabilities and have not been calibrated; do not interpret them as calibrated confidence.",
        "training_data": "datasets/processed/features/hand_gestures/features.csv",
    }
    _atomic_joblib_dump(model, model_path)
    _atomic_json_dump(metadata, metadata_path)
    return {"model_path": model_path, "metadata_path": metadata_path, "metadata": metadata}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        result = export_model(args.input, args.output_dir)
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(f"Exported final model trained on {result['metadata']['training_row_count']} recordings.")
    print(result["model_path"])
    print(result["metadata_path"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
