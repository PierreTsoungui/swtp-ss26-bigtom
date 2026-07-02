# app/services/upload_inspect_service.py
"""Inspect phase of the folder/ZIP upload.

Takes the raw upload (a single ``.zip`` or many individual files), stages it
safely, scans it recursively and returns a classified manifest (sample-sheet
candidates, IDAT pairs, other files, blocking errors). No pipeline runs here.

Heavy / blocking work (streaming to disk, ZIP extraction, parsing) runs in a
worker thread so the event loop stays responsive. On any failure the staging
directory is discarded.
"""
import asyncio
import json
import logging
from pathlib import Path, PurePosixPath
from typing import Optional

from fastapi import UploadFile

from app.core.error_types import AppException, ErrorTypes
from app.core.upload_limits import (
    ALLOWED_IDAT_EXTENSIONS,
    ALLOWED_SHEET_EXTENSIONS,
    MAX_SAMPLE_SHEET_BYTES,
    MAX_SINGLE_FILE_BYTES,
    MAX_UPLOAD_REQUEST_BYTES,
)
from app.models.upload import (
    FileEntry,
    IdatPair,
    InspectManifest,
    ManifestError,
    OtherFile,
    SampleSheetCandidate,
    SuggestedMapping,
)
from app.services import staging_manager
from app.services.archive_utils import ArchiveError, safe_extract_zip
from app.services.samplesheet_normalizer import (
    read_sample_sheet_table,
    suggest_column_mapping,
)

logger = logging.getLogger(__name__)

# Internal files written into the staging dir (excluded from the scan).
INTERNAL_MANIFEST = "_manifest.json"
_COPY_CHUNK = 1024 * 1024

_ARCHIVE_ERROR_MAP = {
    "invalid": ErrorTypes.INVALID_ARCHIVE,
    "too_large": ErrorTypes.ARCHIVE_TOO_LARGE,
    "no_supported": ErrorTypes.NO_SUPPORTED_FILES,
}

# Bridges the normalizer's canonical role names to the snake_case API fields.
_ROLE_TO_FIELD = {
    "Sentrix_ID": "sentrix_id",
    "Sentrix_Position": "sentrix_position",
    "Sample_Group": "sample_group",
    "Sample_Name": "sample_name",
}


# ── Public API ────────────────────────────────────────────────────────────────

async def inspect_upload(files: list[UploadFile]) -> InspectManifest:
    """Stage and classify an upload; return the manifest (raises on fatal error)."""
    if not files:
        raise AppException(ErrorTypes.NO_SUPPORTED_FILES, "Es wurden keine Dateien hochgeladen.")

    session_id, session_dir = staging_manager.create_session()
    try:
        manifest = await asyncio.to_thread(_stage_and_build, files, session_id, session_dir)
        return manifest
    except (AppException, ArchiveError):
        staging_manager.delete_session(session_id)
        raise
    except Exception:
        staging_manager.delete_session(session_id)
        logger.exception("Unerwarteter Fehler beim Inspect: session_id=%s", session_id)
        raise


# ── Staging (runs in a worker thread) ─────────────────────────────────────────

def _stage_and_build(files: list[UploadFile], session_id: str, session_dir: Path) -> InspectManifest:
    """Stage every uploaded item, then build the manifest.

    ZIPs are always extracted — even when mixed with individual files — so a user
    can drop IDATs and a ZIP together and still get one combined selection.
    """
    skipped: list[str] = []
    seen: set[str] = set()
    total = 0
    zip_index = 0
    has_zip = False

    for upload in files:
        name = upload.filename or ""
        basename = PurePosixPath(name.replace("\\", "/")).name
        if not basename or basename.startswith(".") or basename == ".DS_Store":
            continue  # junk / hidden / empty

        ext = PurePosixPath(basename).suffix.lower()
        upload.file.seek(0)

        if ext == ".zip":
            has_zip = True
            total = _check_total(total + _stage_zip_member(upload, session_dir, zip_index, skipped, name))
            zip_index += 1
        elif ext in ALLOWED_IDAT_EXTENSIONS or ext in ALLOWED_SHEET_EXTENSIONS:
            if basename in seen:  # flatten to basename; de-duplicate
                skipped.append(name)
                continue
            seen.add(basename)
            total = _check_total(total + _stream_to_file(upload.file, session_dir / basename, MAX_SINGLE_FILE_BYTES))
        else:
            skipped.append(name)

    source = "zip" if has_zip else "files"
    return _build_manifest(session_id, session_dir, source, skipped)


