from __future__ import annotations

import concurrent.futures
import sys
import time
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import DEFAULT_HAND_LANDMARKER_TASK, Settings
from app.main import create_app
from app.services.hand_landmarker_worker import validate_decoded_frame


ROOT = Path(__file__).resolve().parents[2]
FEATURES = {
    "slot0_thumb_joint2_angle_deg_mean": 30.0,
    "slot0_index_joint1_angle_deg_mean": 40.0,
    "slot0_pinky_joint2_angle_deg_mean": 50.0,
    "slot0_index_extension_ratio_mean": 0.5,
    "slot0_thumb_tip_to_palm_center_distance_norm_mean": 0.3,
    "slot0_index_tip_to_wrist_distance_norm_mean": 0.6,
    "slot0_palm_projected_area_norm2_mean": 0.2,
}
POINTS = [
    [0.50, 0.80, 0.00], [0.44, 0.75, 0.00], [0.39, 0.70, 0.00], [0.34, 0.65, 0.00], [0.30, 0.61, 0.00],
    [0.43, 0.61, 0.00], [0.42, 0.51, 0.00], [0.41, 0.41, 0.00], [0.40, 0.31, 0.00],
    [0.50, 0.58, 0.00], [0.50, 0.47, 0.00], [0.50, 0.36, 0.00], [0.50, 0.25, 0.00],
    [0.58, 0.61, 0.00], [0.60, 0.52, 0.00], [0.62, 0.43, 0.00], [0.64, 0.34, 0.00],
    [0.65, 0.66, 0.00], [0.69, 0.58, 0.00], [0.72, 0.50, 0.00], [0.74, 0.42, 0.00],
]


def make_video(path: Path, *, frames: int = 6, fps: float = 10.0, size: tuple[int, int] = (64, 64)) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, size)
    if not writer.isOpened():
        pytest.skip("OpenCV MJPG video writer is unavailable on this test host")
    for index in range(frames):
        frame = np.zeros((size[1], size[0], 3), dtype=np.uint8)
        frame[:, :, 1] = index % 255
        writer.write(frame)
    writer.release()


def write_synthetic_worker(path: Path, *, behavior: str = "normal", marker: Path | None = None) -> None:
    source = r'''from __future__ import annotations
import argparse
import sys
import time
from pathlib import Path
import cv2
import numpy as np
sys.path.insert(0, BACKEND_PATH)
from app.services.hand_landmarker_worker import validate_decoded_frame

parser = argparse.ArgumentParser()
parser.add_argument("--video", required=True)
parser.add_argument("--model", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--max-duration-seconds", type=float)
parser.add_argument("--max-frames", type=int)
parser.add_argument("--max-width", type=int)
parser.add_argument("--max-height", type=int)
args = parser.parse_args()
video = Path(args.video)
if MARKER_PATH:
    Path(MARKER_PATH).write_text(str(video))
if BEHAVIOR == "timeout":
    time.sleep(2.0)
if BEHAVIOR == "worker_failure":
    print("worker stdout diagnostic")
    print("failure at /private/path/that/must/not/leak", file=sys.stderr)
    raise SystemExit(1)
capture = cv2.VideoCapture(str(video))
fps = float(capture.get(cv2.CAP_PROP_FPS))
if not capture.isOpened() or not fps > 0:
    capture.release()
    raise SystemExit(2)
frames = 0
while True:
    ok, frame = capture.read()
    if not ok:
        break
    stamp = int(round(frames * 1000.0 / fps))
    try:
        validate_decoded_frame(
            frame, frames, stamp,
            max_duration_seconds=args.max_duration_seconds,
            max_frames=args.max_frames,
            max_width=args.max_width,
            max_height=args.max_height,
        )
    except Exception as error:
        from app.services.hand_landmarker_worker import _VideoRejected
        if isinstance(error, _VideoRejected):
            raise SystemExit(error.exit_code)
        raise
    frames += 1
capture.release()
if frames == 0:
    raise SystemExit(2)
if BEHAVIOR == "no_slot0":
    landmarks = np.zeros((frames, 2, 21, 3), dtype=np.float32)
    detection_mask = np.zeros((frames, 2), dtype=np.bool_)
else:
    points = np.asarray(POINTS, dtype=np.float32)
    landmarks = np.zeros((frames, 2, 21, 3), dtype=np.float32)
    landmarks[:, 0] = points
    detection_mask = np.zeros((frames, 2), dtype=np.bool_)
    detection_mask[:, 0] = True
handedness = np.full((frames, 2), "", dtype="U8")
handedness[:, 0] = "Right"
handedness_score = np.zeros((frames, 2), dtype=np.float32)
handedness_score[:, 0] = 0.98
np.savez_compressed(
    args.output,
    landmarks=landmarks,
    detection_mask=detection_mask,
    handedness=handedness,
    handedness_score=handedness_score,
    timestamps_ms=np.asarray([int(round(i * 1000.0 / fps)) for i in range(frames)], dtype=np.int64),
    source_fps=np.asarray(fps, dtype=np.float32),
    timestamp_fps=np.asarray(fps, dtype=np.float32),
    timestamp_basis=np.asarray("frame_index / timestamp_fps"),
    class_label=np.asarray("UNKNOWN"),
    source_filename=np.asarray(video.name),
    source_relative_path=np.asarray("inference/" + video.name),
)
'''
    values = {
        "BACKEND_PATH": repr(str(ROOT / "backend")),
        "MARKER_PATH": repr(str(marker)) if marker else "None",
        "BEHAVIOR": repr(behavior),
        "POINTS": repr(POINTS),
    }
    for name, value in values.items():
        source = source.replace(name, value)
    compile(source, str(path), "exec")
    path.write_text(source, encoding="utf-8")


