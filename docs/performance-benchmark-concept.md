# Performance, Benchmark & Stress-Test Concept

> Goal: measure the pipeline's resource behaviour in a way that lets us **size the
> university server** (unknown, VPN-only hardware) **without depending on the
> machine the benchmark ran on**, and let every developer (Windows / macOS /
> Linux) reproduce the numbers with one command.

---

## 1. The core problem and the key insight

We run everything in Docker on developer laptops today; later it moves to a
university server with an unknown CPU/RAM budget, reachable only via VPN. So a
statement like *"the batch step takes 10 min on my laptop"* tells us almost
nothing about the server.

The trick is to **separate the metrics by how hardware-dependent they are**:

| Metric | Depends mainly on | Hardware-independent? | What it tells us |
|---|---|---|---|
| **Peak RAM per step** (RSS) | data size + algorithm | **YES** — a step that peaks at 4 GB peaks at ~4 GB on any CPU | **How much RAM the server needs** |
| **Peak disk per job** | data size | **YES** | **How much storage the server needs** |
| **Wall-clock time per step** | CPU speed × cores × data | **NO** | Latency / capacity planning — must be *normalised* to compare machines |
| **CPU utilisation** (can exceed 100 %) | parallelism | partially | Where extra cores actually help (mostly DMR) |

**Peak RAM and peak disk are the deployment-sizing numbers** and they are
hardware-independent: they are driven by *what the data is* (number of samples,
array type = number of probes) and *what the algorithm allocates*, not by how
fast the CPU is. This is exactly what we can carry over to the server.

Wall-clock time is *not* portable, so we make it comparable with a per-machine
**calibration score** (Section 4).

---

## 2. What we measure and how (all inside the container → OS-independent)

Every heavy step is an R subprocess in the `r_worker` container. We measure it
from **inside the container via the Linux cgroup v2 interface**, so the host OS
(Windows/macOS/Linux) is irrelevant — Docker always runs a Linux VM/kernel:

* **Peak RAM** — the container's cgroup high-water mark
  `/sys/fs/cgroup/memory.peak` (exact bytes), reset before each step; plus a
  1 Hz sampling of `/sys/fs/cgroup/memory.current` for the timeline (so we can
  say *"RAM peaks during DMR"*). Because a benchmark runs the steps
  **sequentially** (one R process at a time), the container's memory during a
  step equals that step's footprint.
* **CPU** — `/sys/fs/cgroup/cpu.stat` (`usage_usec`, cumulative CPU-microseconds).
  `Δusage / Δwall` gives CPU-cores-equivalent (e.g. 3.8 ≈ ~4 cores busy).
* **Disk** — `du -sb <job_dir>` before/after each step → per-step disk delta and
  the total job footprint.
* **Wall-clock** — start/stop epoch around each step; normalised via calibration.
* **Container memory limit** — from `docker stats` (so we know the headroom on
  the current machine).

This needs no GNU `time`, no host-side profiler, and no changes to the app.

---

## 3. The three layers of testing (they connect)

They build on the **same monitor**; each answers a different question.

### 3.1 Per-step micro-benchmark — "how big is each step?"
Run each pipeline script in isolation on a **fixed dataset**, in order:

```
init_filter → normalize → (beta extract) → batch_svd → dmr → dmp → heatmap
```

Record per step: **peak RAM, duration (raw + normalised), CPU-equiv, disk
delta, exit code**. Repeat across **dataset sizes** (e.g. 4-sample vs 16-sample,
450K vs EPIC v1 vs EPIC v2) to get **scaling curves** → extrapolate to larger
cohorts and to size the server. This is `benchmarks/run.sh`.

### 3.2 Timeline monitoring — "when and where does it peak?"
While the pipeline runs, the monitor samples RAM/CPU at 1 Hz and tags each
sample with the **current step**, producing a time series. The report then shows,
per phase, the RAM/CPU peak and when it occurred (e.g. *"a RAM spike to X GB at
the start of DMR bootstrap"*). Same run as 3.1 — the monitor is always on.

### 3.3 Stress test — "does the server stay up under load?"
A single job is essentially **single-threaded and serial** (`configure_runtime()`
pins BLAS/OpenMP to 1 thread; the only intra-job parallelism is DMR's bootstrap
`nCores`), so load = **concurrent jobs**. `benchmarks/stress.sh` **reproduces the
production behaviour**: it submits *N* jobs but, like the backend resource
governor, admits at most `MAX_PARALLEL = min(mem_budget/DMR_mem, cores/DMR_cores)`
at once and **queues the rest** (the cap is read from the same `.env`). It reports
per-job outcome, aggregate peak RAM, OOM kills and wall time — proving the server
degrades gracefully (queues) instead of crashing. `--no-throttle` runs all *N* at
once (raw overload) to find the true ceiling; `--max-parallel K` overrides the
cap. This is [[deployment sizing]] input.

---

## 4. Making time comparable across machines (calibration)

Before the steps, `run.sh` runs a **fixed CPU-bound R workload** (a set number of
large `matrix %*% matrix` products, single-threaded) and times it → a
**reference score** for that machine. Every raw step time is stored *and*
divided by the reference score:

```
normalised_time(step) = raw_time(step) / reference_score(machine)
```

If laptop A scores 5 s and server B scores 2.5 s on the calibration, B is ~2×
faster, and `normalised_time` is ~equal across A and B. Developers on
Windows/macOS/Linux therefore get **comparable** numbers, and we can *predict*
the server's latency from its calibration score once we can run it there (or
estimate the score from its CPU spec).

