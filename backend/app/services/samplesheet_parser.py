"""Single source of truth for locating and parsing the SampleSheet.

Every upload is normalized to one canonical Illumina-style ``SampleSheet.csv`` at
upload time, but this module stays tolerant of legacy ``*SampleSheet*.csv`` names
and of the ``;`` vs ``,`` delimiter.

Centralizing the "find ``[Data]``, guess the delimiter, read the CSV, trim the
headers, pad the rows" logic here keeps the delimiter/padding error class in
exactly one place, so every consumer (batch grouping, heatmap annotations, table
preview) parses the sheet identically.
"""
import csv
import glob
from pathlib import Path

from app.core.error_types import AppException, ErrorTypes

CANONICAL_SAMPLE_SHEET = "SampleSheet.csv"


def find_sample_sheet_name(job_dir: str | Path) -> str:
    """Return the sample-sheet filename inside ``job_dir``.

    Prefers the canonical ``SampleSheet.csv`` and falls back to any
    ``*SampleSheet*.csv`` match. Raises ``AppException(SAMPLE_SHEET_NOT_FOUND)``
    when none is present.
    """
    job_path = Path(job_dir)
    if (job_path / CANONICAL_SAMPLE_SHEET).exists():
        return CANONICAL_SAMPLE_SHEET

    matches = glob.glob(str(job_path / "*SampleSheet*.csv"))
    if matches:
        return Path(matches[0]).name

    raise AppException(
        ErrorTypes.SAMPLE_SHEET_NOT_FOUND,
        detail=(
            f"No SampleSheet file found in {job_dir}. "
            f"Expected '{CANONICAL_SAMPLE_SHEET}'."
        ),
    )


def read_data_section(job_dir: Path) -> tuple[list[str], list[list[str]]]:
    """Parse the SampleSheet's ``[Data]`` section into ``(headers, data_rows)``.

    - Locates the ``[Data]`` marker (Illumina standard); if absent, the whole
      file is treated as the data section.
    - Auto-detects the delimiter (``;`` or ``,``) from the header line.
    - Trims the header names and pads every row to the header width, so callers
      can index columns safely.

    Raises ``AppException(SAMPLE_SHEET_NOT_FOUND)`` if no sheet exists and
    ``AppException(INVALID_CSV_CONTENT)`` if the file cannot be parsed.
    """
    sheet_path = Path(job_dir) / find_sample_sheet_name(job_dir)

    try:
        with open(sheet_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        data_index = next((i for i, line in enumerate(lines) if "[Data]" in line), -1)
        data_lines = lines[data_index + 1:] if data_index != -1 else lines
        data_lines = [line.strip() for line in data_lines if line.strip()]
        if not data_lines:
            return [], []

        delimiter = ";" if ";" in data_lines[0] else ","
        rows = list(csv.reader(data_lines, delimiter=delimiter))
        headers = [h.strip() for h in rows[0] if h.strip()]
        num_cols = len(headers)

        data_rows = [
            [(row[i].strip() if i < len(row) else "") for i in range(num_cols)]
            for row in rows[1:]
        ]
        return headers, data_rows
    except AppException:
        raise
    except Exception as exc:
        raise AppException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"The SampleSheet could not be read: {exc}",
        ) from exc


def columns_by_index(
    headers: list[str], data_rows: list[list[str]]
) -> dict[int, list[str]]:
    """Column-oriented view of the data rows: ``{col_index: [non-empty values]}``.

    A thin transform over :func:`read_data_section` for callers that analyze the
    sample sheet column by column (the grouping and annotation finders).
    """
    col_values: dict[int, list[str]] = {i: [] for i in range(len(headers))}
    for row in data_rows:
        for i in range(len(headers)):
            value = row[i] if i < len(row) else ""
            if value:
                col_values[i].append(value)
    return col_values