def make_client(
    tmp_path: Path,
    *,
    behavior: str = "normal",
    marker: Path | None = None,
    settings: Settings | None = None,
) -> TestClient:
    tmp_path.mkdir(parents=True, exist_ok=True)
    application = create_app(settings or Settings())
    worker = tmp_path / f"synthetic_worker_{behavior}.py"
    write_synthetic_worker(worker, behavior=behavior, marker=marker)
    application.state.hand_landmarker.worker_script = worker.resolve()
    application.state.hand_landmarker.python_executable = sys.executable
    return TestClient(application)


def post_video(client: TestClient, content: bytes, filename: str = "sample.avi", mime: str = "video/x-msvideo"):
    return client.post(
        "/api/v1/inference/hand/video",
        files={"file": (filename, content, mime)},
    )


def test_multipart_video_runs_synthetic_pipeline_and_cleans_temp_file(tmp_path: Path) -> None:
    video = tmp_path / "sample.avi"
    make_video(video)
    marker = tmp_path / "input_path.txt"
    with make_client(tmp_path, marker=marker) as client:
        response = post_video(client, video.read_bytes())
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["frames_processed"] == 6
    assert payload["frames_with_detected_hands"] == 6
    assert payload["frames_with_valid_slot0_observations"] == 6
    assert payload["predicted_label"] in {"HELP", "NO", "STOP", "WATER", "YES"}
    assert list(payload["uncalibrated_scores"]) == ["HELP", "NO", "STOP", "WATER", "YES"]
    assert payload["calibrated"] is False
    assert payload["score_semantics"] == "uncalibrated_model_probability_scores"
    assert any("uncalibrated" in warning for warning in payload["warnings"])
    assert marker.exists() and not Path(marker.read_text()).exists()