def _stage_zip_member(upload: UploadFile, session_dir: Path, index: int, skipped: list[str], name: str) -> int:
    """Persist one uploaded ZIP, extract it safely, drop it. Returns its byte size.

    A ZIP that simply contains nothing usable is not fatal here (the upload may
    carry usable files elsewhere); ``_build_manifest`` decides overall validity.
    """
    zip_path = session_dir / f"_upload_{index}.zip"
    written = _stream_to_file(upload.file, zip_path, MAX_UPLOAD_REQUEST_BYTES)
    try:
        result = safe_extract_zip(zip_path, session_dir)
        skipped.extend(result.skipped_unsupported)
    except ArchiveError as exc:
        if exc.code != "no_supported":
            raise _map_archive_error(exc) from exc
        skipped.append(name)
    finally:
        zip_path.unlink(missing_ok=True)
    return written


def _check_total(total: int) -> int:
    if total > MAX_UPLOAD_REQUEST_BYTES:
        raise AppException(ErrorTypes.ARCHIVE_TOO_LARGE, "Upload überschreitet das Gesamtlimit.")
    return total


def _stream_to_file(src, target: Path, max_bytes: int) -> int:
    """Copy a file object to ``target`` in chunks, enforcing ``max_bytes``."""
    target.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with open(target, "wb") as dst:
        while True:
            chunk = src.read(_COPY_CHUNK)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                dst.close()
                target.unlink(missing_ok=True)
                raise AppException(ErrorTypes.ARCHIVE_TOO_LARGE, "Eine Datei überschreitet das Limit.")
            dst.write(chunk)
    return written


# ── Manifest building ─────────────────────────────────────────────────────────

def _build_manifest(session_id: str, session_dir: Path, source: str, skipped: list[str]) -> InspectManifest:
    sheet_files: list[tuple[Path, str]] = []
    idat_files: list[tuple[Path, str]] = []

    for path in sorted(session_dir.rglob("*")):
        if not path.is_file() or path.name.startswith("_"):
            continue
        rel = str(path.relative_to(session_dir))
        ext = path.suffix.lower()
        if ext in ALLOWED_IDAT_EXTENSIONS:
            idat_files.append((path, rel))
        elif ext in ALLOWED_SHEET_EXTENSIONS:
            sheet_files.append((path, rel))

    if not sheet_files and not idat_files:
        raise AppException(ErrorTypes.NO_SUPPORTED_FILES, "Keine verwertbaren Dateien (IDAT/Sample-Sheet) gefunden.")

    candidates, sheet_map, sheet_other = _classify_sheets(sheet_files)
    pairs, pair_map, idat_other = _pair_idats(idat_files)

    other_files = sheet_other + idat_other
    other_files += [
        OtherFile(name=PurePosixPath(n.replace("\\", "/")).name, rel_path=n, reason="unsupported_type")
        for n in skipped
    ]

    errors = _collect_errors(candidates, pairs)

    _persist_internal(session_dir, sheet_map, pair_map)

    return InspectManifest(
        session_id=session_id,
        source=source,
        sample_sheets=candidates,
        idats=pairs,
        other_files=other_files,
        errors=errors,
        expires_at=staging_manager.expires_at(session_dir),
    )


def _classify_sheets(
    sheet_files: list[tuple[Path, str]],
) -> tuple[list[SampleSheetCandidate], dict[str, str], list[OtherFile]]:
    """Recognized sheets become candidates; the rest become 'other'."""
    candidates: list[SampleSheetCandidate] = []
    sheet_map: dict[str, str] = {}
    other: list[OtherFile] = []

    for path, rel in sheet_files:
        recognized, sample_count, columns, suggestion = _describe_sheet(path)
        if not recognized:
            other.append(OtherFile(name=path.name, rel_path=rel, reason="unrecognized_sheet"))
            continue
        sheet_id = f"sheet-{len(candidates) + 1}"
        sheet_map[sheet_id] = rel
        candidates.append(SampleSheetCandidate(
            id=sheet_id,
            name=path.name,
            rel_path=rel,
            size_bytes=path.stat().st_size,
            recognized=True,
            sample_count=sample_count,
            columns=columns,
            suggested_mapping=suggestion,
        ))

    return candidates, sheet_map, other


def _describe_sheet(path: Path) -> tuple[bool, Optional[int], list[str], SuggestedMapping]:
    """Return ``(recognized, sample_count, raw_columns, suggested_mapping)``.

    Columns are the sheet's *raw* header names (the dropdown options); the
    suggestion pre-fills the role dropdowns where a column could be recognized.
    """
    empty = SuggestedMapping()
    if path.stat().st_size > MAX_SAMPLE_SHEET_BYTES:
        return False, None, [], empty
    try:
        columns, rows = read_sample_sheet_table(path.read_bytes(), path.name)
    except Exception:
        return False, None, [], empty
    if not columns:
        return False, None, [], empty
    suggestion = {_ROLE_TO_FIELD[role]: col for role, col in suggest_column_mapping(columns).items()}
    return True, len(rows), columns, SuggestedMapping(**suggestion)


