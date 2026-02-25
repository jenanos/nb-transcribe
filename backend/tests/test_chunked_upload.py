import io
import json
import os
import time

import pytest
from starlette.datastructures import UploadFile


@pytest.fixture()
def chunked_main(monkeypatch):
    """Import main and prepare it for chunked upload tests without requiring torch."""
    import main

    monkeypatch.setattr(main, "JOBS", {})
    monkeypatch.setattr(main, "CHUNKED_UPLOADS", {})
    # Prevent finalize from running the real pipeline
    monkeypatch.setattr(
        main,
        "_submit_job",
        lambda path, job_id, filename: None,
    )
    try:
        yield main
    finally:
        pass


@pytest.mark.asyncio
async def test_chunked_init(chunked_main):
    response = await chunked_main.chunked_init(filename="test.m4a")
    body = json.loads(response.body.decode())
    assert "upload_id" in body
    upload_id = body["upload_id"]
    assert upload_id in chunked_main.CHUNKED_UPLOADS
    info = chunked_main.CHUNKED_UPLOADS[upload_id]
    assert info["filename"] == "test.m4a"
    assert os.path.exists(info["path"])
    # Cleanup
    os.remove(info["path"])


@pytest.mark.asyncio
async def test_chunked_append(chunked_main):
    # Init
    response = await chunked_main.chunked_init(filename="test.m4a")
    upload_id = json.loads(response.body.decode())["upload_id"]

    # Append first chunk
    chunk1 = UploadFile(filename="test.m4a", file=io.BytesIO(b"AAAA" * 100))
    response = await chunked_main.chunked_append(upload_id, chunk1)
    await chunk1.close()
    body = json.loads(response.body.decode())
    assert body["status"] == "ok"

    # Append second chunk
    chunk2 = UploadFile(filename="test.m4a", file=io.BytesIO(b"BBBB" * 100))
    response = await chunked_main.chunked_append(upload_id, chunk2)
    await chunk2.close()
    body = json.loads(response.body.decode())
    assert body["status"] == "ok"

    # Verify combined content
    info = chunked_main.CHUNKED_UPLOADS[upload_id]
    with open(info["path"], "rb") as f:
        content = f.read()
    assert content == b"AAAA" * 100 + b"BBBB" * 100

    # Cleanup
    os.remove(info["path"])


@pytest.mark.asyncio
async def test_chunked_append_not_found(chunked_main):
    chunk = UploadFile(filename="test.m4a", file=io.BytesIO(b"data"))
    response = await chunked_main.chunked_append("nonexistent-id", chunk)
    await chunk.close()
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_chunked_finalize(chunked_main):
    # Init
    response = await chunked_main.chunked_init(filename="test.m4a")
    upload_id = json.loads(response.body.decode())["upload_id"]

    # Append data
    chunk = UploadFile(filename="test.m4a", file=io.BytesIO(b"fake-audio-data"))
    await chunked_main.chunked_append(upload_id, chunk)
    await chunk.close()

    # Finalize
    response = await chunked_main.chunked_finalize(upload_id)
    assert response.status_code == 202
    body = json.loads(response.body.decode())
    assert "job_id" in body
    assert body["status"] == "queued"

    # Verify job was created
    job_id = body["job_id"]
    assert job_id in chunked_main.JOBS
    assert chunked_main.JOBS[job_id]["status"] == "queued"

    # Verify upload was removed from CHUNKED_UPLOADS
    assert upload_id not in chunked_main.CHUNKED_UPLOADS


@pytest.mark.asyncio
async def test_chunked_finalize_not_found(chunked_main):
    response = await chunked_main.chunked_finalize("nonexistent-id")
    assert response.status_code == 404


def test_cleanup_chunked_uploads(chunked_main, tmp_path):
    import main

    # Create an expired upload
    expired_file = tmp_path / "expired.upload"
    expired_file.write_bytes(b"old data")
    expired_id = "expired-upload"
    main.CHUNKED_UPLOADS[expired_id] = {
        "path": str(expired_file),
        "filename": "old.m4a",
        "created_at": time.time() - main.CHUNKED_UPLOAD_TTL - 10,
    }

    # Create a fresh upload
    fresh_file = tmp_path / "fresh.upload"
    fresh_file.write_bytes(b"new data")
    fresh_id = "fresh-upload"
    main.CHUNKED_UPLOADS[fresh_id] = {
        "path": str(fresh_file),
        "filename": "new.m4a",
        "created_at": time.time(),
    }

    main._cleanup_chunked_uploads()

    assert expired_id not in main.CHUNKED_UPLOADS
    assert not expired_file.exists()
    assert fresh_id in main.CHUNKED_UPLOADS
    assert fresh_file.exists()

    # Cleanup
    fresh_file.unlink(missing_ok=True)
