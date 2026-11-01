# Linux setup for offline hand-landmark extraction

This setup is for a **Linux x86_64 CPU environment**. It keeps MediaPipe, NumPy,
and OpenCV separate from the macOS project environment. MediaPipe 0.10.35
publishes a `manylinux_2_28_x86_64` wheel, so use a distribution with glibc 2.28
or newer (for example, Ubuntu 22.04 or 24.04) and Python 3.11.

The extractor itself uses portable Python paths, OpenCV video decoding, NumPy,
MediaPipe Tasks VIDEO mode, atomic file replacement, and the CPU delegate. Its
input/model/output paths are based on the project directory. The offline
extraction path does not open a webcam or GUI or call macOS-specific APIs.
OpenCV must be able to decode MP4 files; the commands below install the common
Linux runtime libraries for the PyPI OpenCV wheel.

**Important:** `BaseOptions.Delegate.CPU` selects CPU inference, but it is not a
general switch that disables every GPU-related service in MediaPipe's native
graph. The Mac IMAGE-mode probe failed during graph creation despite CPU
delegation. Run the smoke test below on the target Linux machine and do not stage
or process recordings unless it completes successfully.

## 1. Install system prerequisites

Ensure Python 3.11 is available as `python3.11` and install the OpenCV runtime
libraries:

```sh
sudo apt-get update
sudo apt-get install -y libgl1 libglib2.0-0
python3.11 --version
```

The last command should report Python 3.11.x. The project used Python 3.11.18;
use that patch release when available for the closest reproduction.

## 2. Create and populate an isolated environment

Run these commands from the project root on Linux:

```sh
python3.11 -m venv .venv-linux
source .venv-linux/bin/activate
python -m pip install -r requirements-linux.txt
python -m pip check
```

The pinned core versions are MediaPipe 0.10.35, NumPy 2.2.6, and
opencv-contrib-python 4.12.0.88. MediaPipe's remaining runtime dependencies are
resolved by pip according to the package metadata. After the Linux smoke test
passes, record the complete resolved set with:

```sh
python -m pip freeze > requirements-linux-lock.txt
```

## 3. Verify imports and versions

```sh
python - <<'PY'
import cv2
import mediapipe as mp
import numpy as np

print("MediaPipe:", mp.__version__)
print("NumPy:", np.__version__)
print("OpenCV:", cv2.__version__)
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode
print("Tasks HandLandmarker imports: OK")
print("CPU delegate:", BaseOptions.Delegate.CPU)
PY
```

## 4. Run an IMAGE-mode initialization smoke test

Run from the project root so the existing model is found at
`models/hand_landmarker.task`. This generates a blank image in memory; it does
not open the webcam or read any dataset files.

```sh
python - <<'PY'
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

model = Path("models/hand_landmarker.task")
if not model.is_file():
    raise SystemExit(f"Missing model: {model}")

options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path=str(model.resolve()),
        delegate=BaseOptions.Delegate.CPU,
    ),
    running_mode=RunningMode.IMAGE,
    num_hands=2,
)

landmarker = None
try:
    landmarker = HandLandmarker.create_from_options(options)
    blank = np.zeros((256, 256, 3), dtype=np.uint8)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=blank)
    result = landmarker.detect(image)
    print("IMAGE-mode initialization and blank-image detect: OK")
    print("Hands detected in blank image:", len(result.hand_landmarks))
finally:
    if landmarker is not None:
        landmarker.close()
        print("Landmarker closed: OK")
PY
```

Proceed to a one-video extraction validation only if this command exits
successfully. If initialization fails or the process aborts, stop and report the
complete error before transferring or processing any recordings. Keep source
videos read-only; return only validated NPZ outputs and the generated manifest
to the main project.
