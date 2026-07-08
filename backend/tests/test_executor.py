"""Tests for the R executor lifecycle.

The executor is exercised end-to-end with a controlled subprocess (the running
Python interpreter standing in for ``docker exec Rscript``), so cancellation,
timeout, output streaming and error extraction are verified against real process
behaviour without needing Docker or R.
"""
import asyncio
import sys
from dataclasses import dataclass, field

from app.services.r_executor.commands.base import RCommand
from app.services.r_executor.executor import run_r_script
from app.services.r_executor.result import ExecutionStatus


@dataclass
class FakeCommand(RCommand):
    """An RCommand whose ``build_cmd`` returns an arbitrary local argv."""

    argv: list = field(default_factory=list)

    def build_cmd(self):
        return self.argv


@dataclass
class BrokenCommand(FakeCommand):
    """A command that cannot assemble its argv."""

    def build_cmd(self):
        raise RuntimeError("cannot build argv")


def _python(code: str, *, timeout_seconds: int = 30) -> FakeCommand:
    return FakeCommand(
        script="",
        job_id="test",
        job_dir="/tmp",
        sample_sheet="",
        timeout_seconds=timeout_seconds,
        argv=[sys.executable, "-u", "-c", code],
    )


def _run(command, cancel_event=None, on_progress=None):
    return asyncio.run(
        run_r_script(command, cancel_event or asyncio.Event(), on_progress)
    )


# ── Success / output streaming ────────────────────────────────────────────────

def test_successful_run_captures_output_and_forwards_progress():
    code = (
        "print('{\"type\": \"progress\", \"percent\": 50, \"message\": \"halfway\"}')\n"
        "print('plain log line')"
    )
    events = []

    async def on_progress(data):
        events.append(data)

    result = _run(_python(code), on_progress=on_progress)

    assert result.status is ExecutionStatus.COMPLETED
    assert result.returncode == 0
    assert "plain log line" in result.stdout
    assert {"type": "progress", "percent": 50, "message": "halfway"} in events


def test_nonzero_exit_is_reported_as_failed():
    result = _run(_python("import sys; sys.exit(3)"))
    assert result.status is ExecutionStatus.FAILED
    assert result.returncode == 3


def test_structured_r_error_is_captured_in_extra():
    code = (
        "print('{\"type\": \"error\", \"message\": \"No sample variance\"}')\n"
        "import sys; sys.exit(1)"
    )
    result = _run(_python(code))
    assert result.status is ExecutionStatus.FAILED
    assert result.extra.get("r_error") == "No sample variance"


def test_failing_progress_callback_does_not_break_streaming():
    code = (
        "print('{\"type\": \"progress\", \"percent\": 10}')\n"
        "print('line-2')\n"
        "print('line-3')"
    )

    async def bad_progress(data):
        raise RuntimeError("callback boom")

    result = _run(_python(code), on_progress=bad_progress)

    # The stream keeps draining despite the callback error.
    assert result.status is ExecutionStatus.COMPLETED
    assert "line-2" in result.stdout
    assert "line-3" in result.stdout


# ── Timeout / cancellation ────────────────────────────────────────────────────

def test_timeout_sets_timeout_status_and_kills_the_process(tmp_path):
    marker = tmp_path / "finished.marker"
    code = f"import time; time.sleep(5); open({str(marker)!r}, 'w').close()"
    result = _run(_python(code, timeout_seconds=1))

    assert result.status is ExecutionStatus.TIMEOUT
    # The subprocess was killed before it could complete its work.
    assert not marker.exists()


def test_cancellation_terminates_the_process(tmp_path):
    marker = tmp_path / "finished.marker"
    code = f"import time; time.sleep(5); open({str(marker)!r}, 'w').close()"
    cancel = asyncio.Event()
    cancel.set()  # a reset requested cancellation before/at start

    result = _run(_python(code, timeout_seconds=30), cancel_event=cancel)

    assert result.status is ExecutionStatus.CANCELLED
    assert not marker.exists()


# ── Command construction failure ──────────────────────────────────────────────

def test_command_build_failure_fails_cleanly():
    command = BrokenCommand(script="", job_id="test", job_dir="/tmp", sample_sheet="")
    result = _run(command)
    assert result.status is ExecutionStatus.FAILED
    assert "Command construction failed" in result.stderr
