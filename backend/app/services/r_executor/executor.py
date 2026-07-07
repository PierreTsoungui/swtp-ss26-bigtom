"""Run R commands in the Docker worker and stream their structured output."""
import asyncio
import logging
import re
from typing import Optional, Callable, Awaitable

from app.core.resource_governor import governor
from app.services.r_executor.commands.base import RCommand
from app.services.r_executor.protocol import extract_json_objects
from app.services.r_executor.result import ExecutionResult, ExecutionStatus

logger = logging.getLogger(__name__)

# R writes its own package-loading banners ("Loading required package: ...",
# "Attaching package", "masked from", ...) to stderr. Those are noise. Only
# lines that look like a real diagnostic are logged at WARNING; everything else
# on stderr drops to DEBUG so genuine warnings/errors are not buried.
# Leading word boundary only, so prefixes match too (Warning, errors, failed,
# halted) while avoiding mid-word hits (e.g. "terror").
_R_STDERR_ALERT = re.compile(r"(?i)\b(error|warn|fehler|cannot|fail|halt)")


async def run_r_script(
    command: RCommand,
    cancel_event: asyncio.Event,
    on_progress: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> ExecutionResult:
    """Run an R command inside the Docker worker and stream its output.

    The executor is mode-agnostic: it starts the subprocess, drains both
    output streams, forwards structured progress messages via ``on_progress``,
    and resolves to exactly one :class:`ExecutionStatus`. Cancellation is
    cooperative — callers signal ``cancel_event`` and the executor owns the
    actual process kill, so no one else races on the subprocess handle.
    """
    try:
        cmd = command.build_cmd()
    except Exception:
        # A command that cannot assemble its argv is a programming error, but
        # we must not let it crash the background task — fail it cleanly.
        logger.exception("Failed to build R command: job_id=%s", command.job_id)
        return ExecutionResult(
            status=ExecutionStatus.FAILED,
            returncode=None,
            stdout="",
            stderr="Command construction failed",
        )

    logger.info("R command prepared: job_id=%s mode=%s", command.job_id, command.mode_label)

    async def _queued_notice() -> None:
        """Tell the UI the job is waiting for a free compute slot (backpressure)."""
        if on_progress is not None:
            await on_progress({
                "status": "running",
                "current_step": "Queued — waiting for free compute capacity...",
            })

    # Admission control: hold a memory+core slot for the entire subprocess
    # lifetime so concurrent jobs cannot oversubscribe the host and trigger the
    # OOM-killer (see app.core.resource_governor). Under load this QUEUES the job
    # instead of crashing the server; the container mem_limit is the hard backstop.
    async with governor.slot(
        command.mem_gb, command.cores,
        label=command.mode_label, on_wait=_queued_notice,
    ):
        return await _run_subprocess(command, cancel_event, on_progress, cmd)


async def _run_subprocess(
    command: RCommand,
    cancel_event: asyncio.Event,
    on_progress: Optional[Callable[[dict], Awaitable[None]]],
    cmd: list[str],
) -> ExecutionResult:
    """Start the built R command, stream its output, and resolve the result.

    Extracted from :func:`run_r_script` so the resource-governor slot can wrap the
    whole subprocess lifetime (start → drain → reap) without deeply nesting the
    streaming logic. Behaviour is unchanged from the original inline body.
    """
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        logger.info("R subprocess started: job_id=%s pid=%s", command.job_id, process.pid)
    except Exception:
        logger.exception("Failed to start R subprocess: job_id=%s", command.job_id)
        return ExecutionResult(
            status=ExecutionStatus.FAILED,
            returncode=None,
            stdout="",
            stderr="Subprocess start failed",
        )

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []
    # Holds the message of the last {"type":"error"} the R script emitted on
    # stdout. Surfaced via ExecutionResult.extra["r_error"] so callers can show
    # the real cause instead of a generic fallback.
    protocol: dict[str, Optional[str]] = {"r_error": None}

    async def forward_progress(line: str) -> None:
        """Translate R's JSON protocol into ``on_progress`` calls, capturing state.

        Runs even when ``on_progress`` is None so the error message is always
        recorded.
        """
        for data in extract_json_objects(line):
            msg_type = data.get("type")
            if msg_type == "error":
                protocol["r_error"] = data.get("message")
            if on_progress is None:
                continue
            if msg_type == "progress":
                await on_progress(data)
            elif msg_type == "error":
                await on_progress({
                    "status":       "failed",
                    "current_step": "Pipeline aborted due to an R error",
                    "error": {
                        "title":  "Pipeline Execution Error",
                        "status": 500,
                        "detail": data.get("message", "Unknown R error."),
                    },
                })
            elif msg_type == "done":
                await on_progress({
                    "status":           "running",
                    "progress_percent": 100,
                    "current_step":     "Script processing finished",
                })

    async def read_stream(stream: asyncio.StreamReader, sink: list[str], is_stdout: bool) -> None:
        """Read a stream to EOF, accumulating lines and forwarding progress.

        The loop is resilient by design: a failure while handling a single
        line (e.g. a misbehaving ``on_progress`` callback) is logged but never
        aborts reading, so we always capture the full output for ``parse_stdout``.
        """
        while True:
            line = await stream.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").strip()
            sink.append(decoded)
            if is_stdout:
                logger.debug("R_STDOUT: job_id=%s line=%s", command.job_id, decoded)
                try:
                    await forward_progress(decoded)
                except Exception:
                    logger.exception("Progress forwarding failed: job_id=%s", command.job_id)
            else:
                level = logging.WARNING if _R_STDERR_ALERT.search(decoded) else logging.DEBUG
                logger.log(level, "R_STDERR: job_id=%s line=%s", command.job_id, decoded)

    # The subprocess was created with PIPE for both streams, so neither is None.
    assert process.stdout is not None and process.stderr is not None
    stdout_task = asyncio.create_task(read_stream(process.stdout, stdout_lines, is_stdout=True))
    stderr_task = asyncio.create_task(read_stream(process.stderr, stderr_lines, is_stdout=False))
    # Completes once BOTH streams hit EOF, which happens when the subprocess
    # closes its pipes on exit. Waiting on this (rather than process.wait())
    # guarantees we have read every byte before resolving the result.
    readers_task = asyncio.ensure_future(
        asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
    )
    cancel_wait_task = asyncio.create_task(cancel_event.wait())

    execution_status: ExecutionStatus = ExecutionStatus.FAILED
    returncode: int | None = None

    try:
        pending: set[asyncio.Future] = {readers_task, cancel_wait_task}
        done, _ = await asyncio.wait(
            pending,
            timeout=command.timeout_seconds,
            return_when=asyncio.FIRST_COMPLETED,
        )

        if cancel_wait_task in done:
            logger.info("Cancellation signal received: job_id=%s", command.job_id)
            execution_status = ExecutionStatus.CANCELLED
        elif not done:
            logger.error(
                "R script timeout: job_id=%s limit_seconds=%s",
                command.job_id, command.timeout_seconds,
            )
            execution_status = ExecutionStatus.TIMEOUT
        else:
            # Streams drained -> the process has finished writing. Reap it.
            for outcome in readers_task.result():
                if isinstance(outcome, Exception):
                    logger.error(
                        "R stream reader failed: job_id=%s", command.job_id, exc_info=outcome
                    )
            returncode = await process.wait()
            execution_status = (
                ExecutionStatus.COMPLETED if returncode == 0 else ExecutionStatus.FAILED
            )

    except Exception:
        logger.exception("Unexpected error during R execution: job_id=%s", command.job_id)
        execution_status = ExecutionStatus.FAILED

    finally:
        cancel_wait_task.cancel()
        if not readers_task.done():
            readers_task.cancel()

        # The executor is the only place that kills the process. On cancel /
        # timeout the subprocess is still alive here.
        if process.returncode is None:
            try:
                process.kill()
                returncode = await process.wait()
            except ProcessLookupError:
                pass
            except Exception:
                logger.exception("Failed to terminate R process: job_id=%s", command.job_id)

        # Settle every task (incl. the gather wrapper) so no exception — most
        # notably the CancelledError raised when we cancel a reader — is left
        # unretrieved and logged by the event loop.
        await asyncio.gather(
            readers_task, stdout_task, stderr_task, cancel_wait_task,
            return_exceptions=True,
        )

    final_result = ExecutionResult(
        status=execution_status,
        returncode=returncode,
        stdout="\n".join(stdout_lines),
        stderr="\n".join(stderr_lines),
    )
    if protocol["r_error"]:
        final_result.extra["r_error"] = protocol["r_error"]

    # Optional post-processing (file I/O, plot extraction). A failing hook must
    # not mask the execution status, so it is isolated.
    try:
        final_result = command.parse_stdout(final_result)
    except Exception:
        logger.exception("parse_stdout hook failed: job_id=%s", command.job_id)

    logger.info(
        "R subprocess finished: job_id=%s returncode=%s status=%s",
        command.job_id, returncode, execution_status.value,
    )
    return final_result
