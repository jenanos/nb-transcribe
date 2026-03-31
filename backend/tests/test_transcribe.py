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


def test_fix_cached_config_types_converts_int_to_float(tmp_path):
    """Verify _fix_cached_config_types rewrites int→float for prob/dropout fields."""
    import json
    import transcribe

    # Create a fake config.json with int values where float is expected
    config_data = {
        "model_type": "whisper",
        "mask_feature_prob": 0,
        "attention_dropout": 0,
        "hidden_dropout": 0,
        "vocab_size": 51865,
        "use_cache": True,
    }
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config_data))

    # Stub hf_hub_download to return our temp file
    hf_hub_stub = types.ModuleType("huggingface_hub")
    hf_hub_stub.hf_hub_download = lambda *a, **kw: str(config_path)  # type: ignore[attr-defined]

    monkeypatch_mod = pytest.MonkeyPatch()
    monkeypatch_mod.setitem(sys.modules, "huggingface_hub", hf_hub_stub)
    try:
        transcribe._fix_cached_config_types("fake-model")
    finally:
        monkeypatch_mod.undo()

    fixed = json.loads(config_path.read_text())
    # Float fields should be converted
    assert isinstance(fixed["mask_feature_prob"], float)
    assert fixed["mask_feature_prob"] == 0.0
    assert isinstance(fixed["attention_dropout"], float)
    assert isinstance(fixed["hidden_dropout"], float)
    # Integer fields should stay as int
    assert isinstance(fixed["vocab_size"], int)
    # Bool fields should stay as bool
    assert isinstance(fixed["use_cache"], bool)


def test_fix_cached_config_types_no_rewrite_when_already_float(tmp_path):
    """Verify _fix_cached_config_types does not rewrite if types are correct."""
    import json
    import transcribe

    config_data = {"model_type": "whisper", "mask_feature_prob": 0.0}
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config_data))
    mtime_before = config_path.stat().st_mtime

    hf_hub_stub = types.ModuleType("huggingface_hub")
    hf_hub_stub.hf_hub_download = lambda *a, **kw: str(config_path)  # type: ignore[attr-defined]

    monkeypatch_mod = pytest.MonkeyPatch()
    monkeypatch_mod.setitem(sys.modules, "huggingface_hub", hf_hub_stub)
    try:
        transcribe._fix_cached_config_types("fake-model")
    finally:
        monkeypatch_mod.undo()

    # File should not have been rewritten
    assert config_path.stat().st_mtime == mtime_before
