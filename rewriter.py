from transformers import AutoTokenizer, pipeline
import torch
import re


def create_rewriter_pipeline(
    model_name: str = "google/gemma-3-4b-it"
):
    """Oppretter pipeline for tekstomskriving med Gemma-3 4B IT."""
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA‑enhet funnet for rewriter.")
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True)
    pipe = pipeline(
        "text-generation",
        model=model_name,
        tokenizer=tokenizer,
        device="cuda",
        torch_dtype=torch.bfloat16
    )
    return pipe, tokenizer


def extract_model_response(text: str) -> str:
    """Returnerer kun tekst etter <start_of_turn>model og før <end_of_turn>."""
    match = re.search(r"<start_of_turn>model(.*?)(?:<end_of_turn>|$)", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


def rewrite_text(pipe_tokenizer, text: str, mode: str = "summary") -> str:
    """Renskriver råtekst med Gemma-3 via chat-template og pipeline-API."""
    pipe, tokenizer = pipe_tokenizer
    # Dynamisk system-prompt basert på mode
    if mode == 'summary':
        system_text = (
            "Du er en hjelpende assistent som oppsummerer samtaler. "
            "Fjern gjentakelser og lever en konsis oppsummering uten å gi tilbakemeldinger eller ros."
        )
    elif mode == 'email':
        system_text = (
            "Du er en profesjonell assistent som skriver eposter. "
            "Lag en faglig og profesjonell epost basert på transkripsjonen uten å legge til nye detaljer, "
            "og uten å gi tilbakemeldinger eller ros."
        )
    elif mode == 'document':
        system_text = (
            "Du er en profesjonell assistent for offentlige dokumenter. "
            "Generer tekst i korte setninger uten overflødige kommentarer, "
            "og uten å gi tilbakemeldinger eller ros."
        )
    else:
        system_text = (
            "Du er en hjelpsom assistent. "
            "Utfør omskriving uten å gi tilbakemeldinger eller ros."
        )

    messages = [
        {"role": "system", "content": [{"type": "text", "text": system_text}]},
        {"role": "user",   "content": [{"type": "text", "text": text}]}
    ]
    prompt = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=False
    )
    output = pipe(prompt, max_new_tokens=1024, do_sample=False, num_beams=4)
    raw_result = output[0]["generated_text"]
    return extract_model_response(raw_result)