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
echo "BACKEND_URL=http://127.0.0.1:8000" > .env.local  # adjust when needed
npm run dev
```

The Next.js app runs on `http://localhost:3000` and forwards API calls to `BACKEND_URL` (defaults to the backend started above).

## 🧪 Backend stub mode (no GPU required)

Set `DEV_STUB=1` to skip heavy model loading and return deterministic demo responses:

```bash
cd backend
source .venv/bin/activate  # reuse the virtual environment created above
export DEV_STUB=1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

With the stub enabled you can iterate on the frontend without FFmpeg, CUDA, or `HF_TOKEN`.

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

## ⚙️ Configuration

- `HF_TOKEN` – required by the backend for Gemma-3 powered rewriting when not in stub mode.
- `DEV_STUB` – enable to run the backend with fixture data and without GPU dependencies.
- `BACKEND_URL` – frontend override for API base URL (defaults to `http://127.0.0.1:8000`).

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
