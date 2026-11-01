"""Runtime configuration for model artifact locations."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


_CONFIG_PATH = Path(__file__).resolve()
_SERVICE_ROOT = _CONFIG_PATH.parents[1]
_REPOSITORY_ROOT = _CONFIG_PATH.parents[2]
PROJECT_ROOT = next(
    (
        root
        for root in (_SERVICE_ROOT, _REPOSITORY_ROOT)
        if (root / "datasets" / "processed" / "models").is_dir()
        and (root / "models" / "hand_landmarker.task").is_file()
        and (root / "scripts").is_dir()
    ),
    _REPOSITORY_ROOT,
)
DEFAULT_MODEL_DIR = PROJECT_ROOT / "datasets" / "processed" / "models" / "hand_gestures" / "baseline_v1"
DEFAULT_HAND_LANDMARKER_TASK = PROJECT_ROOT / "models" / "hand_landmarker.task"


@dataclass(frozen=True)
class Settings:
    hand_model_path: Path = DEFAULT_MODEL_DIR / "model.joblib"
    hand_metadata_path: Path = DEFAULT_MODEL_DIR / "model_metadata.json"
    hand_landmarker_task_path: Path = DEFAULT_HAND_LANDMARKER_TASK
    hand_video_max_upload_bytes: int = 20 * 1024 * 1024
    hand_video_max_duration_seconds: float = 5.0
    hand_video_max_frames: int = 150
    hand_video_max_width: int = 1920
    hand_video_max_height: int = 1080
    hand_detector_timeout_seconds: float = 120.0
    hand_video_max_concurrent_jobs: int = 1
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    conversation_timeout_seconds: float = 15.0
    conversation_gesture_max_age_seconds: float = 5.0
    elevenlabs_api_key: str | None = None
    frontend_origins: tuple[str, ...] = ("http://localhost:3000", "http://localhost:3001")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            hand_model_path=Path(os.environ.get("ECHO_HAND_MODEL_PATH", DEFAULT_MODEL_DIR / "model.joblib")).expanduser(),
            hand_metadata_path=Path(os.environ.get("ECHO_HAND_METADATA_PATH", DEFAULT_MODEL_DIR / "model_metadata.json")).expanduser(),
            hand_landmarker_task_path=Path(
                os.environ.get("ECHO_HAND_LANDMARKER_TASK_PATH", DEFAULT_HAND_LANDMARKER_TASK)
            ).expanduser(),
            hand_video_max_upload_bytes=int(os.environ.get("ECHO_HAND_VIDEO_MAX_UPLOAD_BYTES", 20 * 1024 * 1024)),
            hand_video_max_duration_seconds=float(os.environ.get("ECHO_HAND_VIDEO_MAX_DURATION_SECONDS", 5.0)),
            hand_video_max_frames=int(os.environ.get("ECHO_HAND_VIDEO_MAX_FRAMES", 150)),
            hand_video_max_width=int(os.environ.get("ECHO_HAND_VIDEO_MAX_WIDTH", 1920)),
            hand_video_max_height=int(os.environ.get("ECHO_HAND_VIDEO_MAX_HEIGHT", 1080)),
            hand_detector_timeout_seconds=float(os.environ.get("ECHO_HAND_DETECTOR_TIMEOUT_SECONDS", 120.0)),
            hand_video_max_concurrent_jobs=int(os.environ.get("ECHO_HAND_VIDEO_MAX_CONCURRENT_JOBS", 1)),
            groq_api_key=os.environ.get("GROQ_API_KEY") or None,
            groq_model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip(),
            conversation_timeout_seconds=float(os.environ.get("ECHO_CONVERSATION_TIMEOUT_SECONDS", 15.0)),
            conversation_gesture_max_age_seconds=float(
                os.environ.get("ECHO_CONVERSATION_GESTURE_MAX_AGE_SECONDS", 5.0)
            ),
            elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY") or None,
            frontend_origins=tuple(
                origin.strip().rstrip("/")
                for origin in os.environ.get(
                    "ECHO_FRONTEND_ORIGINS", "http://localhost:3000,http://localhost:3001"
                ).split(",")
                if origin.strip()
            ),
        )
