import pytest
from sqlalchemy.exc import OperationalError

import database


@pytest.fixture()
def clean_database(monkeypatch):
    """Nullstill modul-globalene slik at hver test starter uten engine."""
    monkeypatch.setattr(database, "_ENGINE", None)
    monkeypatch.setattr(database, "_SESSION_FACTORY", None)
    yield database
    # Rydd opp etter testen også, slik at andre tester ikke arver en engine
    database._ENGINE = None
    database._SESSION_FACTORY = None


def test_setup_database_skipped_without_url(clean_database, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    clean_database.setup_database()

    assert not clean_database.is_database_configured()


def test_setup_database_degrades_gracefully_when_db_unreachable(clean_database, monkeypatch):
    """Backend skal starte selv om databasen aldri blir tilgjengelig."""
    monkeypatch.setenv("DATABASE_URL", "sqlite:///ignored.db")
    monkeypatch.setenv("DATABASE_CONNECT_RETRIES", "2")
    monkeypatch.setenv("DATABASE_CONNECT_RETRY_DELAY", "0")

    def failing_create_all(*_args, **_kwargs):
        raise OperationalError("connect", {}, Exception("connection refused"))

    monkeypatch.setattr(database.Base.metadata, "create_all", failing_create_all)

    clean_database.setup_database()  # skal ikke kaste

    assert not clean_database.is_database_configured()


def test_setup_database_retries_until_db_is_ready(clean_database, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/retry.db")
    monkeypatch.setenv("DATABASE_CONNECT_RETRIES", "3")
    monkeypatch.setenv("DATABASE_CONNECT_RETRY_DELAY", "0")

    original_create_all = database.Base.metadata.create_all
    attempts = {"count": 0}

    def flaky_create_all(*args, **kwargs):
        attempts["count"] += 1
        if attempts["count"] < 2:
            raise OperationalError("connect", {}, Exception("not ready yet"))
        return original_create_all(*args, **kwargs)

    monkeypatch.setattr(database.Base.metadata, "create_all", flaky_create_all)

    clean_database.setup_database()

    assert attempts["count"] == 2
    assert clean_database.is_database_configured()


def test_save_get_and_list_roundtrip(clean_database, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/roundtrip.db")
    clean_database.setup_database()
    assert clean_database.is_database_configured()

    metadata = {
        "original_filename": "møte.m4a",
        "model_id": "nb-whisper-large",
        "audio_duration_seconds": 12.5,
        "input_size_bytes": 2048,
        "segment_count": 1,
    }
    clean_database.save_transcription_record(
        job_id="job-1",
        raw_text="hei på deg",
        metadata=metadata,
        status="done",
    )

    record = clean_database.get_transcription_record("job-1")
    assert record is not None
    assert record["raw"] == "hei på deg"
    assert record["status"] == "done"
    assert record["metadata"]["original_filename"] == "møte.m4a"
    assert record["metadata"]["audio_duration_seconds"] == 12.5

    items = clean_database.list_transcription_records()
    assert len(items) == 1
    assert items[0]["job_id"] == "job-1"
    assert items[0]["raw_transcript"] == "hei på deg"
    assert items[0]["completed_at"] is not None


def test_save_updates_existing_record(clean_database, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/update.db")
    clean_database.setup_database()

    clean_database.save_transcription_record(
        job_id="job-2",
        raw_text=None,
        metadata={"original_filename": "a.wav"},
        status="running",
    )
    clean_database.save_transcription_record(
        job_id="job-2",
        raw_text="ferdig tekst",
        metadata={"original_filename": "a.wav", "audio_duration_seconds": 3.0},
        status="done",
    )

    record = clean_database.get_transcription_record("job-2")
    assert record is not None
    assert record["status"] == "done"
    assert record["raw"] == "ferdig tekst"
    assert record["metadata"]["audio_duration_seconds"] == 3.0

    items = clean_database.list_transcription_records()
    assert len(items) == 1  # oppdatert, ikke duplisert


def test_get_missing_record_returns_none(clean_database, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/missing.db")
    clean_database.setup_database()

    assert clean_database.get_transcription_record("finnes-ikke") is None
