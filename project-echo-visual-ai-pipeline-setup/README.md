# Project Echo: Visual AI Pipeline

Step 1 establishes a dataset workspace and records selected sources for later review. No datasets have been downloaded, and no model training or preprocessing is performed here.

## Project structure

```text
.
├── datasets/
│   ├── public/
│   │   ├── hand_gestures/       # Public gesture datasets (keep source datasets intact)
│   │   └── visual_speech/       # Public visual-speech datasets (keep source datasets intact)
│   ├── custom/
│   │   ├── hand_gestures/       # Consented WATER, YES, NO, HELP, STOP recordings
│   │   └── facial_lip/          # Consented custom phrase recordings
│   └── processed/
│       ├── landmarks/           # Derived landmark data
│       └── model_ready/         # Later prepared data
├── scripts/
│   └── inspect_dataset.py       # Read-only file and media inventory
├── dataset_manifest.csv
├── requirements.txt
└── .gitignore
```

The script's dataset root can be set with `--root` or the `ECHO_DATASET_ROOT` environment variable. The default is `datasets/` in this project.

## Dataset and tool sources

See [`dataset_manifest.csv`](dataset_manifest.csv) for the selected sources and current setup status. The manifest deliberately does not claim dataset access, licence approval, or download completion. Confirm the official source's current terms and any required registration before obtaining data. Do not use mirrors or circumvent access controls.

- Jester (hand gestures): https://www.qualcomm.com/developer/software/jester-dataset
- LRS3 (visual speech): https://mm.kaist.ac.kr/datasets/lip_reading/
- MediaPipe Hand Landmarker documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
- MediaPipe Face Landmarker documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker

MediaPipe landmark extraction is a later pipeline capability; facial landmarks describe tracked geometry and are not a lip-reading model. Custom recordings must be collected only with informed consent. Keep them separate from public source datasets and do not use facial recognition or identity classification.

## Python environment

Create the dedicated environment (already created as `.venv` in this workspace):

```sh
python3 -m venv .venv
```

Activate it on macOS/Linux:

```sh
source .venv/bin/activate
```

Install the small image-inspection dependency set:

```sh
python -m pip install -r requirements.txt
```

The script reports file counts, extensions, directory structure, image dimensions, available video metadata, and unreadable files. Video metadata is reported when OpenCV is installed; it is optional and is not included in the minimal requirements. Image dimensions are reported when Pillow is installed.

```sh
python scripts/inspect_dataset.py
python scripts/inspect_dataset.py --root /path/to/datasets
python scripts/inspect_dataset.py --root /path/to/datasets --expected-paths expected_files.txt
```

`expected_files.txt` is an optional UTF-8 list of dataset-root-relative paths, one per line; blank lines and `#` comments are ignored. This lets the report identify expected paths that are missing without assuming any particular dataset contents. The inspection is read-only and does not download or modify media.

## Next step

Review the official dataset terms and access requirements, then manually obtain only approved datasets through their official channels. Record verified status changes in the manifest, preserve source datasets in the `datasets/public/` branches, and use the inspection script to inventory staged files. Collect custom recordings only after establishing consent and storage procedures. This setup stops before preprocessing, landmark extraction, or training.
