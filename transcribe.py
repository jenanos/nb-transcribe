import os
import shutil
import subprocess
import tempfile
import argparse
import torch
import soundfile as sf
from transformers import pipeline


def ensure_ffmpeg():
    """Finn og sett FFMPEG_BINARY-variabelen."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("Fant ikke ffmpeg i PATH. Installer system‑pakke eller legg ffmpeg i PATH.")
    os.environ["FFMPEG_BINARY"] = ffmpeg


def create_asr_pipeline(batch_size: int = 4):
    """Oppretter ASR-pipeline på GPU med halvert presisjon og batching."""
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
    """Konverterer en lydfil til WAV (mono, 16 kHz) ved hjelp av FFmpeg."""
    fd, wav_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    subprocess.run([
        os.environ["FFMPEG_BINARY"],
        "-y", "-i", input_path,
        "-ar", str(sampling_rate),
        "-ac", "1",
        wav_path
    ], check=True)
    return wav_path


def segment_wav(wav_path: str, segment_length_s: int = 30) -> list[str]:
    """Splitter WAV-filen i segmenter av gitt lengde (sekunder)."""
    data, sr = sf.read(wav_path)
    total_samples = data.shape[0]
    samples_per_seg = int(segment_length_s * sr)
    tmpdir = tempfile.mkdtemp()
    segment_paths = []

    for idx in range(0, total_samples, samples_per_seg):
        end = idx + samples_per_seg
        seg_data = data[idx:end]
        seg_path = os.path.join(tmpdir, f"segment_{idx//samples_per_seg:03d}.wav")
        sf.write(seg_path, seg_data, sr)
        segment_paths.append(seg_path)

    return segment_paths


def transcribe_file(asr_pipeline, input_path: str, segment_length_s: int = 30) -> str:
    """Transkriberer en lydfil ved å splitte i segmenter og kjøre batched transkripsjon."""
    wav = to_wav(input_path)
    transcripts = []
    try:
        segments = segment_wav(wav, segment_length_s)
        # Kjør pipelinen på alle segmenter i én batch
        results = asr_pipeline(
            segments,
            generate_kwargs={"task": "transcribe", "language": "no", "num_beams": 5}
        )
        # results er liste av dicts med nøkkel "text"
        transcripts = [item["text"] for item in results]
        return "\n".join(transcripts)
    finally:
        os.remove(wav)
        for seg in segments:
            os.remove(seg)
        os.rmdir(os.path.dirname(segments[0]))


def main():
    parser = argparse.ArgumentParser(
        description="Transkriber lange lydfiler ved å dele dem i segmenter og bruke batch."  
    )
    parser.add_argument(
        "input", help="Sti til input lydfil (f.eks. fil.m4a)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Valgfri sti for utdata-tekstfil. Hvis ikke angitt: stdout."
    )
    parser.add_argument(
        "-l", "--segment_length",
        type=int,
        default=30,
        help="Lengde på hver segment i sekunder (standard: 30 s)."
    )
    parser.add_argument(
        "-b", "--batch_size",
        type=int,
        default=4,
        help="Antall segmenter som behandles i én batch (standard: 4)."
    )
    args = parser.parse_args()

    asr = create_asr_pipeline(batch_size=args.batch_size)
    transcript = transcribe_file(asr, args.input, args.segment_length)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(transcript)
    else:
        print(transcript)

if __name__ == "__main__":
    main()
