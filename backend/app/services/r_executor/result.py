from enum import Enum
from dataclasses import dataclass, field
from typing import Any


class ExecutionStatus(str, Enum):
    COMPLETED = "completed"
    FAILED    = "failed"
    CANCELLED = "cancelled"
    TIMEOUT   = "timeout"


@dataclass
class ExecutionResult:
    status:     ExecutionStatus
    returncode: int | None
    stdout:     str
    stderr:     str
    extra:      dict[str, Any] = field(default_factory=dict)

    @property
    def is_success(self) -> bool:
        return self.status == ExecutionStatus.COMPLETED

    @property
    def is_cancelled(self) -> bool:
        return self.status == ExecutionStatus.CANCELLED

    @property
    def is_timeout(self) -> bool:
        return self.status == ExecutionStatus.TIMEOUT