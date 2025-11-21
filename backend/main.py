from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import asyncio
import contextlib
import logging
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from uuid import uuid4
from typing import Dict, Any, Optional

from database import (
    is_database_configured,
    list_transcription_records,
    save_transcription_record,
    setup_database,
    get_transcription_record,
)

DEV_STUB = os.environ.get("DEV_STUB") == "1"
logger = logging.getLogger(__name__)

# --------------------------- 
# 1) Opprett app TIDLIG
# --------------------------- 
app = FastAPI()

# CORS er ikke nødvendig når du proxier via Next.js, men det skader ikke å la stå
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://jenanos.xyz"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_asr_pipeline():
    if DEV_STUB:
        raise RuntimeError("ASR-pipeline er deaktivert i DEV_STUB-modus.")
    from transcribe import create_asr_pipeline  # Importer lokalt for å utsette kostnaden

    return create_asr_pipeline()

@app.on_event("startup")
async def setup_database_on_startup():
    setup_database()


UPLOAD_CHUNK_SIZE = 1024 * 1024
JOB_TTL_SECONDS = 60 * 5  # behold ferdige jobber i minnet i 5 minutter (fallback til DB)


def normalize_prompt(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return None


async def persist_upload(upload: UploadFile) -> str:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        while True:
            chunk = await upload.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            tmp.write(chunk)
        tmp_path = tmp.name
    await upload.close()
    return tmp_path


def cleanup_jobs(now: Optional[float] = None) -> None:
    timestamp = now or time.time()
    expired_ids = [
        job_id
        for job_id, job in list(JOBS.items())
        if job.get("status") in {"done", "error"}
        and timestamp - job.get("created_at", timestamp) > JOB_TTL_SECONDS
    ]
    for job_id in expired_ids:
        JOBS.pop(job_id, None)

# --------------------------- 
# 2) Felles transkriberingsfunksjon
# --------------------------- 
def run_transcribe_pipeline(
    input_path: str,
    mode: str,
    rewrite: bool,
    prompt: Optional[str] = None,
    original_filename: Optional[str] = None,
    model: str = "gemini",
) -> Dict[str, Any]:
    """Kjører hele transkriberingsløpet og returnerer {'raw': ..., 'clean': ...}."""

    prompt = normalize_prompt(prompt)
    metadata: Dict[str, Any] = {
        "rewrite_mode": mode,
        "rewrite_enabled": rewrite,
        "prompt": prompt,
        "original_filename": original_filename,
        "model_id": os.environ.get("MODEL_ID"),
        "requested_at": time.time(),
        "rewrite_model": model,
    }

    with contextlib.suppress(OSError):
        metadata["input_size_bytes"] = os.path.getsize(input_path)

    # Lettvekts stub for lokal utvikling og tester
    if DEV_STUB:
        os.remove(input_path)
        clean_stub_map = {
            "summary": "[DEV] Stub sammendrag av transkripsjonen",
            "email": "[DEV] Stub e-post basert på transkripsjonen",
            "document": "[DEV] Stub avsnitt til dokument",
            "talking_points": "[DEV] Stub talepunkter",
            "polish": "[DEV] Stub renskrevet tekst",
            "workflow": (
                "[DEV] Stub arbeidsflyt\n"
                "Oppgave 1: Følg opp Geir om status på prosjektet.\n"
                "Prompt:\n"
                '"""\n'
                "Du er en assistent som skriver en e-post til Geir. Oppsummer status og be om oppdatering.\n"
                '"""'
            ),
        }
        clean_text = clean_stub_map.get(mode, "[DEV] Stub renskrevet tekst") if rewrite else None
        metadata.setdefault("audio_duration_seconds", 0.0)
        metadata.setdefault("segment_count", 0)
        return {
            "raw": "[DEV] Stub råtranskripsjon",
            "clean": clean_text,
            "metadata": metadata,
        }

    # Importer tunge avhengigheter kun når vi faktisk trenger dem
    from transcribe import (
        to_wav,
        segment_wav,
        transcribe_segments,
    )
    from rewriter import rewrite_text

    wav_path: Optional[str] = None
    segments_dir: Optional[str] = None
    try:
        wav_path = to_wav(input_path)
        metadata["audio_duration_seconds"] = None
        try:
            import soundfile as sf  # type: ignore[import-not-found]

            info = sf.info(wav_path)
            if hasattr(info, "duration") and info.duration is not None:
                metadata["audio_duration_seconds"] = float(info.duration)
            elif getattr(info, "frames", None) and getattr(info, "samplerate", None):
                metadata["audio_duration_seconds"] = info.frames / info.samplerate
        except Exception:  # pragma: no cover - best effort metadata
            metadata["audio_duration_seconds"] = None

        segments, segments_dir = segment_wav(wav_path, 30)
        metadata["segment_count"] = len(segments)

        # ASR
        asr = get_asr_pipeline()
        raw_transcript = transcribe_segments(asr, segments)

        clean_transcript = None
        if rewrite:
            clean_transcript = rewrite_text(raw_transcript, mode, prompt, model)

        return {"raw": raw_transcript, "clean": clean_transcript, "metadata": metadata}
    finally:
        if segments_dir:
            shutil.rmtree(segments_dir, ignore_errors=True)
        if wav_path:
            with contextlib.suppress(FileNotFoundError):
                os.remove(wav_path)
        with contextlib.suppress(FileNotFoundError):
            os.remove(input_path)

# --------------------------- 
# 3) Synkront endepunkt (nyttig lokalt / uten Cloudflare)
# --------------------------- 
@app.post("/process/")
async def process(
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    rewrite: bool = Form(True),
    prompt: Optional[str] = Form(None),
    model: str = Form("gemini"),
):
    if model not in ("gemini", "gemma"):
        return JSONResponse({"error": f"Invalid model: {model}. Must be 'gemini' or 'gemma'"}, status_code=400)

    original_filename = file.filename
    tmp_path = await persist_upload(file)

    job_id = str(uuid4())
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        executor, run_transcribe_pipeline, tmp_path, mode, rewrite, prompt, original_filename, model
    )

    metadata = result.get("metadata") or {}

    save_transcription_record(
        job_id=job_id,
        raw_text=result.get("raw"),
        clean_text=result.get("clean"),
        rewrite_mode=mode,
        rewrite_enabled=rewrite,
        prompt=metadata.get("prompt"),
        metadata=metadata,
        status="done",
    )

    payload = {"job_id": job_id, **result}
    return JSONResponse(payload)

