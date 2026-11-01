"""Validate in-memory landmark sequences before using training preprocessing."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np


class LandmarkInputError(ValueError):
    """Raised when a landmark sequence violates the extraction schema."""


class InsufficientLandmarkSequence(LandmarkInputError):
    """Raised when no usable slot-0 observation can produce the trained features."""


class HandLandmarkInputValidator:
    """Validate the raw Tasks-extractor arrays without imputing absent hands."""

    REQUIRED_ARRAYS = ("landmarks", "detection_mask", "handedness", "handedness_score", "timestamps_ms")

    def validate(self, supplied: Mapping[str, Any]) -> dict[str, np.ndarray]:
        if not isinstance(supplied, Mapping):
            raise LandmarkInputError("landmark input must be a mapping of named arrays")
        missing = [name for name in self.REQUIRED_ARRAYS if name not in supplied]
        if missing:
            raise LandmarkInputError(f"missing required landmark arrays: {missing}")

        arrays: dict[str, np.ndarray] = {}
        for name, value in supplied.items():
            array = np.asarray(value)
            if array.dtype.kind == "O":
                raise LandmarkInputError(f"{name} uses an unsupported object dtype")
            arrays[name] = np.array(array, copy=True)

        landmarks = arrays["landmarks"]
        if landmarks.ndim != 4 or landmarks.shape[1:] != (2, 21, 3):
            raise LandmarkInputError(f"landmarks must have shape (frames, 2, 21, 3); got {landmarks.shape}")
        if landmarks.dtype != np.float32:
            raise LandmarkInputError(f"landmarks must have dtype float32; got {landmarks.dtype}")
        frame_count = landmarks.shape[0]
        if frame_count < 1:
            raise InsufficientLandmarkSequence("landmark sequence contains no frames")

        expected = {
            "detection_mask": ((frame_count, 2), np.dtype(np.bool_)),
            "handedness": ((frame_count, 2), None),
            "handedness_score": ((frame_count, 2), np.dtype(np.float32)),
        }
        for name, (shape, dtype) in expected.items():
            array = arrays[name]
            if array.shape != shape:
                raise LandmarkInputError(f"{name} must have shape {shape}; got {array.shape}")
            if dtype is not None and array.dtype != dtype:
                raise LandmarkInputError(f"{name} must have dtype {dtype}; got {array.dtype}")
            if name == "handedness" and array.dtype.kind not in "US":
                raise LandmarkInputError(f"handedness must contain strings; got {array.dtype}")

        # Match the source preprocessor: unusable timestamps are accepted and
        # cause its documented frame-index resampling fallback.
        for name, default in (("source_fps", 30.0), ("timestamp_fps", 30.0)):
            if name not in arrays:
                arrays[name] = np.asarray(default, dtype=np.float32)
            value = arrays[name]
            if value.shape != () or value.dtype.kind not in "iuf":
                raise LandmarkInputError(f"{name} must be a numeric scalar")

        text_defaults = {
            "timestamp_basis": "inference_input_timestamps",
            "class_label": "UNKNOWN",
            "source_filename": "inference_sequence",
            "source_relative_path": "inference_sequence",
        }
        for name, default in text_defaults.items():
            if name not in arrays:
                arrays[name] = np.asarray(default)
            value = arrays[name]
            if value.shape != () or value.dtype.kind not in "US":
                raise LandmarkInputError(f"{name} must be a scalar string")

        return arrays
