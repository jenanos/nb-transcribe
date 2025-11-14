"""Database configuration and persistence helpers for transcription results."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, JSON, String, Text, create_engine
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
    clean_transcript: Mapped[Optional[str]] = mapped_column(Text)
    rewrite_mode: Mapped[Optional[str]] = mapped_column(String(64))
    rewrite_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    prompt: Mapped[Optional[str]] = mapped_column(Text)
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
    """Initialises the database connection and creates tables when configured."""

    global _ENGINE, _SESSION_FACTORY
    if _ENGINE is not None:
        return

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.info("DATABASE_URL not set; skipping database initialisation.")
        return

    _ENGINE = create_engine(database_url, future=True)
    _SESSION_FACTORY = sessionmaker(bind=_ENGINE, expire_on_commit=False)

    try:
        Base.metadata.create_all(_ENGINE)
        logger.info("Database initialised and tables ready.")
    except SQLAlchemyError as exc:  # pragma: no cover - defensive logging
        logger.error("Failed to create tables: %s", exc)
        _ENGINE = None
        _SESSION_FACTORY = None
        raise


def save_transcription_record(
    *,
    job_id: str,
    raw_text: Optional[str],
    clean_text: Optional[str],
    rewrite_mode: Optional[str],
    rewrite_enabled: bool,
    prompt: Optional[str],
    metadata: Optional[Dict[str, Any]],
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """Persists a single transcription record when a job finishes."""

    if _SESSION_FACTORY is None:
        logger.debug("Database session factory missing; skipping persistence for job %s", job_id)
        return

    record = TranscriptionRecord(
        job_id=job_id,
        raw_transcript=raw_text,
        clean_transcript=clean_text,
        rewrite_mode=rewrite_mode,
        rewrite_enabled=rewrite_enabled,
        prompt=prompt,
        audio_duration_seconds=(metadata or {}).get("audio_duration_seconds"),
        input_size_bytes=(metadata or {}).get("input_size_bytes"),
        original_filename=(metadata or {}).get("original_filename"),
        model_id=(metadata or {}).get("model_id"),
        metadata_json=metadata,
        completed_at=datetime.now(timezone.utc),
        status=status,
        error_message=error_message,
    )

    try:
        with _SESSION_FACTORY() as session:  # type: ignore[misc]
            session.add(record)
            session.commit()
    except SQLAlchemyError as exc:
        logger.error("Failed to persist transcription %s: %s", job_id, exc)
