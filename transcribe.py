import os
import argparse
import torch
from transformers import pipeline

def create_asr_pipeline():
    # Sørg for at ffmpeg er tilgjengelig
    os.environ["FFMPEG_BINARY"] = "ffmpeg"
    # Sjekk at CUDA er aktivert
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA-enhet funnet, sørg for at GPU-drivere og CUDA er installert.")
    # Opprett ASR-pipeline på GPU med halver presisjon for lavere minnebruk
    return pipeline(
        "automatic-speech-recognition",
        model="NbAiLabBeta/nb-whisper-large",
        chunk_length_s=28,
        return_timestamps=False,
        device=0,
        torch_dtype=torch.float16
    )

def transcribe_file(asr_pipeline, file_path):
    # Transkriber lydfilen med spesifikke genereringsparametre
    result = asr_pipeline(
        file_path,
        generate_kwargs={
            "task": "transcribe",
            "language": "no",
            "num_beams": 5
        }
    )
    return result["text"]

def main():
    parser = argparse.ArgumentParser(
        description="Transkriber en .m4a-lydfil med NB-Whisper Large"
    )
    parser.add_argument(
        "input", help="Sti til input-fil (f.eks. lydfil.m4a)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Valgfri sti for utdata-tekstfil. Hvis ikke angitt, skrives til stdout."
    )
    args = parser.parse_args()

    asr = create_asr_pipeline()
    transcript = transcribe_file(asr, args.input)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(transcript)
    else:
        print(transcript)

if __name__ == "__main__":
    main()
