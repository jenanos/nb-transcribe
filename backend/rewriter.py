from transformers import AutoTokenizer, pipeline
import torch
import re
import os


def create_rewriter_pipeline(
    model_name: str = "google/gemma-3-4b-it"
):
    """Oppretter pipeline for tekstomskriving med Gemma-3 4B IT."""
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA‑enhet funnet for rewriter.")
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True, token=os.environ.get("HF_TOKEN"))
    pipe = pipeline(
        "text-generation",
        model=model_name,
        tokenizer=tokenizer,
        device="cuda",
        torch_dtype=torch.bfloat16,
        token=os.environ.get("HF_TOKEN")
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
            "Du er en hjelpende assistent som oppsummerer transkripsjoner. "
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
            "Du er en profesjonell assistent som skriver avsnitt til eksisterende dokumenter. "
            "Lever presise og helhetlige avsnitt som kan flettes inn i et større dokument, uten overflødige kommentarer, "
            "og uten å gi tilbakemeldinger eller ros."
        )
    elif mode == 'talking_points':
        system_text = (
            "Du er en erfaren foredragsholder som lager talepunkter. "
            "Utarbeid en klar punktliste over hovedbudskap og støttepunkter basert på transkripsjonen, "
            "uten å gi tilbakemeldinger eller ros."
        )
    elif mode == 'polish':
        system_text = (
            "Du er en språkvasker som renskriver transkripsjoner. "
            "Behold all informasjon, gjør setningene tydelige og fjern muntlige fyllord. "
            "Fjern uttrykk som 'eh', 'øh', 'ehhh', 'liksom', 'ikke sant', 'altså', 'på en måte' og lignende, selv om teksten blir litt kortere, "
            "og ikke legg til tilbakemeldinger eller ros."
        )
    elif mode == 'workflow':
        system_text = (
            "Du er en arbeidsflyt-assistent som analyserer en transkripsjon. "
            "Identifiser hvert konkrete handlingspunkt eller oppgave som nevnes. "
            "For hver oppgave: oppgi en kort beskrivelse og lag en presis prompt som kan gis til et annet LLM-verktøy "
            "for å utføre oppgaven. Inkluder relevante detaljer, mål, avhengigheter, personer og kontekst fra transkripsjonen. "
            "Svar på norsk og formater resultatet som en nummerert liste med blokker på formatet:\n"
            "Oppgave X: <kort beskrivelse>\n"
            "Prompt:\n"
            "\"\"\"\n"
            "<prompttekst>\n"
            "\"\"\"\n"
            "Ikke legg til vurderinger, konklusjoner eller tekst som ikke følger strukturen."
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
