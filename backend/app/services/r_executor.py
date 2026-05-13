# app/services/r_executor.py
import asyncio
import json
from typing import Dict, Any, Optional, Callable
from pathlib import Path

R_WORKER_CONTAINER = "swtp-ss26-bigtom-r_worker-1"
USE_MOCK_R = True


async def run_r_script(
    script: str,
    job_id: str,
    job_dir: str,
    script_args: list[str],
    on_progress: Optional[Callable] = None,
    
) -> Dict[str, Any]:
    """
    Führt R-Skript aus und parst JSON-Fortschrittsmeldungen.

    Args:
        script: Name des R-Skripts (z. B. "data.R", "normalize.R")
        job_id: Eindeutige Job-ID
        job_dir: Job-Verzeichnis
        on_progress: Callback für Fortschritts-Updates
        script_args: Generische Argumente für das R-Skript (z.B. {"method": "noob"})

    Returns:
        Dict mit returncode, stdout, stderr, result_data
    """
    docker_job_dir = f"/app/jobs/{job_id}"
    script_path = f"/app/r_backend/{script}"
    
    
    cmd = [
        "docker", "exec", R_WORKER_CONTAINER,
        "Rscript", script_path,  
    ]
    
  
    if script_args:
       for arg in script_args:
            cmd.append(f"{docker_job_dir}/{arg}")
    cmd.append(docker_job_dir)
    
    print(f"[R_EXECUTOR] Starte: {' '.join(cmd)}", flush=True)

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout_lines = []
        stderr_lines = []
        filter_stats = {}  

        async def read_stdout():
            nonlocal filter_stats 
            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace").strip()
                stdout_lines.append(decoded)
                print(f"[R_STDOUT] {decoded}", flush=True)

               
                try:
                    data = json.loads(decoded)

                    # Progress-Meldung
                    if data.get("type") == "progress":
                        if on_progress:
                            await on_progress({
                                "progress": data.get("percent", 0),
                                "step": data.get("step", "Verarbeitung...")
                            })

                        if "filter_stats" in data:
                            filter_stats = data["filter_stats"]

                except json.JSONDecodeError:
                    pass

        async def read_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                stderr_lines.append(decoded)
                print(f"[R_STDERR] {decoded}", flush=True)

       
        await asyncio.gather(read_stdout(), read_stderr())
        returncode = await process.wait()

        stdout_str = "\n".join(stdout_lines)
        stderr_str = "\n".join(stderr_lines)

        print(f"[R_EXECUTOR] returncode: {returncode}", flush=True)

        
        if filter_stats and returncode == 0:
            
            stats_path = Path(job_dir) / "filter_stats.json"
            stats_path.parent.mkdir(parents=True, exist_ok=True)
            with open(stats_path, "w") as f:
                json.dump(filter_stats, f, indent=2)
            print(f"[R_EXECUTOR] filter_stats gespeichert: {stats_path}", flush=True)

        return {
            "returncode": returncode,
            "stdout": stdout_str,
            "stderr": stderr_str,
            "filter_stats": filter_stats  
        }

    except asyncio.TimeoutError:
        error_msg = "R-Skript nach 10 Minuten abgebrochen"
        print(f"[R_EXECUTOR] {error_msg}", flush=True)

        if 'process' in locals():
            process.kill()
            await process.wait()

        return {
            "returncode": 1,
            "stdout": "",
            "stderr": error_msg,
            "result_data": {}
        }

    except Exception as e:
        error_msg = f"Fehler beim Ausführen: {str(e)}"
        print(f"[R_EXECUTOR] {error_msg}", flush=True)

        return {
            "returncode": 1,
            "stdout": "",
            "stderr": error_msg,
            "result_data": {}
        }