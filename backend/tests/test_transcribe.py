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


def test_create_asr_pipeline_fixes_int_to_float_in_config(monkeypatch):
    """Verify create_asr_pipeline converts int fields to float before instantiation."""
    import transcribe

    monkeypatch.setattr("shutil.which", lambda _name: "/usr/bin/ffmpeg")

    torch_stub = sys.modules["torch"]
    monkeypatch.setattr(torch_stub.cuda, "is_available", lambda: True)

    captured_from_dict_args = {}
    captured_pipeline_kwargs = {}

    # Simulate a config dict with mask_feature_prob as int (the bug scenario)
    raw_config = {"model_type": "whisper", "mask_feature_prob": 0, "attention_dropout": 0}

    def fake_get_config_dict(*args, **kwargs):
        return dict(raw_config), {}

    def fake_from_dict(config_dict, **kwargs):
        captured_from_dict_args.update(config_dict)
        return "fake-config"

    fake_config_class = types.SimpleNamespace(from_dict=fake_from_dict)

    captured_model_kwargs = {}

    def fake_from_pretrained(*args, **kwargs):
        captured_model_kwargs.update(kwargs)
        captured_model_kwargs["_args"] = args
        return "fake-model"

    fake_processor = types.SimpleNamespace(
        tokenizer="fake-tokenizer",
        feature_extractor="fake-feature-extractor",
    )

    def fake_pipeline(*args, **kwargs):
        captured_pipeline_kwargs.update(kwargs)
        return "fake-pipeline"

    # Stub the submodules that create_asr_pipeline imports locally
    config_utils_stub = types.ModuleType("transformers.configuration_utils")
    config_utils_stub.PretrainedConfig = types.SimpleNamespace(  # type: ignore[attr-defined]
        get_config_dict=fake_get_config_dict,
    )
    auto_config_stub = types.ModuleType("transformers.models.auto.configuration_auto")
    auto_config_stub.CONFIG_MAPPING = {"whisper": fake_config_class}  # type: ignore[attr-defined]

    tf_stub = sys.modules["transformers"]
    tf_stub.AutoModelForSpeechSeq2Seq = types.SimpleNamespace(from_pretrained=fake_from_pretrained)  # type: ignore[attr-defined]
    tf_stub.AutoProcessor = types.SimpleNamespace(from_pretrained=lambda *a, **kw: fake_processor)  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "transformers.configuration_utils", config_utils_stub)
    monkeypatch.setitem(sys.modules, "transformers.models", types.ModuleType("transformers.models"))
    monkeypatch.setitem(sys.modules, "transformers.models.auto", types.ModuleType("transformers.models.auto"))
    monkeypatch.setitem(sys.modules, "transformers.models.auto.configuration_auto", auto_config_stub)
    monkeypatch.setattr(transcribe, "pipeline", fake_pipeline)

    result = transcribe.create_asr_pipeline()

    assert result == "fake-pipeline"
    # mask_feature_prob should be 0.0 (float), not 0 (int)
    assert captured_from_dict_args["mask_feature_prob"] == 0.0
    assert isinstance(captured_from_dict_args["mask_feature_prob"], float)
    # attention_dropout should also be converted to float
    assert isinstance(captured_from_dict_args["attention_dropout"], float)
    # Model should be loaded with fixed config and correct dtype
    assert captured_model_kwargs["config"] == "fake-config"
    assert captured_model_kwargs["torch_dtype"] == "float16"
    # Model object should be passed to pipeline, not the model name string
    assert captured_pipeline_kwargs["model"] == "fake-model"
