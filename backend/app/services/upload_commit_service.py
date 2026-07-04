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
from app.services import intake_guards, job_manager, staging_manager
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
            f"Ausgewähltes Sample-Sheet nicht gefunden: {req.selected_sample_sheet_id!r}",
            instance,
        )

    selected_pairs = _resolve_selected_pairs(req.selected_pair_ids, internal.get("pairs", {}), instance)

    # Intake guards — reject an oversized cohort or a full disk BEFORE building
    # the job dir, so the pipeline never starts work it cannot finish within the
    # RAM/disk budget (see app.core.config). The container mem_limit is the hard
    # backstop; these give the user a clear, early message instead.
    intake_guards.enforce_sample_limit(len(selected_pairs), instance)
    intake_guards.enforce_storage_limit(instance)

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
        clean_job_files(job_id)
        raise
    except Exception as exc:
        clean_job_files(job_id)
        raise AppException(
            ErrorTypes.SAVE_FAILED, f"Fehler beim Übernehmen der Auswahl: {exc}", instance
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
        raise AppException(ErrorTypes.NO_IDAT_FILES, "Es wurde kein IDAT-Paar ausgewählt.", instance)

    resolved = []
    for pid in pair_ids:
        pair = pair_map.get(pid)
        if pair is None:
            raise AppException(ErrorTypes.INVALID_SELECTION, f"Unbekanntes IDAT-Paar: {pid!r}", instance)
        if not pair.get("grn") or not pair.get("red"):
            raise AppException(ErrorTypes.UNPAIRED_IDATS, f"IDAT-Paar ist unvollständig: {pid!r}", instance)
        resolved.append(pair)
    return resolved


def _move_idats(session_dir: Path, pairs: list[dict], job_dir: Path) -> None:
    for pair in pairs:
        for rel in (pair["grn"], pair["red"]):
            src = (session_dir / rel).resolve()
            if not src.is_relative_to(session_dir.resolve()) or not src.is_file():
                raise AppException(ErrorTypes.INVALID_SELECTION, f"Datei nicht im Staging: {rel!r}")
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
        raise AppException(ErrorTypes.INVALID_SELECTION, f"Sample-Sheet nicht im Staging: {sheet_rel!r}", instance)

    content = src.read_bytes()
    try:
        raw_headers, rows = read_sample_sheet_table(content, Path(sheet_rel).name)
    except ValueError as exc:
        raise AppException(ErrorTypes.INVALID_CSV_CONTENT, f"Sample-Sheet konnte nicht gelesen werden: {exc}", instance) from exc

    role_map = mapping.as_role_dict()
    missing = [raw for raw in role_map.values() if raw not in raw_headers]
    if missing:
        raise AppException(
            ErrorTypes.INVALID_COLUMN_MAPPING,
            f"Zugeordnete Spalte(n) sind nicht im Sample-Sheet: {sorted(set(missing))}. "
            f"Verfügbare Spalten: {raw_headers}.",
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
            "Die zugeordneten Spalten passen zu keinem der hochgeladenen IDAT-Paare: "
            f"Sentrix_ID='{mapping.sentrix_id}', Sentrix_Position='{mapping.sentrix_position}' "
            f"ergeben z.B. die Array-ID '{example_sheet}', während die IDAT-Dateien z.B. "
            f"'{example_idat}' erwarten. Bitte prüfen, welche Spalten Chip-Barcode und "
            "Position enthalten.",
            instance,
        )


def _clean(value: str) -> str:
    """Strip whitespace the way the R backend's normalize_id does, for matching."""
    return "".join(str(value).split())
