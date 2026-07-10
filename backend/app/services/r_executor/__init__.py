"""R execution subsystem: the runner, command definitions and result types."""

from app.services.r_executor.commands.base import RCommand
from app.services.r_executor.commands.commands import (
    BatchCorrectionCommand,
    BatchInitCommand,
    BetaExtractionCommand,
    DmpAnalysisCommand,
    DmrAnalysisCommand,
    FilteringCommand,
    HeatmapCommand,
    NormalizationCommand,
    NormalizationPreviewCommand,
    SvdPlotCommand,
)
from app.services.r_executor.executor import run_r_script
from app.services.r_executor.result import ExecutionResult, ExecutionStatus

__all__ = [
    "run_r_script",
    "ExecutionResult",
    "ExecutionStatus",
    "RCommand",
    "FilteringCommand",
    "NormalizationCommand",
    "NormalizationPreviewCommand",
    "HeatmapCommand",
    "BatchInitCommand",
    "SvdPlotCommand",
    "BatchCorrectionCommand",
    "DmrAnalysisCommand",
    "DmpAnalysisCommand",
    "BetaExtractionCommand",
]
