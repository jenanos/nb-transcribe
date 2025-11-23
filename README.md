# nb-transcribe 🎙️

[![Build and Push Docker Images](https://github.com/jenanos/nb-transcribe/actions/workflows/build-and-push.yml/badge.svg)](https://github.com/jenanos/nb-transcribe/actions/workflows/build-and-push.yml)

End-to-end Norwegian speech-to-text with a FastAPI backend, Next.js 15 frontend, GPU-accelerated NB-Whisper transcription, and Gemma-3 assisted copy editing.

## ✨ What’s inside

- **FastAPI backend** that exposes both synchronous `/process/` and async `/jobs` endpoints.
- **NB-Whisper Large** for GPU-accelerated automatic speech recognition.
- **Gemma-3 4B IT** for summarising, rewriting, and workflow extraction.
- **Stub mode** (`DEV_STUB=1`) to exercise the UI without a GPU, HF token, or FFmpeg.
- **Docker Compose** definitions for a full-stack deployment with NVIDIA GPU support.

## 🧰 Prerequisites

- Git and a POSIX-compatible shell (macOS, Linux, or WSL2).
- Node.js 20+ with npm (consider using `nvm`).
- Python 3.11+ with `venv`.
- FFmpeg in your `PATH` (e.g. `sudo apt install ffmpeg`).
- NVIDIA GPU with CUDA 12.x and drivers installed for the full pipeline.
- Hugging Face account with access to Gemma-3 and a personal access token for `HF_TOKEN`.

## 🚀 Local development

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/nb-transcribe.git
cd nb-transcribe
```

### 2. Start the backend (full pipeline)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
export HF_TOKEN="<your-hf-token>"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend expects a CUDA-capable GPU, FFmpeg, and a valid Hugging Face token to load the transcription and rewriting models.

### 3. Start the frontend

```bash
cd ../frontend
npm install
cp .env.local.example .env.local  # adjust values when needed
npm run dev
```

The Next.js app runs on `http://localhost:3000` and forwards API calls to `BACKEND_URL` (defaults to the backend started above).
Toggle the mocked experience by setting `NEXT_PUBLIC_MOCK_MODE` to `1` in `.env.local`.

## 🧪 Backend stub mode (no GPU required)

Set `DEV_STUB=1` to skip heavy model loading and return deterministic demo responses:

```bash
cd backend
source .venv/bin/activate  # reuse the virtual environment created above
export DEV_STUB=1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

With the stub enabled you can iterate on the frontend without FFmpeg, CUDA, or `HF_TOKEN`.

## 🧪 Frontend mock mode

- Copy `frontend/.env.local.example` to `.env.local` and keep `NEXT_PUBLIC_MOCK_MODE=1` to build the demo UI without a backend.
- The file picker is pre-filled with a demo clip; uploading new audio is disabled and shows a short English explainer.
- Start the transcription straight away to see mocked raw and rewritten outputs for each mode.

## 🧷 Useful commands

| Area     | Command                          | Notes |
|----------|----------------------------------|-------|
| Backend  | `pytest`                         | Runs API and pipeline tests (requires `DEV_STUB=1` for fast execution). |
| Backend  | `uvicorn main:app --reload`      | Starts the FastAPI server locally. |
| Frontend | `npm run lint`                   | Next.js linting. |
| Frontend | `npm test`                       | Jest + Testing Library suite. |

## 🐳 Docker Compose

Build and run the complete stack with GPU support (requires the NVIDIA Container Toolkit):

```bash
export HF_TOKEN="<your-hf-token>"
docker compose up --build
```

- The backend container reads `HF_TOKEN` at startup to authenticate against Hugging Face.
- The frontend is served on port 3000; the backend listens on port 8000 within the internal network.
- A PostgreSQL 16 container called `db` keeps all transcription results. The backend connects via
  `DATABASE_URL=postgresql+psycopg://nbtranscribe:nbtranscribe@db:5432/nbtranscribe` by default in
  the Compose file.

## 🗃️ Database persistence

- Set `DATABASE_URL` to a PostgreSQL connection string (SQLAlchemy 2.x syntax, e.g.
  `postgresql+psycopg://user:password@hostname:5432/nb_transcribe`).
- When configured, the backend creates a `transcription_records` table that stores the raw output,
  rewritten text, prompt, rewrite mode, duration, input size, model id, filenames, status, and a JSON
  blob with additional metadata for every synchronous `/process/` call or async job.
- Missing or invalid `DATABASE_URL` values simply disable persistence, keeping local DEV_STUB
  workflows simple.
- Deployments running multiple backend instances can point them all to the same database service to
  consolidate job history.

## ⚙️ Configuration

- `frontend/.env.local.example` – template for local/frontend deployments (mock mode flag and backend URL).
- `backend/env.example` – template for backend deployments (stub toggle and Hugging Face token).
- `DATABASE_URL` – optional PostgreSQL DSN consumed by SQLAlchemy to store transcription history.
- `HF_TOKEN` – required by the backend for Gemma-3 powered rewriting when not in stub mode.
- `GEMINI_API_KEY` / `GEMINI_MODEL` – required when du bruker Gemini CLI i headless-modus for omskriving. CLI-en krever Node
  18+; en feilmelding ala `SyntaxError: Unexpected token '.'` betyr som regel at Node-versjonen er for gammel.
- `DEV_STUB` – enable to run the backend with fixture data and without GPU dependencies.
- `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL` / `NEXT_PUBLIC_API_URL` – frontend overrides for
  the API base URL (default: `http://127.0.0.1:8000`). The server-side proxy prefers
  `BACKEND_URL` when present, but it will fall back to either public variable so existing
  Docker/infra setups keep working.
- `NEXT_PUBLIC_DIRECT_BACKEND_URL` – optional public URL for bypassing the Next.js proxy and
  streaming file uploads directly to FastAPI. Enable this when you need to send very large
  audio files (10–30 minutes) that would otherwise hit the Vercel/serverless body limits.
  **Important:** Because uploads originate directly from the browser, the backend's CORS
  `allow_origins` list must include the domain where the frontend is hosted.
- `NEXT_PUBLIC_MOCK_MODE` / `TRANSCRIBE_MOCK_MODE` – set to `1` to enable the fully mocked
  UI without talking to the backend.

## ☁️ Cloudflare Access

- Set `BACKEND_URL` so the Next.js server-side API routes know which backend host to
  contact. The proxy prefers this variable over the public fallbacks to keep secrets on
  the server only.
- When the backend sits behind Cloudflare Access, provide `CF_ACCESS_CLIENT_ID` and
  `CF_ACCESS_CLIENT_SECRET` (service token credentials). The API routes automatically add
  the `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers when **both** variables are
  defined, without ever exposing them to the browser.

## 📂 Repository layout

```
.
├── backend/        # FastAPI app with transcription and rewriting pipelines
├── frontend/       # Next.js 15 (App Router) UI
└── docker-compose.yml
```

## 🤝 Contributing

- Keep an eye on GPU VRAM usage: NB-Whisper Large and Gemma-3 both run on the GPU.
- Open issues or pull requests with ideas, bug fixes, or documentation improvements—contributions are welcome!
