"""Compose landmark validation, source preprocessing, features, and classifier."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.services.hand_feature_extractor import HandFeatureExtractor
from app.services.hand_preprocessor import HandLandmarkPreprocessor
from app.services.landmark_validation import HandLandmarkInputValidator
from app.services.project_echo_pipeline import FEATURE_COLUMNS


@dataclass(frozen=True)
class HandInferenceResult:
    features: dict[str, float]
    classifier_result: dict[str, Any]
    source_frame_count: int
    processed_sequence_length: int
    valid_slot0_frame_count: int


class HandInferenceService:
    """Inference orchestration kept separate from MediaPipe initialization."""

    def __init__(self, classifier: Any) -> None:
        model_columns = tuple(classifier.feature_columns)
        if model_columns != tuple(FEATURE_COLUMNS):
            raise ValueError("loaded classifier metadata differs from the reviewed training feature order")
        self.classifier = classifier
        self.validator = HandLandmarkInputValidator()
        self.preprocessor = HandLandmarkPreprocessor()
        self.feature_extractor = HandFeatureExtractor(model_columns)

    def predict_landmarks(self, raw_arrays: Mapping[str, Any]) -> HandInferenceResult:
        validated = self.validator.validate(raw_arrays)
        processed, _stats = self.preprocessor.transform(validated)
        features = self.feature_extractor.extract(processed)
        classifier_result = self.classifier.predict(features)
        return HandInferenceResult(
            features=features,
            classifier_result=classifier_result,
            source_frame_count=int(validated["landmarks"].shape[0]),
            processed_sequence_length=int(processed["normalized_landmarks"].shape[0]),
            valid_slot0_frame_count=int(processed["hand_validity_mask"][:, 0].sum()),
        )
