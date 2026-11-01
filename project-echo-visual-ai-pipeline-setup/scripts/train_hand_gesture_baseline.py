#!/usr/bin/env python3
"""Run an exploratory, recording-level five-fold baseline for hand gestures."""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "datasets" / "processed" / "features" / "hand_gestures" / "features.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "datasets" / "processed" / "evaluation" / "hand_gestures" / "baseline_v1"

FEATURE_COLUMNS = [
    "slot0_thumb_joint2_angle_deg_mean",
    "slot0_index_joint1_angle_deg_mean",
    "slot0_pinky_joint2_angle_deg_mean",
    "slot0_index_extension_ratio_mean",
    "slot0_thumb_tip_to_palm_center_distance_norm_mean",
    "slot0_index_tip_to_wrist_distance_norm_mean",
    "slot0_palm_projected_area_norm2_mean",
]
TARGET_COLUMN = "class_label"
IDENTITY_COLUMNS = ("recording_id", "source_filename", "source_relative_path")
FORBIDDEN_METADATA_COLUMNS = {
    "feature_row", "temporal_time_basis", "output_filename", "processing_status",
    "error_or_warning", "available_numeric_feature_count", "total_numeric_feature_count",
    "detection_rate", "valid_hand_rate", "invalid_landmark_count", "source_frame_count",
    "output_sequence_length", "timestamp_resampling_method",
}
FIXED_LABEL_ORDER = ("HELP", "NO", "STOP", "WATER", "YES")
EXPECTED_CLASS_COUNTS = {"YES": 7, "NO": 5, "HELP": 5, "WATER": 5, "STOP": 5}
N_SPLITS = 5
RANDOM_STATE = 42


class DatasetValidationError(ValueError):
    """Raised when the baseline input does not match the reviewed dataset contract."""


def is_forbidden_feature_name(name: str) -> bool:
    """Recognize target, identifiers, and excluded metadata/reliability columns."""
    lowered = name.casefold()
    if name == TARGET_COLUMN or name in IDENTITY_COLUMNS or name in FORBIDDEN_METADATA_COLUMNS:
        return True
    if lowered.startswith("slot1_") or lowered.endswith("_available"):
        return True
    if any(token in lowered for token in (
        "handedness", "reliability", "valid_frame", "missing_frame", "valid_hand",
        "detection", "motion_interval_count", "wrist_valid_position_count",
    )):
        return True
    if name in {"overall_valid_hand_frame_ratio", "temporal_time_basis"}:
        return True
    return False


def validate_feature_allowlist(columns: Sequence[str]) -> None:
    """Require the exact previously reviewed list, in its reviewed order."""
    proposed = list(columns)
    forbidden = [name for name in proposed if is_forbidden_feature_name(name)]
    if forbidden:
        raise DatasetValidationError(f"forbidden feature columns requested: {forbidden}")
    if proposed != FEATURE_COLUMNS:
        raise DatasetValidationError(
            "feature allowlist must exactly match the reviewed seven-column list and order"
        )


