# app/services/archive_utils.py
"""Safe extraction of an untrusted ZIP archive.

This is the **only** place in the codebase that opens a ZIP. Extracting a file
uploaded by a user is the single most dangerous operation in the upload flow, so
every defence lives here, behind one function (``safe_extract_zip``):

* **Zip-Slip** — each member is resolved and must stay strictly inside the
  destination directory; ``..``, absolute paths and Windows drive letters are
  rejected.
* **Zip-bomb** — file count, declared and *actual* uncompressed size and the
  compression ratio are all capped; extraction streams member-by-member and
  aborts the moment a cap is hit (never a blind ``extractall``).
* **Symlinks / special entries** — directory entries and symlinks are ignored
  (we never follow a link onto a host path).
* **Whitelist** — only ``.idat/.csv/.xls/.xlsx`` are written to disk; other real
  files are reported by name but never extracted; junk (``__MACOSX/``,
  ``.DS_Store``, hidden files) is dropped silently.
* **Inert** — written files get mode ``0o644`` (no execute bit) as defence in
  depth; uploaded files are only ever read as data, never executed.

The limits come from ``app.core.upload_limits`` (single source of truth).
"""
import logging
import os
import stat
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from app.core.upload_limits import (
    ALLOWED_EXTENSIONS,
    COMPRESSION_RATIO_MIN_BYTES,
    MAX_ARCHIVE_FILE_COUNT,
    MAX_COMPRESSION_RATIO,
    MAX_SINGLE_FILE_BYTES,
    MAX_UNPACKED_TOTAL_BYTES,
)

logger = logging.getLogger(__name__)

_COPY_CHUNK = 1024 * 1024  # 1 MiB


class ArchiveError(Exception):
    """A ZIP was rejected. ``code`` maps to an HTTP error type in the caller."""

    def __init__(self, code: str, message: str):
        """Store the error ``code`` and the human-readable ``message``."""
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class ExtractedFile:
    """A file that was safely written to the destination directory."""

    path: Path      # absolute path on disk
    rel_path: str   # path of the member inside the archive (for display)


@dataclass
class ExtractionResult:
    """Outcome of a safe archive extraction: written files and skipped members."""

    files: list[ExtractedFile] = field(default_factory=list)
    # Real, non-junk entries that were *not* extracted (unsupported type).
    skipped_unsupported: list[str] = field(default_factory=list)


# ── Public API ────────────────────────────────────────────────────────────────

def safe_extract_zip(zip_path: Path, dest_dir: Path) -> ExtractionResult:
    """Extract the allowed files of ``zip_path`` into ``dest_dir``.

    Raises ``ArchiveError`` on a corrupt archive or any breached limit. On such
    an error the caller is responsible for discarding ``dest_dir``.
    """
    dest_root = dest_dir.resolve()

    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        raise ArchiveError("invalid", f"Archive is corrupt or not a ZIP: {exc}") from exc

    result = ExtractionResult()
    total_unpacked = 0

    with zf:
        members = [m for m in zf.infolist() if not _is_junk(m)]

        _check_archive_envelope(members)

        for member in members:
            rel = member.filename
            ext = PurePosixPath(rel).suffix.lower()

            if ext not in ALLOWED_EXTENSIONS:
                # A real but unsupported file: report it, never write it.
                result.skipped_unsupported.append(rel)
                continue

            target = _safe_target(dest_root, rel)
            target.parent.mkdir(parents=True, exist_ok=True)

            written = _extract_member(zf, member, target)
            total_unpacked += written
            if total_unpacked > MAX_UNPACKED_TOTAL_BYTES:
                raise ArchiveError(
                    "too_large",
                    "The total unpacked size exceeds the limit.",
                )

            result.files.append(ExtractedFile(path=target, rel_path=rel))

    if not result.files:
        raise ArchiveError("no_supported", "The archive contains no usable files.")

    return result


# ── Internal helpers ──────────────────────────────────────────────────────────

def _is_junk(member: zipfile.ZipInfo) -> bool:
    """Return True for entries dropped silently: dirs, symlinks, OS junk, hidden."""
    if member.is_dir():
        return True

    mode = member.external_attr >> 16
    if stat.S_ISLNK(mode):  # never follow symlinks out of the staging dir
        return True

    parts = PurePosixPath(member.filename.replace("\\", "/")).parts
    if any(p.startswith("__MACOSX") for p in parts):
        return True

    basename = parts[-1] if parts else member.filename
    if basename == ".DS_Store" or basename.startswith("."):
        return True

    return False


def _check_archive_envelope(members: list[zipfile.ZipInfo]) -> None:
    """Cheap up-front guards from the central directory before extracting bytes."""
    if len(members) > MAX_ARCHIVE_FILE_COUNT:
        raise ArchiveError("too_large", "The archive contains too many files.")

    declared_total = sum(m.file_size for m in members)
    if declared_total > MAX_UNPACKED_TOTAL_BYTES:
        raise ArchiveError("too_large", "The declared unpacked size exceeds the limit.")

    compressed_total = sum(m.compress_size for m in members)
    if (
        declared_total > COMPRESSION_RATIO_MIN_BYTES
        and compressed_total > 0
        and declared_total / compressed_total > MAX_COMPRESSION_RATIO
    ):
        raise ArchiveError("too_large", "Suspicious compression ratio (possible zip bomb).")


def _safe_target(dest_root: Path, member_name: str) -> Path:
    """Resolve a member name to a path guaranteed to stay inside ``dest_root``.

    Two independent checks (component inspection + final containment), so a bug
    in one still leaves the other as a backstop.
    """
    normalized = member_name.replace("\\", "/")
    pure = PurePosixPath(normalized)

    if pure.is_absolute() or (len(normalized) > 1 and normalized[1] == ":"):
        raise ArchiveError("invalid", f"Absoluter Pfad im Archiv abgelehnt: {member_name!r}")

    parts = [p for p in pure.parts if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ArchiveError("invalid", f"Pfad-Traversal im Archiv abgelehnt: {member_name!r}")

    target = dest_root.joinpath(*parts)
    if not target.resolve().is_relative_to(dest_root):
        raise ArchiveError("invalid", f"Entry is outside the target directory: {member_name!r}")

    return target


def _extract_member(zf: zipfile.ZipFile, member: zipfile.ZipInfo, target: Path) -> int:
    """Stream one member to ``target``, enforcing the per-file size cap.

    Counts *actual* bytes (not the header's declared size), so a lying header
    cannot smuggle a large file past the guard.
    """
    written = 0
    with zf.open(member) as src, open(target, "wb") as dst:
        while True:
            chunk = src.read(_COPY_CHUNK)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_SINGLE_FILE_BYTES:
                dst.close()
                target.unlink(missing_ok=True)
                raise ArchiveError(
                    "too_large",
                    f"File exceeds the single-file limit: {member.filename!r}",
                )
            dst.write(chunk)

    os.chmod(target, 0o644)
    return written
