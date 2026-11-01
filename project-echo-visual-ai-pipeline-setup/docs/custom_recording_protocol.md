# Project Echo custom recording protocol

## Purpose and scope

This protocol describes how to collect small, consent-based prototype datasets for facial/lip movement and personalised hand-gesture recognition. These recordings support technical experimentation only. They do not establish clinical validity or suitability for diagnosis, treatment, or other clinical decisions.

Keep custom recordings separate from public datasets in the existing project folders:

```text
datasets/custom/
├── facial_lip/
└── hand_gestures/
```

Do not start a recording session until the participant has received the information below, given explicit consent, and had an opportunity to ask questions.

## Participant consent and withdrawal

- Participation is voluntary. A person may decline any prompt, pause, or stop without penalty or loss of access to services.
- Obtain explicit, documented consent for **video recording** and separately for **machine-learning experimentation** before recording. Explain what will be recorded, the intended prototype use, who can access it, how long it will be kept, and that it will not be uploaded publicly.
- Do not imply that participation, the system, or the recordings have clinical validation. Do not promise a particular system outcome.
- Explain how to withdraw: give the participant a project contact or other agreed route, and allow them to request deletion of identifiable raw recordings and linked derived files. Record the request date and completion status in a restricted deletion log. Do not use the recording for new experiments after a withdrawal request while deletion is pending.
- Before collection, designate a data steward responsible for receiving requests, locating files via the participant-ID mapping, deleting raw and derived copies from project-controlled storage and backups where feasible, and documenting any copies that cannot be recalled (for example, files already included in an authorized analysis). Confirm completion to the participant when appropriate.

## Privacy and handling

- Never record anyone without informed consent. Avoid bystanders; stop and discard a take if a non-consenting person is captured.
- Do not upload recordings or derived participant data to public repositories, public cloud buckets, social media, or third-party services. Do not use public AI tools to process them.
- Collect only information needed for the stated prototype. Do not request participant names, addresses, contact details, medical histories, or other unnecessary identifying details as dataset metadata.
- Restrict storage and access to the authorized project team using device or volume encryption and account-level access controls. Do not store recordings on shared or unmanaged devices. Keep any contact or identity-to-participant-ID mapping separately, with tighter access, and never place that mapping in the dataset folders.
- Choose a retention period before collection, tell participants what it is, and delete recordings and linked files when it expires unless renewed consent and a documented need justify retention. Include a deletion date or review date in the session record.
- Do not perform facial recognition, identity classification, emotion inference, or inference of medical conditions from facial movements.

## Facial/lip recordings

Use a small, fixed phrase set so each recording has a clear label and transcript. A suggested initial set is:

| Label | Spoken phrase |
|---|---|
| `YES` | “Yes.” |
| `NO` | “No.” |
| `HELP` | “I need help.” |
| `WATER` | “I need water.” |
| `STOP` | “Please stop.” |

Participants may skip phrases. Record the exact phrase spoken in the transcript field; note deviations rather than silently relabeling them. Do not ask participants to disclose personal or sensitive information in a phrase.

- Record in a quiet, neutral setting with a front-facing camera, the face comfortably in frame, and consistent, even lighting. Use a stable camera position and consistent framing and distance within a session.
- Keep the background plain where practical. Avoid strong backlighting, filters, beauty effects, and distracting motion.
- Give a brief practice take if wanted, then record short, separate takes. Allow natural pacing and breaks. Do not pressure participants to exaggerate mouth movements.
- Record phrase label and exact transcript for each take. Any audio capture must be disclosed in consent and should be disabled if it is not needed.

## Hand-gesture recordings

Begin with these gesture labels: `YES`, `NO`, `HELP`, `STOP`, and `WATER`. These are initial configurable labels, not universal meanings.

- Record short video sequences with the full hand visible and a stable camera view. Use reasonably consistent lighting and background within each session.
- Capture multiple repetitions per label, with rests as needed. Invite comfortable natural variations in speed, hand position, and execution; do not require painful or tiring movements.
- Confirm the intended label with the participant for each gesture. If a gesture's meaning or preferred form differs for that participant, document their chosen meaning/variant in the session metadata and treat it as participant-specific.
- Stop if the participant reports discomfort. Do not reinterpret an unfamiliar movement as a label without asking the participant.

## Metadata and filenames

Store a metadata CSV or JSON sidecar with at least these fields:

- anonymous `participant_id`
- `session_id`
- `task` (`facial_lip` or `hand_gesture`)
- `phrase_or_gesture_label`
- `transcript` for spoken phrases, where applicable
- `language` (and locale if needed)
- `recording_conditions` (for example, camera orientation, lighting, and notable setup differences)
- `consent_status` (recording and ML experimentation consent, plus the date/version of the consent record)

Use opaque, non-identifying IDs in filenames; never put participant names in filenames or paths. For example:

```text
datasets/custom/facial_lip/P001/S001/YES_take001.mp4
datasets/custom/hand_gestures/P001/S001/WATER_take001.mp4
```

Here `P001` and `S001` are assigned IDs, not initials or other identifying codes. Keep the link between `participant_id` and a person's identity outside the dataset, separately secured, and only if needed to administer consent and withdrawal.

## Dataset splitting

When creating train, validation, and test partitions, split by **participant**, not by individual clip. All recordings from one participant must stay in one partition. This participant-independent split reduces identity leakage and gives a more realistic measure of performance on people not represented during training. Record the split assignment in a separate metadata field or split file without moving original recordings into public-dataset folders. Keep the test partition held out from model fitting and tuning.

## Limitations and safety

- Volunteer recordings are small prototype data, not clinical evidence. Do not describe results as clinically validated or generalizable to people who did not participate.
- Gesture meanings and forms are personalised and configurable. Do not assume `YES`, `NO`, `HELP`, `STOP`, or `WATER` gestures are universal or consistent across participants, cultures, or contexts.
- Do not infer emotion or medical condition from facial or lip movements. Facial landmarks, if generated later with separate approval, are geometric measurements and are not themselves a lip-reading model.
- Do not record without informed consent, share the data publicly, or use the recordings for facial recognition or identity classification.
