"""Validation and on-disk persistence for uploaded IDATs and sample sheets."""
import shutil
from pathlib import Path
from typing import List, Tuple, Dict

from fastapi import UploadFile

# All tunables come from the central, env-based configuration. JOB_BASE_DIR is
# the single base directory shared by upload, job-manager and cleanup; the size
# limits are env-configurable (MAX_TOTAL_UPLOAD_MB / MAX_SAMPLE_SHEET_MB).
from app.core.config import JOB_BASE_DIR, MAX_TOTAL_UPLOAD_BYTES, MAX_SAMPLE_SHEET_BYTES
from app.core.atomic_io import write_json_atomic

UPLOAD_BASE_DIR = JOB_BASE_DIR
ALLOWED_IDAT_EXTENSIONS = {".idat"}
ALLOWED_SHEET_EXTENSIONS = {".xlsx", ".xls", ".csv"}

# Upload size ceilings (bytes), sourced from configuration. Kept as module-level
# aliases so existing references and test monkeypatching keep working.
MAX_TOTAL_SIZE = MAX_TOTAL_UPLOAD_BYTES
MAX_SAMPLE_SHEET_SIZE = MAX_SAMPLE_SHEET_BYTES

# ==================== HELPERS ====================

def read_chunk(file: UploadFile, size: int = 2048) -> bytes:
    """Read bytes without permanently moving the file pointer."""
    pos = file.file.tell()
    chunk = file.file.read(size)
    file.file.seek(pos)
    return chunk


def get_file_size(file: UploadFile) -> int:
    """Return the file size in bytes without moving the file pointer."""
    current_pos = file.file.tell()

    file.file.seek(0, 2)
    size = file.file.tell()

    file.file.seek(current_pos)

    return size


def get_total_file_size(files: List[UploadFile]) -> int:
    """Return the combined size in bytes of all given files."""
    return sum(get_file_size(file) for file in files)





# ==================== VALIDATION ====================

def looks_like_idat(file: UploadFile) -> Tuple[bool, str]:
    """Run a low-risk plausibility check on an IDAT file.

    Aims to block obvious fake files while not rejecting genuine IDATs. Returns
    ``(ok, reason)`` where ``reason`` explains a rejection.
    """
    chunk = read_chunk(file, 2048)

    # File too small
    if len(chunk) < 100:
        return False, "file too small"

    # Obvious PDF
    if chunk.startswith(b"%PDF"):
        return False, "PDF detected"

    # Check for typical binary structure
    if chunk.count(b"\x00") < 10:
        return False, "no typical binary structure"

    return True, "OK"


def validate_idat_files(files: List[UploadFile]) -> Tuple[bool, Dict]:
    """Validate a set of IDAT uploads (format, content, pairing, total size).

    Returns ``(ok, info)`` where ``info`` is a success summary or an RFC 9457-style
    error body describing the first failure.
    """
    if not files:
        return False, {
            "error": "FILE_MISSING",
            "message": "No IDAT files uploaded",
            "type": "/errors/missing-files",
            "title": "Missing files",
            "status": 400
        }

    for file in files:
        ext = Path(file.filename or "").suffix.lower()
        if ext != ".idat":
            return False, {
                "error": "INVALID_FILE_FORMAT",
                "message": f"{file.filename} is not an .idat file",
                "type": "/errors/invalid-file-format",
                "title": "Invalid file format",
                "status": 400,
                "filename": file.filename
            }

        ok, reason = looks_like_idat(file)
        if not ok:
            return False, {
                "error": "INVALID_IDAT_CONTENT",
                "message": f"{file.filename}: {reason}",
                "type": "/errors/invalid-idat-content",
                "title": "Invalid IDAT content",
                "status": 400,
                "filename": file.filename,
                "reason": reason
            }

    if len(files) % 2 != 0:
        return False, {
            "error": "INVALID_IDAT_COUNT",
            "message": "IDAT files must come in pairs",
            "type": "/errors/uneven-file-count",
            "title": "Uneven file count",
            "status": 400,
            "file_count": len(files)
        }

    total_size = get_total_file_size(files)
    if total_size > MAX_TOTAL_SIZE:
        return False, {
            "error": "TOTAL_SIZE_TOO_LARGE",
            "message": f"IDAT files too large ({round(total_size / (1024 * 1024), 2)} MB)",
            "type": "/errors/total-size-too-large",
            "title": "Total size too large",
            "status": 400,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "max_size_mb": MAX_TOTAL_SIZE // (1024 * 1024),
            "file_count": len(files)
        }

    expected_samples = len(files) // 2
    return True, {
        "message": f"{len(files)} IDAT files validated ({expected_samples} samples)",
        "file_count": len(files),
        "expected_sample_count": expected_samples,
        "total_size_mb": round(total_size / (1024 * 1024), 2)
    }


