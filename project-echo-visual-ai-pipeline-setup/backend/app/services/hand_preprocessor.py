"""Apply the exact fixed-length transformations used for model training."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.services.landmark_validation import InsufficientLandmarkSequence, LandmarkInputError
from app.services.project_echo_pipeline import SEQUENCE_LENGTH, preprocess_arrays


class HandLandmarkPreprocessor:
    """Thin, independently testable adapter over preprocess_arrays."""

    def transform(self, arrays: dict[str, Any]) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
        if np.asarray(arrays["landmarks"]).shape[0] < 1:
            raise InsufficientLandmarkSequence("landmark sequence contains no frames")
        processed, stats = preprocess_arrays(
            arrays,
            sequence_length=SEQUENCE_LENGTH,
            short_gap_interpolation=False,
        )
        expected_shape = (SEQUENCE_LENGTH, 2, 21, 3)
        for name in ("original_landmarks", "wrist_relative_landmarks", "normalized_landmarks"):
            if processed[name].shape != expected_shape:
                raise LandmarkInputError(f"preprocessing produced invalid {name} shape: {processed[name].shape}")
        if not np.asarray(processed["hand_validity_mask"][:, 0], dtype=np.bool_).any():
            raise InsufficientLandmarkSequence("no valid slot-0 hand observations are available")
        return processed, stats


