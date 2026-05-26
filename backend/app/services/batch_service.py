import asyncio
from pathlib import Path
from typing import List

import pandas as pd

from app.services.job_manager import get_job, update_job

SAMPLE_SHEET_EXTENSIONS = [".csv", ".xlsx", ".xls"]


def find_sample_sheet_path(job_dir: str) -> Path:
    job_path = Path(job_dir)
    for ext in SAMPLE_SHEET_EXTENSIONS:
        files = list(job_path.glob(f"*{ext}"))
        if files:
            return files[0]
    raise FileNotFoundError("Kein Sample Sheet im Job-Ordner gefunden")


def get_sample_sheet_columns(job_dir: str) -> List[str]:
    sample_sheet_path = find_sample_sheet_path(job_dir)
    if sample_sheet_path.suffix.lower() == ".csv":
        df = pd.read_csv(sample_sheet_path, nrows=0, sep=None, engine="python")
    else:
        df = pd.read_excel(sample_sheet_path, nrows=0)

    return [str(column) for column in df.columns]


async def run_batch_correction_background(
    job_id: str,
    job_dir: str,
    batch_variable: str,
    covariates: List[str]
):
    job = get_job(job_id)
    if not job:
        return

    try:
        update_job(
            job_id,
            status="running",
            phase="batch_correction",
            progress_percent=10,
            current_step="Batch-Korrektur wird berechnet..."
        )

        await asyncio.sleep(2)

        update_job(
            job_id,
            status="batch_done",
            phase="batch_correction",
            progress_percent=100,
            current_step="Batch-Korrektur abgeschlossen"
        )
    except Exception as exc:
        update_job(
            job_id,
            status="failed",
            phase="batch_correction",
            progress_percent=0,
            error_message=str(exc)
        )
