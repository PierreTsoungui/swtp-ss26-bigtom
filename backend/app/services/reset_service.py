# app/services/reset_service.py
"""
Reset orchestration for a single job.

A reset must tear a job down cleanly no matter what state it is in: idle,
running an R subprocess, or racing toward completion. The flow is always the
same — claim an exclusive reset slot, signal cooperative cancellation, wait for
the background task to wind down (forcing it if it ignores the signal), then
purge every trace of the job from the registries.

The cancellation contract this builds on (see r_executor_spec.md, section 6):

  * The executor owns the R subprocess and kills it when the cancel event is
    set; no one else touches the process.
  * Pipeline services return cleanly on cancellation without writing a final
    status — the reset is responsible for deleting the job.
  * `job_manager.begin_reset()` marks the job so any trailing state transition
    from the still-draining task becomes a silent no-op instead of a crash.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.services import file_handler, job_manager
from app.services.job_manager import JobStatusValue

logger = logging.getLogger(__name__)

# How long to wait for a running pipeline task to honor the cancel signal
# before we cancel it hard.
CANCEL_GRACE_PERIOD_SECONDS = 5.0


@dataclass(frozen=True)
class ResetOutcome:
    """Result of a reset attempt, translated to HTTP by the route layer."""

    found: bool
    was_running: bool
    already_in_progress: bool = False


async def reset_job(job_id: str) -> ResetOutcome:
    """Cancel (if needed) and permanently delete a job and its data.

    This is the user-facing "delete my data now" action, so the guarantee is:
    when this returns successfully, no data for ``job_id`` remains on disk. To
    make that guarantee real, the order is deliberate:

      1. stop any running R work and wait for it to actually terminate, so it can
         no longer write into the job directory;
      2. purge the in-memory registries;
      3. delete the job directory from disk and verify it is gone.

    Deleting before the R subprocess is stopped would be unsafe — the still-running
    process could recreate files after the deletion. A job is considered present
    if either its in-memory record OR its on-disk directory exists, so a completed
    job whose in-memory record was already evicted can still be deleted.

    Idempotent and concurrency-safe.

    Raises:
        OSError: If the job directory cannot be fully removed (the caller must
            then NOT report success — the route maps this to an HTTP 500).
    """
    # Exactly one reset may run per job. A second concurrent request returns
    # immediately rather than racing on the same teardown.
    if not job_manager.begin_reset(job_id):
        logger.info("[reset] Reset already in progress: job_id=%s", job_id)
        return ResetOutcome(found=True, was_running=False, already_in_progress=True)

    try:
        job = job_manager.get_job(job_id)
        dir_exists = file_handler.job_dir_exists(job_id)

        # Nothing anywhere (neither in memory nor on disk) → genuinely not found.
        if job is None and not dir_exists:
            logger.info("[reset] Job not found: job_id=%s", job_id)
            return ResetOutcome(found=False, was_running=False)

        was_running = job is not None and job.status == JobStatusValue.RUNNING.value

        # 1. Stop in-flight R work FIRST so it cannot recreate files after we
        #    delete them. Signal unconditionally: an in-flight task or cancel
        #    event may still exist even if the reported status briefly lags
        #    behind. Both calls are safe no-ops when nothing is in flight.
        if job_manager.trigger_cancel(job_id):
            logger.info("[reset] Cancel signal sent: job_id=%s", job_id)
        await _await_task_shutdown(job_id)

        # 2. Purge the in-memory registries. The pipeline task's own finally
        #    normally clears the cancel-event/task registrations already; these
        #    calls are an idempotent safety net for the forced-cancel path.
        job_manager.delete_job(job_id)
        job_manager.unregister_cancel_event(job_id)
        job_manager.unregister_job_task(job_id)

        # 3. Delete the job's data from disk. This must succeed before we report
        #    success — the response is a guarantee that the data is gone.
        file_handler.delete_job_files(job_id)

        logger.info(
            "[reset] Job reset complete: job_id=%s was_running=%s", job_id, was_running
        )
        return ResetOutcome(found=True, was_running=was_running)
    finally:
        job_manager.end_reset(job_id)


async def _await_task_shutdown(job_id: str) -> None:
    """Wait for the job's pipeline task to finish after the cancel signal.

    Uses ``asyncio.wait`` (not ``wait_for``): it observes completion without
    cancelling the task on timeout, so a task that needs a little longer keeps
    running. Only if the grace period elapses do we cancel it hard and wait for
    its finally-block to release registrations and kill the R subprocess.
    """
    task = job_manager.get_job_task(job_id)
    if task is None or task.done():
        return

    done, _ = await asyncio.wait({task}, timeout=CANCEL_GRACE_PERIOD_SECONDS)
    if done:
        return

    logger.warning(
        "[reset] Task did not react within %.1fs, forcing cancel: job_id=%s",
        CANCEL_GRACE_PERIOD_SECONDS, job_id,
    )
    task.cancel()
    # asyncio.wait never re-raises the task's CancelledError, so this simply
    # gives the forced task a bounded window to run its cleanup.
    await asyncio.wait({task}, timeout=CANCEL_GRACE_PERIOD_SECONDS)
