"""Reads and validates the central backend configuration.

Every tunable is sourced from an environment variable with a sensible default,
so the same image runs unchanged across dev/CI/production and can be overridden
without code changes.
"""

import os
from pathlib import Path


def _get_positive_float(name: str, default: float) -> float:
    """Read a positive float from the environment."""
    raw_value = os.getenv(name, str(default))
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number, got {raw_value!r}") from exc

    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _get_positive_int(name: str, default: int) -> int:
    """Read a positive integer from the environment."""
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw_value!r}") from exc

    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _get_csv_list(name: str, default: str) -> list[str]:
    """Read a comma-separated environment variable into a list of trimmed values."""
    raw_value = os.getenv(name, default)
    return [item.strip() for item in raw_value.split(",") if item.strip()]


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
STAGING_BASE_DIR = Path(os.getenv("STAGING_BASE_DIR", "./staging"))
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

# ── Upload limits ─────────────────────────────────────────────────────────────
# Byte ceilings for an upload, configured in megabytes for readability. The IDAT
# payload of a typical run is ~30 MB; the generous default leaves headroom for
# larger studies. The sample sheet is always small.
MAX_TOTAL_UPLOAD_BYTES = _get_positive_int("MAX_TOTAL_UPLOAD_MB", 900) * 1024 * 1024
MAX_SAMPLE_SHEET_BYTES = _get_positive_int("MAX_SAMPLE_SHEET_MB", 10) * 1024 * 1024

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allowed browser origins for the API. Defaults to the local dev frontends; in
# production set CORS_ALLOWED_ORIGINS to the deployed frontend origin(s), e.g.
# "https://app.example.com". Comma-separated. A literal "*" disables the origin
# allowlist (not recommended together with credentials).
CORS_ALLOWED_ORIGINS = _get_csv_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:8080,https://localhost,https://127.0.0.1",
)