def validate_sample_sheet(file: UploadFile) -> Tuple[bool, Dict]:
    """Validate a sample-sheet upload.

    Checks that the file is present, has an allowed extension (.xlsx/.xls/.csv),
    matches the expected magic number, and is within the size limit. Returns
    ``(ok, info)`` with a success summary or an error body.
    """
    if not file:
        return False, {
            "error": "FILE_MISSING",
            "message": "No sample sheet uploaded",
            "type": "/errors/missing-files",
            "title": "Missing files",
            "status": 400
        }


    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_SHEET_EXTENSIONS:
        return False, {
            "error": "INVALID_FILE_FORMAT",
            "message": f"{file.filename}: format not allowed",
            "type": "/errors/invalid-file-format",
            "title": "Invalid file format",
            "status": 415,
            "filename": file.filename,
            "allowed_formats": list(ALLOWED_SHEET_EXTENSIONS)
        }


    try:
        chunk = read_chunk(file, 2048)

        # XLSX = ZIP Container
        if ext == ".xlsx":
            if not chunk.startswith(b"PK\x03\x04"):
                return False, {
                    "error": "INVALID_XLSX_CONTENT",
                    "message": f"{file.filename}: not a valid Excel file",
                    "type": "/errors/invalid-xlsx-content",
                    "title": "Invalid XLSX content",
                    "status": 415,
                    "filename": file.filename
                }

        # XLS = OLE Container
        elif ext == ".xls":
            if not chunk.startswith(b"\xd0\xcf\x11\xe0"):
                return False, {
                    "error": "INVALID_XLS_CONTENT",
                    "message": f"{file.filename}: not a valid Excel file",
                    "type": "/errors/invalid-xls-content",
                    "title": "Invalid XLS content",
                    "status": 415,
                    "filename": file.filename
                }

        # CSV plausibility
        elif ext == ".csv":
            if chunk.startswith(b"%PDF"):
                return False, {
                    "error": "INVALID_CSV_CONTENT",
                    "message": f"{file.filename}: PDF detected, CSV expected",
                    "type": "/errors/invalid-csv-content",
                    "title": "Invalid CSV content",
                    "status": 415,
                    "filename": file.filename
                }

            text = chunk.decode("utf-8", errors="ignore")
            if not any(sep in text for sep in [",", ";", "\t", "\n"]):
                return False, {
                    "error": "INVALID_CSV_CONTENT",
                    "message": f"{file.filename}: not a valid CSV format",
                    "type": "/errors/invalid-csv-content",
                    "title": "Invalid CSV content",
                    "status": 415,
                    "filename": file.filename
                }

    except Exception as e:
        return False, {
            "error": "SAMPLE_SHEET_READ_ERROR",
            "message": f"{file.filename}: file cannot be read",
            "type": "/errors/sample-sheet-read-error",
            "title": "Sample sheet read error",
            "status": 500,
            "filename": file.filename,
            "detail": str(e)
        }

    # 4. size check
    file_size = get_file_size(file)
    if file_size > MAX_SAMPLE_SHEET_SIZE:
        size_mb = round(file_size / (1024 * 1024), 2)
        max_mb = MAX_SAMPLE_SHEET_SIZE // (1024 * 1024)
        return False, {
            "error": "FILE_TOO_LARGE",
            "message": f"{file.filename}: {size_mb} MB (max {max_mb} MB)",
            "type": "/errors/file-too-large",
            "title": "File too large",
            "status": 400,
            "filename": file.filename,
            "size_mb": size_mb,
            "max_size_mb": max_mb
        }

    # 5. success
    return True, {
        "message": f"Sample Sheet validiert: {file.filename}",
        "format": ext,
        "size_mb": round(file_size / (1024 * 1024), 2)
    }
# ==================== PERSISTENCE ====================

def save_idat_files(files: List[UploadFile], job_dir: Path) -> List[str]:
    """Save the uploaded IDAT files into the job directory.

    Args:
        files: The uploaded IDAT files.
        job_dir: The job directory to write into.

    Returns:
        The list of saved file paths as strings.

    Raises:
        ValueError: If two uploads resolve to the same filename.
    """
    saved_paths = []

    for file in files:
        file.file.seek(0)

        safe_name = Path(file.filename or "").name
        file_path = job_dir / safe_name

        if file_path.exists():
            raise ValueError(
                f"Duplicate filename detected: {safe_name}"
            )

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        saved_paths.append(str(file_path))

    return saved_paths

def save_sample_sheet(file: UploadFile, job_dir: Path) -> str:
    """Persist the uploaded sample sheet under a fixed canonical filename.

    The stored filename is always the constant ``SampleSheet.csv`` and never the
    user-supplied one, so the target path is confined to ``job_dir`` by
    construction. No path-traversal check is needed here.
    """
    file.file.seek(0)

    file_path = job_dir / "SampleSheet.csv"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return str(file_path)

def save_filter_settings(filter_settings: Dict, job_dir: Path) -> str:
    """Persist the filter settings as JSON in the job directory.

    Expects an already parsed dict and writes it atomically so a crash mid-write
    cannot corrupt the file. Returns the path to the saved file as a string.
    """
    file_path = Path(job_dir) / "filter_settings.json"
    write_json_atomic(file_path, filter_settings)
    return str(file_path)


# ==================== HELPERS ====================

def ensure_upload_dir(job_id: str) -> Path:
    """Create the temporary directory for a job."""
    job_dir = UPLOAD_BASE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def clean_job_files(job_id: str):
    """Delete all files of a job (best effort, never raises).

    Used, among other things, to roll back a half-created job where a residual
    error can be tolerated. For a guaranteed deletion (reset) use
    ``delete_job_files``.
    """
    job_dir = UPLOAD_BASE_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)


def job_dir_exists(job_id: str) -> bool:
    """Return True if the job's directory still exists on disk."""
    return (UPLOAD_BASE_DIR / job_id).exists()


def delete_job_files(job_id: str) -> None:
    """Delete a job's directory and guarantee it is gone.

    Unlike ``clean_job_files`` this raises if the directory cannot be fully
    removed, so a caller (the reset flow) can refuse to report success while any
    data remains on disk.

    Raises:
        OSError: If the directory still exists after the deletion attempt.
    """
    job_dir = UPLOAD_BASE_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
    if job_dir.exists():
        raise OSError(f"The job directory could not be fully deleted: {job_dir}")