def load_dataset(input_path: Path = DEFAULT_INPUT) -> dict[str, Any]:
    """Validate the CSV and build X exclusively from the approved feature columns."""
    input_path = input_path.expanduser().resolve()
    if not input_path.is_file():
        raise DatasetValidationError(f"feature CSV does not exist: {input_path}")
    try:
        with input_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames or []
            required = [*IDENTITY_COLUMNS, TARGET_COLUMN, *FEATURE_COLUMNS]
            missing = [name for name in required if name not in fieldnames]
            if missing:
                raise DatasetValidationError(f"feature CSV is missing required columns: {missing}")
            validate_feature_allowlist(FEATURE_COLUMNS)
            rows = list(reader)
    except (OSError, csv.Error, UnicodeError) as error:
        raise DatasetValidationError(f"cannot read feature CSV: {error}") from error

    if len(rows) != 27:
        raise DatasetValidationError(f"expected 27 recording rows, found {len(rows)}")
    for identity_column in IDENTITY_COLUMNS:
        values = [row.get(identity_column, "") for row in rows]
        if any(not value for value in values):
            raise DatasetValidationError(f"{identity_column} contains an empty value")
        if len(set(values)) != len(values):
            raise DatasetValidationError(f"duplicate {identity_column} values")
    if any(Path(row["source_filename"]).stem != row["recording_id"] for row in rows):
        raise DatasetValidationError("recording_id does not match source_filename stem")

    y = np.asarray([row[TARGET_COLUMN].strip() for row in rows], dtype=str)
    class_counts = Counter(y.tolist())
    if dict(class_counts) != EXPECTED_CLASS_COUNTS:
        raise DatasetValidationError(
            f"class counts do not match expected {EXPECTED_CLASS_COUNTS}: {dict(class_counts)}"
        )

    feature_values: list[list[float]] = []
    for row_index, row in enumerate(rows):
        values: list[float] = []
        for name in FEATURE_COLUMNS:
            raw = (row.get(name) or "").strip()
            if not raw:
                raise DatasetValidationError(f"missing selected feature {name!r} at row {row_index + 2}")
            try:
                value = float(raw)
            except ValueError as error:
                raise DatasetValidationError(
                    f"selected feature {name!r} is not numeric at row {row_index + 2}: {raw!r}"
                ) from error
            if not math.isfinite(value):
                raise DatasetValidationError(
                    f"selected feature {name!r} is not finite at row {row_index + 2}"
                )
            values.append(value)
        feature_values.append(values)

    X = np.asarray(feature_values, dtype=np.float64)
    if X.shape != (27, 7):
        raise DatasetValidationError(f"X must have shape (27, 7); got {X.shape}")
    return {
        "X": X,
        "y": y,
        "recording_id": [row["recording_id"] for row in rows],
        "source_filename": [row["source_filename"] for row in rows],
        "source_relative_path": [row["source_relative_path"] for row in rows],
        "class_counts": dict(class_counts),
        "feature_columns": list(FEATURE_COLUMNS),
    }


