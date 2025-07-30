import argparse
import os
from transcribe import create_asr_pipeline, to_wav, segment_wav, transcribe_segments
from rewriter import create_rewriter_pipeline, rewrite_text

def main():
    parser = argparse.ArgumentParser(
        description="Transkriber og renskriv med NB-Whisper + Gemma-3 4B"
    )
    parser.add_argument("input", help="Sti til lydfil (.m4a, .wav osv)")
    parser.add_argument(
        "-o", "--output",
        help="Basenavn for output-filer (uten filendelse)."
    )
    parser.add_argument("-l", "--segment_length", type=int, default=30,
                        help="Segmentlengde i sekunder")
    parser.add_argument("-b", "--batch_size", type=int, default=4,
                        help="Batch-størrelse for ASR")
    parser.add_argument("--model", default="google/gemma-3-4b-it",
                        help="Navn på rewriter-modell (~4B)")
    args = parser.parse_args()

    # Konverter og segmenter
    wav = to_wav(args.input)
    segments = segment_wav(wav, args.segment_length)

    # ASR
    asr = create_asr_pipeline(batch_size=args.batch_size)
    raw_transcript = transcribe_segments(asr, segments)

    # Rewriting
    rewriter = create_rewriter_pipeline(model_name=args.model)
    clean_transcript = rewrite_text(rewriter, raw_transcript)

    # Cleanup midlertidige filer
    for seg in segments:
        os.remove(seg)
    os.remove(wav)

    # Output til filer eller stdout
    if args.output:
        raw_path = f"{args.output}_raw.txt"
        clean_path = f"{args.output}_clean.txt"
        with open(raw_path, "w", encoding="utf-8") as f:
            f.write(raw_transcript)
        with open(clean_path, "w", encoding="utf-8") as f:
            f.write(clean_transcript)
        print(f"Skrev rå transkripsjon til: {raw_path}")
        print(f"Skrev renskrevet transkripsjon til: {clean_path}")
    else:
        print("--- RAW TRANSKRIBSJON ---")
        print(raw_transcript)
        print("--- RENSKREVET TRANSKRIBSJON ---")
        print(clean_transcript)

if __name__ == "__main__":
    main()