import importlib
import io
import json
import sys
import time
import types
from pathlib import Path

import pytest
from starlette.datastructures import UploadFile


def _ensure_transcribe_importable():
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


def _patch_transcribe(monkeypatch, tmp_path: Path):
    _ensure_transcribe_importable()
    import transcribe

    seg_dir = tmp_path / "segments"
    seg_dir.mkdir(parents=True, exist_ok=True)

    def fake_to_wav(input_path: str, sampling_rate: int = 16000) -> str:  # noqa: ARG002
        return input_path

    def fake_segment_wav(wav_path: str, segment_length_s: int = 30):  # noqa: ARG002
        seg_path = seg_dir / "seg_000.wav"
        seg_path.write_bytes(b"fake")
        return [str(seg_path)], str(seg_dir)

    def fake_transcribe_segments(_asr, segments: list[str]):  # noqa: ARG002
        assert segments, "segments expected"
        return "stubbet transkripsjon"

    monkeypatch.setattr(transcribe, "to_wav", fake_to_wav)
    monkeypatch.setattr(transcribe, "segment_wav", fake_segment_wav)
    monkeypatch.setattr(transcribe, "transcribe_segments", fake_transcribe_segments)


@pytest.fixture()
def patched_main(monkeypatch, tmp_path):
    import main

    _patch_transcribe(monkeypatch, tmp_path)
    module = importlib.reload(main)
    monkeypatch.setattr(module, "get_asr_pipeline", lambda: None)
    monkeypatch.setattr(module, "JOBS", {})
    try:
        yield module
    finally:
        importlib.reload(main)


@pytest.mark.asyncio
async def test_health_endpoint(patched_main):
    response = await patched_main.health()
    assert response.status_code == 200
    payload = json.loads(response.body.decode())
    assert payload == {"status": "ok"}


@pytest.mark.asyncio
async def test_process_endpoint_transcribes(patched_main):
    upload = UploadFile(filename="test.wav", file=io.BytesIO(b"fake-bytes"))
    response = await patched_main.process(upload)
    await upload.close()

    assert response.status_code == 200
    payload = json.loads(response.body.decode())
    assert payload["raw"] == "stubbet transkripsjon"
    assert payload["metadata"]["original_filename"] == "test.wav"


@pytest.mark.asyncio
async def test_process_endpoint_returns_json_error_on_failure(patched_main, monkeypatch):
    def failing_pipeline(*_args, **_kwargs):
        raise RuntimeError("pipeline exploded")

    monkeypatch.setattr(patched_main, "run_transcribe_pipeline", failing_pipeline)

    upload = UploadFile(filename="test.wav", file=io.BytesIO(b"fake-bytes"))
    response = await patched_main.process(upload)
    await upload.close()

    assert response.status_code == 500
    payload = json.loads(response.body.decode())
    assert "pipeline exploded" in payload["error"]
    assert "job_id" in payload


def test_cleanup_jobs_keeps_recently_finished_job(patched_main):
    """En jobb som var lenge i kø, men nettopp ble ferdig, skal ikke slettes."""
    now = time.time()
    patched_main.JOBS["slow-job"] = {
        "status": "done",
        "result": {"raw": "tekst"},
        "error": None,
        "created_at": now - patched_main.JOB_TTL_SECONDS * 3,
        "finished_at": now,
    }

    patched_main.cleanup_jobs(now)

    assert "slow-job" in patched_main.JOBS


def test_cleanup_jobs_removes_job_finished_long_ago(patched_main):
    now = time.time()
    patched_main.JOBS["old-job"] = {
        "status": "done",
        "result": {"raw": "tekst"},
        "error": None,
        "created_at": now - patched_main.JOB_TTL_SECONDS * 3,
        "finished_at": now - patched_main.JOB_TTL_SECONDS - 10,
    }
    patched_main.JOBS["running-job"] = {
        "status": "running",
        "result": None,
        "error": None,
        "created_at": now - patched_main.JOB_TTL_SECONDS * 3,
    }

    patched_main.cleanup_jobs(now)

    assert "old-job" not in patched_main.JOBS
    assert "running-job" in patched_main.JOBS


@pytest.mark.asyncio
async def test_get_job_hides_traceback_by_default(patched_main):
    patched_main.JOBS["failed-job"] = {
        "status": "error",
        "result": None,
        "error": "boom",
        "error_detail": "Traceback (most recent call last): ...",
        "created_at": time.time(),
        "finished_at": time.time(),
    }

    response = await patched_main.get_job("failed-job")
    payload = json.loads(response.body.decode())

    assert response.status_code == 500
    assert payload["error"] == "boom"
    assert "detail" not in payload


@pytest.mark.asyncio
async def test_get_job_exposes_traceback_when_enabled(patched_main, monkeypatch):
    monkeypatch.setattr(patched_main, "EXPOSE_ERROR_DETAILS", True)
    patched_main.JOBS["failed-job"] = {
        "status": "error",
        "result": None,
        "error": "boom",
        "error_detail": "Traceback (most recent call last): ...",
        "created_at": time.time(),
        "finished_at": time.time(),
    }

    response = await patched_main.get_job("failed-job")
    payload = json.loads(response.body.decode())

    assert payload["detail"].startswith("Traceback")


def test_submit_job_handles_error(tmp_path: Path, patched_main, monkeypatch):
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    job_id = "job-error"
    patched_main.JOBS[job_id] = {
        "status": "queued",
        "result": None,
        "error": None,
        "created_at": time.time(),
    }

    def failing_pipeline(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(patched_main, "run_transcribe_pipeline", failing_pipeline)

    patched_main._submit_job(str(audio_path), job_id, "audio.wav")

    job = patched_main.JOBS[job_id]
    assert job["status"] == "error"
    assert "boom" in job["error"]
    assert "finished_at" in job


def test_submit_job_publishes_complete_result_atomically(
    tmp_path: Path, patched_main, monkeypatch
):
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    job_id = "job-success"
    original_job = {
        "status": "queued",
        "result": None,
        "error": None,
        "created_at": time.time(),
    }
    patched_main.JOBS[job_id] = original_job
    expected_result = {"raw": "ferdig tekst", "metadata": {"segment_count": 2}}

    monkeypatch.setattr(
        patched_main,
        "run_transcribe_pipeline",
        lambda *_args, **_kwargs: expected_result,
    )

    def assert_not_done_while_persisting(**_kwargs):
        assert patched_main.JOBS[job_id]["status"] == "running"
        assert patched_main.JOBS[job_id]["result"] is None

    monkeypatch.setattr(
        patched_main,
        "save_transcription_record",
        assert_not_done_while_persisting,
    )

    patched_main._submit_job(str(audio_path), job_id, "audio.wav")

    assert original_job["status"] == "running"
    assert patched_main.JOBS[job_id] is not original_job
    assert patched_main.JOBS[job_id]["status"] == "done"
    assert patched_main.JOBS[job_id]["result"] == expected_result
