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


def create_asr_pipeline(batch_size: int = 4):
    """Oppretter ASR-pipeline på GPU med fp16 og batching."""
    ensure_ffmpeg()
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA‑enhet funnet. Sørg for at GPU‑drivere og CUDA er installert.")

    # Workaround: newer huggingface_hub versions enforce strict type validation
    # on dataclass fields. The model config JSON has integer 0 for fields that
    # expect float (e.g. mask_feature_prob). AutoConfig.from_pretrained kwargs
    # are applied AFTER the constructor, so we must fix the raw dict first.
    # Imports are local to avoid requiring transformers submodules at module
    # import time, which would break lightweight test stubs.
    from transformers.configuration_utils import PretrainedConfig
    from transformers.models.auto.configuration_auto import CONFIG_MAPPING

    config_dict, _ = PretrainedConfig.get_config_dict(MODEL_NAME)
    for key in list(config_dict):
        if isinstance(config_dict[key], int) and not isinstance(config_dict[key], bool):
            if key.endswith(("_prob", "_dropout", "_rate", "_eps")):
                config_dict[key] = float(config_dict[key])
    if "mask_feature_prob" not in config_dict:
        config_dict["mask_feature_prob"] = 0.0
    config_class = CONFIG_MAPPING[config_dict["model_type"]]
    config = config_class.from_dict(config_dict)

    # Load the model explicitly with our fixed config so that pipeline()
    # does not call AutoConfig.from_pretrained again (which would hit the
    # same strict-validation bug a second time).
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_NAME, config=config, torch_dtype=torch.float16
    )
    processor = AutoProcessor.from_pretrained(MODEL_NAME)

    return pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
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
    ], check=True, capture_output=True)
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
