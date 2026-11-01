from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.config import PROJECT_ROOT
from app.services.hand_classifier import HandClassifierService
from app.services.hand_inference import HandInferenceService
from app.services.hand_landmarker import (
    DetectorWorkerError,
    HandLandmarkerService,
    MissingTaskAssetError,
)
from app.services.project_echo_pipeline import FEATURE_COLUMNS


TASK_PATH = PROJECT_ROOT / "models/hand_landmarker.task"
MODEL_DIR = PROJECT_ROOT / "datasets/processed/models/hand_gestures/baseline_v1"


POINTS = [
    [0.50, 0.80, 0.00], [0.44, 0.75, 0.00], [0.39, 0.70, 0.00], [0.34, 0.65, 0.00], [0.30, 0.61, 0.00],
    [0.43, 0.61, 0.00], [0.42, 0.51, 0.00], [0.41, 0.41, 0.00], [0.40, 0.31, 0.00],
    [0.50, 0.58, 0.00], [0.50, 0.47, 0.00], [0.50, 0.36, 0.00], [0.50, 0.25, 0.00],
    [0.58, 0.61, 0.00], [0.60, 0.52, 0.00], [0.62, 0.43, 0.00], [0.64, 0.34, 0.00],
    [0.65, 0.66, 0.00], [0.69, 0.58, 0.00], [0.72, 0.50, 0.00], [0.74, 0.42, 0.00],
]


def make_short_video(path: Path) -> None:
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"MJPG"),
        10.0,
        (64, 64),
    )
    if not writer.isOpened():
        pytest.skip("OpenCV MJPG video writer is unavailable on this test host")
    for index in range(6):
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        frame[:, :, 1] = index * 20
        writer.write(frame)
    writer.release()


def write_synthetic_worker(path: Path) -> None:
    worker_source = r'''from __future__ import annotations
import argparse
import sys
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--video", required=True)
parser.add_argument("--model", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
video = Path(args.video)
if not video.is_file() or video.stat().st_size == 0:
    print("[ERROR] video input missing or empty", file=sys.stderr)
    raise SystemExit(2)
points = np.asarray(''' + repr(POINTS) + r''', dtype=np.float32)
landmarks = np.zeros((5, 2, 21, 3), dtype=np.float32)
landmarks[:, 0] = points
detection_mask = np.zeros((5, 2), dtype=np.bool_)
detection_mask[:, 0] = True
handedness = np.full((5, 2), "", dtype="U8")
handedness[:, 0] = "Right"
handedness_score = np.zeros((5, 2), dtype=np.float32)
handedness_score[:, 0] = 0.98
np.savez_compressed(
    args.output,
    landmarks=landmarks,
    detection_mask=detection_mask,
    handedness=handedness,
    handedness_score=handedness_score,
    timestamps_ms=np.asarray([0, 100, 200, 300, 400], dtype=np.int64),
    source_fps=np.asarray(10.0, dtype=np.float32),
    timestamp_fps=np.asarray(10.0, dtype=np.float32),
    timestamp_basis=np.asarray("frame_index / timestamp_fps"),
    class_label=np.asarray("UNKNOWN"),
    source_filename=np.asarray(video.name),
    source_relative_path=np.asarray("inference/" + video.name),
)
'''
    path.write_text(worker_source, encoding="utf-8")


def test_short_video_flows_through_detector_contract_adapters_and_classifier(tmp_path: Path) -> None:
    video_path = tmp_path / "short_sample.avi"
    make_short_video(video_path)
    worker_script = tmp_path / "synthetic_detector_worker.py"
    write_synthetic_worker(worker_script)

    # The real worker is deliberately not launched in this test host: this
    # process-boundary fixture isolates the pipeline test from native MediaPipe.
    detector = HandLandmarkerService(task_path=TASK_PATH, worker_script=worker_script, python_executable=sys.executable)
    raw_landmarks = detector.process_video(video_path)
    assert raw_landmarks["landmarks"].shape == (5, 2, 21, 3)
    assert raw_landmarks["detection_mask"].dtype == np.bool_
    assert raw_landmarks["detection_mask"][:, 0].all()
    assert not raw_landmarks["detection_mask"][:, 1].any()

    metadata = json.loads((MODEL_DIR / "model_metadata.json").read_text(encoding="utf-8"))
    classifier = HandClassifierService.load(MODEL_DIR / "model.joblib", MODEL_DIR / "model_metadata.json")
    result = HandInferenceService(classifier).predict_landmarks(raw_landmarks)

    assert result.processed_sequence_length == 32
    assert result.valid_slot0_frame_count > 0
    assert tuple(result.features) == tuple(FEATURE_COLUMNS) == tuple(metadata["feature_columns"])
    assert len(result.features) == 7
    assert np.isfinite(np.asarray(list(result.features.values()))).all()
    assert result.classifier_result["predicted_label"] in metadata["class_labels"]
    assert list(result.classifier_result["uncalibrated_scores"]) == metadata["estimator_classes"]


def test_end_to_end_path_reports_missing_task_asset_before_worker(tmp_path: Path) -> None:
    video_path = tmp_path / "short_sample.avi"
    make_short_video(video_path)
    worker_script = tmp_path / "worker_should_not_run.py"
    worker_script.write_text("raise RuntimeError('worker should not run')\n", encoding="utf-8")
    detector = HandLandmarkerService(
        task_path=tmp_path / "missing.task",
        worker_script=worker_script,
        python_executable=sys.executable,
    )
    with pytest.raises(MissingTaskAssetError):
        detector.process_video(video_path)


def test_end_to_end_path_reports_missing_mediapipe_dependency_from_worker(tmp_path: Path) -> None:
    video_path = tmp_path / "short_sample.avi"
    make_short_video(video_path)
    worker_script = tmp_path / "worker_missing_mediapipe.py"
    worker_script.write_text(
        "import sys\nprint(\"[ERROR] imports: ModuleNotFoundError: No module named 'mediapipe'\", file=sys.stderr)\nsys.exit(1)\n",
        encoding="utf-8",
    )
    detector = HandLandmarkerService(
        task_path=TASK_PATH,
        worker_script=worker_script,
        python_executable=sys.executable,
    )
    with pytest.raises(DetectorWorkerError, match="No module named.*mediapipe"):
        detector.process_video(video_path)
