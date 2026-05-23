
import sys
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import patch

# Python-Pfad korrigieren
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


async def mock_run_r_script(
    script: str,
    job_id: str,
    sample_sheet: str,
    job_dir: str,
    script_args: list = None,
    on_progress=None
):
    """
    Mock für run_r_script - Simuliert echtes R-Skript Verhalten.
    
    Simuliert:
    - Mehrere Progress-Updates (20%, 40%, 60%, 80%, 100%)
    - Verzögerungen zwischen Updates (wie echte Verarbeitung)
    - Speichert filter_stats.json im Job-Ordner
    """
    import json
    from pathlib import Path
    
    print(f"[MOCK_R] Starte Simulation für Job {job_id}")
    
    # Simuliere Progress-Updates (wie echtes R-Skript)

    progress_steps = [
        (20, "Detection P-Value Filterung"),
        (40, "Bead Count Filterung"),
        (60, "Non-CpG Filterung"),
        (80, "SNP Filterung"),
        (100, "Filterung abgeschlossen")
    ]
    
    for progress, step in progress_steps:
        if on_progress:
            print(f"[MOCK_R] Sende Progress: {progress}% - {step}")
            await on_progress({"progress": progress, "step": step})
        else:
            print(f"[MOCK_R] WARNUNG: on_progress ist None!")
        
        # Warte zwischen den Updates (simuliert Verarbeitungszeit)
        await asyncio.sleep(0.3)
    
    # Simuliere Filter-Statistiken (wie echtes R-Skript)
    
    filter_stats = {
        "total_probes_before": 485512,
        "total_probes_after": 467530,
        "removed": 17982,
        "steps": [
            {"name": "Detection P-Value", "removed": 12847, "remaining": 472665},
            {"name": "Bead Count", "removed": 2613, "remaining": 470052},
            {"name": "Non-CpG", "removed": 1432, "remaining": 468620},
            {"name": "SNP", "removed": 856, "remaining": 467764},
            {"name": "Multi-Hit", "removed": 234, "remaining": 467530}
        ]
    }
    
    # Speichere Stats in Datei (für GET /filter/.../stats)
    stats_path = Path(job_dir) / "filter_stats.json"
    stats_path.parent.mkdir(parents=True, exist_ok=True)
    with open(stats_path, "w") as f:
        json.dump(filter_stats, f, indent=2)
    
    print(f"[MOCK_R] filter_stats.json gespeichert: {stats_path}")
    print(f"[MOCK_R] Simulation abgeschlossen für Job {job_id}")
    
    return {
        "returncode": 0,
        "stdout": "Mock R-Skript erfolgreich",
        "stderr": "",
        "filter_stats": filter_stats
    }

# Patch: Ersetze run_r_script in allen Tests durch Mock

with patch("app.services.r_executor.run_r_script", mock_run_r_script):
    from app.main import app
    from fastapi.testclient import TestClient

client = TestClient(app)


# PFADE ZU ECHTEN TESTDATEN

TEST_DATA_DIR = Path(__file__).parent / "data" / "206891110005"
SAMPLE_SHEET_PATH = Path(__file__).parent / "data" / "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"


@pytest.fixture
def idat_files():
    """Liefert alle IDAT-Dateien als Liste für Upload"""
    files = []
    if TEST_DATA_DIR.exists():
        for file_path in TEST_DATA_DIR.iterdir():
            if file_path.is_file() and file_path.suffix.lower() == '.idat':
                with open(file_path, "rb") as f:
                    content = f.read()
                files.append((
                    "idat_files", 
                    (file_path.name, content, "application/octet-stream")
                ))
    return files


@pytest.fixture
def sample_sheet():
    """Liefert das Sample Sheet als Tuple für Upload"""
    if SAMPLE_SHEET_PATH.exists():
        with open(SAMPLE_SHEET_PATH, "rb") as f:
            content = f.read()
        return ("sample_sheet", (SAMPLE_SHEET_PATH.name, content, "text/csv"))
    return None


@pytest.fixture
def upload_files(idat_files, sample_sheet):
    """Liefert die kompletten Files für einen Upload-Request"""
    if not idat_files or not sample_sheet:
        pytest.fail("Testdaten nicht gefunden")
    return idat_files + [sample_sheet]