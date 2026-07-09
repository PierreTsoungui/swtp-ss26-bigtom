# app/services/staging_manager.py
"""Lifecycle of staging sessions for the folder/ZIP upload.

A *staging session* is a temporary directory holding an unconfirmed upload while
the user reviews it. It is identified by a UUID ``session_id`` and lives under
``STAGING_BASE_DIR`` (a sibling of the job directory). The actual TTL cleanup
reuses the generic ``job_cleanup_service`` loop (started in ``main.py``); this
module owns only the path handling, creation, lookup and expiry semantics.

Security: ``session_id`` always comes from the client on commit/preview/delete,
so it is strictly validated as a UUID and the resolved directory must stay
inside ``STAGING_BASE_DIR`` — a session id can never be used for path traversal.
"""
import logging
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import STAGING_BASE_DIR, STAGING_RETENTION_HOURS
from app.core.error_types import AppException, ErrorTypes

logger = logging.getLogger(__name__)


def _base_dir() -> Path:
    STAGING_BASE_DIR.mkdir(parents=True, exist_ok=True)
    return STAGING_BASE_DIR.resolve()


def create_session() -> tuple[str, Path]:
    """Create a fresh staging directory and return ``(session_id, path)``."""
    session_id = str(uuid.uuid4())
    session_dir = _base_dir() / session_id
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_id, session_dir


def _resolve_session_dir(session_id: str) -> Path:
    """Validate the id and map it to its directory inside the staging base.

    Rejects anything that is not a UUID or that would resolve outside the base.
    """
    try:
        uuid.UUID(session_id)
    except (ValueError, AttributeError, TypeError):
        raise AppException(
            ErrorTypes.SESSION_NOT_FOUND, f"Invalid session id: {session_id!r}"
        ) from None

    base = _base_dir()
    session_dir = (base / session_id).resolve()
    if not session_dir.is_relative_to(base):
        raise AppException(ErrorTypes.SESSION_NOT_FOUND, "Invalid session id.")
    return session_dir


def _is_expired(session_dir: Path) -> bool:
    try:
        age_seconds = time.time() - session_dir.stat().st_mtime
        return age_seconds > STAGING_RETENTION_HOURS * 3600
    except OSError:
        return True  # concurrent cleanup already removed the directory


def require_session(session_id: str) -> Path:
    """Return the session directory, or raise NOT_FOUND / EXPIRED.

    Every successful call touches the directory mtime so that the TTL window
    slides forward with each user interaction (rolling expiry).  A user who is
    actively reviewing the inspect result never loses the session mid-workflow;
    only truly abandoned sessions expire after STAGING_RETENTION_HOURS of
    inactivity.
    """
    session_dir = _resolve_session_dir(session_id)
    if not session_dir.is_dir():
        raise AppException(ErrorTypes.SESSION_NOT_FOUND, f"Upload session not found: {session_id}")
    if _is_expired(session_dir):
        delete_session(session_id)
        raise AppException(ErrorTypes.SESSION_EXPIRED, "The upload session has expired.")
    try:
        os.utime(session_dir, None)  # rolling TTL: reset expiry on every access
    except OSError:
        pass  # concurrent cleanup already removed the directory; next call will return NOT_FOUND
    return session_dir


def expires_at(session_dir: Path) -> str:
    """ISO-8601 expiry timestamp for a session directory (UTC)."""
    expiry = session_dir.stat().st_mtime + STAGING_RETENTION_HOURS * 3600
    return datetime.fromtimestamp(expiry, tz=timezone.utc).isoformat()


def delete_session(session_id: str) -> None:
    """Remove a staging directory (idempotent)."""
    session_dir = _resolve_session_dir(session_id)
    shutil.rmtree(session_dir, ignore_errors=True)