def build_models() -> dict[str, Any]:
    """Construct exactly the two prespecified models."""
    return {
        "dummy_most_frequent": DummyClassifier(strategy="most_frequent"),
        "logistic_regression": Pipeline(
            [
                ("standard_scaler", StandardScaler()),
                (
                    "logistic_regression",
                    LogisticRegression(
                        C=1.0,
                        class_weight="balanced",
                        max_iter=2000,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }


def make_cv_splits(y: np.ndarray) -> list[tuple[np.ndarray, np.ndarray]]:
    """Create deterministic recording-index folds using the specified splitter."""
    splitter = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    return [(train.copy(), test.copy()) for train, test in splitter.split(np.zeros(len(y)), y)]


def _class_distribution(y: np.ndarray, indices: np.ndarray) -> dict[str, int]:
    counts = Counter(y[indices].tolist())
    return {label: int(counts.get(label, 0)) for label in FIXED_LABEL_ORDER}


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        labels=FIXED_LABEL_ORDER,
        zero_division=0,
    )
    matrix = confusion_matrix(y_true, y_pred, labels=FIXED_LABEL_ORDER)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_precision": float(np.mean(precision)),
        "macro_recall": float(np.mean(recall)),
        "macro_f1": float(np.mean(f1)),
        "per_class": {
            label: {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int(support[index]),
            }
            for index, label in enumerate(FIXED_LABEL_ORDER)
        },
        "confusion_matrix_label_order": list(FIXED_LABEL_ORDER),
        "confusion_matrix": matrix.astype(int).tolist(),
    }


def evaluate_baselines(dataset: dict[str, Any]) -> dict[str, Any]:
    """Fit both models within each training fold and create one OOF result per row."""
    X = np.asarray(dataset["X"], dtype=np.float64)
    y = np.asarray(dataset["y"], dtype=str)
    if X.shape != (27, len(FEATURE_COLUMNS)) or y.shape != (27,):
        raise DatasetValidationError(f"unexpected X/y shapes: {X.shape}/{y.shape}")
    if not np.isfinite(X).all():
        raise DatasetValidationError("X contains missing or infinite values")
    ids = list(dataset["recording_id"])
    if len(ids) != len(y) or len(set(ids)) != len(ids):
        raise DatasetValidationError("recording identifiers must be unique and align one-to-one with rows")

    splits = make_cv_splits(y)
    fold_details: list[dict[str, Any]] = []
    test_occurrences = np.zeros(len(y), dtype=np.int8)
    for fold_number, (train_indices, test_indices) in enumerate(splits, start=1):
        if set(ids[i] for i in train_indices) & set(ids[i] for i in test_indices):
            raise DatasetValidationError(f"recording identity crossed train/test boundary in fold {fold_number}")
        test_occurrences[test_indices] += 1
        fold_details.append(
            {
                "fold": fold_number,
                "train_recordings": int(len(train_indices)),
                "test_recordings": int(len(test_indices)),
                "train_class_counts": _class_distribution(y, train_indices),
                "test_class_counts": _class_distribution(y, test_indices),
            }
        )
    if not np.all(test_occurrences == 1):
        raise DatasetValidationError("each recording must receive exactly one out-of-fold prediction")

    model_results: dict[str, Any] = {}
    for model_name in ("dummy_most_frequent", "logistic_regression"):
        predictions = np.empty(len(y), dtype=object)
        prediction_folds = np.zeros(len(y), dtype=np.int8)
        fold_fits: list[dict[str, Any]] = []
        for fold_number, (train_indices, test_indices) in enumerate(splits, start=1):
            estimator = build_models()[model_name]
            estimator.fit(X[train_indices], y[train_indices])
            predictions[test_indices] = estimator.predict(X[test_indices])
            prediction_folds[test_indices] = fold_number
            # Kept in-memory for audit/tests; not serialized to output files.
            fold_fits.append(
                {
                    "fold": fold_number,
                    "train_indices": train_indices.copy(),
                    "test_indices": test_indices.copy(),
                    "estimator": estimator,
                }
            )
        if any(value is None for value in predictions.tolist()) or not np.all(prediction_folds > 0):
            raise DatasetValidationError(f"model {model_name} did not produce exactly one OOF prediction per row")
        model_results[model_name] = {
            "predictions": predictions.astype(str),
            "prediction_folds": prediction_folds,
            "metrics": _compute_metrics(y, predictions.astype(str)),
            "fold_fits": fold_fits,
        }

    return {"folds": fold_details, "models": model_results}


def _model_configurations() -> dict[str, dict[str, Any]]:
    return {
        "dummy_most_frequent": {"class": "sklearn.dummy.DummyClassifier", "strategy": "most_frequent"},
        "logistic_regression": {
            "class": "sklearn.pipeline.Pipeline",
            "steps": [
                {"name": "standard_scaler", "class": "sklearn.preprocessing.StandardScaler"},
                {
                    "name": "logistic_regression",
                    "class": "sklearn.linear_model.LogisticRegression",
                    "C": 1.0,
                    "class_weight": "balanced",
                    "max_iter": 2000,
                    "random_state": RANDOM_STATE,
                },
            ],
            "scaling": "fit only inside each training fold through the Pipeline",
        },
    }


def _build_outputs(dataset: dict[str, Any], evaluated: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], str]:
    y = np.asarray(dataset["y"], dtype=str)
    oof_rows: list[dict[str, Any]] = []
    for index in range(len(y)):
        dummy_pred = str(evaluated["models"]["dummy_most_frequent"]["predictions"][index])
        lr_pred = str(evaluated["models"]["logistic_regression"]["predictions"][index])
        fold = int(evaluated["models"]["logistic_regression"]["prediction_folds"][index])
        oof_rows.append(
            {
                "recording_id": dataset["recording_id"][index],
                "source_filename": dataset["source_filename"][index],
                "source_relative_path": dataset["source_relative_path"][index],
                "true_class": str(y[index]),
                "dummy_prediction": dummy_pred,
                "dummy_correct": int(dummy_pred == y[index]),
                "logistic_regression_prediction": lr_pred,
                "logistic_regression_correct": int(lr_pred == y[index]),
                "fold": fold,
            }
        )

    confusion_rows: list[dict[str, Any]] = []
    for model_name, model in evaluated["models"].items():
        matrix = model["metrics"]["confusion_matrix"]
        for index, true_label in enumerate(FIXED_LABEL_ORDER):
            row: dict[str, Any] = {"model": model_name, "true_class": true_label}
            row.update({predicted_label: int(matrix[index][col]) for col, predicted_label in enumerate(FIXED_LABEL_ORDER)})
            confusion_rows.append(row)

    metrics = {
        "evaluation": {
            "unit": "recording",
            "method": "5-fold stratified cross-validation with out-of-fold predictions",
            "n_splits": N_SPLITS,
            "shuffle": True,
            "random_state": RANDOM_STATE,
            "labels": list(FIXED_LABEL_ORDER),
            "feature_columns": list(FEATURE_COLUMNS),
            "target_column": TARGET_COLUMN,
            "models": _model_configurations(),
            "software": {"python": platform.python_version(), "numpy": np.__version__, "scikit_learn": sklearn.__version__},
            "fold_class_distributions": evaluated["folds"],
            "limitations": [
                "All 27 recordings come from one participant; this is a same-participant exploratory evaluation.",
                "Cross-validation is not an independent external test and does not establish participant-independent generalization.",
                "The sample is small and class counts are imbalanced; fold estimates can be unstable.",
                "No hyperparameter tuning or feature selection used held-out folds.",
                "This experiment does not validate real-world AAC performance.",
            ],
        },
        "dataset": {
            "recording_count": len(y),
            "class_counts": {label: int(dataset["class_counts"][label]) for label in FIXED_LABEL_ORDER},
            "feature_count": len(FEATURE_COLUMNS),
        },
        "models": {
            model_name: {
                "metrics": {
                    key: value
                    for key, value in model["metrics"].items()
                    if key not in {"confusion_matrix_label_order", "confusion_matrix"}
                },
                "confusion_matrix_label_order": list(FIXED_LABEL_ORDER),
                "confusion_matrix": model["metrics"]["confusion_matrix"],
            }
            for model_name, model in evaluated["models"].items()
        },
    }

    report = _render_report(metrics, oof_rows)
    return metrics, oof_rows, confusion_rows, report


def _render_report(metrics: dict[str, Any], oof_rows: list[dict[str, Any]]) -> str:
    lines = [
        "# Project Echo — Hand Gesture Baseline v1",
        "",
        "## Evaluation design",
        "",
        "This is an exploratory, same-participant, recording-level evaluation. The 27 rows represent 27 recordings; no frames are split across folds. We used `StratifiedKFold(n_splits=5, shuffle=True, random_state=42)`, and each recording receives exactly one out-of-fold prediction.",
        "",
        "Only the seven prespecified slot-0 geometry features listed in `metrics.json` were passed to X. `class_label` was used only as y. The logistic-regression scaler is fitted inside each training fold by its Pipeline. No feature selection or hyperparameter tuning used held-out folds.",
        "",
        "Cross-validation is not an independent external test. All recordings come from one participant, so this does not establish participant-independent generalization or validate real-world AAC performance.",
        "",
        "## Dataset and folds",
        "",
        f"Recordings: {metrics['dataset']['recording_count']}; features: {metrics['dataset']['feature_count']}; class counts: "
        + ", ".join(f"{label} {count}" for label, count in metrics["dataset"]["class_counts"].items())
        + ".",
        "",
        "| Fold | Train class counts | Held-out class counts |",
        "|---:|---|---|",
    ]
    for fold in metrics["evaluation"]["fold_class_distributions"]:
        train = ", ".join(f"{label} {count}" for label, count in fold["train_class_counts"].items())
        test = ", ".join(f"{label} {count}" for label, count in fold["test_class_counts"].items())
        lines.append(f"| {fold['fold']} | {train} | {test} |")

    for model_name, model_data in metrics["models"].items():
        metric = model_data["metrics"]
        lines.extend(
            [
                "",
                f"## {model_name}",
                "",
                f"Configuration: `{json.dumps(metrics['evaluation']['models'][model_name], sort_keys=True)}`",
                "",
                "| Accuracy | Balanced accuracy | Macro precision | Macro recall | Macro F1 |",
                "|---:|---:|---:|---:|---:|",
                f"| {metric['accuracy']:.4f} | {metric['balanced_accuracy']:.4f} | {metric['macro_precision']:.4f} | {metric['macro_recall']:.4f} | {metric['macro_f1']:.4f} |",
                "",
                "| Class | Precision | Recall | F1 | Support |",
                "|---|---:|---:|---:|---:|",
            ]
        )
        for label in FIXED_LABEL_ORDER:
            per_class = metric["per_class"][label]
            lines.append(
                f"| {label} | {per_class['precision']:.4f} | {per_class['recall']:.4f} | {per_class['f1']:.4f} | {per_class['support']} |"
            )
        lines.extend(
            [
                "",
                "Confusion matrix (rows = true class, columns = predicted class; fixed order HELP, NO, STOP, WATER, YES):",
                "",
                "| True \\ Predicted | " + " | ".join(FIXED_LABEL_ORDER) + " |",
                "|---|" + "---:|" * len(FIXED_LABEL_ORDER),
            ]
        )
        for label, matrix_row in zip(FIXED_LABEL_ORDER, model_data["confusion_matrix"]):
            lines.append(f"| {label} | " + " | ".join(str(value) for value in matrix_row) + " |")

    lines.extend(
        [
            "",
            "## Out-of-fold prediction by recording",
            "",
            "| Recording ID | True class | Dummy prediction | Correct? | Logistic prediction | Correct? | Fold |",
            "|---|---|---|---|---|---|---:|",
        ]
    )
    for row in oof_rows:
        lines.append(
            f"| {row['recording_id']} | {row['true_class']} | {row['dummy_prediction']} | {bool(row['dummy_correct'])} | "
            f"{row['logistic_regression_prediction']} | {bool(row['logistic_regression_correct'])} | {row['fold']} |"
        )
    lines.extend(
        [
            "",
            "## Limitations",
            "",
            "This small, imbalanced dataset contains one participant. These out-of-fold results are exploratory estimates for these recordings only; they are not an external test, do not imply generalization to new participants, and do not validate real-world AAC performance.",
            "",
        ]
    )
    return "\n".join(lines)


def _atomic_write(path: Path, writer: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temp_name = handle.name
            writer(handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def run_evaluation(input_path: Path = DEFAULT_INPUT, output_dir: Path = DEFAULT_OUTPUT) -> dict[str, Any]:
    input_path = input_path.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    if input_path == output_dir or input_path in output_dir.parents or output_dir in input_path.parents:
        raise DatasetValidationError("input feature file and output directory must not overlap")
    dataset = load_dataset(input_path)
    evaluated = evaluate_baselines(dataset)
    metrics, oof_rows, confusion_rows, report = _build_outputs(dataset, evaluated)

    output_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = output_dir / "metrics.json"
    oof_path = output_dir / "oof_predictions.csv"
    confusion_path = output_dir / "confusion_matrix.csv"
    report_path = output_dir / "evaluation_report.md"

    def write_metrics(handle: Any) -> None:
        json.dump(metrics, handle, indent=2, ensure_ascii=False, allow_nan=False)
        handle.write("\n")

    def write_oof(handle: Any) -> None:
        columns = (
            "recording_id", "source_filename", "source_relative_path", "true_class",
            "dummy_prediction", "dummy_correct", "logistic_regression_prediction",
            "logistic_regression_correct", "fold",
        )
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(oof_rows)

    def write_confusion(handle: Any) -> None:
        columns = ("model", "true_class", *FIXED_LABEL_ORDER)
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(confusion_rows)

    _atomic_write(metrics_path, write_metrics)
    _atomic_write(oof_path, write_oof)
    _atomic_write(confusion_path, write_confusion)
    _atomic_write(report_path, lambda handle: handle.write(report))
    return {
        "metrics": metrics,
        "oof_predictions": oof_rows,
        "outputs": [metrics_path, oof_path, confusion_path, report_path],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        result = run_evaluation(args.input, args.output_dir)
    except (OSError, DatasetValidationError, ValueError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(f"Evaluated {result['metrics']['dataset']['recording_count']} recordings with two prespecified models.")
    for path in result["outputs"]:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
