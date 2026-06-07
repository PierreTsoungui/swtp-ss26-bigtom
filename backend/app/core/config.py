"""Liest und validiert die zentrale Backend-Konfiguration."""

import os
from pathlib import Path


def _get_positive_float(name: str, default: float) -> float:
    """Liest eine positive Kommazahl aus der Umgebung."""
    raw_value = os.getenv(name, str(default))
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number, got {raw_value!r}") from exc

    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _get_positive_int(name: str, default: int) -> int:
    """Liest eine positive Ganzzahl aus der Umgebung."""
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw_value!r}") from exc

    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


JOB_BASE_DIR = Path(os.getenv("JOB_BASE_DIR", "./jobs"))
JOB_RETENTION_HOURS = _get_positive_float("JOB_RETENTION_HOURS", 24)
JOB_CLEANUP_INTERVAL_SECONDS = _get_positive_int(
    "JOB_CLEANUP_INTERVAL_SECONDS",
    86400,
)
