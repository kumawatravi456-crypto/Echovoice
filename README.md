# Project Echo
### A Multimodal Live Conversation Assistant for People with Speech Impairments

Project Echo is an accessibility-focused hackathon prototype designed to help people with speech impairments participate more independently in live conversations.

It combines speech transcription, hand gestures, facial and mouth-motion tracking, conversational context, AI-generated response suggestions, and confirmed text-to-speech output in one communication interface.

> **Status:** Research and hackathon prototype. Not a clinically validated assistive communication device.

---

## 1. The Problem

People living with conditions such as ALS, cerebral palsy, Parkinson's disease, stroke-related speech difficulties, or those who have undergone laryngectomy may experience barriers when communicating through conventional speech interfaces.

Traditional voice assistants often struggle with atypical speech. Voice-only systems may also overlook non-verbal communication signals.

Project Echo explores a multimodal approach that combines available communication signals to help interpret intended messages and support two-way conversations.

## 2. How Project Echo Works

1. **Conversation input:** The conversation partner speaks, and the system transcribes the available speech.
2. **User input:** The person communicates through attempted speech and supported hand gestures.
3. **Visual tracking:** MediaPipe tracks hand landmarks and facial/mouth movement locally.
4. **Signal interpretation:** The backend uses available transcript, supported gesture labels, and conversation context to generate a proposed response.
5. **User review:** The person can review, edit, accept, or reject the proposed message.
6. **Confirmed speech:** Only after explicit confirmation is the message sent to ElevenLabs text-to-speech for audio output.

Ambiguous or conflicting signals should lead to clarification rather than an assumed response. An AI-generated suggestion is never treated as user approval.

## 3. Core Features

- Real-time speech transcription using ElevenLabs Scribe.
- English and Hindi transcription configuration, with code-mixed speech as an intended use case.
- Hand gesture recognition for YES, NO, HELP, WATER, and STOP.
- Local facial landmark and mouth-motion tracking.
- AI-assisted conversation response suggestions using Groq.
- Editable message suggestions and explicit user confirmation.
- ElevenLabs text-to-speech for confirmed messages.
- Conversation history and accessibility settings.
- Consent-oriented camera and voice features.

**Important visual capability distinction:** The current face pipeline measures mouth geometry and movement. It does not perform validated lip-reading, infer spoken words from lip movements, or provide clinically validated emotion recognition.

## 4. System Architecture

```text
                 PROJECT ECHO
                       |
          +------------+------------+
          |                         |
     Speech Input              Visual Input
          |                         |
   ElevenLabs Scribe        MediaPipe Tracking
          |                  /             \
   Transcript             Hand             Face
          |              Landmarks        Landmarks
          |                  |               |
          |          Gesture Classifier   Mouth Motion
          |                  |               |
          +------------------+---------------+
                             |
                    Conversation Context
                             |
                     FastAPI Backend
                             |
                       Groq LLM
                             |
                   Proposed Text Response
                             |
                    User Review / Editing
                             |
                  Explicit User Confirmation
                             |
                    ElevenLabs Text-to-Speech
                             |
                      Spoken Response











## 5. Technology Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Python, FastAPI
- **Speech-to-text:** ElevenLabs Scribe
- **Text-to-speech:** ElevenLabs
- **AI response generation:** Groq
- **Visual tracking:** MediaPipe
- **Gesture classification:** scikit-learn, NumPy, Joblib
- **Authentication and data:** Firebase

## 6. Gesture Recognition

The custom hand gesture classifier supports five classes:

- YES
- NO
- HELP
- WATER
- STOP

The model uses seven engineered hand-geometry features and a StandardScaler + LogisticRegression pipeline.

### Exploratory evaluation

The current custom dataset contains 27 recordings from one participant.

| Metric | Result |
|---|---:|
| Cross-validation accuracy | 88.89% |
| Balanced accuracy | 91.43% |
| Macro F1-score | 89.39% |

These results are exploratory, based on a small single-participant dataset. They do not establish generalization to other people or clinical effectiveness. Model scores are not calibrated probabilities.

MediaPipe provides pretrained landmark tracking. The custom classifier is trained using the project's own recorded gesture samples.

## 7. Privacy and Safety

- Camera frames and face landmarks are processed locally in the browser.
- Raw camera frames and face landmarks are not sent to the backend by the current frontend integration.
- Speech transcription and text-to-speech use external ElevenLabs services.
- Private API keys must remain on the backend.
- Voice cloning requires explicit informed consent.
- AI-generated responses are suggestions, not decisions.
- Only explicitly confirmed messages should be spoken.
- Ambiguous signals should trigger clarification, not assumed agreement.

## 8. Local Setup

### Requirements

- Node.js and npm
- Python 3.11
- Groq API key
- ElevenLabs API key
- Firebase configuration, if using authentication

### Backend

```bash
cd project-echo-visual-ai-pipeline-setup
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-backend.txt


