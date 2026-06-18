# app/services/r_executor.py
import asyncio
from collections import defaultdict
import json
import logging
import re
from typing import Dict, Any, Optional, Callable
from pathlib import Path
from app.services.job_manager import register_process, unregister_process

logger = logging.getLogger(__name__)

R_WORKER_CONTAINER = "swtp-ss26-bigtom-r_worker-1"
USE_MOCK_R = True

async def run_r_script(
    script: str,
    job_id: str,
    job_dir: str,
    sample_sheet: str,
    mode: str = "filtering",
    script_args: list = [],
    on_progress: Optional[Callable] = None,
    extra_env: dict = {},
) -> Dict[str, Any]:

    script_path    = f"/app/r_backend/{script}"
    docker_job_dir = f"/app/jobs/{job_id}"

    logger.info("Preparing R script execution for job %s in mode: %s", job_id, mode)

    def env_flags(env: dict) -> list:
        flags = []
        for key, val in env.items():
            flags += ["-e", f"{key}={val}"]
        return flags

    if mode == "normalization_preview":
        docker_sample_sheet = f"{docker_job_dir}/{Path(sample_sheet).name}"
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/filtered_data.rds",
            docker_job_dir,
            docker_sample_sheet,
        ]

    elif mode == "batch_correction":
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            docker_job_dir,
            *script_args,
        ]

    elif mode == "batch_init":
        beta_file, sample_sheet_file, plot_name = script_args[0], script_args[1], script_args[2]
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{beta_file}",
            f"{docker_job_dir}/{sample_sheet_file}",
            docker_job_dir,
            plot_name,
        ]

    elif mode == "svd_plot":
        beta_file, sample_sheet_file, plot_name = script_args[0], script_args[1], script_args[2]
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{beta_file}",
            f"{docker_job_dir}/{sample_sheet_file}",
            docker_job_dir,
            plot_name,
        ]

    elif mode == "heatmap":
        result_rds_name   = script_args[0]
        sample_sheet_name = script_args[1]
        cmd = [
            "docker", "exec",
            *env_flags(extra_env),
            R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{result_rds_name}",
            f"{docker_job_dir}/{sample_sheet_name}",
            docker_job_dir,
        ]

    elif mode == "normalization":
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            docker_job_dir,
            *script_args,
        ]

    else:  # filtering (default)
        cmd = [
            "docker", "exec", R_WORKER_CONTAINER,
            "Rscript", script_path,
            f"{docker_job_dir}/{sample_sheet}",
            docker_job_dir,
            *script_args,
        ]

    logger.info("Executing command: %s", " ".join(cmd))

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        register_process(job_id, process)

        stdout_lines  = []
        stderr_lines  = []
        filter_stats  = {}
        preview_plots = defaultdict(list)

        async def read_stdout():
            nonlocal filter_stats, preview_plots

            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace").strip()
                stdout_lines.append(decoded)
                
                logger.info("R_STDOUT: %s", decoded)

                json_objects = re.findall(r'\{.*?\}', decoded)
                for obj in json_objects:
                    try:
                        data     = json.loads(obj)
                        msg_type = data.get("type")

                        if on_progress:
                            if msg_type == "progress":
                                await on_progress(data)
                            elif msg_type == "error":
                                await on_progress({
                                    "status":       "failed",
                                    "current_step": "Pipeline wegen Fehlers abgebrochen",
                                    "error": {
                                        "type":   f"https://api.bigtom.swtp/errors/{mode}-failed",
                                        "title":  "Pipeline Execution Error",
                                        "status": 500,
                                        "detail": data.get("message", "Unbekannter R-Fehler."),
                                        "instance": f"/api/v1/status/{job_id}",
                                    },
                                })
                            elif msg_type == "done":
                                await on_progress({
                                    "status":           "completed" if mode != "filtering" else "running",
                                    "progress_percent": 100,
                                    "current_step":     "Skript-Verarbeitung erfolgreich abgeschlossen",
                                })

                        if mode == "normalization_preview" and msg_type == "plot":
                            preview_plots[data["method"].lower()].append({
                                "plot_kind": data["plot_kind"],
                                "file":      data["file"],
                            })

                    except (json.JSONDecodeError, ValueError):
                        pass

        async def read_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                stderr_lines.append(decoded)
                
                logger.warning("R_STDERR: %s", decoded)

        await asyncio.gather(read_stdout(), read_stderr())
        returncode = await asyncio.wait_for(process.wait(), timeout=600)
        unregister_process(job_id)

        stdout_str = "\n".join(stdout_lines)
        stderr_str = "\n".join(stderr_lines)

        logger.info("R subprocess finished with returncode: %d", returncode)

        if mode == "filtering" and returncode == 0:
            stats_path = Path(job_dir) / "filter_stats.json"
            if stats_path.exists():
                try:
                    with open(stats_path, "r") as f:
                        filter_stats = json.load(f)
                    logger.info("Successfully loaded filter_stats.json")
                except Exception:
                    logger.exception("Failed to parse filter_stats.json")

        response_data: Dict[str, Any] = {
            "returncode": returncode,
            "stdout":     stdout_str,
            "stderr":     stderr_str,
        }
        if mode == "filtering":
            response_data["filter_stats"] = filter_stats
        elif mode == "normalization_preview":
            response_data["preview_plots"] = dict(preview_plots)

        return response_data

    except asyncio.TimeoutError:
        logger.error("R script execution timed out for job %s after 10 minutes", job_id)
        unregister_process(job_id)
        if "process" in locals():
            process.kill()
            await process.wait()
        return {"returncode": 1, "stdout": "", "stderr": "R script timeout after 10 minutes"}

    except Exception:
        logger.exception("Unexpected error occurred while running R script for job %s", job_id)
        unregister_process(job_id)
        return {"returncode": 1, "stdout": "", "stderr": "Internal executor error"}