from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

from app.config import PROJECT_ROOT
from app.services.hand_landmarker import (
    DetectorWorkerError,
    HandLandmarkerService,
    InvalidVideoInputError,
    LandmarkOutputError,
    MissingTaskAssetError,
    validate_landmark_output,
)


TASK_PATH = PROJECT_ROOT / "models/hand_landmarker.task"


def detector_output() -> dict[str, np.ndarray]:
    landmarks = np.zeros((2, 2, 21, 3), dtype=np.float32)
    landmarks[:, 0] = np.arange(63, dtype=np.float32).reshape(21, 3) / 100.0
    return {
        "landmarks": landmarks,
        "detection_mask": np.asarray([[True, False], [True, False]], dtype=np.bool_),
        "handedness": np.asarray([["Right", ""], ["Right", ""]], dtype="U8"),
        "handedness_score": np.asarray([[0.98, 0.0], [0.97, 0.0]], dtype=np.float32),
        "timestamps_ms": np.asarray([0, 33], dtype=np.int64),
        "source_fps": np.asarray(30.0, dtype=np.float32),
        "timestamp_fps": np.asarray(30.0, dtype=np.float32),
        "timestamp_basis": np.asarray("frame_index / timestamp_fps"),
        "class_label": np.asarray("UNKNOWN"),
        "source_filename": np.asarray("sample.mp4"),
        "source_relative_path": np.asarray("inference/sample.mp4"),
    }


def test_landmark_output_validation_preserves_raw_schema_and_missing_slot() -> None:
    output = validate_landmark_output(detector_output())
    assert output["landmarks"].shape == (2, 2, 21, 3)
    assert output["landmarks"].dtype == np.float32
    assert output["detection_mask"].dtype == np.bool_
    assert output["handedness"].shape == (2, 2)
    assert output["timestamps_ms"].tolist() == [0, 33]
    assert not output["detection_mask"][:, 1].any()
    assert np.count_nonzero(output["landmarks"][:, 1]) == 0


def test_landmark_output_rejects_bad_timestamps_and_nonfinite_detected_points() -> None:
    bad_timestamps = detector_output()
    bad_timestamps["timestamps_ms"] = np.asarray([10, 10], dtype=np.int64)
    with pytest.raises(LandmarkOutputError, match="strictly increasing"):
        validate_landmark_output(bad_timestamps)

    bad_points = detector_output()
    bad_points["landmarks"][0, 0, 0, 0] = np.nan
    with pytest.raises(LandmarkOutputError, match="finite x/y/z"):
        validate_landmark_output(bad_points)


def test_missing_task_asset_is_reported_before_worker_start(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"nonempty")
    service = HandLandmarkerService(task_path=tmp_path / "missing.task")
    with pytest.raises(MissingTaskAssetError):
        service.process_video(video)


def test_empty_or_missing_video_is_rejected_before_detector_initialization(tmp_path: Path) -> None:
    empty_video = tmp_path / "empty.mp4"
    empty_video.touch()
    service = HandLandmarkerService(task_path=TASK_PATH)
    with pytest.raises(InvalidVideoInputError, match="empty"):
        service.process_video(empty_video)
    with pytest.raises(InvalidVideoInputError, match="does not exist"):
        service.process_video(tmp_path / "missing.mp4")


def test_detector_worker_failure_is_reported_without_affecting_caller(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"nonempty")
    failing_worker = tmp_path / "worker_failure.py"
    failing_worker.write_text(
        "import sys\nprint('worker stdout diagnostic')\nprint('simulated native detector abort', file=sys.stderr)\nsys.exit(134)\n",
        encoding="utf-8",
    )
    service = HandLandmarkerService(task_path=TASK_PATH, worker_script=failing_worker, python_executable=sys.executable)
    with pytest.raises(DetectorWorkerError, match="(?s)code 134.*worker stdout diagnostic.*simulated native detector abort") as raised:
        service.process_video(video)
    assert raised.value.exit_code == 134
    assert raised.value.stdout == "worker stdout diagnostic"
    assert raised.value.stderr == "simulated native detector abort"
    # Reaching this assertion proves the worker exit was contained in its child process.
    assert True


def test_detector_worker_executable_can_be_configured_without_changing_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ECHO_HAND_DETECTOR_PYTHON", "/tmp/echo-macos-worker/bin/python")
    configured = HandLandmarkerService(task_path=TASK_PATH)
    assert configured.python_executable == "/tmp/echo-macos-worker/bin/python"

    monkeypatch.delenv("ECHO_HAND_DETECTOR_PYTHON")
    default = HandLandmarkerService(task_path=TASK_PATH)
    assert default.python_executable == sys.executable
