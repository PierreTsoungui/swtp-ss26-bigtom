"""Outcome types for a finished R execution."""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ExecutionStatus(StrEnum):
    """Terminal state of an R execution."""

    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class ExecutionResult:
    """Result of running an R command: status, exit code, captured output."""

    status: ExecutionStatus
    returncode: int | None
    stdout: str
    stderr: str
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def is_success(self) -> bool:
        """Return True if the command completed successfully."""
        return self.status == ExecutionStatus.COMPLETED

    @property
    def is_cancelled(self) -> bool:
        """Return True if the command was cancelled (e.g. by a reset)."""
        return self.status == ExecutionStatus.CANCELLED

    @property
    def is_timeout(self) -> bool:
        """Return True if the command was aborted after exceeding its timeout."""
        return self.status == ExecutionStatus.TIMEOUT
