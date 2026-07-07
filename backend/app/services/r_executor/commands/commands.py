"""Concrete R command definitions.

Each dataclass builds the ``docker exec ... Rscript ...`` argv for one R script
and, where needed, post-processes the result. They are the only place that knows
the argument order of a given R script.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.services.r_executor.commands.base import RCommand
from app.services.r_executor.result import ExecutionResult

logger = logging.getLogger(__name__)


@dataclass
class FilteringCommand(RCommand):
    """Run init_filter.R (probe/sample quality-control filtering)."""

    extra_args: list[str] = field(default_factory=list)

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for init_filter.R."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.sample_sheet}",
            self.docker_job_dir,
            *self.extra_args,
        ]

    def parse_stdout(self, result: ExecutionResult) -> ExecutionResult:
        """Attach filter_stats.json to ``result.extra`` after a successful run."""
        stats_path = Path(self.job_dir) / "filter_stats.json"
        if result.is_success and stats_path.exists():
            try:
                with open(stats_path, "r") as f:
                    result.extra["filter_stats"] = json.load(f)
                logger.info("filter_stats.json loaded: job_id=%s", self.job_id)
            except Exception:
                logger.exception("filter_stats.json could not be parsed: job_id=%s", self.job_id)
        return result


@dataclass
class NormalizationCommand(RCommand):
    """Run normalize.R for the chosen normalization method."""

    extra_args: list[str] = field(default_factory=list)

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for normalize.R."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class NormalizationPreviewCommand(RCommand):
    """Run normalization_preview.R (per-method density/PCA preview artifacts).

    No ``parse_stdout`` hook: the script does not emit ``{"type": "plot"}``
    messages (it only writes PNG/JSON files and progress). Plot discovery happens
    in ``normalization_preview_service`` via a directory scan, which is the single
    source of truth, so the base no-op ``parse_stdout`` is inherited.
    """

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for normalization_preview.R."""
        docker_sample_sheet = f"{self.docker_job_dir}/{Path(self.sample_sheet).name}"
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/filtered_data.rds",
            self.docker_job_dir,
            docker_sample_sheet,
        ]


@dataclass
class HeatmapCommand(RCommand):
    """Run heatmap.R to render the annotated heatmap.

    ``extra_env`` is forwarded as ``docker exec -e KEY=VALUE`` so the R script
    receives its grouping/rendering parameters through the environment.
    """

    result_rds_name:   str = ""
    sample_sheet_name: str = ""
    extra_env:         dict[str, str] = field(default_factory=dict)

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for heatmap.R, injecting ``extra_env``."""
        env_flags: list[str] = []
        for key, val in self.extra_env.items():
            env_flags += ["-e", f"{key}={val}"]
        return [
            "docker", "exec",
            *env_flags,
            self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.result_rds_name}",
            f"{self.docker_job_dir}/{self.sample_sheet_name}",
            self.docker_job_dir,
        ]


@dataclass
class BatchInitCommand(RCommand):
    """Run batch_svd.R to produce the round-0 baseline SVD plot."""

    beta_file:         str = ""
    sample_sheet_file: str = ""
    plot_name:         str = ""

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for the baseline batch_svd.R run."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.beta_file}",
            f"{self.docker_job_dir}/{self.sample_sheet_file}",
            self.docker_job_dir,
            self.plot_name,
        ]


@dataclass
class SvdPlotCommand(RCommand):
    """Run batch_svd.R to produce a post-correction SVD plot for a given round."""

    beta_file:         str = ""
    sample_sheet_file: str = ""
    plot_name:         str = ""

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for a post-correction batch_svd.R run."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.beta_file}",
            f"{self.docker_job_dir}/{self.sample_sheet_file}",
            self.docker_job_dir,
            self.plot_name,
        ]


@dataclass
class BatchCorrectionCommand(RCommand):
    """Run batch_correct.R (removeBatchEffect on the beta matrix)."""

    extra_args: list[str] = field(default_factory=list)

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for batch_correct.R."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class DmrAnalysisCommand(RCommand):
    """Run dmr.R (differentially methylated regions).

    Passes the sample-sheet path, the job directory and the script arguments in
    that order.

    ``timeout_seconds`` is raised above the global 600s default because the DMR
    analysis is compute-intensive (a genome-wide region search across all CpGs)
    and can exceed it depending on the sample count (see r_executor_spec.md §5.3).
    """

    extra_args:      list[str] = field(default_factory=list)
    timeout_seconds: int       = 1200

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for dmr.R."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.sample_sheet}",
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class DmpAnalysisCommand(RCommand):
    """Run dmp.R (differentially methylated positions).

    ``timeout_seconds`` sits between the DMR timeout and the global default: DMP
    is lighter than DMR (per-CpG statistics, no region search) but still well
    above the default for large cohorts — 900s instead of 600s.
    """

    extra_args:      list[str] = field(default_factory=list)
    timeout_seconds: int       = 900

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv for dmp.R."""
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.sample_sheet}",
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class BetaExtractionCommand(RCommand):
    """Extract the uncorrected beta matrix from normalized_data.rds via inline R.

    Used when batch correction is skipped: it runs ``getBeta`` on the normalized
    data and writes ``beta.rds`` so DMR/DMP have their input. All paths use
    ``docker_job_dir`` (the container path), since the inline R runs inside the
    container via ``docker exec``.

    ``script`` and ``sample_sheet`` are unused here (dummy values are passed at
    construction) because no script file is invoked; ``timeout_seconds`` is short
    (120s) because it is a single readRDS/getBeta/saveRDS pass.

    ``script_path`` is deliberately disabled (see the override below): per
    r_executor_spec.md §3.3 ``build_cmd`` must never reference it, so an
    accidental access fails loudly instead of producing a silently wrong path.
    """

    timeout_seconds: int = 120

    @property
    def script_path(self) -> str:
        """Fail: this command runs inline R (``-e``) and has no script file."""
        raise NotImplementedError(
            "BetaExtractionCommand runs no script file (inline -e). "
            "script_path must not be accessed here — see r_executor_spec.md §3.3."
        )

    def build_cmd(self) -> list[str]:
        """Build the ``docker exec`` argv that runs the inline beta-extraction R."""
        r_inline = (
            f"library(minfi); "
            f"normalized <- readRDS('{self.docker_job_dir}/normalized_data.rds'); "
            f"beta <- getBeta(normalized); "
            f"saveRDS(beta, '{self.docker_job_dir}/beta.rds')"
        )
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", "-e", r_inline,
        ]
