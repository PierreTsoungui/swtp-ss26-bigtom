"""Abstract base for R commands: shared paths, timeout and the argv contract."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core import config

if TYPE_CHECKING:
    from app.services.r_executor.result import ExecutionResult


@dataclass
class RCommand(ABC):
    """Abstract base class for every executable R command.

    Holds the fields common to all commands (script, job, sample sheet) and the
    container/path helpers, and defines the ``build_cmd`` contract each concrete
    command implements.
    """

    script:       str
    job_id:       str
    job_dir:      str
    sample_sheet: str

    # Per-command wall-clock budget enforced by the executor. Compute-heavy
    # commands (DMR/DMP analysis) override this; the executor reads it instead
    # of assuming a single global limit.
    timeout_seconds: int = 600

    R_WORKER_CONTAINER = "swtp-ss26-bigtom-r_worker-1"

    # ── Admission-control weights (see app.core.resource_governor) ──
    # Estimated peak memory (GiB) and CPU cores this step needs. Deliberately
    # PLAIN class attributes (no annotation) so they are NOT dataclass fields and
    # never shift the constructor signature; heavy commands override them.
    mem_gb = config.PIPELINE_STEP_MEMORY_GB
    cores = 1

    @property
    def docker_job_dir(self) -> str:
        """Return the job directory as seen inside the R worker container."""
        return f"/app/jobs/{self.job_id}"

    @property
    def script_path(self) -> str:
        """Return the R script path inside the R worker container."""
        return f"/app/r_backend/{self.script}"

    @abstractmethod
    def build_cmd(self) -> list[str]:
        """Return the exact argument list for the ``docker exec`` invocation."""
        ...

    def parse_stdout(self, result: ExecutionResult) -> ExecutionResult:
        """Post-process the result (e.g. load JSON statistics); a no-op by default."""
        return result

    @property
    def mode_label(self) -> str:
        """Return a readable class name for structured logging."""
        return type(self).__name__