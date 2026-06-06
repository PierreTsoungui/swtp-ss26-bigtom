from email import header
import shutil
from pathlib import Path
from typing import List, Tuple, Dict

from fastapi import UploadFile
import os
import json

UPLOAD_BASE_DIR = Path(os.getenv("JOB_BASE_DIR", "./jobs"))

#UPLOAD_BASE_DIR = Path("/app/jobs")
ALLOWED_IDAT_EXTENSIONS = {".idat"}
ALLOWED_SHEET_EXTENSIONS = {".xlsx", ".xls", ".csv"}


MAX_TOTAL_SIZE = 600 * 1024 * 1024  # 200 MB (mehr als genug für 30 MB + Puffer)
MAX_SAMPLE_SHEET_SIZE = 10 * 1024 * 1024

# ==================== HILFSFUNKTIONEN ====================

def read_chunk(file: UploadFile, size: int = 2048) -> bytes:
    """
    Liest Bytes ohne den Dateizeiger dauerhaft zu verändern.
    """
    pos = file.file.tell()
    chunk = file.file.read(size)
    file.file.seek(pos)
    return chunk


def get_file_size(file: UploadFile) -> int:
    """
    Gibt die Dateigröße zurück.
    """
    current_pos = file.file.tell()

    file.file.seek(0, 2)
    size = file.file.tell()

    file.file.seek(current_pos)

    return size


def get_total_file_size(files: List[UploadFile]) -> int:
    return sum(get_file_size(file) for file in files)





# ==================== VALIDIERUNG ====================

def looks_like_idat(file: UploadFile) -> Tuple[bool, str]:
    """
    Risikoarme Plausibilitätsprüfung für IDAT-Dateien.
    Ziel:
    - offensichtliche Fake-Dateien blockieren
    - echte IDATs nicht unnötig ablehnen
    """

    chunk = read_chunk(file, 2048)

    # Datei zu klein
    if len(chunk) < 100:
        return False, "Datei zu klein"

    # offensichtliches PDF
    if chunk.startswith(b"%PDF"):
        return False, "PDF erkannt"

    # typische Binärstruktur prüfen
    if chunk.count(b"\x00") < 10:
        return False, "keine typische Binärstruktur"

    return True, "OK"


def validate_idat_files(files: List[UploadFile]) -> Tuple[bool, Dict]:
    if not files:
        return False, {
            "error": "FILE_MISSING",
            "message": "Keine IDAT-Dateien hochgeladen",
            "type": "/errors/missing-files",
            "title": "Missing files",
            "status": 400
        }

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext != ".idat":
            return False, {
                "error": "INVALID_FILE_FORMAT",
                "message": f"{file.filename} ist keine .idat Datei",
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
            "message": "IDAT-Dateien müssen paarweise sein",
            "type": "/errors/uneven-file-count",
            "title": "Uneven file count",
            "status": 400,
            "file_count": len(files)
        }

    total_size = get_total_file_size(files)
    if total_size > MAX_TOTAL_SIZE:
        return False, {
            "error": "TOTAL_SIZE_TOO_LARGE",
            "message": f"IDAT-Dateien zu groß ({round(total_size / (1024 * 1024), 2)} MB)",
            "type": "/errors/total-size-too-large",
            "title": "Total size too large",
            "status": 400,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "max_size_mb": MAX_TOTAL_SIZE // (1024 * 1024),
            "file_count": len(files)
        }

    expected_samples = len(files) // 2
    return True, {
        "message": f"{len(files)} IDAT-Dateien validiert ({expected_samples} Samples)",
        "file_count": len(files),
        "expected_sample_count": expected_samples,
        "total_size_mb": round(total_size / (1024 * 1024), 2)
    }


