import shutil
from pathlib import Path
from typing import List, Tuple, Dict
from fastapi import UploadFile

UPLOAD_BASE_DIR = Path("app/temp")
ALLOWED_IDAT_EXTENSIONS = {".idat"}
ALLOWED_SHEET_EXTENSIONS = {".xlsx", ".xls", ".csv"}


MAX_TOTAL_SIZE = 200 * 1024 * 1024  # 200 MB (mehr als genug für 30 MB + Puffer)


# ==================== HILFSFUNKTIONEN ====================

def get_file_size(file: UploadFile) -> int:
    """
    Gibt die Größe einer UploadFile in Bytes zurück.
    Setzt den Dateizeiger danach wieder zurück.
    """
    current_pos = file.file.tell()
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(current_pos)
    return size


def get_total_file_size(files: List[UploadFile]) -> int:
    """Gibt die Gesamtgröße aller Dateien zurück"""
    total = 0
    for file in files:
        total += get_file_size(file)
    return total


# ==================== VALIDIERUNG ====================

def validate_idat_files(files: List[UploadFile]) -> Tuple[bool, Dict]:
    """
    VALIDIERUNG nach Kundengespräch:
    - Dateien vorhanden
    - Format .idat
    - Anzahl gerade (rot + grün pro Sample)
    - Gesamtgröße (basierend auf 16 Samples = 30 MB)
    """
    # 1. Leere Liste?
    if not files:
        return False, {
            "error": "FILE_MISSING",
            "message": "Keine IDAT-Dateien hochgeladen",
            "details": {"missing_fields": ["idat_files"]}
        }
    
    # 2. Format prüfen
    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_IDAT_EXTENSIONS:
            return False, {
                "error": "INVALID_FILE_FORMAT",
                "message": f"Datei '{file.filename}' ist keine .idat Datei",
                "details": {"invalid_file": file.filename}
            }
    
    # 3. Anzahl prüfen (muss gerade sein für rot+grün)
    if len(files) % 2 != 0:
        return False, {
            "error": "INVALID_IDAT_COUNT",
            "message": f"IDAT-Dateien müssen paarweise sein (rot + grün pro Probe). Gefunden: {len(files)} Dateien",
            "details": {"file_count": len(files)}
        }
    
    # 4. Gesamtgröße prüfen ( 16 Samples = 30 MB)
    total_size = get_total_file_size(files)
    if total_size > MAX_TOTAL_SIZE:
        return False, {
            "error": "TOTAL_SIZE_TOO_LARGE",
            "message": f"IDAT-Dateien sind zu groß ({round(total_size / (1024 * 1024), 2)} MB). Erwartet: ca. 30 MB für 16 Proben",
            "details": {
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "expected_size_mb": 30,
                "file_count": len(files)
            }
        }
    
    # Erfolg
    expected_samples = len(files) // 2
    return True, {
        "message": f"IDAT-Dateien valid: {len(files)} Dateien für {expected_samples} Proben, {round(total_size / (1024 * 1024), 2)} MB",
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
    """
    # 1. Datei vorhanden?
    if not file:
        return False, {
            "error": "FILE_MISSING",
            "message": "Kein Sample Sheet hochgeladen",
            "details": {"missing_fields": ["sample_sheet"]}
        }
    
    # 2. Format prüfen
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_SHEET_EXTENSIONS:
        return False, {
            "error": "INVALID_FILE_FORMAT",
            "message": f"Sample Sheet '{file.filename}' hat falsches Format. Erwartet: .xlsx, .xls oder .csv",
            "details": {
                "invalid_file": file.filename,
                "allowed_formats": list(ALLOWED_SHEET_EXTENSIONS)
            }
        }
    
    # 3. Größe prüfen (Sample Sheet sollte klein sein, z. B. < 10 MB)
    file_size = get_file_size(file)
    if file_size > 10 * 1024 * 1024:  # 10 MB
        return False, {
            "error": "FILE_TOO_LARGE",
            "message": f"Sample Sheet '{file.filename}' ist zu groß ({round(file_size / (1024 * 1024), 2)} MB)",
            "details": {
                "size_mb": round(file_size / (1024 * 1024), 2)
            }
        }
    
    return True, {
        "message": f"Sample Sheet valid: {file.filename}",
        "format": ext,
        "filename": file.filename
    }


# ==================== SPEICHERN ====================

def save_idat_files(files: List[UploadFile], job_dir: Path) -> List[str]:
    """Speichert IDAT-Dateien"""
    saved_paths = []
    for file in files:
        file_path = job_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_paths.append(str(file_path))
    return saved_paths


def save_sample_sheet(file: UploadFile, job_dir: Path) -> str:
    """Speichert Sample Sheet"""
    file_path = job_dir / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
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