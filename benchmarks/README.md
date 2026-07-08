# Benchmarks

Performance / stress-test toolkit for the methylation pipeline. It measures the
**hardware-independent** resource footprint (peak RAM, peak disk) of each
pipeline step so we can size the university server, plus calibration-normalised
timings so developers on Windows / macOS / Linux get comparable numbers.

Read the full methodology first:
[`../docs/performance-benchmark-concept.md`](../docs/performance-benchmark-concept.md).

## Prerequisites

- Docker with the stack running: `docker compose up -d`
- A bash shell: **Git Bash** on Windows, Terminal on macOS/Linux.
  (All measurement runs *inside* the Linux container, so the host OS does not
  affect the numbers.)
- A dataset folder: the raw **IDAT** files (any nesting) + a minfi-style
  **SampleSheet.csv** (`Sample_Name, Sample_Group, Sentrix_ID, Sentrix_Position`)
  — the same sheet the app uses after upload.

## Quick start

```bash
# Per-step benchmark + timeline
./benchmarks/run.sh /path/to/dataset

# Tune the run
./benchmarks/run.sh /path/to/dataset --method funnorm --dmr-cores 4 --dmr-boot 100 --keep

# Concurrency stress test: 4 pipelines at once
./benchmarks/stress.sh /path/to/dataset 4
```

Results are written to `benchmarks/results/<run>/` (git-ignored).

## Files

| File | Role |
|---|---|
| `run.sh` | Main entry. Calibrates the machine, stages the dataset, runs every pipeline step in isolation while monitoring, and writes the report. |
| `stress.sh` | Runs *N* full pipelines concurrently; reports aggregate peak RAM + OOM kills → concurrency ceiling. |
| `monitor.sh` | Background 1 Hz sampler of the r_worker container's cgroup counters (RAM/CPU), tagged by pipeline phase. Started automatically. |
| `summarize.awk` | Turns `steps.csv` + `timeline.csv` into `report.md` / `report.csv`. |
| `results/` | Output (git-ignored). |

## Output files (per run)

| File | Contents |
|---|---|
| `report.md` | Human-readable per-step table: peak RAM, duration, normalised time, CPU cores-eq., disk Δ, status. |
| `report.csv` | Same, machine-readable — one row per step. Collect these across machines. |
| `timeline.csv` | 1 Hz samples `epoch,phase,mem_bytes,cpu_usec` — plot to see *when* RAM peaks. |
| `meta.txt` | Host, Docker version, **calibration score**, container memory limit, run parameters. |
| `log_<step>.txt` | Per-step stdout/stderr (for debugging a failing step). |

## How to read the numbers

- **Peak RAM / disk** — hardware-independent. Compare directly across machines;
  these size the server (`server RAM ≥ single-job peak × concurrency + headroom`).
- **Duration** — hardware-dependent. Compare across machines only via the
  **normalised time** column (`raw / calibration score`).
- **CPU cores-eq.** — > 1 means a step used multiple cores (mostly DMR with
  `--dmr-cores > 1`); note that raising DMR cores also raises DMR's RAM peak.

## Sharing results across the team

Everyone runs the same command on the same dataset and commits (or collects)
their `report.csv` + `meta.txt`. Peak RAM/disk should agree machine-to-machine;
times are compared via the calibration score. Aggregate into the server-sizing
table.
