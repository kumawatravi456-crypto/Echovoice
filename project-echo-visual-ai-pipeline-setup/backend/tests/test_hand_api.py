from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, Settings
from app.main import create_app


MODEL_DIR = PROJECT_ROOT / "datasets/processed/models/hand_gestures/baseline_v1"
MODEL_PATH = MODEL_DIR / "model.joblib"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
SAMPLE_FEATURES = {
    "slot0_thumb_joint2_angle_deg_mean": 170.0,
    "slot0_index_joint1_angle_deg_mean": 100.0,
    "slot0_pinky_joint2_angle_deg_mean": 98.0,
    "slot0_index_extension_ratio_mean": 0.62,
    "slot0_thumb_tip_to_palm_center_distance_norm_mean": 1.37,
    "slot0_index_tip_to_wrist_distance_norm_mean": 1.05,
    "slot0_palm_projected_area_norm2_mean": 0.48,
}


@pytest.fixture
def client() -> TestClient:
    application = create_app(Settings(MODEL_PATH, METADATA_PATH))
    with TestClient(application) as test_client:
        yield test_client


def test_health_and_model_status(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    payload = client.get("/api/v1/models/status").json()
    assert payload["status"] == "ready"
    assert payload["models"]["hand_classifier"]["feature_count"] == 7
    assert payload["models"]["hand_classifier"]["class_labels"] == ["HELP", "NO", "STOP", "WATER", "YES"]


def test_successful_prediction_returns_ordered_uncalibrated_scores(client: TestClient) -> None:
    response = client.post("/api/v1/inference/hand/features", json={"features": SAMPLE_FEATURES})
    assert response.status_code == 200
    payload = response.json()
    assert payload["predicted_label"] in {"HELP", "NO", "STOP", "WATER", "YES"}
    assert list(payload["uncalibrated_scores"]) == ["HELP", "NO", "STOP", "WATER", "YES"]
    assert payload["score_semantics"] == "uncalibrated_model_probability_scores"
    assert payload["calibrated"] is False
    assert all(0.0 <= score <= 1.0 for score in payload["uncalibrated_scores"].values())


@pytest.mark.parametrize(
    "mutation",
    [
        lambda values: values.pop("slot0_index_joint1_angle_deg_mean"),
        lambda values: values.update(extra_feature=1.0),
        lambda values: values.update(slot0_index_joint1_angle_deg_mean=float("nan")),
        lambda values: values.update(slot0_index_joint1_angle_deg_mean=float("inf")),
        lambda values: values.update(slot0_index_joint1_angle_deg_mean="not-a-number"),
    ],
)
def test_invalid_feature_input_is_rejected(client: TestClient, mutation) -> None:
    values = dict(SAMPLE_FEATURES)
    mutation(values)
    response = client.post(
        "/api/v1/inference/hand/features",
        content=json.dumps({"features": values}, allow_nan=True),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422


def test_missing_model_is_reported_and_prediction_returns_503(tmp_path: Path) -> None:
    application = create_app(Settings(tmp_path / "missing.joblib", tmp_path / "missing.json"))
    with TestClient(application) as test_client:
        status = test_client.get("/api/v1/models/status").json()
        assert status["status"] == "degraded"
        assert status["models"]["hand_classifier"]["status"] == "unavailable"
        response = test_client.post("/api/v1/inference/hand/features", json={"features": SAMPLE_FEATURES})
        assert response.status_code == 503
