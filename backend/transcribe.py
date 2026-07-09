import contextlib
import json
import os
import shutil
import subprocess
import tempfile
import torch
import soundfile as sf
from transformers import pipeline

MODEL_NAME = "NbAiLabBeta/nb-whisper-large"


def ensure_ffmpeg():
    """Finn og sett FFMPEG_BINARY-variabelen for å dekode lyd."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("Fant ikke ffmpeg i PATH. Installer system‑pakke eller legg ffmpeg i PATH.")
    os.environ["FFMPEG_BINARY"] = ffmpeg


def _fix_cached_config_types(model_name: str) -> None:
    """Fix int-vs-float type issues in the cached config.json.

    Newer huggingface_hub versions enforce strict type validation on dataclass
    fields. The model's config.json has integer 0 for fields that expect float
    (e.g. mask_feature_prob). This rewrites the cached file so that ALL
    subsequent from_pretrained calls (config, model, processor, tokenizer)
    use correct types.
    """
    from huggingface_hub import hf_hub_download

    try:
        config_path = hf_hub_download(model_name, "config.json")
        with open(config_path) as f:
            config_data = json.load(f)

        changed = False
        for key in list(config_data):
            if isinstance(config_data[key], int) and not isinstance(config_data[key], bool):
                if key.endswith(("_prob", "_dropout", "_rate", "_eps")):
                    config_data[key] = float(config_data[key])
                    changed = True

        if changed:
            # Atomic write: temp file + os.replace to avoid corrupted cache
            dir_name = os.path.dirname(config_path)
            fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".json")
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(config_data, f, indent=2)
                os.replace(tmp_path, config_path)
            except BaseException:
                with contextlib.suppress(OSError):
                    os.remove(tmp_path)
                raise
    except Exception as e:
        raise RuntimeError(
            f"Failed to fix cached config types for model '{model_name}'. "
            "Check Hugging Face hub connectivity and local cache integrity."
        ) from e


def create_asr_pipeline(batch_size: int = 4):
    """Oppretter ASR-pipeline på GPU med fp16 og batching."""
    ensure_ffmpeg()
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA‑enhet funnet. Sørg for at GPU‑drivere og CUDA er installert.")

    # Fix cached config.json so all from_pretrained calls use correct types
    _fix_cached_config_types(MODEL_NAME)

    return pipeline(
        "automatic-speech-recognition",
        model=MODEL_NAME,
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
    result = subprocess.run([
        os.environ["FFMPEG_BINARY"],
        "-y", "-i", input_path,
        "-ar", str(sampling_rate), "-ac", "1", wav_path
    ], capture_output=True)
    if result.returncode != 0:
        with contextlib.suppress(OSError):
            os.remove(wav_path)
        stderr = (result.stderr or b"").decode("utf-8", errors="replace").strip()
        stderr_tail = "\n".join(stderr.splitlines()[-5:])
        raise RuntimeError(
            f"ffmpeg klarte ikke å konvertere lydfilen (exit {result.returncode}): {stderr_tail}"
        )
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


def transcribe_segments(asr_pipeline, segments: list[str], sub_batch_size: int = 10) -> str:
    """Transkriberer en liste med segmentfiler og returnerer samlet tekst.

    For lange lydfiler kan antall segmenter bli svært høyt (f.eks. 48 for 24 min).
    Vi deler derfor opp i sub-batcher for å begrense minnebruk og unngå at GPU-
    prosessen blokkerer i for lang tid sammenhengende.
    """
    all_texts: list[str] = []
    for i in range(0, len(segments), sub_batch_size):
        batch = segments[i : i + sub_batch_size]
        results = asr_pipeline(
            batch,
            generate_kwargs={"task": "transcribe", "language": "no", "num_beams": 5},
        )
        all_texts.extend(res["text"] for res in results)
    return "\n".join(all_texts)
