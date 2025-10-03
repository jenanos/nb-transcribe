from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from typing import Dict, Any, Optional

DEV_STUB = os.environ.get("DEV_STUB") == "1"

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

# ---------------------------
# 2) Felles transkriberingsfunksjon
# ---------------------------
def run_transcribe_pipeline(input_path: str, mode: str, rewrite: bool) -> Dict[str, Optional[str]]:
    """Kjører hele transkriberingsløpet og returnerer {'raw': ..., 'clean': ...}."""

    # Lettvekts stub for lokal utvikling og tester
    if DEV_STUB:
        os.remove(input_path)
        return {
            "raw": "[DEV] Stub råtranskripsjon",
            "clean": "[DEV] Stub renskrevet tekst",
        }

    # Importer tunge avhengigheter kun når vi faktisk trenger dem
    from transcribe import (
        create_asr_pipeline,
        to_wav,
        segment_wav,
        transcribe_segments,
    )
    from rewriter import create_rewriter_pipeline, rewrite_text
    import torch  # type: ignore[import-not-found]

    wav = to_wav(input_path)
    segments = segment_wav(wav, 30)

    # ASR
    asr = create_asr_pipeline()
    raw_transcript = transcribe_segments(asr, segments)
    del asr
    torch.cuda.empty_cache()

    clean_transcript = None
    if rewrite:
        rewriter = create_rewriter_pipeline()
        clean_transcript = rewrite_text(rewriter, raw_transcript, mode)
        del rewriter
        torch.cuda.empty_cache()

    # Rydd opp midlertidige filer
    for seg in segments:
        os.remove(seg)
    os.remove(wav)
    os.remove(input_path)

    return {"raw": raw_transcript, "clean": clean_transcript}

# ---------------------------
# 3) Synkront endepunkt (nyttig lokalt / uten Cloudflare)
# ---------------------------
@app.post("/process/")
async def process(
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    rewrite: bool = Form(True)
):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    result = run_transcribe_pipeline(tmp_path, mode, rewrite)
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

@app.post("/jobs")
async def create_job(
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    rewrite: bool = Form(True)
):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    job_id = str(uuid4())
    JOBS[job_id] = {"status": "queued", "result": None, "error": None}

    loop = asyncio.get_running_loop()
    loop.run_in_executor(executor, _submit_job, tmp_path, mode, rewrite, job_id)

    return JSONResponse({"job_id": job_id, "status": "queued"}, status_code=202)

@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"error": "Not found"}, status_code=404)
    if job["status"] == "done":
        return JSONResponse({"status": "done", "result": job["result"]})
    if job["status"] == "error":
        return JSONResponse({"status": "error", "error": job["error"]}, status_code=500)
    return JSONResponse({"status": job["status"]})
