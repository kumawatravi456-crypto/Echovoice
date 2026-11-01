"""HTTP request and response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HandFeaturesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: dict[str, Any]


class HandFeaturesResponse(BaseModel):
    predicted_label: str
    uncalibrated_scores: dict[str, float]
    score_semantics: Literal["uncalibrated_model_probability_scores"] = "uncalibrated_model_probability_scores"
    calibrated: Literal[False] = False
    warning: str = "Scores are uncalibrated model outputs, not reliable confidence estimates."


class HandVideoInferenceResponse(BaseModel):
    frames_processed: int
    frames_with_detected_hands: int
    frames_with_valid_slot0_observations: int
    predicted_label: str
    uncalibrated_scores: dict[str, float]
    score_semantics: Literal["uncalibrated_model_probability_scores"] = "uncalibrated_model_probability_scores"
    calibrated: Literal[False] = False
    warnings: list[str]


class ConversationTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    speaker: Literal["user", "partner", "unknown"]
    text: str = Field(min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("conversation text cannot be blank")
        return value


class ConversationSignalMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hand_tracking_active: bool | None = None
    face_tracking_active: bool | None = None
    mouth_motion_available: bool | None = None


class ConversationGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latest_finalized_transcript: str = Field(min_length=1, max_length=1000)
    latest_speaker: Literal["user", "partner", "unknown"] = "partner"
    history: list[ConversationTurn] = Field(default_factory=list, max_length=20)
    gesture_label: Literal["YES", "NO", "HELP", "WATER", "STOP"] | None = None
    gesture_timestamp: datetime | None = None
    signal_metadata: ConversationSignalMetadata | None = None

    @field_validator("latest_finalized_transcript")
    @classmethod
    def nonblank_transcript(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("latest transcript cannot be blank")
        return value

    @field_validator("gesture_timestamp")
    @classmethod
    def require_timezone_for_gesture_timestamp(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("gesture_timestamp must include a timezone")
        return value


class ConversationGenerateResponse(BaseModel):
    suggested_response: str
    gesture_context_used: bool
    warnings: list[str]


class ScribeTokenResponse(BaseModel):
    token: str
    expires_in_seconds: int = 900
