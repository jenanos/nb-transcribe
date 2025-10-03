import importlib
import io
import json
from pathlib import Path

import asyncio

import pytest
from starlette.datastructures import UploadFile


@pytest.fixture()
def stubbed_main(monkeypatch):
    monkeypatch.setenv("DEV_STUB", "1")
    import main

    module = importlib.reload(main)
    try:
        yield module
    finally:
        monkeypatch.delenv("DEV_STUB", raising=False)
        importlib.reload(module)


def test_process_endpoint_uses_stub(stubbed_main):
    upload = UploadFile(filename="test.wav", file=io.BytesIO(b"fake-bytes"))

    async def call_process():
        response = await stubbed_main.process(upload, mode="summary", rewrite=True)
        await upload.close()
        return response

    response = asyncio.run(call_process())

    assert response.status_code == 200
    payload = json.loads(response.body.decode())
    assert payload == {
        "raw": "[DEV] Stub råtranskripsjon",
        "clean": "[DEV] Stub renskrevet tekst",
    }


def test_submit_job_stubbed(tmp_path: Path, stubbed_main):
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    job_id = "job-123"
    stubbed_main.JOBS[job_id] = {"status": "queued", "result": None, "error": None}

    stubbed_main._submit_job(str(audio_path), "summary", True, job_id)

    job = stubbed_main.JOBS[job_id]
    assert job["status"] == "done"
    assert job["result"] == {
        "raw": "[DEV] Stub råtranskripsjon",
        "clean": "[DEV] Stub renskrevet tekst",
    }
