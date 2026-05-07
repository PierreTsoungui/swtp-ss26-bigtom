# app/services/r_executor.py
import asyncio
from pathlib import Path
from typing import Dict, Any

R_SCRIPTS_DIR = Path("app/scripts")


async def run_r_script(
    script: str,
    job_id: str,
    job_dir: str,
    sample_sheet: str
) -> Dict[str, Any]:
    """
    Ruft das R-Skript auf (geschrieben vom R-Team).
    
    Das R-Skript erwartet:
        --job_id <id>
        --idat_dir <pfad>
        --sample_sheet <dateiname>
    
    Das R-Skript gibt bei Erfolg exit code 0 zurück.
    Bei Fehler exit code != 0 und Fehlermeldung auf stderr.
    """
    
    script_path = R_SCRIPTS_DIR / script
    
    # Prüfen ob Skript existiert (R-Team muss es liefern)
    if not script_path.exists():
        return {
            "returncode": 1,
            "stderr": f"R-Skript nicht gefunden: {script_path}. Bitte von R-Team bereitstellen."
        }
    
    # Aufruf mit korrekten Dateipfaden
    cmd = [
        "Rscript", str(script_path),
        "--job_id", job_id,
        "--idat_dir", job_dir,
        "--sample_sheet", sample_sheet
    ]
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), 
            timeout=600  # 10 Minuten
        )
        
        return {
            "returncode": process.returncode,
            "stdout": stdout.decode('utf-8', errors='replace'),
            "stderr": stderr.decode('utf-8', errors='replace')
        }
        
    except asyncio.TimeoutError:
        return {
            "returncode": 1,
            "stderr": f"R-Skript {script} nach 10 Minuten abgebrochen"
        }
    except Exception as e:
        return {
            "returncode": 1,
            "stderr": f"Fehler beim Ausführen von R: {str(e)}"
        }
