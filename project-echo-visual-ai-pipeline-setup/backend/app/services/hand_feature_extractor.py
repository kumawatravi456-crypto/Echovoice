"""Extract the existing seven training features without reimplementing formulas."""

from __future__ import annotations

import math
from typing import Any

from app.services.landmark_validation import InsufficientLandmarkSequence
from app.services.project_echo_pipeline import FEATURE_COLUMNS, extract_record_features


class HandFeatureExtractor:
    """Thin adapter over extract_record_features with strict model-column ordering."""

    def __init__(self, feature_columns: tuple[str, ...] | list[str] = tuple(FEATURE_COLUMNS)) -> None:
        self.feature_columns = tuple(feature_columns)
        if self.feature_columns != tuple(FEATURE_COLUMNS):
            raise ValueError("inference feature order must exactly match the reviewed training allowlist")

    def extract(self, preprocessed: dict[str, Any]) -> dict[str, float]:
        row = extract_record_features(preprocessed)
        output: dict[str, float] = {}
        for name in self.feature_columns:
            value = row.get(name)
            if value is None or value == "":
                raise InsufficientLandmarkSequence(f"trained feature {name!r} is unavailable")
            numeric = float(value)
            if not math.isfinite(numeric):
                raise InsufficientLandmarkSequence(f"trained feature {name!r} is non-finite")
            output[name] = numeric
        return output
