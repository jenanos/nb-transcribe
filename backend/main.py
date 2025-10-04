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


@lru_cache(maxsize=1)
def get_rewriter_pipeline():
    if DEV_STUB:
        raise RuntimeError("Rewriter-pipeline er deaktivert i DEV_STUB-modus.")
    from rewriter import create_rewriter_pipeline  # Importer lokalt for å utsette kostnaden

    return create_rewriter_pipeline()


def _warm_pipelines():
    if DEV_STUB:
        return
    try:
        get_asr_pipeline()
    except Exception as exc:  # pragma: no cover - kun logg
        logger.warning("Klarte ikke å varme opp ASR-pipeline: %s", exc)

    if os.environ.get("HF_TOKEN"):
        try:
            get_rewriter_pipeline()
        except Exception as exc:  # pragma: no cover - kun logg
            logger.warning("Klarte ikke å varme opp rewriter-pipeline: %s", exc)


@app.on_event("startup")
async def warm_pipelines_on_startup():
    if DEV_STUB:
        return
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, _warm_pipelines)


UPLOAD_CHUNK_SIZE = 1024 * 1024
JOB_TTL_SECONDS = 60 * 30  # behold ferdige jobber i 30 minutter


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
def run_transcribe_pipeline(input_path: str, mode: str, rewrite: bool) -> Dict[str, Optional[str]]:
    """Kjører hele transkriberingsløpet og returnerer {'raw': ..., 'clean': ...}."""

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
                "\"\"\"\n"
                "Du er en assistent som skriver en e-post til Geir. Oppsummer status og be om oppdatering.\n"
                "\"\"\""
            ),
        }
        clean_text = clean_stub_map.get(mode, "[DEV] Stub renskrevet tekst") if rewrite else None
        return {
            "raw": "[DEV] Stub råtranskripsjon",
            "clean": clean_text,
        }

    # Importer tunge avhengigheter kun når vi faktisk trenger dem
    from transcribe import (
        to_wav,
        segment_wav,
        transcribe_segments,
    )
    from rewriter import rewrite_text
    import torch  # type: ignore[import-not-found]

    wav_path: Optional[str] = None
    segments_dir: Optional[str] = None
    try:
        wav_path = to_wav(input_path)
        segments, segments_dir = segment_wav(wav_path, 30)

        # ASR
        asr = get_asr_pipeline()
        raw_transcript = transcribe_segments(asr, segments)
        torch.cuda.empty_cache()

        clean_transcript = None
        if rewrite:
            rewriter = get_rewriter_pipeline()
            clean_transcript = rewrite_text(rewriter, raw_transcript, mode)
            torch.cuda.empty_cache()

        return {"raw": raw_transcript, "clean": clean_transcript}
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
    rewrite: bool = Form(True)
):
    tmp_path = await persist_upload(file)

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(executor, run_transcribe_pipeline, tmp_path, mode, rewrite)
    return JSONResponse(result)

# ---------------------------
# 4) Enkel "jobbkø" i minne + async endepunkt (for Cloudflare)
# ---------------------------
executor = ThreadPoolExecutor(max_workers=1)  # kjør én jobb om gangen (GPU)
JOBS: Dict[str, Dict[str, Any]] = {}         # {job_id: {status, result, error}}

def _submit_job(file_path: str, mode: str, rewrite: bool, job_id: str):
    try:
        JOBS[job_id]["status"] = "running"
        result = run_transcribe_pipeline(file_path, mode, rewrite)
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["result"] = result
    except Exception as e:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = str(e)
    finally:
        cleanup_jobs()

@app.post("/jobs")
async def create_job(
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    rewrite: bool = Form(True)
):
    tmp_path = await persist_upload(file)

    job_id = str(uuid4())
    JOBS[job_id] = {"status": "queued", "result": None, "error": None, "created_at": time.time()}

    loop = asyncio.get_running_loop()
    loop.run_in_executor(executor, _submit_job, tmp_path, mode, rewrite, job_id)

    cleanup_jobs()
    return JSONResponse({"job_id": job_id, "status": "queued"}, status_code=202)

@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    cleanup_jobs()
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"error": "Not found"}, status_code=404)
    if job["status"] == "done":
        return JSONResponse({"status": "done", "result": job["result"]})
    if job["status"] == "error":
        return JSONResponse({"status": "error", "error": job["error"]}, status_code=500)
    return JSONResponse({"status": job["status"]})


@app.on_event("shutdown")
async def shutdown_event():
    get_asr_pipeline.cache_clear()
    get_rewriter_pipeline.cache_clear()
    executor.shutdown(wait=False)
