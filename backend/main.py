from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import asyncio
import contextlib
import logging
import shutil
import traceback
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from uuid import uuid4
from typing import Dict, Any, Optional

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import (
    get_transcription_record,
    is_database_configured,
    list_transcription_records,
    save_transcription_record,
    setup_database,
)

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
    from transcribe import create_asr_pipeline  # Importer lokalt for å utsette kostnaden

    return create_asr_pipeline()

@app.on_event("startup")
async def setup_database_on_startup():
    setup_database()


UPLOAD_CHUNK_SIZE = 1024 * 1024
JOB_TTL_SECONDS = 60 * 5  # behold ferdige jobber i minnet i 5 minutter (fallback til DB)


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
    job_id: str,
    original_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Kjører hele transkriberingsløpet og returnerer transkripsjonen."""

    metadata: Dict[str, Any] = {
        "original_filename": original_filename,
        "model_id": os.environ.get("MODEL_ID"),
        "requested_at": time.time(),
    }

    with contextlib.suppress(OSError):
        metadata["input_size_bytes"] = os.path.getsize(input_path)

    from transcribe import (
        segment_wav,
        to_wav,
        transcribe_segments,
    )

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

        return {"raw": raw_transcript, "metadata": metadata}
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
):
    original_filename = file.filename
    tmp_path = await persist_upload(file)

    job_id = str(uuid4())
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        executor, run_transcribe_pipeline, tmp_path, job_id, original_filename
    )

    metadata = result.get("metadata") or {}

    save_transcription_record(
        job_id=job_id,
        raw_text=result.get("raw"),
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
    job_id: str,
    original_filename: Optional[str] = None,
):
    metadata_for_db: Dict[str, Any] = {
        "original_filename": original_filename,
    }
    try:
        JOBS[job_id]["status"] = "running"
        result = run_transcribe_pipeline(file_path, job_id, original_filename=original_filename)
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["result"] = result
        metadata_for_db = result.get("metadata", metadata_for_db)
        save_transcription_record(
            job_id=job_id,
            raw_text=result.get("raw"),
            metadata=metadata_for_db,
            status="done",
        )
    except Exception as e:
        error_message = str(e)
        error_traceback = traceback.format_exc()
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = error_message
        JOBS[job_id]["error_detail"] = error_traceback
        logger.exception("Job %s feilet", job_id)
        save_transcription_record(
            job_id=job_id,
            raw_text=None,
            metadata=metadata_for_db,
            status="error",
            error_message=error_message,
        )
    finally:
        cleanup_jobs()

@app.post("/jobs")
async def create_job(
    file: UploadFile = File(...),
):
    tmp_path = await persist_upload(file)
    original_filename = file.filename

    job_id = str(uuid4())
    JOBS[job_id] = {"status": "queued", "result": None, "error": None, "created_at": time.time()}

    loop = asyncio.get_running_loop()
    loop.run_in_executor(
        executor,
        _submit_job,
        tmp_path,
        job_id,
        original_filename,
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
            error_payload = {"status": "error", "error": job.get("error")}
            if job.get("error_detail"):
                error_payload["detail"] = job["error_detail"]
            return JSONResponse(error_payload, status_code=500)
        return JSONResponse({"status": job["status"]})

    # 2. Fallback til database
    if is_database_configured():
        record = get_transcription_record(job_id)
        if record:
            if record["status"] == "done":
                # Rekonstruer result-objektet slik frontend forventer det
                result = {
                    "raw": record["raw"],
                    "metadata": record["metadata"],
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