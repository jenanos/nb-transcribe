"""Database configuration and persistence helpers for transcription results."""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import BigInteger, DateTime, Float, JSON, String, Text, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy ORM models."""


class TranscriptionRecord(Base):
    """ORM model that stores a transcription job and its metadata."""

    __tablename__ = "transcription_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text)
    audio_duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    input_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    original_filename: Mapped[Optional[str]] = mapped_column(String(512))
    model_id: Mapped[Optional[str]] = mapped_column(String(255))
    metadata_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="done")
    error_message: Mapped[Optional[str]] = mapped_column(Text)


_ENGINE = None
_SESSION_FACTORY: Optional[sessionmaker[Session]] = None


def setup_database() -> None:
    """Initialises the database connection and creates tables when configured.

    Retries a few times so the backend survives losing the startup race
    against Postgres (docker-compose ``depends_on`` does not wait for the
    database to accept connections). If the database stays unreachable the
    app continues without persistence instead of crashing.
    """

    global _ENGINE, _SESSION_FACTORY
    if _ENGINE is not None:
        return

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.info("DATABASE_URL not set; skipping database initialisation.")
        return

    retries = max(1, int(os.environ.get("DATABASE_CONNECT_RETRIES", "5")))
    retry_delay = float(os.environ.get("DATABASE_CONNECT_RETRY_DELAY", "2"))

    engine = create_engine(database_url)
    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(engine)
        except SQLAlchemyError as exc:
            if attempt == retries:
                logger.error(
                    "Database unavailable after %d attempts; continuing without persistence: %s",
                    retries,
                    exc,
                )
                return
            logger.warning(
                "Database not ready (attempt %d/%d), retrying in %.1fs: %s",
                attempt,
                retries,
                retry_delay,
                exc,
            )
            time.sleep(retry_delay)
        else:
            _ENGINE = engine
            _SESSION_FACTORY = sessionmaker(bind=engine, expire_on_commit=False)
            logger.info("Database initialised and tables ready.")
            return


def is_database_configured() -> bool:
    """Returns True when a database engine/session factory is available."""

    return _SESSION_FACTORY is not None


def save_transcription_record(
    *,
    job_id: str,
    raw_text: Optional[str],
    metadata: Optional[Dict[str, Any]],
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """Persists a single transcription record when a job finishes."""

    if _SESSION_FACTORY is None:
        logger.debug("Database session factory missing; skipping persistence for job %s", job_id)
        return

    try:
        with _SESSION_FACTORY() as session:  # type: ignore[misc]
            # Check if record exists
            record = (
                session.query(TranscriptionRecord)
                .filter(TranscriptionRecord.job_id == job_id)
                .first()
            )

            if record:
                # Update existing record
                if raw_text is not None:
                    record.raw_transcript = raw_text
                
                # Update metadata fields if present in metadata dict
                if metadata:
                    if "audio_duration_seconds" in metadata:
                        record.audio_duration_seconds = metadata["audio_duration_seconds"]
                    if "input_size_bytes" in metadata:
                        record.input_size_bytes = metadata["input_size_bytes"]
                    if "original_filename" in metadata:
                        record.original_filename = metadata["original_filename"]
                    if "model_id" in metadata:
                        record.model_id = metadata["model_id"]
                    
                    # Merge or replace metadata_json? Let's replace for simplicity, 
                    # or merge if we want to be fancy. Replacing is safer for now 
                    # to ensure we don't have stale keys, but we should be careful.
                    # Given the usage, we usually pass the full metadata object.
                    record.metadata_json = metadata

                record.status = status
                if error_message is not None:
                    record.error_message = error_message
                
                # If status is done or error, set completed_at if not set?
                # Or just update completed_at every time we save with a terminal status?
                if status in ("done", "error"):
                    record.completed_at = datetime.now(timezone.utc)

            else:
                # Create new record
                record = TranscriptionRecord(
                    job_id=job_id,
                    raw_transcript=raw_text,
                    audio_duration_seconds=(metadata or {}).get("audio_duration_seconds"),
                    input_size_bytes=(metadata or {}).get("input_size_bytes"),
                    original_filename=(metadata or {}).get("original_filename"),
                    model_id=(metadata or {}).get("model_id"),
                    metadata_json=metadata,
                    completed_at=datetime.now(timezone.utc) if status in ("done", "error") else None,
                    status=status,
                    error_message=error_message,
                )
                session.add(record)
            
            session.commit()
    except SQLAlchemyError as exc:
        logger.error("Failed to persist transcription %s: %s", job_id, exc)


def list_transcription_records(limit: int = 50) -> list[dict[str, Any]]:
    """Returns the most recent transcription records as dictionaries."""

    if _SESSION_FACTORY is None:
        logger.debug("Database session factory missing; cannot list transcriptions")
        return []

    try:
        with _SESSION_FACTORY() as session:  # type: ignore[misc]
            records = (
                session.query(TranscriptionRecord)
                .order_by(TranscriptionRecord.created_at.desc())
                .limit(limit)
                .all()
            )

        return [
            {
                "id": record.id,
                "job_id": record.job_id,
                "raw_transcript": record.raw_transcript,
                "audio_duration_seconds": record.audio_duration_seconds,
                "input_size_bytes": record.input_size_bytes,
                "original_filename": record.original_filename,
                "model_id": record.model_id,
                "metadata_json": record.metadata_json,
                "created_at": record.created_at.isoformat() if record.created_at else None,
                "completed_at": record.completed_at.isoformat()
                if record.completed_at
                else None,
                "status": record.status,
                "error_message": record.error_message,
            }
            for record in records
        ]
    except SQLAlchemyError as exc:
        logger.error("Failed to list transcriptions: %s", exc)
        return []


def get_transcription_record(job_id: str) -> Optional[Dict[str, Any]]:
    """Fetches a single transcription record by job_id."""
    if _SESSION_FACTORY is None:
        return None

    try:
        with _SESSION_FACTORY() as session:
            record = (
                session.query(TranscriptionRecord)
                .filter(TranscriptionRecord.job_id == job_id)
                .first()
            )

            if not record:
                return None

            return {
                "id": record.id,
                "job_id": record.job_id,
                "raw": record.raw_transcript,
                "metadata": {
                    "audio_duration_seconds": record.audio_duration_seconds,
                    "input_size_bytes": record.input_size_bytes,
                    "original_filename": record.original_filename,
                    "model_id": record.model_id,
                    **(record.metadata_json or {}),
                },
                "status": record.status,
                "error": record.error_message,
                "created_at": record.created_at.timestamp() if record.created_at else None,
            }
    except SQLAlchemyError as exc:
        logger.error("Failed to get transcription %s: %s", job_id, exc)
        return None