RAM/disk peaks need **no** normalisation — they are already machine-independent.

---

## 5. Translating results into a server spec (deployment sizing)

From the report:

* **RAM** ≥ `max(step peak RAM) × expected_concurrent_jobs + headroom`
  (headroom = OS + backend + a safety margin, e.g. +25 %). Example: if EPIC v2
  DMP peaks at ~2.5 GB and we want 4 concurrent analyses → ~10 GB + headroom ≈
  **13–16 GB**.
* **Storage** ≥ `max(job footprint) × concurrent_jobs + retention`. The app
  already auto-deletes expired jobs (`job_cleanup_service`), so retention is
  bounded; size for a handful of live EPIC v2 jobs (each raw+filtered+normalised
  ≈ hundreds of MB).
* **CPU / cores** — **do not reduce peak RAM; they reduce latency.** Most steps
  are single-threaded on purpose (numerical stability). The lever is
  `DMR_CORES` (bootstrap parallelism). ⚠️ **RAM ↔ cores trade-off:** each DMR
  worker copies the working set, so raising `DMR_CORES` multiplies DMR's RAM
  peak. Pick `DMR_CORES` so `dmr_peak × DMR_CORES` still fits the RAM budget.
* **Concurrency** from the stress test (Section 3.3).

---

## 5.1 Built-in safeguards against overload (implemented)

Benchmarks first showed a single DMR step peaking at ~11 GiB — because
`champ.DMR()` silently defaulted to **3 Bumphunter workers, each holding a full
copy of the beta matrix**. `dmr.R` now passes `cores = DMR_CORES` (default 1),
which cut the DMR peak to **~3.5 GiB** (single copy); raise `DMR_CORES` only on
machines with RAM to spare. Even so, unbounded concurrent uploads can
oversubscribe host RAM → the kernel OOM-killer (SIGKILL) takes the whole machine
down. Two complementary layers prevent this, both sized from **one env config**
(`.env`, see `.env.example`):

**A) Hard wall — container limits (`docker-compose.yml`).**
`r_worker` has `mem_limit` (`R_WORKER_MEM_LIMIT`) and `cpus` (`R_WORKER_CPUS`);
the backend has a small `mem_limit`. If the container exceeds its limit, its
*own* cgroup OOM-killer stops the offending R process — the **host and other
services stay alive**. This is the last-resort guarantee that the server never
crashes, and it also protects a developer's laptop from `stress.sh`.

**B) Soft queue — resource governor (`app/core/resource_governor.py`).**
The backend admits every R step against a **memory-GiB + CPU-core budget**
(`PIPELINE_MEMORY_BUDGET_GB`, `PIPELINE_CORE_BUDGET`). Each step declares its
estimated weight (`PIPELINE_DMR_MEMORY_GB` ≈ 12, `PIPELINE_DMP_MEMORY_GB` ≈ 4,
else `PIPELINE_STEP_MEMORY_GB`); if it does not fit the remaining budget it
**queues** (the UI shows *"In Warteschlange …"*) until capacity frees up. So under
load the app gets *slower*, never crashes. Effective parallelism is derived:
`max_parallel(step) ≈ min(budget_mem / step_mem, budget_cores / step_cores)`.

**Deploying = setting the env to the server's budget.** Keep the soft budget ≤
the hard `mem_limit` so the queue engages first and the container wall is only a
backstop. The governor is covered by unit tests
(`backend/tests/test_resource_governor.py`).

## 6. Deploying to the university server (short)

Docker Compose runs on the server unchanged. For HTTPS behind the VPN, put a
**TLS-terminating reverse proxy** (nginx / Traefik / Caddy) in front of the
frontend/backend and terminate the certificate there (Let's Encrypt if the host
is reachable, otherwise a university-issued cert) — the application code does not
change. Set the container **memory limits** (compose `deploy.resources.limits`)
from the sizing in Section 5 so a runaway job cannot take the whole host, and set
`DMR_CORES` to the server's core budget minus headroom. Note: `r_backend` is
bind-mounted but the **backend image is baked** — a code change needs a rebuild
(`docker compose build`).

---

## 7. How to run it (Windows / macOS / Linux)

Prerequisites: Docker (Desktop on Win/Mac, Engine on Linux) with the stack up
(`docker compose up -d`), and a bash shell — **Git Bash** on Windows, Terminal
on macOS/Linux. All resource measurement happens *inside* the Linux container, so
the host OS does not affect the numbers.

```bash
# 1) Per-step benchmark + timeline on a dataset (folder with IDATs + a SampleSheet CSV)
./benchmarks/run.sh /path/to/dataset            # e.g. .../METHYLANALYZER_TESTDATA/data
./benchmarks/run.sh /path/to/dataset --method funnorm --dmr-cores 4 --dmr-boot 100

# 2) Concurrency stress test (N parallel pipelines on the same dataset)
./benchmarks/stress.sh /path/to/dataset 4

# Results (git-ignored): benchmarks/results/run_<timestamp>/
#   report.md        human-readable per-step table (peak RAM, time, CPU, disk)
#   report.csv       machine-readable, one row per step (for aggregating machines)
#   timeline.csv     1 Hz RAM/CPU samples tagged by phase (for plotting)
#   meta.txt         host + calibration score + container memory limit
```

**Reproducing across the team:** every developer runs the same command on the
same dataset; they compare **peak RAM / disk directly** (machine-independent) and
**times via `normalised_time`** (calibration). Collect each machine's
`report.csv` + `meta.txt` to build the sizing table for the server.

See [`benchmarks/README.md`](../benchmarks/README.md) for the file-by-file
reference.
