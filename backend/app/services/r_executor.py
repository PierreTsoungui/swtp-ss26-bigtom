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
    sample_sheet: str,
    mode: str = "filtering",
    script_args: list = [],
    on_progress: Optional[Callable] = None
) -> Dict[str, Any]:

    script_path = f"/app/r_backend/{script}"
    docker_job_dir = f"/app/jobs/{job_id}"
    script_path = f"/app/r_backend/{script}"
    
    
    cmd = [
        "docker", "exec", R_WORKER_CONTAINER,
        "Rscript", script_path,  
    ]

    print(f"[R_EXECUTOR] mode={mode}", flush=True)

    if mode == "normalization_preview":
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/filtered_data.rds",
            docker_job_dir
        ]
    elif mode == "normalization":
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            docker_job_dir,
            *script_args          # <- method kommt hier rein
        ]
    else:  # filtering
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{sample_sheet}",
            docker_job_dir
        ]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout_lines = []
        stderr_lines = []

        filter_stats = {}
        preview_plots = []

        async def read_stdout():
            nonlocal filter_stats, preview_plots

            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace").strip()
                stdout_lines.append(decoded)

                print(f"[R] {decoded}", flush=True)

                
                # 1. PROGRESS (TEXT FORMAT)
                
                if decoded.startswith("PROGRESS:"):
                    try:
                        percent = int(decoded.replace("PROGRESS:", "").strip())
                        if on_progress:
                            await on_progress({
                                "progress": percent,
                                "step": "Processing..."
                            })
                    except:
                        pass

                
                # 2. JSON EVENTS
                
                try:
                    data = json.loads(decoded)

                    # progress json
                    if "progress" in data:
                        if on_progress:
                            await on_progress(data)

                    # FILTER MODE
                    if mode == "filtering":
                        if "filter_stats" in data:
                            filter_stats.update(data["filter_stats"])

                    # PREVIEW MODE
                    if mode == "normalization_preview":
                        if data.get("type") == "plot":
                           preview_plots.append({
                                    "method": data["method"],
                                    "file": data["file"]
                                })

                except json.JSONDecodeError:
                    pass

        async def read_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                stderr_lines.append(line.decode())

        await asyncio.gather(read_stdout(), read_stderr())
        returncode = await process.wait()

        stdout_str = "\n".join(stdout_lines)
        stderr_str = "\n".join(stderr_lines)

       
        # SAVE FILTER STATS
        
        if mode == "filtering" and filter_stats and returncode == 0:
            stats_path = Path(job_dir) / "filter_stats.json"
            stats_path.parent.mkdir(parents=True, exist_ok=True)

            with open(stats_path, "w") as f:
                json.dump(filter_stats, f, indent=2)

      
        # RETURN FILTER MODE
       
        if mode == "filtering":
            return {
                "returncode": returncode,
                "stdout": stdout_str,
                "stderr": stderr_str,
                "filter_stats": filter_stats
            }

        # RETURN PREVIEW MODE
        
        if mode == "normalization_preview":
            return {
                "returncode": returncode,
                "stdout": stdout_str,
                "stderr": stderr_str,
                "preview_plots": preview_plots[:5] 
            }

        if mode == "normalization":
            return {
                "returncode": returncode,
                "stdout": stdout_str,
                "stderr": stderr_str
            }

        return {
            "returncode": returncode,
            "stdout": stdout_str,
            "stderr": stderr_str
        }

    except Exception as e:
        return {
            "returncode": 1,
            "stdout": "",
            "stderr": str(e)
        }