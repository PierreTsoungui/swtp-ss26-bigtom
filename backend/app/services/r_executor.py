# app/services/r_executor.py

import asyncio
from collections import defaultdict
import json

import re
from typing import Dict, Any, Optional, Callable
from pathlib import Path

from app.services import job_manager

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

    print(f"[R_EXECUTOR] mode={mode}", flush=True)

    # ------------------------------------------------------------
    # COMMANDS
    # ------------------------------------------------------------

    if mode == "normalization_preview":

        cmd = [
            "docker", "exec",
            R_WORKER_CONTAINER,

            "Rscript",
            script_path,

            f"{docker_job_dir}/filtered_data.rds",
            docker_job_dir
        ]

    elif mode == "normalization":

        cmd = [
            "docker", "exec",
            R_WORKER_CONTAINER,

            "Rscript",
            script_path,

            docker_job_dir,

            *script_args
        ]

    else:  # filtering

        cmd = [
            "docker", "exec",
            R_WORKER_CONTAINER,

            "Rscript",
            script_path,

            f"{docker_job_dir}/{sample_sheet}",
            docker_job_dir,
            *script_args
        ]

    print(
        f"[R_EXECUTOR] Starte: {' '.join(cmd)}",
        flush=True
    )

    try:

        # ------------------------------------------------------------
        # START PROCESS
        # ------------------------------------------------------------

        process = await asyncio.create_subprocess_exec(
            *cmd,

            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        # ------------------------------------------------------------
        # REGISTER PROCESS
        # ------------------------------------------------------------

        job_manager.register_process(
            job_id,
            process
        )

        stdout_lines = []
        stderr_lines = []

        filter_stats = {}
         # FIX 1: KEINE LISTE MEHR → strukturierte Sammlung
        preview_plots = defaultdict(list)

        # ------------------------------------------------------------
        # READ STDOUT
        # ------------------------------------------------------------

        async def read_stdout():

            nonlocal filter_stats
            nonlocal preview_plots

            while True:

                line = await process.stdout.readline()

                if not line:
                    break

                decoded = line.decode(
                    "utf-8",
                    errors="replace"
                ).strip()

                stdout_lines.append(decoded)

                print(
                    f"[R_STDOUT] {decoded}",
                    flush=True
                )

                # ----------------------------------------------------
                # LEGACY PROGRESS FORMAT
                # ----------------------------------------------------
                #
                # PROGRESS:80
                # ----------------------------------------------------

                if decoded.startswith("PROGRESS:"):

                    try:

                        percent = int(
                            decoded.replace(
                                "PROGRESS:",
                                ""
                            ).strip()
                        )

                        if on_progress:

                            await on_progress({
                                "progress": percent,
                                "step": "Processing..."
                            })

                    except Exception:
                        pass
                 # ----------------------------------------------------
                # FIX 2: MULTI-JSON HANDLING (WICHTIGSTER FIX)
                # ----------------------------------------------------

                json_objects = re.findall(r'\{.*?\}', decoded)

                for obj in json_objects:

                    try:
                        data = json.loads(obj)

                        # progress JSON
                        if "progress" in data and on_progress:
                            await on_progress(data)
                      
                      # filtering stats
                        if mode == "filtering":
                            if "filter_stats" in data:
                                filter_stats.update(data["filter_stats"])
                  
                        # normalization preview plots
                        
                        if mode == "normalization_preview":

                            if data.get("type") == "plot":

                                preview_plots[data["method"].lower()].append({
                                    "plot_kind": data["plot_kind"],
                                    "file": data["file"]
                                })

                    except json.JSONDecodeError:
                        pass

        # ------------------------------------------------------------
        # READ STDERR
        # ------------------------------------------------------------

        async def read_stderr():

            while True:

                line = await process.stderr.readline()

                if not line:
                    break

                decoded = line.decode(
                    "utf-8",
                    errors="replace"
                ).strip()

                stderr_lines.append(decoded)

                print(
                    f"[R_STDERR] {decoded}",
                    flush=True
                )

        # ------------------------------------------------------------
        # RUN READERS
        # ------------------------------------------------------------

        await asyncio.gather(
            read_stdout(),
            read_stderr()
        )

        # ------------------------------------------------------------
        # WAIT WITH TIMEOUT
        # ------------------------------------------------------------

        returncode = await asyncio.wait_for(
            process.wait(),
            timeout=600
        )

        # ------------------------------------------------------------
        # UNREGISTER PROCESS
        # ------------------------------------------------------------

        job_manager.unregister_process(job_id)

        stdout_str = "\n".join(stdout_lines)
        stderr_str = "\n".join(stderr_lines)

        print(
            f"[R_EXECUTOR] returncode: {returncode}",
            flush=True
        )

        # ------------------------------------------------------------
        # SAVE FILTER STATS
        # ------------------------------------------------------------

        if (
            mode == "filtering"
            and filter_stats
            and returncode == 0
        ):

            stats_path = Path(job_dir) / "filter_stats.json"

            stats_path.parent.mkdir(
                parents=True,
                exist_ok=True
            )

            with open(stats_path, "w") as f:

                json.dump(
                    filter_stats,
                    f,
                    indent=2
                )

            print(
                f"[R_EXECUTOR] Filter stats saved: {stats_path}",
                flush=True
            )

        # ------------------------------------------------------------
        # RETURN FILTERING
        # ------------------------------------------------------------

        if mode == "filtering":

            return {

                "returncode": returncode,
                "stdout": stdout_str,
                "stderr": stderr_str,
                "filter_stats": filter_stats
            }

        # ------------------------------------------------------------
        # RETURN NORMALIZATION PREVIEW
        # ------------------------------------------------------------
         # FIX 3: KEIN slicing mehr -> keine Datenverluste
        if mode == "normalization_preview":

            return {

                "returncode": returncode,
                "stdout": stdout_str,
                "stderr": stderr_str,
                "preview_plots": dict(preview_plots)
            }

        # ------------------------------------------------------------
        # RETURN NORMALIZATION
        # ------------------------------------------------------------

        if mode == "normalization":

            return {

                "returncode": returncode,
                "stdout": stdout_str,
                "stderr": stderr_str
            }

        # ------------------------------------------------------------
        # DEFAULT RETURN
        # ------------------------------------------------------------

        return {

            "returncode": returncode,
            "stdout": stdout_str,
            "stderr": stderr_str
        }

    # ------------------------------------------------------------
    # TIMEOUT
    # ------------------------------------------------------------

    except asyncio.TimeoutError:

        print(
            "[R_EXECUTOR] Timeout after 10 minutes",
            flush=True
        )

        job_manager.unregister_process(job_id)

        if 'process' in locals():

            process.kill()
            await process.wait()

        return {

            "returncode": 1,
            "stdout": "",
            "stderr": "R script timeout after 10 minutes"
        }

    # ------------------------------------------------------------
    # GENERAL ERROR
    # ------------------------------------------------------------

    except Exception as e:

        print(
            f"[R_EXECUTOR] ERROR: {str(e)}",
            flush=True
        )

        job_manager.unregister_process(job_id)

        return {

            "returncode": 1,
            "stdout": "",
            "stderr": str(e)
        }