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
    extra_args: list[str] = field(default_factory=list)

    def build_cmd(self) -> list[str]:
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.sample_sheet}",
            self.docker_job_dir,
            *self.extra_args,
        ]

    def parse_stdout(self, result: ExecutionResult) -> ExecutionResult:
        # FIX: result.is_success statt result.status == "completed" (type-sicher)
        stats_path = Path(self.job_dir) / "filter_stats.json"
        if result.is_success and stats_path.exists():
            try:
                with open(stats_path, "r") as f:
                    result.extra["filter_stats"] = json.load(f)
                logger.info("filter_stats.json geladen: job_id=%s", self.job_id)
            except Exception:
                logger.exception("filter_stats.json konnte nicht geparst werden: job_id=%s", self.job_id)
        return result


@dataclass
class NormalizationCommand(RCommand):
    extra_args: list[str] = field(default_factory=list)

    def build_cmd(self) -> list[str]:
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class NormalizationPreviewCommand(RCommand):
    # No parse_stdout hook: normalization_preview.R does not emit {"type":"plot"}
    # messages (it only writes PNG files and progress). Plot discovery happens in
    # normalization_preview_service via a PNG directory scan, which is the single
    # source of truth. The base no-op parse_stdout is inherited.

    def build_cmd(self) -> list[str]:
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
    result_rds_name:   str = ""
    sample_sheet_name: str = ""
    extra_env:         dict[str, str] = field(default_factory=dict)

    def build_cmd(self) -> list[str]:
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
    beta_file:         str = ""
    sample_sheet_file: str = ""
    plot_name:         str = ""

    def build_cmd(self) -> list[str]:
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
    beta_file:         str = ""
    sample_sheet_file: str = ""
    plot_name:         str = ""

    def build_cmd(self) -> list[str]:
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
    extra_args: list[str] = field(default_factory=list)

    def build_cmd(self) -> list[str]:
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class DmrAnalysisCommand(RCommand):
    """
    Im alten Executor lief mode="dmr_analysis" durch den else-Fallback
    (Filtering-Shape: sample_sheet-Pfad, job_dir, *script_args). Diese
    Klasse reproduziert exakt dieses Kommando.

    timeout_seconds: DMR-Analyse ist rechenintensiv (genomweite Region-
    Suche über alle CpGs) und kann den globalen 600s-Default je nach
    Probenanzahl überschreiten. Siehe r_executor_spec.md Abschnitt 5.3.
    """
    extra_args:      list[str] = field(default_factory=list)
    timeout_seconds: int       = 1200

    def build_cmd(self) -> list[str]:
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.sample_sheet}",
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class DmpAnalysisCommand(RCommand):
    """
    Analog zu DmrAnalysisCommand, für mode="dmp_analysis".

    timeout_seconds: DMP-Analyse ist weniger aufwendig als DMR (keine
    Region-Suche, nur per-CpG-Statistik), aber bei großen Cohorten
    immer noch deutlich über dem Default — 900s statt 600s.
    """
    extra_args:      list[str] = field(default_factory=list)
    timeout_seconds: int       = 900

    def build_cmd(self) -> list[str]:
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,
            f"{self.docker_job_dir}/{self.sample_sheet}",
            self.docker_job_dir,
            *self.extra_args,
        ]


@dataclass
class BetaExtractionCommand(RCommand):
    """
    Ersetzt den rohen `docker exec ... Rscript -e` Aufruf in
    run_downstream_analysis_task. Extrahiert die unkorrigierte
    Beta-Matrix aus normalized_data.rds, wenn die Batch-Korrektur
    übersprungen wurde.

    FIX: Der alte Code injizierte den HOST-Pfad (job_dir) in den Inline-R-Code,
    der aber via `docker exec` IM CONTAINER ausgeführt wird. Das funktioniert
    nur, wenn Host- und Container-Pfad zufällig identisch sind. Hier wird
    konsequent docker_job_dir (Container-Pfad) verwendet.

    script/sample_sheet werden hier nicht benötigt (Dummy-Werte beim
    Konstruieren übergeben), da kein Skript-File aufgerufen wird.

    timeout_seconds: einfacher readRDS/getBeta/saveRDS-Durchlauf, deutlich
    kürzer als ein vollständiges R-Skript — 120s statt der globalen 600s.

    script_path ist für diese Klasse hart gesperrt (siehe Override unten).
    Laut r_executor_spec.md Abschnitt 3.3 darf build_cmd() hier niemals
    self.script_path referenzieren — das war bisher nur ein Doku-Kommentar.
    Ein versehentlicher Zugriff (z.B. bei künftigen Refactorings) soll
    sofort crashen statt einen stillen, falschen Pfad zu produzieren.
    """
    timeout_seconds: int = 120

    @property
    def script_path(self) -> str:
        raise NotImplementedError(
            "BetaExtractionCommand führt kein Skript-File aus (inline -e). "
            "script_path darf hier nicht aufgerufen werden — siehe "
            "r_executor_spec.md Abschnitt 3.3."
        )

    def build_cmd(self) -> list[str]:
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