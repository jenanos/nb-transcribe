import subprocess
import os
import re
from functools import lru_cache

# Importer kun for Gemma-støtte
try:
    from transformers import AutoTokenizer, pipeline
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

def get_system_prompt(mode: str) -> str:
    """Returnerer system-prompt basert på omskrivingsmodus."""
    prompts = {
        'summary': "Du er en hjelpende assistent som oppsummerer transkripsjoner. Fjern gjentakelser og lever en konsis oppsummering uten å gi tilbakemeldinger eller ros.",
        'email': "Du er en profesjonell assistent som skriver eposter. Lag en faglig og profesjonell epost basert på transkripsjonen uten å legge til nye detaljer, og uten å gi tilbakemeldinger eller ros.",
        'document': "Du er en profesjonell assistent som skriver avsnitt til eksisterende dokumenter. Lever presise og helhetlige avsnitt som kan flettes inn i et større dokument, uten overflødige kommentarer, og uten å gi tilbakemeldinger eller ros.",
        'talking_points': "Du er en erfaren foredragsholder som lager talepunkter. Utarbeid en klar punktliste over hovedbudskap og støttepunkter basert på transkripsjonen, uten å gi tilbakemeldinger eller ros.",
        'polish': "Du er en språkvasker som renskriver transkripsjoner. Behold all informasjon, gjør setningene tydelige og fjern muntlige fyllord. Fjern uttrykk som 'eh', 'øh', 'ehhh', 'liksom', 'ikke sant', 'altså', 'på en måte' og lignende, selv om teksten blir litt kortere, og ikke legg til tilbakemeldinger eller ros.",
        'workflow': "Du er en arbeidsflyt-assistent som analyserer en transkripsjon. Identifiser hvert konkrete handlingspunkt eller oppgave som nevnes. For hver oppgave: oppgi en kort beskrivelse og lag en presis prompt som kan gis til et annet LLM-verktøy for å utføre oppgaven. Inkluder relevante detaljer, mål, avhengigheter, personer og kontekst fra transkripsjonen. Svar på norsk og formater resultatet som en nummerert liste med blokker på formatet:\nOppgave X: <kort beskrivelse>\nPrompt:\n\"\"\"\n<prompttekst>\n\"\"\"\nIkke legg til vurderinger, konklusjoner eller tekst som ikke følger strukturen."
    }
    return prompts.get(mode, "Du er en hjelpsom assistent. Utfør omskriving uten å gi tilbakemeldinger eller ros.")

@lru_cache(maxsize=1)
def create_rewriter_pipeline(model_name: str = "google/gemma-3-4b-it"):
    """Oppretter og cacher en pipeline for tekstomskriving med en Hugging Face-modell."""
    if not TRANSFORMERS_AVAILABLE:
        raise RuntimeError("Transformers/PyTorch er ikke installert. Kan ikke opprette Gemma-pipeline.")
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA-enhet funnet for Gemma-rewriter.")
    
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

def extract_gemma_response(text: str) -> str:
    """Returnerer kun tekst etter <start_of_turn>model og før <end_of_turn>."""
    match = re.search(r"<start_of_turn>model(.*?)(?:<end_of_turn>|$)", text, re.DOTALL)
    return match.group(1).strip() if match else text.strip()

def rewrite_text_gemma(text: str, mode: str, prompt: str | None) -> str:
    """Renskriver tekst med en lokal Gemma-modell."""
    pipe, tokenizer = create_rewriter_pipeline()
    system_text = get_system_prompt(mode)
    
    user_text = text
    if prompt and prompt.strip():
        user_text = f"{prompt.strip()}\n\n{text}"

    messages = [
        {"role": "system", "content": [{"type": "text", "text": system_text}]},
        {"role": "user", "content": [{"type": "text", "text": user_text}]}
    ]
    
    prompt_text = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    output = pipe(prompt_text, max_new_tokens=1024, do_sample=False, num_beams=4)
    raw_result = output[0]["generated_text"]
    
    # Tøm VRAM etter bruk
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        
    return extract_gemma_response(raw_result)

def rewrite_text_gemini(text: str, mode: str, prompt: str | None) -> str:
    """Renskriver tekst med Gemini CLI i headless-modus."""
    system_text = get_system_prompt(mode)
    
    user_text = text
    if prompt and prompt.strip():
        user_text = f"{prompt.strip()}\n\n{text}"

    full_prompt = f"{system_text}\n\n{user_text}"
    
    api_key = os.environ.get("GEMINI_API_KEY")
    model_id = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY er ikke satt i miljøvariablene.")

    # Kopier miljøvariabler og sett API-nøkkelen
    env = os.environ.copy()
    env["GEMINI_API_KEY"] = api_key
    env.setdefault("GEMINI_HEADLESS", "1")  # tving non-interaktiv modus
    env.setdefault("NO_COLOR", "1")         # unngå ANSI-koder i output

    cmd = ['gemini', '--model', model_id, '--output-format', 'text']

    try:
        # Vi sender prompten via stdin for å unngå argument-lengdebegrensninger.
        result = subprocess.run(
            cmd,
            input=full_prompt,
            capture_output=True,
            text=True,
            check=True,
            encoding='utf-8',
            env=env
        )
        # CLI kan likevel sende ANSI-koder dersom den tror den skriver til TTY.
        # Rens resultatet slik at frontend ikke trenger å gjøre det selv.
        clean_output = re.sub(r"\x1B\[[0-9;]*[mK]", "", result.stdout)
        return clean_output.strip()
    except FileNotFoundError:
        raise RuntimeError("'gemini'-kommandoen ble ikke funnet. Sørg for at Gemini CLI er installert og i din PATH.")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Feil under kjøring av Gemini CLI: {e.stderr}")

def rewrite_text(text: str, mode: str, prompt: str | None, model: str = "gemini") -> str:
    """Velger omskrivingsmotor basert på 'model'-parameteren."""
    if model == "gemma":
        return rewrite_text_gemma(text, mode, prompt)
    return rewrite_text_gemini(text, mode, prompt)