# --------------------------- 
# 4) Enkel "jobbkø" i minne + async endepunkt (for Cloudflare)
# --------------------------- 
executor = ThreadPoolExecutor(max_workers=1)  # kjør én jobb om gangen (GPU) 
JOBS: Dict[str, Dict[str, Any]] = {}         # {job_id: {status, result, error}}

def _submit_job(
    file_path: str,
    mode: str,
    rewrite: bool,
    job_id: str,
    original_filename: Optional[str] = None,
    prompt: Optional[str] = None,
    model: str = "gemini",
):
    prompt = normalize_prompt(prompt)
    metadata_for_db: Dict[str, Any] = {
        "rewrite_mode": mode,
        "rewrite_enabled": rewrite,
        "prompt": prompt,
        "original_filename": original_filename,
    }
    try:
        JOBS[job_id]["status"] = "running"
        result = run_transcribe_pipeline(file_path, mode, rewrite, prompt, original_filename, model)
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["result"] = result
        metadata_for_db = result.get("metadata", metadata_for_db)
        save_transcription_record(
            job_id=job_id,
            raw_text=result.get("raw"),
            clean_text=result.get("clean"),
            rewrite_mode=mode,
            rewrite_enabled=rewrite,
            prompt=prompt,
            metadata=metadata_for_db,
            status="done",
        )
    except Exception as e:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = str(e)
        save_transcription_record(
            job_id=job_id,
            raw_text=None,
            clean_text=None,
            rewrite_mode=mode,
            rewrite_enabled=rewrite,
            prompt=prompt,
            metadata=metadata_for_db,
            status="error",
            error_message=str(e),
        )
    finally:
        cleanup_jobs()

@app.post("/jobs")
async def create_job(
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    rewrite: bool = Form(True),
    prompt: Optional[str] = Form(None),
    model: str = Form("gemini"),
):
    if model not in ("gemini", "gemma"):
        return JSONResponse({"error": f"Invalid model: {model}. Must be 'gemini' or 'gemma'"}, status_code=400)

    tmp_path = await persist_upload(file)
    original_filename = file.filename

    job_id = str(uuid4())
    JOBS[job_id] = {"status": "queued", "result": None, "error": None, "created_at": time.time()}

    loop = asyncio.get_running_loop()
    loop.run_in_executor(
        executor,
        _submit_job,
        tmp_path,
        mode,
        rewrite,
        job_id,
        original_filename,
        prompt,
        model,
    )

    cleanup_jobs()
    return JSONResponse({"job_id": job_id, "status": "queued"}, status_code=202)

@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    cleanup_jobs()
    
    # 1. Sjekk minne først (raskest for pågående jobber)
    job = JOBS.get(job_id)
    if job:
        if job["status"] == "done":
            return JSONResponse({"status": "done", "result": job["result"]})
        if job["status"] == "error":
            return JSONResponse({"status": "error", "error": job["error"]}, status_code=500)
        return JSONResponse({"status": job["status"]})

    # 2. Fallback til database
    if is_database_configured():
        record = get_transcription_record(job_id)
        if record:
            if record["status"] == "done":
                # Rekonstruer result-objektet slik frontend forventer det
                result = {
                    "raw": record["raw"],
                    "clean": record["clean"],
                    "metadata": record["metadata"]
                }
                return JSONResponse({"status": "done", "result": result})
            elif record["status"] == "error":
                return JSONResponse({"status": "error", "error": record["error"]}, status_code=500)
            else:
                return JSONResponse({"status": record["status"]})

    return JSONResponse({"error": "Not found"}, status_code=404)


@app.get("/transcriptions")
async def get_transcriptions(limit: int = 50):
    if not is_database_configured():
        return JSONResponse({"error": "Database not configured"}, status_code=503)

    safe_limit = max(1, min(limit, 200))
    records = list_transcription_records(limit=safe_limit)
    return JSONResponse({"items": records})


@app.on_event("shutdown")
async def shutdown_event():
    get_asr_pipeline.cache_clear()
    executor.shutdown(wait=False)