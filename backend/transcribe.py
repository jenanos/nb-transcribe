import os
import shutil
import subprocess
import tempfile
import torch
import soundfile as sf
from transformers import pipeline


def ensure_ffmpeg():
    """Finn og sett FFMPEG_BINARY-variabelen for å dekode lyd."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("Fant ikke ffmpeg i PATH. Installer system‑pakke eller legg ffmpeg i PATH.")
    os.environ["FFMPEG_BINARY"] = ffmpeg


def create_asr_pipeline(batch_size: int = 4):
    """Oppretter ASR-pipeline på GPU med fp16 og batching."""
    ensure_ffmpeg()
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA‑enhet funnet. Sørg for at GPU‑drivere og CUDA er installert.")
    return pipeline(
        "automatic-speech-recognition",
        model="NbAiLabBeta/nb-whisper-large",
        return_timestamps=False,
        device=0,
        torch_dtype=torch.float16,
        ignore_warning=True,
        batch_size=batch_size
    )


def to_wav(input_path: str, sampling_rate: int = 16000) -> str:
    """Konverterer inputfil til WAV (mono, 16 kHz)."""
    ensure_ffmpeg()
    fd, wav_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    subprocess.run([
        os.environ["FFMPEG_BINARY"],
        "-y", "-i", input_path,
        "-ar", str(sampling_rate), "-ac", "1", wav_path
    ], check=True)
    return wav_path


def segment_wav(wav_path: str, segment_length_s: int = 30) -> tuple[list[str], str]:
    """Splitter WAV-filen i segmenter av gitt lengde (sekunder)."""
    data, sr = sf.read(wav_path)
    samples_per_seg = int(segment_length_s * sr)
    tmpdir = tempfile.mkdtemp()
    paths = []
    for i in range(0, len(data), samples_per_seg):
        seg = data[i:i+samples_per_seg]
        path = os.path.join(tmpdir, f"seg_{i//samples_per_seg:03d}.wav")
        sf.write(path, seg, sr)
        paths.append(path)
    return paths, tmpdir


def transcribe_segments(asr_pipeline, segments: list[str]) -> str:
    """Transkriberer en liste med segmentfiler og returnerer samlet tekst."""
    results = asr_pipeline(
        segments,
        generate_kwargs={"task": "transcribe", "language": "no", "num_beams": 5}
    )
    return "\n".join([res["text"] for res in results])
