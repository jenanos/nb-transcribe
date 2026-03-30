import sys
import types

import pytest


def _ensure_stubs():
    """Stub out heavy GPU dependencies so ``import transcribe`` works in CI."""
    for mod_name in ("torch", "soundfile", "transformers"):
        if mod_name not in sys.modules:
            sys.modules[mod_name] = types.ModuleType(mod_name)
    torch_stub = sys.modules["torch"]
    if not hasattr(torch_stub, "cuda"):
        cuda = types.ModuleType("torch.cuda")
        cuda.is_available = lambda: False  # type: ignore[attr-defined]
        torch_stub.cuda = cuda  # type: ignore[attr-defined]
    if not hasattr(torch_stub, "float16"):
        torch_stub.float16 = "float16"  # type: ignore[attr-defined]
    sf_stub = sys.modules["soundfile"]
    if not hasattr(sf_stub, "read"):
        sf_stub.read = lambda *a, **kw: ([], 16000)  # type: ignore[attr-defined]
        sf_stub.write = lambda *a, **kw: None  # type: ignore[attr-defined]
        sf_stub.info = lambda *a, **kw: types.SimpleNamespace(duration=0.0, frames=0, samplerate=16000)  # type: ignore[attr-defined]
    tf_stub = sys.modules["transformers"]
    if not hasattr(tf_stub, "pipeline"):
        tf_stub.pipeline = lambda *a, **kw: None  # type: ignore[attr-defined]
    if not hasattr(tf_stub, "AutoConfig"):
        auto_config = types.SimpleNamespace(from_pretrained=lambda *a, **kw: None)
        tf_stub.AutoConfig = auto_config  # type: ignore[attr-defined]


_ensure_stubs()

from transcribe import transcribe_segments  # noqa: E402


class FakeASR:
    """Minimal ASR pipeline stub that records calls and returns predictable text."""

    def __init__(self):
        self.calls: list[list[str]] = []

    def __call__(self, segments, **_kwargs):
        self.calls.append(list(segments))
        return [{"text": f"text-{seg}"} for seg in segments]


def test_transcribe_segments_single_batch():
    asr = FakeASR()
    result = transcribe_segments(asr, ["a", "b", "c"], sub_batch_size=10)

    assert asr.calls == [["a", "b", "c"]]
    assert result == "text-a\ntext-b\ntext-c"


def test_transcribe_segments_multiple_sub_batches():
    asr = FakeASR()
    segments = [f"seg{i}" for i in range(25)]
    result = transcribe_segments(asr, segments, sub_batch_size=10)

    # Should be split into 3 sub-batches: 10, 10, 5
    assert len(asr.calls) == 3
    assert len(asr.calls[0]) == 10
    assert len(asr.calls[1]) == 10
    assert len(asr.calls[2]) == 5
    assert result == "\n".join(f"text-seg{i}" for i in range(25))


def test_transcribe_segments_exact_batch_boundary():
    asr = FakeASR()
    segments = [f"seg{i}" for i in range(20)]
    result = transcribe_segments(asr, segments, sub_batch_size=10)

    assert len(asr.calls) == 2
    assert len(asr.calls[0]) == 10
    assert len(asr.calls[1]) == 10
    assert result == "\n".join(f"text-seg{i}" for i in range(20))


def test_transcribe_segments_empty():
    asr = FakeASR()
    result = transcribe_segments(asr, [], sub_batch_size=10)

    assert asr.calls == []
    assert result == ""


def test_create_asr_pipeline_passes_float_mask_feature_prob(monkeypatch):
    """Verify create_asr_pipeline loads config with mask_feature_prob as float."""
    import transcribe

    monkeypatch.setattr("shutil.which", lambda _name: "/usr/bin/ffmpeg")

    torch_stub = sys.modules["torch"]
    monkeypatch.setattr(torch_stub.cuda, "is_available", lambda: True)

    captured_config_kwargs = {}
    captured_pipeline_kwargs = {}

    def fake_from_pretrained(*args, **kwargs):
        captured_config_kwargs.update(kwargs)
        captured_config_kwargs["model_name"] = args[0] if args else None
        return "fake-config"

    def fake_pipeline(*args, **kwargs):
        captured_pipeline_kwargs.update(kwargs)
        return "fake-pipeline"

    fake_auto_config = types.SimpleNamespace(from_pretrained=fake_from_pretrained)
    monkeypatch.setattr(transcribe, "AutoConfig", fake_auto_config)
    monkeypatch.setattr(transcribe, "pipeline", fake_pipeline)

    result = transcribe.create_asr_pipeline()

    assert result == "fake-pipeline"
    assert captured_config_kwargs["model_name"] == "NbAiLabBeta/nb-whisper-large"
    assert captured_config_kwargs["mask_feature_prob"] == 0.0
    assert isinstance(captured_config_kwargs["mask_feature_prob"], float)
    assert captured_pipeline_kwargs["config"] == "fake-config"
