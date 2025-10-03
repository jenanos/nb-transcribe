# nb-transcribe 🎙️

Fullverdig verktøykasse for norsk tale-til-tekst med NB-Whisper og renskriving med Gemma-3. Prosjektet består av en FastAPI-backend og en Next.js-frontend.

## ✨ Funksjoner

- GPU-akselerert transkribering med NB-Whisper Large.
- Renskriver tekst med Gemma-3 i flere moduser (sammendrag, e-post, dokument mm.).
- Frontend som kan testes mot raske stub-data uten tung backend.
- Docker Compose-oppsett for hel stack med GPU-akselerasjon.

## 🧰 Forutsetninger

- Git og en POSIX-kompatibel shell (macOS/Linux) eller WSL2 på Windows.
- Node.js 20+ og npm (anbefalt via nvm).
- Python 3.12 med `venv` (bruk samme versjon som i `backend/__pycache__`).
- FFmpeg tilgjengelig i PATH (`sudo apt install ffmpeg`).
- NVIDIA GPU med CUDA 12.x for full pipeline.
- Hugging Face-konto og tilgang til Gemma-3. Sett et personlig tilgangstoken i `HF_TOKEN` før du starter backend.

## 🚀 Kom i gang (lokal utvikling)

### 1. Klon og installer

```bash
git clone https://github.com/<din-org>/nb-transcribe.git
cd nb-transcribe
```

### 2. Backend (full pipeline)

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
export HF_TOKEN="<ditt-hf-token>"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend forventer GPU og FFmpeg. Hvis du mangler GPU eller bare vil teste frontenden, se stub-modus under.

### 3. Frontend

```bash
cd ../frontend
npm install
# Oppdater BACKEND_URL i .env.local ved behov (standard http://127.0.0.1:8000)
npm run dev
```

Frontend starter på `http://localhost:3000` og proxier mot backend-URL-en.

## 🧪 Rask frontend-testing med dev stub

Backend har en lettvekts stub som hopper over GPU-tunge steg og returnerer demo-svar. Start backend slik:

```bash
cd backend
source .venv/bin/activate  # hvis du allerede har satt den opp
export DEV_STUB=1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Med `DEV_STUB=1` trenger du verken GPU, HF-token eller FFmpeg. Frontenden kan da testes fritt mot stub-data.

## 🐳 Docker Compose

Hele stacken kan kjøres med Docker (krever NVIDIA GPU + NVIDIA Container Toolkit på hosten).

```bash
export HF_TOKEN="<ditt-hf-token>"
docker compose up --build
```

- Backend bruker `HF_TOKEN` for å autentisere mot Hugging Face ved oppstart.
- Frontend er tilgjengelig på port 3000, backend på 8000 internt i nettverket.

## ⚙️ Miljøvariabler

- `HF_TOKEN` (backend, påkrevd for ekte renskriving): HF access token med rettigheter til Gemma-3.
- `DEV_STUB` (backend, valgfri): Sett til `1` for å aktivere raske demo-svar.
- `BACKEND_URL` (frontend, valgfri): Basen for API-kall. Standard `http://127.0.0.1:8000`.

## 📂 Prosjektstruktur

```
.
├── backend/        # FastAPI-app, transkribering og renskriving
├── frontend/       # Next.js-app med app router
└── docker-compose.yml
```

## 🤝 Tips og videre arbeid

- Kjør `npm run lint` i frontend og legg gjerne til tester etter hvert.
- Hold øye med GPU-minnebruk når du kjører full pipeline; Gemma-3 kan være minnekrevende.
- Gi beskjed om bugs eller åpne PR-er for forbedringer - bidrag er velkomne! 🙌
