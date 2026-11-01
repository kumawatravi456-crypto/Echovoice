from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from groq import NotFoundError

from app.config import PROJECT_ROOT, Settings
from app.main import create_app
from app.services.conversation_generator import ConversationGeneratorService


MODEL_DIR = PROJECT_ROOT / "datasets/processed/models/hand_gestures/baseline_v1"
MODEL_PATH = MODEL_DIR / "model.joblib"
METADATA_PATH = MODEL_DIR / "model_metadata.json"


class FakeCompletions:
    def __init__(self, response_text: str = "Could you tell me a little more?") -> None:
        self.response_text = response_text
        self.call: dict[str, Any] | None = None
        self.error: Exception | None = None

    def create(self, **kwargs: Any) -> Any:
        self.call = kwargs
        if self.error:
            raise self.error
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.response_text))]
        )


class FakeClient:
    def __init__(self, completions: FakeCompletions) -> None:
        self.chat = SimpleNamespace(completions=completions)

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *_: object) -> None:
        return None


class FakeClientFactory:
    def __init__(self, completions: FakeCompletions) -> None:
        self.completions = completions
        self.options: dict[str, Any] | None = None

    def __call__(self, **kwargs: Any) -> FakeClient:
        self.options = kwargs
        return FakeClient(self.completions)


def make_app(*, api_key: str | None = "test-only-groq-key"):
    settings = Settings(MODEL_PATH, METADATA_PATH, groq_api_key=api_key)
    return create_app(settings)


def make_service(
    *, api_key: str | None = "test-only-groq-key", completions: FakeCompletions | None = None
) -> tuple[ConversationGeneratorService, FakeCompletions, FakeClientFactory]:
    chosen_completions = completions or FakeCompletions()
    factory = FakeClientFactory(chosen_completions)
    settings = Settings(MODEL_PATH, METADATA_PATH, groq_api_key=api_key)
    service = ConversationGeneratorService(
        settings,
        client_factory=factory,
        clock=lambda: datetime.now(UTC),
    )
    return service, chosen_completions, factory


def test_groq_environment_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-only-groq-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    settings = Settings.from_env()
    assert settings.groq_api_key == "test-only-groq-key"
    assert settings.groq_model == "openai/gpt-oss-20b"


def test_default_groq_model_is_current_production_model() -> None:
    assert Settings().groq_model == "openai/gpt-oss-120b"


def test_unknown_speaker_is_preserved_as_unknown_in_provider_context() -> None:
    service, completions, _ = make_service()
    from app.schemas import ConversationGenerateRequest

    request = ConversationGenerateRequest.model_validate(
        {
            "latest_finalized_transcript": "Could you help?",
            "latest_speaker": "unknown",
            "history": [{"speaker": "unknown", "text": "Earlier unclear speech."}],
        }
    )
    service.generate(request)
    context = json.loads(completions.call["messages"][1]["content"])
    assert context["latest_speaker"] == "unknown"
    assert context["history"][0]["speaker"] == "unknown"


def test_successful_response_uses_context_and_groq_chat_completion() -> None:
    service, completions, factory = make_service()
    now = datetime.now(UTC)
    from app.schemas import ConversationGenerateRequest

    request = ConversationGenerateRequest.model_validate(
        {
            "latest_finalized_transcript": "I need some water",
            "history": [{"speaker": "partner", "text": "What would help?"}],
            "gesture_label": "WATER",
            "gesture_timestamp": (now - timedelta(seconds=1)).isoformat(),
            "signal_metadata": {"mouth_motion_available": True},
        }
    )
    result = service.generate(request)

    assert result.suggested_response == "Could you tell me a little more?"
    assert result.gesture_context_used is True
    assert result.warnings
    assert factory.options is not None
    assert factory.options["api_key"] == "test-only-groq-key"
    assert factory.options["timeout"] == 15.0
    assert factory.options["max_retries"] == 0
    assert completions.call["model"] == "openai/gpt-oss-120b"
    assert completions.call["max_completion_tokens"] == 120
    context = json.loads(completions.call["messages"][1]["content"])
    assert completions.call["messages"][0]["role"] == "system"
    assert context["latest_finalized_transcript"] == "I need some water"
    assert context["history"][0]["text"] == "What would help?"
    assert context["fresh_hand_gesture"] == {"label": "WATER"}
    assert context["signal_metadata"] == {"mouth_motion_available": True}


@pytest.mark.parametrize(
    ("gesture", "expected_warning"),
    [
        ({"gesture_label": "YES"}, "timestamp was unavailable"),
        (
            {
                "gesture_label": "YES",
                "gesture_timestamp": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
            },
            "stale or had a future timestamp",
        ),
    ],
)
def test_stale_or_untimestamped_gesture_is_omitted(
    gesture: dict[str, str], expected_warning: str
) -> None:
    service, completions, _ = make_service()
    from app.schemas import ConversationGenerateRequest

    request = ConversationGenerateRequest.model_validate(
        {"latest_finalized_transcript": "Hello", **gesture}
    )
    result = service.generate(request)
    assert result.gesture_context_used is False
    assert any(expected_warning in warning for warning in result.warnings)
    context = json.loads(completions.call["messages"][1]["content"])
    assert context["fresh_hand_gesture"] is None


def test_missing_groq_key_is_reported() -> None:
    with TestClient(make_app(api_key=None)) as client:
        response = client.post(
            "/api/v1/conversation/generate",
            json={"latest_finalized_transcript": "Hello"},
        )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "conversation_not_configured"


def test_provider_failure_is_sanitized_and_returns_generic_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    api_key = "gsk_test-secret-never-real"
    transcript = "private transcript fixture"
    response = httpx.Response(
        404,
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
        json={"error": {"message": f"model unavailable: {transcript}; {api_key}; Authorization: Bearer private-token"}},
    )
    error = NotFoundError(response.json()["error"]["message"], response=response, body=response.json())
    completions = FakeCompletions()
    completions.error = error
    application = make_app(api_key=api_key)
    service, _, _ = make_service(api_key=api_key, completions=completions)
    application.state.conversation_generator = service

    with TestClient(application) as client:
        with caplog.at_level("WARNING", logger="app.services.conversation_generator"):
            result = client.post(
                "/api/v1/conversation/generate",
                json={"latest_finalized_transcript": transcript},
            )

    assert result.status_code == 503
    assert result.json()["detail"]["code"] == "conversation_unavailable"
    assert "NotFoundError" in caplog.text
    assert "404" in caplog.text
    assert "model unavailable" in caplog.text
    assert api_key not in caplog.text
    assert transcript not in caplog.text
    assert "private-token" not in caplog.text


def test_provider_timeout_keeps_gateway_timeout_response() -> None:
    completions = FakeCompletions()
    completions.error = TimeoutError("test timeout")
    application = make_app()
    service, _, _ = make_service(completions=completions)
    application.state.conversation_generator = service
    with TestClient(application) as client:
        response = client.post(
            "/api/v1/conversation/generate",
            json={"latest_finalized_transcript": "Hello"},
        )
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "conversation_timeout"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"latest_finalized_transcript": "   "},
        {"latest_finalized_transcript": "Hello", "unexpected": "field"},
        {"latest_finalized_transcript": "Hello", "gesture_label": "MAYBE"},
        {"latest_finalized_transcript": "Hello", "gesture_label": "YES", "gesture_timestamp": "2026-11-01T12:00:00"},
    ],
)
def test_invalid_conversation_request_is_rejected(payload: dict[str, Any]) -> None:
    with TestClient(make_app()) as client:
        assert client.post("/api/v1/conversation/generate", json=payload).status_code == 422
