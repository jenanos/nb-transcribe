from transformers import AutoProcessor, Gemma3ForConditionalGeneration
# AutoProcessor for Gemma-3 may require PIL for image inputs
try:
    from PIL import Image
except ImportError:
    raise ImportError("Pillow library not found. Please install it with `pip install pillow` and restart.")
import torch


def create_rewriter_pipeline(
    model_name: str = "google/gemma-3-4b-it"
):
    """Oppretter rewriter med Google Gemma-3 4B og AutoProcessor for chat.
    Modellen lastes med fp16 og flyttes direkte til enkelt GPU uten accelerate.
    Krever transformers>=4.50.0 og gyldig HF-CLI autentisering.
    """
    if not torch.cuda.is_available():
        raise RuntimeError("Ingen CUDA‑enhet funnet for rewriter.")
    # Last processor for chat templating
    processor = AutoProcessor.from_pretrained(
        model_name,
        use_fast=True
    )
    # Last modell med fp16 og lavt CPU-minne, så flytt manuelt til GPU
    model = Gemma3ForConditionalGeneration.from_pretrained(
        model_name,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True
    )
    model = model.to("cuda:0")
    model.eval()
    return model, processor


def rewrite_text(model_processor, text: str) -> str:
    """Renskriver råtekst med Gemma-3 via chat-template og AutoProcessor."""
    model, processor = model_processor
    # Bygg messages
    messages = [
        {"role": "system", "content": [{"type": "text", "text": "Du er en hjelpsom assistent som skal hjelpe meg med å renskrive følgende tekst:."}]},
        {"role": "user",   "content": [{"type": "text", "text": text}]}
    ]
    # Forbered inputs med chat-templating
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt"
    ).to(model.device, dtype=torch.bfloat16)

    # Generer uten sampling
    with torch.inference_mode():
        generation = model.generate(
            **inputs,
            max_new_tokens=1024,
            do_sample=False,
            num_beams=4
        )
    # Fjern prompt tokens
    input_len = inputs["input_ids"].shape[-1]
    gen_tokens = generation[0][input_len:]
    # Decode til tekst
    decoded = processor.decode(gen_tokens, skip_special_tokens=True)
    return decoded