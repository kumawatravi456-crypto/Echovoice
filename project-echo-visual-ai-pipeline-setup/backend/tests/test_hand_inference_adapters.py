from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import pytest

from app.config import PROJECT_ROOT
from app.services.hand_feature_extractor import HandFeatureExtractor
from app.services.hand_inference import HandInferenceService
from app.services.hand_preprocessor import HandLandmarkPreprocessor
from app.services.landmark_validation import (
    HandLandmarkInputValidator,
    InsufficientLandmarkSequence,
    LandmarkInputError,
)
from app.services.project_echo_pipeline import FEATURE_COLUMNS, SEQUENCE_LENGTH, preprocess_arrays
from app.services.hand_classifier import HandClassifierService


LANDMARK_ROOT = PROJECT_ROOT / "datasets/processed/landmarks/hand_gestures"
FEATURES_PATH = PROJECT_ROOT / "datasets/processed/features/hand_gestures/features.csv"
MODEL_DIR = PROJECT_ROOT / "datasets/processed/models/hand_gestures/baseline_v1"


def load_npz(path: Path) -> dict[str, np.ndarray]:
    with np.load(path, allow_pickle=False) as archive:
        return {name: np.array(archive[name], copy=True) for name in archive.files}


def saved_feature_rows() -> dict[str, dict[str, str]]:
    with FEATURES_PATH.open(newline="", encoding="utf-8") as handle:
        return {row["source_filename"]: row for row in csv.DictReader(handle)}


def first_record() -> tuple[Path, dict[str, np.ndarray]]:
    path = sorted(LANDMARK_ROOT.glob("*/*.npz"))[0]
    return path, load_npz(path)


def test_feature_adapter_matches_saved_training_features_for_all_recordings() -> None:
    saved = saved_feature_rows()
    validator = HandLandmarkInputValidator()
    preprocessor = HandLandmarkPreprocessor()
    extractor = HandFeatureExtractor()
    inputs = sorted(LANDMARK_ROOT.glob("*/*.npz"))
    assert len(inputs) == 27
    assert len(saved) == 27

    for path in inputs:
        raw = load_npz(path)
        validated = validator.validate(raw)
        processed, _ = preprocessor.transform(validated)
        actual = extractor.extract(processed)
        expected = saved[path.with_suffix(".mp4").name]
        assert list(actual) == FEATURE_COLUMNS
        for name in FEATURE_COLUMNS:
            assert actual[name] == pytest.approx(float(expected[name]), rel=1e-12, abs=1e-12), (path.name, name)


def test_preprocessor_is_exact_32_frame_source_transform() -> None:
    _, raw = first_record()
    validated = HandLandmarkInputValidator().validate(raw)
    adapted, adapted_stats = HandLandmarkPreprocessor().transform(validated)
    original, original_stats = preprocess_arrays(
        validated,
        sequence_length=32,
        short_gap_interpolation=False,
    )
    assert SEQUENCE_LENGTH == 32
    assert adapted_stats == original_stats
    assert adapted.keys() == original.keys()
    for key in original:
        np.testing.assert_equal(adapted[key], original[key])


def test_malformed_and_empty_landmark_sequences_are_rejected() -> None:
    _, raw = first_record()
    malformed = dict(raw)
    malformed["landmarks"] = raw["landmarks"][:, :1]
    with pytest.raises(LandmarkInputError, match="landmarks must have shape"):
        HandLandmarkInputValidator().validate(malformed)

    empty = dict(raw)
    empty["landmarks"] = np.empty((0, 2, 21, 3), dtype=np.float32)
    empty["detection_mask"] = np.empty((0, 2), dtype=np.bool_)
    empty["handedness"] = np.empty((0, 2), dtype="U8")
    empty["handedness_score"] = np.empty((0, 2), dtype=np.float32)
    empty["timestamps_ms"] = np.empty((0,), dtype=np.int64)
    with pytest.raises(InsufficientLandmarkSequence, match="no frames"):
        HandLandmarkInputValidator().validate(empty)


def test_absent_hands_stay_invalid_and_do_not_become_zero_geometry() -> None:
    _, raw = first_record()
    absent = dict(raw)
    absent["landmarks"] = np.zeros_like(raw["landmarks"])
    absent["detection_mask"] = np.zeros_like(raw["detection_mask"])
    validated = HandLandmarkInputValidator().validate(absent)
    source_outputs, _ = preprocess_arrays(validated, sequence_length=32, short_gap_interpolation=False)
    assert not source_outputs["hand_validity_mask"].any()
    assert np.isnan(source_outputs["normalized_landmarks"]).all()
    with pytest.raises(InsufficientLandmarkSequence, match="no valid slot-0"):
        HandLandmarkPreprocessor().transform(validated)


def test_inference_service_passes_exact_features_to_existing_classifier() -> None:
    model = HandClassifierService.load(MODEL_DIR / "model.joblib", MODEL_DIR / "model_metadata.json")
    service = HandInferenceService(model)
    path, raw = first_record()
    result = service.predict_landmarks(raw)
    expected = saved_feature_rows()[path.with_suffix(".mp4").name]
    assert list(result.features) == FEATURE_COLUMNS
    for name in FEATURE_COLUMNS:
        assert result.features[name] == pytest.approx(float(expected[name]), rel=1e-12, abs=1e-12)
    assert result.processed_sequence_length == 32
    assert result.valid_slot0_frame_count > 0
    assert result.classifier_result["predicted_label"] in json.loads((MODEL_DIR / "model_metadata.json").read_text())["class_labels"]
    assert "uncalibrated_scores" in result.classifier_result

