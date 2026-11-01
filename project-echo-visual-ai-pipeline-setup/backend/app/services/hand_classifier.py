"""Load and call the existing Project Echo hand classifier artifact."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np


class ModelArtifactError(RuntimeError):
    """Raised when the model or its metadata does not meet the artifact contract."""


class InvalidFeatureInput(ValueError):
    """Raised for missing, extra, nonnumeric, or nonfinite feature values."""


class HandClassifierService:
    def __init__(self, model: Any, metadata: dict[str, Any]) -> None:
        self.model = model
        self.metadata = metadata
        self.feature_columns = tuple(metadata["feature_columns"])
        self.class_labels = tuple(metadata["class_labels"])
        self.estimator_classes = tuple(str(value) for value in model.classes_)

    @classmethod
    def load(cls, model_path: Path, metadata_path: Path) -> "HandClassifierService":
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if not isinstance(metadata, dict):
                raise ModelArtifactError("model metadata must be a JSON object")
            feature_columns = metadata.get("feature_columns")
            class_labels = metadata.get("class_labels")
            estimator_classes = metadata.get("estimator_classes")
            if (
                not isinstance(feature_columns, list)
                or len(feature_columns) != 7
                or any(not isinstance(name, str) or not name for name in feature_columns)
                or len(set(feature_columns)) != 7
            ):
                raise ModelArtifactError("metadata must contain seven unique ordered feature names")
            if (
                not isinstance(class_labels, list)
                or len(class_labels) != 5
                or any(not isinstance(label, str) or not label for label in class_labels)
                or len(set(class_labels)) != 5
            ):
                raise ModelArtifactError("metadata must contain five unique class labels")
            if estimator_classes != class_labels:
                raise ModelArtifactError("metadata estimator_classes must match class_labels in order")
            if not isinstance(metadata.get("training_row_count"), int) or metadata["training_row_count"] < 1:
                raise ModelArtifactError("metadata training_row_count must be a positive integer")

            model = joblib.load(model_path)
            if not callable(getattr(model, "predict", None)) or not callable(getattr(model, "predict_proba", None)):
                raise ModelArtifactError("loaded artifact must expose predict and predict_proba")
            actual_classes = tuple(str(value) for value in getattr(model, "classes_", ()))
            if actual_classes != tuple(estimator_classes):
                raise ModelArtifactError("loaded estimator classes do not match metadata")
            scaler = getattr(model, "named_steps", {}).get("standard_scaler")
            if scaler is None or getattr(scaler, "n_features_in_", None) != len(feature_columns):
                raise ModelArtifactError("loaded pipeline scaler feature count does not match metadata")
            return cls(model, metadata)
        except ModelArtifactError:
            raise
        except Exception as error:
            raise ModelArtifactError(f"could not load hand model artifacts ({type(error).__name__})") from error

    def status(self) -> dict[str, Any]:
        return {
            "status": "ready",
            "feature_count": len(self.feature_columns),
            "class_labels": list(self.class_labels),
            "training_row_count": self.metadata["training_row_count"],
        }

    def predict(self, supplied: dict[str, Any]) -> dict[str, Any]:
        expected = set(self.feature_columns)
        provided = set(supplied)
        missing = [name for name in self.feature_columns if name not in provided]
        extra = sorted(provided - expected)
        if missing or extra:
            raise InvalidFeatureInput(f"feature keys mismatch; missing={missing}, extra={extra}")

        values: list[float] = []
        for name in self.feature_columns:
            value = supplied[name]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise InvalidFeatureInput(f"feature {name!r} must be a finite number")
            numeric = float(value)
            if not math.isfinite(numeric):
                raise InvalidFeatureInput(f"feature {name!r} must be finite")
            values.append(numeric)

        vector = np.asarray([values], dtype=np.float64)
        prediction = str(self.model.predict(vector)[0])
        scores = np.asarray(self.model.predict_proba(vector), dtype=np.float64)
        if scores.shape != (1, len(self.estimator_classes)) or not np.isfinite(scores).all():
            raise ModelArtifactError("model returned invalid prediction scores")
        return {
            "predicted_label": prediction,
            "uncalibrated_scores": {
                label: float(scores[0, index])
                for index, label in enumerate(self.estimator_classes)
            },
        }
