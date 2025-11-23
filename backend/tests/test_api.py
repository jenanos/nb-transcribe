import importlib
import io
import importlib
import io
import json
import time
from pathlib import Path

import pytest
from starlette.datastructures import UploadFile


def _patch_transcribe(monkeypatch, tmp_path: Path):
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
async def test_process_endpoint_transcribes(patched_main):
    upload = UploadFile(filename="test.wav", file=io.BytesIO(b"fake-bytes"))
    response = await patched_main.process(upload)
    await upload.close()

    assert response.status_code == 200
    payload = json.loads(response.body.decode())
    assert payload["raw"] == "stubbet transkripsjon"
    assert payload["metadata"]["original_filename"] == "test.wav"


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
