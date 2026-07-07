# app/services/upload_commit_service.py
"""Commit phase of the folder/ZIP upload.

Validates the user's selection against the staged session, moves exactly the
chosen files into a fresh job directory (normalizing the sample sheet to the
canonical ``SampleSheet.csv``), persists the filter settings and creates the
job. The route then launches the existing filtering pipeline. The staging
directory is removed on success.
"""
import logging
import shutil
import uuid
from pathlib import Path

from app.core.error_types import AppException, ErrorTypes
from app.models.upload import ColumnMapping, CommitRequest
from app.services import job_manager, staging_manager
from app.services.file_handler import clean_job_files, ensure_upload_dir, save_filter_settings
from app.services.job_manager import JobPhase, JobStatusValue
from app.services.samplesheet_normalizer import normalize_sample_sheet, read_sample_sheet_table
from app.services.upload_inspect_service import load_internal

logger = logging.getLogger(__name__)


def persist_committed_job(req: CommitRequest, instance: str) -> tuple[str, Path]:
    """Validate the selection, build the job directory, create the job.

    Returns ``(job_id, job_dir)``. Raises ``AppException`` (RFC-9457) on any
    invalid selection or persistence failure, rolling back a partial job dir.
    """
    session_dir = staging_manager.require_session(req.session_id)
    internal = load_internal(session_dir)

    sheet_rel = internal.get("sheets", {}).get(req.selected_sample_sheet_id)
    if sheet_rel is None:
        raise AppException(
            ErrorTypes.NO_SAMPLE_SHEET,
            f"Selected sample sheet not found: {req.selected_sample_sheet_id!r}",
            instance,
        )

    selected_pairs = _resolve_selected_pairs(req.selected_pair_ids, internal.get("pairs", {}), instance)

    # Validate the role mapping against the chosen sheet *before* touching the
    # job dir, so a bad mapping never leaves a half-built job behind.
    canonical_sheet = _build_canonical_sheet(
        session_dir, sheet_rel, req.column_mapping, req.selected_pair_ids, instance
    )

    job_id = str(uuid.uuid4())
    job_dir = ensure_upload_dir(job_id)
    try:
        _move_idats(session_dir, selected_pairs, job_dir)
        (job_dir / "SampleSheet.csv").write_text(canonical_sheet, encoding="utf-8", newline="")
        save_filter_settings(req.filter_settings.model_dump(), job_dir)
    except AppException:
        # Structured error: roll back but keep its type/status.
        clean_job_files(job_id)
        raise
    except Exception as exc:
        # Rollback boundary: clean up the half-built job dir on any other failure
        # and re-raise as a structured 500 (never swallow).
        clean_job_files(job_id)
        raise AppException(
            ErrorTypes.SAVE_FAILED, f"Error while committing the selection: {exc}", instance
        ) from exc

    job_manager.create_job(job_id)
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.UPLOADED,
        new_status=JobStatusValue.COMPLETED,
    )

    # The selection is now safely in the job dir; the staging area can go.
    staging_manager.delete_session(req.session_id)
    return job_id, job_dir


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_selected_pairs(pair_ids: list[str], pair_map: dict, instance: str) -> list[dict]:
    if not pair_ids:
        raise AppException(ErrorTypes.NO_IDAT_FILES, "No IDAT pair was selected.", instance)

    resolved = []
    for pid in pair_ids:
        pair = pair_map.get(pid)
        if pair is None:
            raise AppException(ErrorTypes.INVALID_SELECTION, f"Unbekanntes IDAT-Paar: {pid!r}", instance)
        if not pair.get("grn") or not pair.get("red"):
            raise AppException(ErrorTypes.UNPAIRED_IDATS, f"IDAT pair is incomplete: {pid!r}", instance)
        resolved.append(pair)
    return resolved


def _move_idats(session_dir: Path, pairs: list[dict], job_dir: Path) -> None:
    for pair in pairs:
        for rel in (pair["grn"], pair["red"]):
            src = (session_dir / rel).resolve()
            if not src.is_relative_to(session_dir.resolve()) or not src.is_file():
                raise AppException(ErrorTypes.INVALID_SELECTION, f"File not in staging: {rel!r}")
            shutil.move(str(src), str(job_dir / Path(rel).name))


def _build_canonical_sheet(
    session_dir: Path,
    sheet_rel: str,
    mapping: ColumnMapping,
    selected_pair_ids: list[str],
    instance: str,
) -> str:
    """Validate the role mapping against the sheet and return the canonical CSV.

    Enforces three things before the pipeline can start:

    1. every mapped column actually exists in the chosen sheet;
    2. the mapped ``Sentrix_ID``/``Sentrix_Position`` columns build array ids
       (``<id>_<position>``) that overlap the selected IDAT pairs — a mismatch
       almost always means the wrong columns were picked, so we hard-fail with a
       plain-text hint instead of starting a job that cannot find its IDATs;
    3. (distinctness of the four roles is guaranteed by ``ColumnMapping``).
    """
    src = (session_dir / sheet_rel).resolve()
    if not src.is_relative_to(session_dir.resolve()) or not src.is_file():
        raise AppException(ErrorTypes.INVALID_SELECTION, f"Sample sheet not in staging: {sheet_rel!r}", instance)

    content = src.read_bytes()
    try:
        raw_headers, rows = read_sample_sheet_table(content, Path(sheet_rel).name)
    except ValueError as exc:
        raise AppException(ErrorTypes.INVALID_CSV_CONTENT, f"Sample sheet could not be read: {exc}", instance) from exc

    role_map = mapping.as_role_dict()
    missing = [raw for raw in role_map.values() if raw not in raw_headers]
    if missing:
        raise AppException(
            ErrorTypes.INVALID_COLUMN_MAPPING,
            f"Mapped column(s) are not in the sample sheet: {sorted(set(missing))}. "
            f"Available columns: {raw_headers}.",
            instance,
        )

    _check_idats_match_sheet(raw_headers, rows, mapping, selected_pair_ids, instance)

    return normalize_sample_sheet(content, Path(sheet_rel).name, column_mapping=role_map)


def _check_idats_match_sheet(
    raw_headers: list[str],
    rows: list[list[str]],
    mapping: ColumnMapping,
    selected_pair_ids: list[str],
    instance: str,
) -> None:
    """Hard-fail when the mapped chip columns match none of the selected IDATs."""
    if not selected_pair_ids:
        return  # the empty-selection case is handled by _resolve_selected_pairs

    id_idx = raw_headers.index(mapping.sentrix_id)
    pos_idx = raw_headers.index(mapping.sentrix_position)
    sheet_ids = {
        f"{_clean(row[id_idx])}_{_clean(row[pos_idx])}"
        for row in rows
        if id_idx < len(row) and pos_idx < len(row) and _clean(row[id_idx]) and _clean(row[pos_idx])
    }

    if sheet_ids.isdisjoint(selected_pair_ids):
        example_sheet = next(iter(sorted(sheet_ids)), "—")
        example_idat = sorted(selected_pair_ids)[0]
        raise AppException(
            ErrorTypes.INVALID_COLUMN_MAPPING,
            "The mapped columns do not match any of the uploaded IDAT pairs: "
            f"Sentrix_ID='{mapping.sentrix_id}', Sentrix_Position='{mapping.sentrix_position}' "
            f"produce e.g. the array id '{example_sheet}', while the IDAT files expect "
            f"e.g. '{example_idat}'. Please check which columns contain the chip barcode "
            "and the position.",
            instance,
        )


def _clean(value: str) -> str:
    """Strip whitespace the way the R backend's normalize_id does, for matching."""
    return "".join(str(value).split())