def test_oversized_upload_is_rejected_while_copying(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        response = post_video(client, b"x" * (20 * 1024 * 1024 + 1))
        body_limit_response = post_video(client, b"x" * (20 * 1024 * 1024 + 64 * 1024 + 1))
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "upload_too_large"
    assert body_limit_response.status_code == 413
    assert body_limit_response.json()["detail"]["code"] == "upload_too_large"


def test_unsupported_extension_or_mime_is_rejected(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        response = post_video(client, b"not a video", "sample.bin", "application/octet-stream")
    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "unsupported_video_type"


def test_unreadable_video_is_rejected_and_temp_file_is_removed(tmp_path: Path) -> None:
    marker = tmp_path / "input_path.txt"
    with make_client(tmp_path, marker=marker) as client:
        response = post_video(client, b"not a video")
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_video"
    assert marker.exists() and not Path(marker.read_text()).exists()


@pytest.mark.parametrize(
    ("name", "frames", "fps", "size", "expected_code"),
    [
        ("duration", 60, 10.0, (64, 64), "video_too_long"),
        ("frames", 151, 30.0, (64, 64), "too_many_frames"),
        ("dimensions", 3, 10.0, (1922, 1082), "video_dimensions_too_large"),
    ],
)
def test_duration_frame_and_dimension_limits_are_enforced(
    tmp_path: Path,
    name: str,
    frames: int,
    fps: float,
    size: tuple[int, int],
    expected_code: str,
) -> None:
    video = tmp_path / f"{name}.avi"
    make_video(video, frames=frames, fps=fps, size=size)
    with make_client(tmp_path) as client:
        response = post_video(client, video.read_bytes())
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == expected_code


def test_detector_timeout_and_worker_failure_are_sanitized(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    video = tmp_path / "sample.avi"
    make_video(video)
    short_timeout = replace(Settings(), hand_detector_timeout_seconds=1.0)
    timeout_marker = tmp_path / "timeout_input.txt"
    with make_client(tmp_path / "timeout", behavior="timeout", marker=timeout_marker, settings=short_timeout) as client:
        timeout_response = post_video(client, video.read_bytes())
    assert timeout_response.status_code == 504
    assert timeout_response.json()["detail"]["code"] == "detector_timeout"
    assert timeout_marker.exists() and not Path(timeout_marker.read_text()).exists()

    failure_marker = tmp_path / "failure_input.txt"
    with make_client(tmp_path / "worker_failure", behavior="worker_failure", marker=failure_marker) as client:
        failure_response = post_video(client, video.read_bytes())
    assert failure_response.status_code == 503
    assert failure_response.json()["detail"]["code"] == "detector_failed"
    assert "/private/path" not in failure_response.text
    assert "worker stdout diagnostic" in caplog.text
    assert "failure at /private/path/that/must/not/leak" in caplog.text
    assert "exit_code=1" in caplog.text
    assert failure_marker.exists() and not Path(failure_marker.read_text()).exists()


def test_missing_task_asset_and_model_are_reported_without_paths(tmp_path: Path) -> None:
    video = tmp_path / "sample.avi"
    make_video(video)
    no_task = replace(Settings(), hand_landmarker_task_path=tmp_path / "missing.task")
    with make_client(tmp_path / "no_task", settings=no_task) as client:
        task_response = post_video(client, video.read_bytes())
    assert task_response.status_code == 503
    assert task_response.json()["detail"]["code"] == "detector_unavailable"
    assert str(tmp_path) not in task_response.text

    no_model = replace(
        Settings(),
        hand_model_path=tmp_path / "missing.joblib",
        hand_metadata_path=tmp_path / "missing.json",
        hand_landmarker_task_path=DEFAULT_HAND_LANDMARKER_TASK,
    )
    with make_client(tmp_path / "no_model", settings=no_model) as client:
        model_response = post_video(client, video.read_bytes())
    assert model_response.status_code == 503
    assert model_response.json()["detail"]["code"] == "hand_inference_unavailable"
    assert str(tmp_path) not in model_response.text


def test_no_valid_slot0_observations_is_a_clear_client_error(tmp_path: Path) -> None:
    video = tmp_path / "sample.avi"
    make_video(video)
    with make_client(tmp_path, behavior="no_slot0") as client:
        response = post_video(client, video.read_bytes())
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "no_usable_hand_sequence"


def test_concurrent_detector_capacity_rejects_excess_request(tmp_path: Path) -> None:
    video = tmp_path / "sample.avi"
    make_video(video)
    marker = tmp_path / "worker_started.txt"
    application = create_app(replace(Settings(), hand_detector_timeout_seconds=1.0))
    worker = tmp_path / "slow_worker.py"
    write_synthetic_worker(worker, behavior="timeout", marker=marker)
    application.state.hand_landmarker.worker_script = worker.resolve()
    application.state.hand_landmarker.python_executable = sys.executable
    first_client = TestClient(application)
    second_client = TestClient(application)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        first_request = pool.submit(post_video, first_client, video.read_bytes())
        deadline = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert marker.exists(), "synthetic worker did not start"
        second_response = post_video(second_client, video.read_bytes())
        first_response = first_request.result(timeout=10)
    first_client.close()
    second_client.close()
    assert second_response.status_code == 429
    assert second_response.json()["detail"]["code"] == "detector_busy"
    assert first_response.status_code == 504


def test_decoded_frame_limit_helper_checks_actual_dimensions_and_order() -> None:
    frame = np.zeros((1081, 1920, 3), dtype=np.uint8)
    from app.services.hand_landmarker_worker import _DimensionLimitExceeded, _DurationExceeded, _FrameLimitExceeded

    with pytest.raises(_DimensionLimitExceeded):
        validate_decoded_frame(
            frame, 0, 0, max_duration_seconds=5.0, max_frames=150, max_width=1920, max_height=1080
        )
    with pytest.raises(_FrameLimitExceeded):
        validate_decoded_frame(
            np.zeros((10, 10, 3)), 150, 0,
            max_duration_seconds=5.0, max_frames=150, max_width=1920, max_height=1080,
        )
    with pytest.raises(_DurationExceeded):
        validate_decoded_frame(
            np.zeros((10, 10, 3)), 10, 5000,
            max_duration_seconds=5.0, max_frames=150, max_width=1920, max_height=1080,
        )
    with pytest.raises(_DurationExceeded):
        validate_decoded_frame(
            np.zeros((10, 10, 3)), 10, 1000,
            video_position_ms=5001.0,
            max_duration_seconds=5.0, max_frames=150, max_width=1920, max_height=1080,
        )


def test_existing_health_status_and_feature_endpoint_still_work(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/api/v1/models/status").json()["status"] == "ready"
        feature_response = client.post("/api/v1/inference/hand/features", json={"features": FEATURES})
    assert feature_response.status_code == 200
    assert feature_response.json()["calibrated"] is False