def _pair_idats(
    idat_files: list[tuple[Path, str]],
) -> tuple[list[IdatPair], dict[str, dict], list[OtherFile]]:
    """Group IDATs into Grn/Red pairs by base name."""
    pairs: dict[str, dict] = {}
    other: list[OtherFile] = []

    for path, rel in idat_files:
        parsed = _parse_idat_name(path.name)
        if parsed is None:
            other.append(OtherFile(name=path.name, rel_path=rel, reason="idat_naming"))
            continue
        base, channel = parsed
        entry = pairs.setdefault(base, {"grn": None, "red": None})
        if entry[channel] is not None:
            other.append(OtherFile(name=path.name, rel_path=rel, reason="duplicate_idat"))
            continue
        entry[channel] = {"path": rel, "file": FileEntry(name=path.name, rel_path=rel, size_bytes=path.stat().st_size)}

    pair_models: list[IdatPair] = []
    pair_map: dict[str, dict] = {}
    for base in sorted(pairs):
        entry = pairs[base]
        grn, red = entry["grn"], entry["red"]
        complete = grn is not None and red is not None
        pair_models.append(IdatPair(
            pair_id=base,
            grn=grn["file"] if grn else None,
            red=red["file"] if red else None,
            complete=complete,
        ))
        pair_map[base] = {
            "grn": grn["path"] if grn else None,
            "red": red["path"] if red else None,
        }

    return pair_models, pair_map, other


def _parse_idat_name(name: str) -> Optional[tuple[str, str]]:
    """Split ``<base>_Grn.idat`` / ``<base>_Red.idat`` → ``(base, channel)``."""
    low = name.lower()
    for suffix, channel in (("_grn.idat", "grn"), ("_red.idat", "red")):
        if low.endswith(suffix):
            return name[: -len(suffix)], channel
    return None


def _collect_errors(candidates: list[SampleSheetCandidate], pairs: list[IdatPair]) -> list[ManifestError]:
    """Genuinely blocking (but non-fatal) conditions surfaced in the manifest.

    Having *several* sample sheets is NOT an error: the user simply picks one in
    the UI (a radio), and the commit accepts exactly one by construction.
    """
    errors: list[ManifestError] = []
    if not candidates:
        errors.append(ManifestError(
            code="NO_SAMPLE_SHEET",
            message="No sample sheet detected — add a valid sample sheet file.",
        ))
    if not any(p.complete for p in pairs):
        errors.append(ManifestError(
            code="NO_IDAT_FILES",
            message="No complete IDAT pair (Grn + Red) found.",
        ))
    return errors


# ── Internal mapping (consumed by commit / preview) ───────────────────────────

def _persist_internal(session_dir: Path, sheet_map: dict[str, str], pair_map: dict[str, dict]) -> None:
    payload = {"sheets": sheet_map, "pairs": pair_map}
    (session_dir / INTERNAL_MANIFEST).write_text(json.dumps(payload), encoding="utf-8")


def load_internal(session_dir: Path) -> dict:
    path = session_dir / INTERNAL_MANIFEST
    if not path.exists():
        raise AppException(ErrorTypes.SESSION_NOT_FOUND, "Manifest der Upload-Session fehlt.")
    return json.loads(path.read_text(encoding="utf-8"))


def build_sheet_preview(session_dir: Path, sheet_id: str, max_rows: int):
    """Tabular preview of a staged candidate sheet (lazy, on-click)."""
    from app.models.upload import SheetPreview  # local import avoids a cycle at module load

    internal = load_internal(session_dir)
    sheet_rel = internal.get("sheets", {}).get(sheet_id)
    if sheet_rel is None:
        raise AppException(ErrorTypes.INVALID_SELECTION, f"Sample-Sheet nicht gefunden: {sheet_id!r}")

    src = (session_dir / sheet_rel).resolve()
    if not src.is_relative_to(session_dir.resolve()) or not src.is_file():
        raise AppException(ErrorTypes.INVALID_SELECTION, "Sample-Sheet nicht im Staging.")

    # Show the raw columns/rows so the preview matches the dropdown options.
    columns, rows = read_sample_sheet_table(src.read_bytes(), src.name)
    limit = max(1, min(max_rows, 200))
    return SheetPreview(
        sheet_id=sheet_id,
        columns=columns,
        rows=rows[:limit],
        total_rows=len(rows),
        truncated=len(rows) > limit,
    )


# ── Shared helpers ────────────────────────────────────────────────────────────

def _map_archive_error(exc: ArchiveError) -> AppException:
    error_type = _ARCHIVE_ERROR_MAP.get(exc.code, ErrorTypes.INVALID_ARCHIVE)
    return AppException(error_type, str(exc))
