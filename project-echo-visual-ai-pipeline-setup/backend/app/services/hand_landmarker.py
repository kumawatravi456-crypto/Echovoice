"""Isolated-process adapter for the existing MediaPipe Hand Landmarker task."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

from app.config import Settings
from app.services.landmark_validation import HandLandmarkInputValidator, LandmarkInputError


class MissingTaskAssetError(FileNotFoundError):
    """Raised when the configured hand-landmarker task asset is unavailable."""


class InvalidVideoInputError(ValueError):
    """Raised when the input video path is missing or empty."""


class DetectorWorkerError(RuntimeError):
    """Raised when the isolated native detector process fails or times out."""

    def __init__(
        self,
        message: str,
        *,
        exit_code: int | None = None,
        stdout: str = "",
        stderr: str = "",
    ) -> None:
        self.exit_code = exit_code
        self.stdout = stdout[-4000:]
        self.stderr = stderr[-4000:]
        super().__init__(message)


class DetectorTimeoutError(DetectorWorkerError):
    """Raised when the isolated detector exceeds its configured deadline."""


class InvalidVideoContentError(ValueError):
    """Raised when a supported upload is not a readable video stream."""


class VideoDurationLimitError(ValueError):
    """Raised when decoded video duration exceeds its configured limit."""


class VideoFrameLimitError(ValueError):
    """Raised when decoded video frame count exceeds its configured limit."""


class VideoDimensionLimitError(ValueError):
    """Raised when decoded video dimensions exceed their configured limits."""


class LandmarkOutputError(LandmarkInputError):
    """Raised when detector output does not satisfy the Phase 3A input contract."""


WORKER_SCRIPT = Path(__file__).with_name("hand_landmarker_worker.py")


def validate_landmark_output(supplied: dict[str, Any]) -> dict[str, np.ndarray]:
    """Validate detector output and retain the Phase 3A raw landmark schema."""
    try:
        arrays = HandLandmarkInputValidator().validate(supplied)
    except LandmarkInputError as error:
        raise LandmarkOutputError(str(error)) from error

    landmarks = arrays["landmarks"]
    frame_count = landmarks.shape[0]
    timestamps = arrays["timestamps_ms"]
    if timestamps.shape != (frame_count,) or timestamps.dtype.kind not in "iu":
        raise LandmarkOutputError(f"timestamps_ms must be an integer vector of length {frame_count}")
    if frame_count > 1 and not np.all(np.diff(timestamps.astype(np.int64)) > 0):
        raise LandmarkOutputError("timestamps_ms must be strictly increasing")
    detected = arrays["detection_mask"]
    if not np.isfinite(landmarks[detected]).all():
        raise LandmarkOutputError("detected hand landmarks must contain finite x/y/z coordinates")
    if not np.isfinite(arrays["handedness_score"]).all():
        raise LandmarkOutputError("handedness_score contains non-finite values")
    return arrays


class HandLandmarkerService:
    """Run MediaPipe in a child process so a native abort cannot kill the API."""

    def __init__(
        self,
        task_path: Path | None = None,
        *,
        timeout_seconds: float = 120.0,
        python_executable: str | Path | None = None,
        worker_script: Path = WORKER_SCRIPT,
    ) -> None:
        self.task_path = Path(task_path or Settings.from_env().hand_landmarker_task_path).expanduser().resolve()
        self.timeout_seconds = float(timeout_seconds)
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self.python_executable = str(
            python_executable or os.environ.get("ECHO_HAND_DETECTOR_PYTHON") or sys.executable
        )
        self.worker_script = Path(worker_script).expanduser().resolve()

    def process_video(
        self,
        video_path: Path,
        *,
        max_duration_seconds: float | None = None,
        max_frames: int | None = None,
        max_width: int | None = None,
        max_height: int | None = None,
    ) -> dict[str, np.ndarray]:
        video_path = Path(video_path).expanduser().resolve()
        if not video_path.is_file():
            raise InvalidVideoInputError(f"video file does not exist: {video_path}")
        if video_path.stat().st_size == 0:
            raise InvalidVideoInputError(f"video file is empty: {video_path}")
        if not self.task_path.is_file() or self.task_path.stat().st_size == 0:
            raise MissingTaskAssetError(f"hand-landmarker task asset is missing or empty: {self.task_path}")
        if not self.worker_script.is_file():
            raise DetectorWorkerError(f"detector worker script is missing: {self.worker_script}")

        with tempfile.TemporaryDirectory(prefix="echo-hand-detector-") as temporary_directory:
            output_path = Path(temporary_directory) / "landmarks.npz"
            command = [
                self.python_executable,
                str(self.worker_script),
                "--video", str(video_path),
                "--model", str(self.task_path),
                "--output", str(output_path),
            ]
            constraints = (max_duration_seconds, max_frames, max_width, max_height)
            if any(value is not None for value in constraints):
                if any(value is None for value in constraints):
                    raise ValueError("all video processing limits must be provided together")
                command.extend([
                    "--max-duration-seconds", str(float(max_duration_seconds)),
                    "--max-frames", str(int(max_frames)),
                    "--max-width", str(int(max_width)),
                    "--max-height", str(int(max_height)),
                ])
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                    check=False,
                )
            except subprocess.TimeoutExpired as error:
                timeout_stdout = error.stdout or ""
                timeout_stderr = error.stderr or ""
                if isinstance(timeout_stdout, bytes):
                    timeout_stdout = timeout_stdout.decode("utf-8", errors="replace")
                if isinstance(timeout_stderr, bytes):
                    timeout_stderr = timeout_stderr.decode("utf-8", errors="replace")
                raise DetectorTimeoutError(
                    f"isolated hand-landmarker worker exceeded {self.timeout_seconds:g} seconds",
                    stdout=timeout_stdout,
                    stderr=timeout_stderr,
                ) from error
            if completed.returncode != 0:
                worker_errors = {
                    2: (InvalidVideoContentError, "video could not be opened or decoded"),
                    3: (VideoDurationLimitError, "video exceeds the configured duration limit"),
                    4: (VideoFrameLimitError, "video exceeds the configured frame-count limit"),
                    5: (VideoDimensionLimitError, "video exceeds the configured dimension limit"),
                }
                if completed.returncode in worker_errors:
                    error_type, safe_message = worker_errors[completed.returncode]
                    raise error_type(safe_message)
                worker_stdout = (completed.stdout or "").strip()
                worker_stderr = (completed.stderr or "").strip()
                termination = f"isolated hand-landmarker worker exited with code {completed.returncode}"
                if completed.returncode < 0:
                    try:
                        signal_name = signal.Signals(-completed.returncode).name
                    except ValueError:
                        signal_name = f"signal {-completed.returncode}"
                    termination += f" ({signal_name}; shell status {128 - completed.returncode})"
                details = []
                if worker_stdout:
                    details.append(f"stdout:\n{worker_stdout[-4000:]}")
                if worker_stderr:
                    details.append(f"stderr:\n{worker_stderr[-4000:]}")
                if not details:
                    details.append("no worker diagnostic")
                raise DetectorWorkerError(
                    f"{termination}:\n" + "\n".join(details),
                    exit_code=completed.returncode,
                    stdout=worker_stdout,
                    stderr=worker_stderr,
                )
            if not output_path.is_file():
                raise DetectorWorkerError("detector worker succeeded without writing landmark output")
            try:
                with np.load(output_path, allow_pickle=False) as archive:
                    arrays = {name: np.array(archive[name], copy=True) for name in archive.files}
            except Exception as error:
                raise DetectorWorkerError(f"could not read detector output safely: {type(error).__name__}: {error}") from error

        return validate_landmark_output(arrays)
