import asyncio
import atexit
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Python path correction
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Redirect JOB_BASE_DIR to a writable temp dir before any app import so that
# tests work regardless of who runs them (root or UID 1000 in Docker).
_TEST_JOBS_DIR = tempfile.mkdtemp(prefix="pytest_bigtom_")
os.environ["JOB_BASE_DIR"] = _TEST_JOBS_DIR
atexit.register(shutil.rmtree, _TEST_JOBS_DIR, ignore_errors=True)


async def mock_run_r_script(
    command, cancel_event: asyncio.Event, on_progress=None  # RCommand object (new signature)
):
    """
    Mock for run_r_script - Simulates real R script behavior.

    Simulates:
    - Multiple progress updates (20%, 40%, 60%, 80%, 100%)
    - Delays between updates (like real processing)
    - Saves filter_stats.json in the job directory
    - Handles different command modes (filtering, normalization_preview, etc.)
    """
    from pathlib import Path

    from app.services.r_executor.result import ExecutionResult, ExecutionStatus

    job_id = command.job_id
    job_dir = command.job_dir

    print(f"[MOCK_R] Starting simulation for job {job_id}")
    print(f"[MOCK_R] Mode: {command.mode_label}")

    # Simulate progress updates based on mode
    if command.mode_label == "filtering":
        progress_steps = [
            (20, "Detection P-Value Filtering"),
            (40, "Bead Count Filtering"),
            (60, "Non-CpG Filtering"),
            (80, "SNP Filtering"),
            (100, "Filtering complete"),
        ]
    elif command.mode_label == "normalization_preview":
        progress_steps = [
            (25, "RAW normalization"),
            (50, "NOOB normalization"),
            (75, "QUANTILE normalization"),
            (100, "Preview complete"),
        ]
    else:
        progress_steps = [(50, "Processing..."), (100, "Complete")]

    for progress, step in progress_steps:
        if on_progress:
            print(f"[MOCK_R] Sending progress: {progress}% - {step}")
            await on_progress({"progress": progress, "step": step})
        else:
            print("[MOCK_R] WARNING: on_progress is None!")

        # Wait between updates (simulate processing time)
        await asyncio.sleep(0.2)

    # Simulate filter statistics (for filtering mode)
    filter_stats = {}
    preview_plots = []

    if command.mode_label == "filtering":
        filter_stats = {
            "total_probes_before": 485512,
            "total_probes_after": 467530,
            "removed": 17982,
            "steps": [
                {"name": "Detection P-Value", "removed": 12847, "remaining": 472665},
                {"name": "Bead Count", "removed": 2613, "remaining": 470052},
                {"name": "Non-CpG", "removed": 1432, "remaining": 468620},
                {"name": "SNP", "removed": 856, "remaining": 467764},
                {"name": "Multi-Hit", "removed": 234, "remaining": 467530},
            ],
        }

        # Save filter_stats.json (for GET /filter/.../stats)
        stats_path = Path(job_dir) / "filter_stats.json"
        stats_path.parent.mkdir(parents=True, exist_ok=True)
        with open(stats_path, "w") as f:
            json.dump(filter_stats, f, indent=2)

        print(f"[MOCK_R] filter_stats.json saved: {stats_path}")

    elif command.mode_label == "normalization_preview":
        # Simulate preview plots
        for method in ["raw", "noob", "quantile", "swan", "funnorm"]:
            preview_plots.append(
                {"method": method, "plot_kind": "density", "file": f"density_{method}.png"}
            )
            preview_plots.append(
                {"method": method, "plot_kind": "pca", "file": f"pca_{method}.png"}
            )

    print(f"[MOCK_R] Simulation complete for job {job_id}")

    # Create result object matching new executor signature
    result = ExecutionResult(
        status=ExecutionStatus.COMPLETED,
        returncode=0,
        stdout="Mock R script successful",
        stderr="",
        extra={"filter_stats": filter_stats, "preview_plots": preview_plots},
    )

    # Parse output (simulate command's parse_stdout hook)
    result = command.parse_stdout(result)

    return result


# Patch: Replace run_r_script with mock
with patch("app.services.r_executor.run_r_script", mock_run_r_script):
    from fastapi.testclient import TestClient

    from app.main import app

client = TestClient(app)

# TEST DATA PATHS
# In the container BACKEND_DIR=/app and jobs are mounted at /app/jobs.
# On the host BACKEND_DIR=.../backend and jobs live one level up at .../jobs.
_JOBS_ROOT = (
    BACKEND_DIR / "jobs" if (BACKEND_DIR / "jobs").exists() else BACKEND_DIR.parent / "jobs"
)
TEST_DATA_DIR = _JOBS_ROOT / "07b7fa29-8a9d-418d-bc16-8308a2b387fd"
SAMPLE_SHEET_PATH = TEST_DATA_DIR / "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"

# Create minimal test data if missing so tests are self-contained
if not TEST_DATA_DIR.exists():
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    basenames = ["sample_1", "sample_2"]
    for b in basenames:
        for channel in ("Grn", "Red"):
            fname = TEST_DATA_DIR / f"{b}_{channel}.idat"
            with open(fname, "wb") as f:
                f.write(b"\x00\x01\x02\x00\x00" * 50)
    SAMPLE_SHEET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SAMPLE_SHEET_PATH, "w", encoding="utf-8") as f:
        f.write("Sample_Name,Sentrix_ID,Sentrix_Position\n")
        for i, b in enumerate(["sample_1", "sample_2"], 1):
            f.write(f"{b},20689111000{i},R01C01\n")


@pytest.fixture
def idat_files():
    """Return all IDAT files as a list for upload."""
    files = []
    if TEST_DATA_DIR.exists():
        # Use rglob to find IDATs in all subdirectories recursively
        for file_path in sorted(TEST_DATA_DIR.rglob("*.idat")):
            if file_path.is_file():
                with open(file_path, "rb") as f:
                    content = f.read()
                files.append(("idat_files", (file_path.name, content, "application/octet-stream")))
    return files


@pytest.fixture
def sample_sheet():
    """Return the sample sheet as a tuple for upload."""
    if SAMPLE_SHEET_PATH.exists():
        with open(SAMPLE_SHEET_PATH, "rb") as f:
            content = f.read()
        return ("sample_sheet", (SAMPLE_SHEET_PATH.name, content, "text/csv"))
    return None


@pytest.fixture
def upload_files(idat_files, sample_sheet):
    """Return the complete files for an upload request."""
    if not idat_files or not sample_sheet:
        pytest.fail("Test data not found")
    return idat_files + [sample_sheet]
