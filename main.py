from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import torch

from transcribe import create_asr_pipeline, to_wav, segment_wav, transcribe_segments
from rewriter import create_rewriter_pipeline, rewrite_text

app = FastAPI()

# Tillat frontend på localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://jenanos.xyz"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/process/")
async def process(
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    rewrite: bool = Form(True)
):
    # Lagre midlertidig fil
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    wav = to_wav(tmp_path)
    segments = segment_wav(wav, 30)

    # 1. Last ASR-modellen, bruk og frigjør
    asr = create_asr_pipeline()
    raw_transcript = transcribe_segments(asr, segments)
    del asr
    torch.cuda.empty_cache()

    clean_transcript = None
    if rewrite:
        # 2. Last rewriter-modellen, bruk og frigjør
        rewriter = create_rewriter_pipeline()
        clean_transcript = rewrite_text(rewriter, raw_transcript, mode)
        del rewriter
        torch.cuda.empty_cache()

    # Rydd opp
    for seg in segments:
        os.remove(seg)
    os.remove(wav)
    os.remove(tmp_path)

    return JSONResponse({"raw": raw_transcript, "clean": clean_transcript})