def validate_sample_sheet(file: UploadFile) -> Tuple[bool, Dict]:
    """
    VALIDIERUNG:
    - Datei vorhanden
    - Format .xlsx, .xls, .csv
    - Größe (Sample Sheet ist klein)
    - Magic Number (Excel-Dateien prüfen)
    """


    if not file:
        return False, {
            "error": "FILE_MISSING",
            "message": "Kein Sample Sheet hochgeladen",
            "type": "/errors/missing-files",
            "title": "Missing files",
            "status": 400
        }


    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_SHEET_EXTENSIONS:
        return False, {
            "error": "INVALID_FILE_FORMAT",
            "message": f"{file.filename}: Format nicht erlaubt",
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
                    "message": f"{file.filename}: Keine gültige Excel-Datei",
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
                    "message": f"{file.filename}: Keine gültige Excel-Datei",
                    "type": "/errors/invalid-xls-content",
                    "title": "Invalid XLS content",
                    "status": 415,
                    "filename": file.filename
                }

        # CSV Plausibilität
        elif ext == ".csv":
            if chunk.startswith(b"%PDF"):
                return False, {
                    "error": "INVALID_CSV_CONTENT",
                    "message": f"{file.filename}: PDF erkannt, CSV erwartet",
                    "type": "/errors/invalid-csv-content",
                    "title": "Invalid CSV content",
                    "status": 415,
                    "filename": file.filename
                }

            text = chunk.decode("utf-8", errors="ignore")
            if not any(sep in text for sep in [",", ";", "\t", "\n"]):
                return False, {
                    "error": "INVALID_CSV_CONTENT",
                    "message": f"{file.filename}: Kein gültiges CSV-Format",
                    "type": "/errors/invalid-csv-content",
                    "title": "Invalid CSV content",
                    "status": 415,
                    "filename": file.filename
                }

    except Exception as e:
        return False, {
            "error": "SAMPLE_SHEET_READ_ERROR",
            "message": f"{file.filename}: Datei kann nicht gelesen werden",
            "type": "/errors/sample-sheet-read-error",
            "title": "Sample sheet read error",
            "status": 500,
            "filename": file.filename,
            "detail": str(e)
        }

    # 4. Größenprüfung
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

    # 5. Erfolg
    return True, {
        "message": f"Sample Sheet validiert: {file.filename}",
        "format": ext,
        "size_mb": round(file_size / (1024 * 1024), 2)
    }
# ==================== SPEICHERN ====================

def save_idat_files(files: List[UploadFile], job_dir: Path) -> List[str]:
    saved_paths = []

    for file in files:
        file.file.seek(0)

        safe_name = Path(file.filename).name
        file_path = job_dir / safe_name

        if file_path.exists():
            raise ValueError(
                f"Doppelter Dateiname erkannt: {safe_name}"
            )

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        saved_paths.append(str(file_path))

    return saved_paths

# ÄNDERUNG
def save_sample_sheet(file: UploadFile, job_dir: Path) -> str:
    file.file.seek(0)

    safe_name = "SampleSheet.csv" # Path(file.filename).name
    file_path = job_dir / safe_name
    try:
        file_path.resolve().relative_to(job_dir.resolve())
    except ValueError:
        raise ValueError("Ungültiger Dateiname")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return str(file_path)

def save_filter_settings(filter_settings: Dict, job_dir: Path) -> str:
    """
    Speichert die filter_settings als JSON-Datei im Job-Ordner.
    Erwartet ein bereits geparstes Dict (aus JSON).
    Gibt den Pfad zur gespeicherten Datei als String zurück.
    """
    job_dir = Path(job_dir)
    job_dir.mkdir(parents=True, exist_ok=True)
    file_path = job_dir / "filter_settings.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(filter_settings, f)
    return str(file_path)


# ==================== HILFSFUNKTIONEN ====================

def ensure_upload_dir(job_id: str) -> Path:
    """Erstellt temporären Ordner für einen Job"""
    job_dir = UPLOAD_BASE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def clean_job_files(job_id: str):
    """Löscht alle Dateien eines Jobs"""
    job_dir = UPLOAD_BASE_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)

