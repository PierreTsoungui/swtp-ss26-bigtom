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


def _get_nonneg_int(name: str, default: int) -> int:
    """Liest eine Ganzzahl >= 0 (0 = deaktiviert/unbegrenzt)."""
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw_value!r}") from exc
    if value < 0:
        raise ValueError(f"{name} must be >= 0")
    return value


def _get_nonneg_float(name: str, default: float) -> float:
    """Liest eine Kommazahl >= 0 (0 = deaktiviert/unbegrenzt)."""
    raw_value = os.getenv(name, str(default))
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number, got {raw_value!r}") from exc
    if value < 0:
        raise ValueError(f"{name} must be >= 0")
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
#
# ⚠️ MEMORY: each core is a separate Bumphunter worker holding a FULL COPY of the
# beta matrix, so DMR peak RAM scales ~linearly with this. Default 1 keeps DMR to
# a single copy (~5 GiB instead of ~11 GiB at 3 cores) — raise only on machines
# with RAM to spare, and keep PIPELINE_DMR_MEMORY_GB in sync with the real peak.
DMR_CORES = _get_positive_int("DMR_CORES", 1)

# ── Deployment resource budget (single source of truth for admission control) ──
# The backend runs every R step inside the ONE r_worker container, so unbounded
# concurrent uploads would oversubscribe the host's RAM and trigger the kernel
# OOM-killer (SIGKILL) — taking the whole server down. To prevent that, heavy R
# work is admitted through a weighted queue (see app.core.resource_governor): a
# step only starts once its estimated memory AND core need fits the remaining
# budget; otherwise it QUEUES until capacity frees up (graceful slow-down instead
# of a crash).
#
# DEPLOYMENT: set these to the target machine's budget, leaving headroom for the
# OS/other services. Mirror PIPELINE_MEMORY_BUDGET_GB / PIPELINE_CORE_BUDGET with
# the r_worker container's mem_limit / cpus in docker-compose.yml (the hard wall
# that guarantees the host survives even if an estimate is wrong).
#
# Effective parallelism is derived, not fixed:
#   max_parallel(step) ~= min(BUDGET_MEM / step_mem, BUDGET_CORES / step_cores)
PIPELINE_MEMORY_BUDGET_GB = _get_positive_float("PIPELINE_MEMORY_BUDGET_GB", 12.0)
PIPELINE_CORE_BUDGET = _get_positive_int("PIPELINE_CORE_BUDGET", 2)

# Per-step peak-memory estimates (GiB), from the benchmark suite (benchmarks/).
# DMR bootstrap is by far the heaviest; DMP is moderate; everything else uses the
# default. A step whose estimate exceeds the whole budget is allowed to run alone
# (clamped) rather than deadlocking.
PIPELINE_STEP_MEMORY_GB = _get_positive_float("PIPELINE_STEP_MEMORY_GB", 5.0)
PIPELINE_DMR_MEMORY_GB = _get_positive_float("PIPELINE_DMR_MEMORY_GB", 6.0)
PIPELINE_DMP_MEMORY_GB = _get_positive_float("PIPELINE_DMP_MEMORY_GB", 4.0)

# ── Intake guards (0 = disabled/unlimited) ────────────────────────────────────
# Per-job cohort cap: memory scales with the sample count, so an oversized upload
# would need far more RAM than the budget. Rejecting it early at commit gives a
# clear message instead of a job that later gets OOM-killed at DMR. Tune to the
# RAM budget (benchmark first); the hard container mem_limit remains the backstop.
MAX_SAMPLES_PER_JOB = _get_nonneg_int("MAX_SAMPLES_PER_JOB", 48)

# Total-disk cap for all job directories combined. A new upload is refused once
# JOB_BASE_DIR already holds this many GiB, so the pipeline cannot fill the disk
# (which would corrupt running jobs). 0 = unlimited; size it to the machine's
# disk, above JOB_RETENTION_HOURS worth of expected traffic.
MAX_JOBS_DISK_GB = _get_nonneg_float("MAX_JOBS_DISK_GB", 0.0)
