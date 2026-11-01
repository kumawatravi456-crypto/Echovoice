# Vercel deployment

Deploy from this repository root. `vercel.json` configures two Vercel Services in one project: the Vite frontend in `ide-quicklink-6/` and the FastAPI backend in `project-echo-visual-ai-pipeline-setup/backend/`. The `/api/chat` request is sent to the frontend's Gemini function; other `/api/*` requests go to FastAPI. The remaining paths serve the Vite single-page app.

Set these project environment variables in Vercel:

- `GEMINI_API_KEY` (server-side; required by `/api/chat`)
- `GROQ_API_KEY` (server-side; required for proposed conversation responses)
- `ELEVENLABS_API_KEY` (server-side; required for realtime transcription token issuance)
- `ECHO_FRONTEND_ORIGINS=https://ide-quicklink-6.vercel.app` (backend CORS allow-list for the production URL)
- `VITE_ECHO_API_BASE_URL=https://ide-quicklink-6.vercel.app` (frontend API base URL)
- `ECHO_HAND_VIDEO_MAX_UPLOAD_BYTES=4194304` (Vercel request payloads are limited to 4.5 MB, so video uploads are capped at 4 MB)
- `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` (allows the Python MediaPipe/OpenCV bundle, which is over the standard Python function size limit)

`GEMINI_MODEL` and `GROQ_MODEL` are optional. The frontend uses `gemini-3.8-flash` and the backend uses `openai/gpt-oss-120b` by default. Never put the provider API keys in `VITE_*` variables.

For Firebase sign-in, add `ide-quicklink-6.vercel.app` to the Firebase Authentication authorized domains and enable the providers described in the app README. Vercel preview deployments have different hostnames and need separate CORS and Firebase domain entries if they are used.

Vercel Deployment Protection is enabled for this project, so production and preview URLs require access through the Vercel team.
