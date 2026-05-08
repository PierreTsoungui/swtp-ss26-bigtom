import asyncio
from pathlib import Path
from typing import Dict, Any

R_WORKER_CONTAINER = "swtp-ss26-bigtom-r_worker-1"

async def run_r_script(
    script: str,
    job_id: str,
    job_dir: str,
    sample_sheet: str
) -> Dict[str, Any]:

    script_path = f"/app/r_backend/{script}"

    cmd = [
        "docker", "exec", R_WORKER_CONTAINER,
        "Rscript", script_path,
        f"/app/jobs/{job_id}/{sample_sheet}",  # args[1] = samplesheet
        f"/app/jobs/{job_id}"                   # args[2] = idat_dir
    ]

    print(f"[R_EXECUTOR] Starte: {' '.join(cmd)}", flush=True)

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=600
        )

        stdout_str = stdout.decode('utf-8', errors='replace')
        stderr_str = stderr.decode('utf-8', errors='replace')

        print(f"[R_EXECUTOR] returncode: {process.returncode}", flush=True)
        print(f"[R_EXECUTOR] stdout: {stdout_str}", flush=True)
        if stderr_str:
            print(f"[R_EXECUTOR] stderr: {stderr_str}", flush=True)

        return {
            "returncode": process.returncode,
            "stdout": stdout_str,
            "stderr": stderr_str
        }

    except asyncio.TimeoutError:
        print(f"[R_EXECUTOR] Timeout nach 10 Minuten", flush=True)
        return {"returncode": 1, "stderr": "R-Skript nach 10 Minuten abgebrochen"}

    except Exception as e:
        print(f"[R_EXECUTOR] Exception: {str(e)}", flush=True)
        return {"returncode": 1, "stderr": f"Fehler: {str(e)}"}