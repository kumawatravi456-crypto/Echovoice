"""Bindings to the original, authoritative Project Echo pipeline functions."""

from __future__ import annotations

import sys
from app.config import PROJECT_ROOT


if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.extract_hand_features import SEQUENCE_LENGTH, extract_record_features  # noqa: E402
from scripts.preprocess_hand_landmarks import preprocess_arrays  # noqa: E402
from scripts.train_hand_gesture_baseline import FEATURE_COLUMNS  # noqa: E402


__all__ = ["FEATURE_COLUMNS", "PROJECT_ROOT", "SEQUENCE_LENGTH", "extract_record_features", "preprocess_arrays"]
