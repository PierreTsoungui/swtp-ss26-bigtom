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
        docker_sample_sheet = f"{docker_job_dir}/{Path(sample_sheet).name}"
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/filtered_data.rds",
            docker_job_dir,
            docker_sample_sheet
        ]
    elif mode == "batch_correction":
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            docker_job_dir,
            *script_args
        ]
    elif mode == "batch_init":
        beta_file         = script_args[0]  # "normalized_data.rds"
        sample_sheet_file = script_args[1]  # "Demo_...SampleSheet.csv"
        plot_name         = script_args[2]  # "svd_plot_0.png"
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{beta_file}",
            f"{docker_job_dir}/{sample_sheet_file}",
            docker_job_dir,
            plot_name
        ]

    elif mode == "svd_plot":
        beta_file         = script_args[0]  # "corrected_data.rds"
        sample_sheet_file = script_args[1]  # "Demo_...SampleSheet.csv"
        plot_name         = script_args[2]  # "svd_plot_1.png"
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{beta_file}",
            f"{docker_job_dir}/{sample_sheet_file}",
            docker_job_dir,
            plot_name
        ]
    elif mode == "normalization":
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            docker_job_dir,
            *script_args
        ]
    else:  # filtering
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{sample_sheet}",
            docker_job_dir,
            *script_args
        ]

    print(f"[R_EXECUTOR] Starte: {' '.join(cmd)}", flush=True)

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        job_manager.register_process(job_id, process)

        stdout_lines = []
        stderr_lines = []
        filter_stats = {}
        preview_plots = defaultdict(list)

        # ------------------------------------------------------------
        # READ STDOUT (UPPC-konformer Parser)
        # ------------------------------------------------------------
        async def read_stdout():
            nonlocal filter_stats
            nonlocal preview_plots

            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace").strip()
                stdout_lines.append(decoded)

                print(f"[R_STDOUT] {decoded}", flush=True)

                # Suche nach validen JSON-Strukturen in der Zeile
                json_objects = re.findall(r'\{.*?\}', decoded)
                for obj in json_objects:
                    try:
                        data = json.loads(obj)
                        msg_type = data.get("type")

                        if on_progress:
                            # 1. UPPC Progress Event: Übergib das ursprüngliche R-Event unverändert.
                            if msg_type == "progress":
                                await on_progress(data)
                            
                            # 2. UPPC Error Event -> Transformierung in RFC 7807 Problem Detail
                            elif msg_type == "error":
                                await on_progress({
                                    "status": "failed",
                                    "current_step": "Pipeline wegen Fehlers abgebrochen",
                                    "error": {
                                        "type": f"https://api.bigtom.swtp/errors/{mode}-failed",
                                        "title": "Pipeline Execution Error",
                                        "status": 500,
                                        "detail": data.get("message", "Ein unbekannter Fehler ist im R-Backend aufgetreten."),
                                        "instance": f"/api/v1/status/{job_id}"
                                    }
                                })
                            
                            # 3. UPPC Done Event
                            elif msg_type == "done":
                                await on_progress({
                                    "status": "completed" if mode != "filtering" else "running",
                                    "progress_percent": 100,
                                    "current_step": "Skript-Verarbeitung erfolgreich abgeschlossen"
                                })

                        # Normalization Preview Plots (Sonderspezifikation beibehalten)
                        if mode == "normalization_preview" and msg_type == "plot":
                            preview_plots[data["method"].lower()].append({
                                "plot_kind": data["plot_kind"],
                                "file": data["file"]
                            })

                    except (json.JSONDecodeError, ValueError):
                        pass

        # ------------------------------------------------------------
        # READ STDERR
        # ------------------------------------------------------------
        async def read_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                stderr_lines.append(decoded)
                print(f"[R_STDERR] {decoded}", flush=True)

        # Starte asynchrones Einlesen beider Streams
        await asyncio.gather(read_stdout(), read_stderr())

        # Warte auf das Prozessende
        returncode = await asyncio.wait_for(process.wait(), timeout=600)
        job_manager.unregister_process(job_id)

        stdout_str = "\n".join(stdout_lines)
        stderr_str = "\n".join(stderr_lines)

        print(f"[R_EXECUTOR] returncode: {returncode}", flush=True)

        # ------------------------------------------------------------
        # LOAD FILTER STATS FROM DISK (Zentraler Fix für init_filter.R)
        # ------------------------------------------------------------
        if mode == "filtering" and returncode == 0:
            stats_path = Path(job_dir) / "filter_stats.json"
            if stats_path.exists():
                try:
                    with open(stats_path, "r") as f:
                        filter_stats = json.load(f)
                    print(f"[R_EXECUTOR] Filter stats erfolgreich geladen.", flush=True)
                except Exception as e:
                    print(f"[R_EXECUTOR] Fehler beim Laden der filter_stats.json: {str(e)}", flush=True)

        # Packe Rückgabe-Strukturen
        response_data = {
            "returncode": returncode,
            "stdout": stdout_str,
            "stderr": stderr_str
        }

        if mode == "filtering":
            response_data["filter_stats"] = filter_stats
        elif mode == "normalization_preview":
            response_data["preview_plots"] = dict(preview_plots)

        return response_data

    except asyncio.TimeoutError:
        print("[R_EXECUTOR] Timeout nach 10 Minuten", flush=True)
        job_manager.unregister_process(job_id)
        if 'process' in locals():
            process.kill()
            await process.wait()
        return {
            "returncode": 1,
            "stdout": "",
            "stderr": "R script timeout after 10 minutes"
        }

    except Exception as e:
        print(f"[R_EXECUTOR] ERROR: {str(e)}", flush=True)
        job_manager.unregister_process(job_id)
        return {
            "returncode": 1,
            "stdout": "",
            "stderr": str(e)
        }