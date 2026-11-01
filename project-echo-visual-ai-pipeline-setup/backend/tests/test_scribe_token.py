from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, Settings
from app.main import create_app
from app.services.scribe_token import (
    ScribeProviderError,
    ScribeTokenConfigurationError,
    ScribeTokenService,
    TOKEN_URL,
)


MODEL_DIR = PROJECT_ROOT / "datasets/processed/models/hand_gestures/baseline_v1"


class FakeResponse:
    def __init__(self, payload: Any, error: Exception | None = None) -> None:
        self.payload = payload
        self.error = error

    def raise_for_status(self) -> None:
        if self.error:
            raise self.error

    def json(self) -> Any:
        return self.payload


class FakeAsyncClient:
    def __init__(self, response: FakeResponse, observed: dict[str, Any]) -> None:
        self.response = response
        self.observed = observed

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, url: str, *, headers: dict[str, str]) -> FakeResponse:
        self.observed.update(url=url, headers=headers)
        return self.response


def fake_client_factory(response: FakeResponse, observed: dict[str, Any]):
    def factory(**kwargs: Any) -> FakeAsyncClient:
        observed["client_options"] = kwargs
        return FakeAsyncClient(response, observed)
    return factory


def make_app(api_key: str | None = "test-scribe-key"):
    settings = Settings(
        MODEL_DIR / "model.joblib",
        MODEL_DIR / "model_metadata.json",
        elevenlabs_api_key=api_key,
    )
    return create_app(settings)


def test_scribe_token_service_uses_official_single_use_token_endpoint() -> None:
    observed: dict[str, Any] = {}
    service = ScribeTokenService(
        "test-scribe-key",
        client_factory=fake_client_factory(FakeResponse({"token": "short-lived-token"}), observed),
    )

    token = asyncio.run(service.create_token())

    assert token == "short-lived-token"
    assert observed["url"] == TOKEN_URL
    assert observed["headers"] == {"xi-api-key": "test-scribe-key"}
    assert observed["client_options"] == {"timeout": 10.0}


def test_scribe_token_service_rejects_missing_key_without_network_call() -> None:
    service = ScribeTokenService(None)
    with pytest.raises(ScribeTokenConfigurationError):
        asyncio.run(service.create_token())


def test_scribe_token_service_sanitizes_provider_failures() -> None:
    observed: dict[str, Any] = {}
    request = httpx.Request("POST", TOKEN_URL)
    response = httpx.Response(403, request=request)
    service = ScribeTokenService(
        "test-scribe-key",
        client_factory=fake_client_factory(FakeResponse({}, httpx.HTTPStatusError("secret detail", request=request, response=response)), observed),
    )
    with pytest.raises(ScribeProviderError, match="could not issue") as caught:
        asyncio.run(service.create_token())
    assert "secret detail" not in str(caught.value)


def test_provider_http_rejection_logs_status_and_only_sanitized_error_fields(
    caplog: pytest.LogCaptureFixture,
) -> None:
    api_key = "test-xi-secret-api-key"
    request = httpx.Request("POST", TOKEN_URL)
    payload = {
        "detail": {
            "status": "invalid_api_key",
            "message": (
                f"Key rejected; xi-api-key: {api_key}; token=temporary-token-secret; "
                "Authorization: Bearer authorization-secret"
            ),
        },
        "raw_body_marker": "this entire raw body must not be logged",
    }
    response = httpx.Response(403, request=request, json=payload)
    error = httpx.HTTPStatusError("provider rejection", request=request, response=response)
    observed: dict[str, Any] = {}
    service = ScribeTokenService(
        api_key,
        client_factory=fake_client_factory(FakeResponse(payload, error), observed),
    )

    with caplog.at_level("WARNING", logger="app.services.scribe_token"):
        with pytest.raises(ScribeProviderError):
            asyncio.run(service.create_token())

    assert "HTTP 403" in caplog.text
    assert "invalid_api_key" in caplog.text
    assert "Key rejected" in caplog.text
    for secret in (api_key, "temporary-token-secret", "authorization-secret", "raw_body_marker", "this entire raw body"):
        assert secret not in caplog.text
    assert len(caplog.text) < 1000


def test_non_json_provider_rejection_logs_only_generic_sanitized_detail(
    caplog: pytest.LogCaptureFixture,
) -> None:
    request = httpx.Request("POST", TOKEN_URL)
    response = httpx.Response(
        502,
        request=request,
        content=b"<html>raw-response-secret-do-not-log</html>",
        headers={"content-type": "text/html"},
    )
    error = httpx.HTTPStatusError("provider rejection", request=request, response=response)
    service = ScribeTokenService(
        "test-key",
        client_factory=fake_client_factory(FakeResponse(None, error), {}),
    )

    with caplog.at_level("WARNING", logger="app.services.scribe_token"):
        with pytest.raises(ScribeProviderError):
            asyncio.run(service.create_token())

    assert "HTTP 502" in caplog.text
    assert "non-JSON or unreadable error response" in caplog.text
    assert "raw-response-secret-do-not-log" not in caplog.text
    assert "<html>" not in caplog.text


def test_provider_error_message_logging_is_bounded(caplog: pytest.LogCaptureFixture) -> None:
    request = httpx.Request("POST", TOKEN_URL)
    response = httpx.Response(
        400,
        request=request,
        json={"detail": {"status": "invalid_request", "message": "x" * 1000}},
    )
    error = httpx.HTTPStatusError("provider rejection", request=request, response=response)
    service = ScribeTokenService(
        "test-key",
        client_factory=fake_client_factory(FakeResponse({}, error), {}),
    )

    with caplog.at_level("WARNING", logger="app.services.scribe_token"):
        with pytest.raises(ScribeProviderError):
            asyncio.run(service.create_token())

    logged_message = caplog.text.split('message="', 1)[1].split('"', 1)[0]
    assert len(logged_message) == 240


def test_scribe_token_route_returns_short_lived_token_only_to_allowed_origin() -> None:
    application = make_app()

    class FakeTokenService:
        async def create_token(self) -> str:
            return "short-lived-token"

    application.state.scribe_token_service = FakeTokenService()
    with TestClient(application) as client:
        denied = client.get("/api/v1/transcription/scribe-token")
        response = client.get(
            "/api/v1/transcription/scribe-token",
            headers={"Origin": "http://localhost:3001"},
        )

    assert denied.status_code == 403
    assert response.status_code == 200
    assert response.json() == {"token": "short-lived-token", "expires_in_seconds": 900}
    assert response.headers["cache-control"] == "no-store"


def test_scribe_token_route_maps_missing_configuration_to_generic_error() -> None:
    with TestClient(make_app(api_key=None)) as client:
        response = client.get(
            "/api/v1/transcription/scribe-token",
            headers={"Origin": "http://localhost:3001"},
        )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "scribe_not_configured"


def test_scribe_token_route_sanitizes_provider_failure() -> None:
    application = make_app()

    class FailedTokenService:
        async def create_token(self) -> str:
            raise ScribeProviderError("private provider response and key")

    application.state.scribe_token_service = FailedTokenService()
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/transcription/scribe-token",
            headers={"Origin": "http://localhost:3001"},
        )
    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "scribe_unavailable",
        "message": "Live transcription is temporarily unavailable.",
    }
    assert "private provider" not in response.text
