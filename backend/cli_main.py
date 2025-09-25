# main.py
import argparse
import os
from transcribe import create_asr_pipeline, to_wav, segment_wav, transcribe_segments
from rewriter import create_rewriter_pipeline, rewrite_text


def main():
    parser = argparse.ArgumentParser(
        description="Transkriber og renskriv med NB‑Whisper + Gemma‑3"
    )
    parser.add_argument("input", help="Sti til lydfil (.m4a, .wav osv)")
    parser.add_argument(
        "-o", "--output",
        help="Valgfritt: Basenavn for output-filer (uten filendelse)."
    )
    parser.add_argument("-l", "--segment_length", type=int, default=30,
                        help="Segmentlengde i sekunder")
    parser.add_argument("-b", "--batch_size", type=int, default=4,
                        help="Batch-størrelse for ASR")
    parser.add_argument(
        "--model", default="google/gemma-3-1b-it",
        help="Navn på gated rewriter-modell (~1B)"
    )
    parser.add_argument(
        "--mode", choices=["summary", "email", "document", "talking_points", "polish"],
        default="summary",
        help=(
            "Velg type renskriving: 'summary', 'email', 'document', 'talking_points' eller 'polish'"
        )
    )
    args = parser.parse_args()

    # Deriver base-navn for output fra input-fil hvis ikke gitt
    if args.output:
        base = args.output
    else:
        base = os.path.splitext(os.path.basename(args.input))[0]

    # Konverter og segmenter
    wav = to_wav(args.input)
    segments = segment_wav(wav, args.segment_length)

    # ASR
    asr = create_asr_pipeline(batch_size=args.batch_size)
    raw_transcript = transcribe_segments(asr, segments)

    # Renskriv
    rewriter = create_rewriter_pipeline(model_name=args.model)
    clean_transcript = rewrite_text(rewriter, raw_transcript, args.mode)

    # Rydd opp midlertidige filer
    for seg in segments:
        os.remove(seg)
    os.remove(wav)

    # Skriv til filer
    raw_path = f"{base}_raw.txt"
    clean_path = f"{base}_clean.txt"
    with open(raw_path, "w", encoding="utf-8") as f:
        f.write(raw_transcript)
    with open(clean_path, "w", encoding="utf-8") as f:
        f.write(clean_transcript)

    print(f"Skrev rå transkripsjon til: {raw_path}")
    print(f"Skrev renskrevet transkripsjon ({args.mode}) til: {clean_path}")

if __name__ == "__main__":
    main()