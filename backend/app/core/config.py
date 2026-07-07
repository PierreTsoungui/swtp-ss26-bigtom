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

# ── Staging (folder/ZIP upload inspect) ───────────────────────────────────────
# Unconfirmed uploads live here until the user commits a selection. Kept as a
# sibling of JOB_BASE_DIR so the commit can move files atomically (same
# filesystem) into the final job directory.
STAGING_BASE_DIR = Path(os.environ.get("JOB_BASE_DIR", "/app/jobs")) / "staging"
STAGING_RETENTION_HOURS = _get_positive_float("STAGING_RETENTION_HOURS", 2)
STAGING_CLEANUP_INTERVAL_SECONDS = _get_positive_int(
    "STAGING_CLEANUP_INTERVAL_SECONDS",
    900,  # 15 minutes
)

# ── R compute parallelism ─────────────────────────────────────────────────────
# Cores handed to dmr.R for its bootstrap step (the heaviest, embarrassingly
# parallel R workload). dmr.R itself caps this at the host's physical cores
# (min(nCores, detectCores)), so values above the available cores are harmless.
# The bootstrap workers are separate R processes, each still single-threaded for
# BLAS — so this does not nest threads or fight the container's *_NUM_THREADS=1.
# A conservative default keeps headroom when several jobs run at once.
DMR_CORES = _get_positive_int("DMR_CORES", 4)
