#!/usr/bin/env bash
#
# run.sh — per-step performance benchmark of the methylation pipeline.
#
# Runs every pipeline R script in isolation, in order, on a fixed dataset, while
# a background monitor samples the r_worker container's cgroup counters. Produces
# a per-step report of PEAK RAM (hardware-independent), duration (raw +
# calibration-normalised), CPU cores-equivalent and disk growth.
#
# See ../docs/performance-benchmark-concept.md for the methodology.
#
# Usage:
#   ./benchmarks/run.sh <dataset_dir> [options]
#
# <dataset_dir>  A folder containing the raw IDAT files (any nesting) and a
#                minfi-style SampleSheet.csv (Sample_Name, Sample_Group,
#                Sentrix_ID, Sentrix_Position) — the same sheet the app produces
#                after upload.
#
# Options:
#   --method <m>      Normalization method (noob|quantile|swan|funnorm). Default: noob
#   --dmr-cores <n>   DMR bootstrap cores. Default: 1
#   --dmr-boot <n>    DMR bootstrap iterations. Default: 50
#   --interval <s>    Monitor sampling interval in seconds. Default: 1
#   --label <name>    Label for this run (goes into meta.txt). Default: hostname
#   --keep            Keep the staged job directory (default: delete it)
#
# Prerequisites: the stack is up (`docker compose up -d`) and a bash shell
# (Git Bash on Windows, Terminal on macOS/Linux).

set -uo pipefail

# ---- locate repo + this script --------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ---- defaults + arg parsing ------------------------------------------------
METHOD="noob"; DMR_CORES="1"; DMR_BOOT="50"; INTERVAL="1"; KEEP=0
LABEL="$(hostname 2>/dev/null || echo machine)"
DATASET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --method)    METHOD="$2"; shift 2 ;;
    --dmr-cores) DMR_CORES="$2"; shift 2 ;;
    --dmr-boot)  DMR_BOOT="$2"; shift 2 ;;
    --interval)  INTERVAL="$2"; shift 2 ;;
    --label)     LABEL="$2"; shift 2 ;;
    --keep)      KEEP=1; shift ;;
    -h|--help)   sed -n '2,40p' "$0"; exit 0 ;;
    -*)          echo "Unknown option: $1" >&2; exit 2 ;;
    *)           DATASET="$1"; shift ;;
  esac
done

if [ -z "$DATASET" ] || [ ! -d "$DATASET" ]; then
  echo "ERROR: pass a dataset directory. See --help." >&2
  exit 2
fi

# ---- locate the running r_worker container --------------------------------
CID="$(docker compose ps -q r_worker 2>/dev/null)"
if [ -z "$CID" ]; then
  echo "ERROR: r_worker container is not running. Start it with 'docker compose up -d'." >&2
  exit 1
fi

# cgroup v2 sanity (the whole measurement relies on it)
if ! docker exec "$CID" sh -c 'test -f /sys/fs/cgroup/memory.current' 2>/dev/null; then
  echo "WARNING: /sys/fs/cgroup/memory.current not found — RAM peaks may be unavailable." >&2
fi

# memory.peak gives an *exact* per-step peak but only if we can reset it between
# steps. On many Docker setups the cgroup fs is mounted read-only, so the reset
# fails and memory.peak is just a cumulative high-water mark. Detect that once:
# when resettable we use memory.peak; otherwise we fall back to the monitor's
# sampled memory.current maximum per phase (still accurate for multi-second steps).
if docker exec "$CID" sh -c 'echo 0 > /sys/fs/cgroup/memory.peak' 2>/dev/null; then
  PEAK_RESETTABLE=1; PEAK_SRC="cgroup memory.peak (exact)"
else
  PEAK_RESETTABLE=0; PEAK_SRC="monitor memory.current max (1 Hz sampling)"
fi

# ---- results + staging locations ------------------------------------------
TS="$(date +%Y%m%d_%H%M%S)"
RES="$REPO_ROOT/benchmarks/results/run_$TS"
mkdir -p "$RES"
JOB_NAME="bench_$TS"
JOB_HOST="$REPO_ROOT/jobs/$JOB_NAME"   # host side (bind-mounted)
JOB_C="/app/jobs/$JOB_NAME"            # container side
PHASE_FILE="$RES/phase.txt"
STEPS="$RES/steps.csv"
STOPFILE="$RES/.stop"
echo "step,start_epoch,end_epoch,exit,peak_bytes,disk_before,disk_after" > "$STEPS"
echo "init" > "$PHASE_FILE"

# ---- helpers ---------------------------------------------------------------
dexec()  { docker exec "$CID" sh -c "$1"; }              # run a shell snippet in the container
cnow()   { docker exec "$CID" date +%s.%N; }             # container-side high-res epoch
du_bytes() { docker exec -w "$JOB_C" "$CID" du -sb . 2>/dev/null | cut -f1; }

# measure <label> <command...>  — reset peak, time the command, record metrics
measure() {
  label="$1"; shift
  echo "$label" > "$PHASE_FILE"
  local db start end ex peak da cur disp
  db="$(du_bytes)"; db="${db:-0}"
  [ "$PEAK_RESETTABLE" -eq 1 ] && dexec 'echo 0 > /sys/fs/cgroup/memory.peak 2>/dev/null || true'
  start="$(cnow)"
  docker exec -w "$JOB_C" "$CID" "$@" > "$RES/log_$label.txt" 2>&1
  ex=$?
  end="$(cnow)"
  # peak=0 when not resettable → summarize.awk falls back to the timeline max
  if [ "$PEAK_RESETTABLE" -eq 1 ]; then
    peak="$(dexec 'cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo 0')"; peak="${peak:-0}"
    disp="$peak"
  else
    peak=0
    # running max for this phase from the timeline the monitor just wrote → the
    # live figure then matches the peak the report will show.
    disp="$(awk -F, -v p="$label" '$2==p && $3+0>m{m=$3+0} END{print m+0}' "$RES/timeline.csv" 2>/dev/null)"
    disp="${disp:-0}"
  fi
  da="$(du_bytes)"; da="${da:-0}"
  printf '%s,%s,%s,%s,%s,%s,%s\n' "$label" "$start" "$end" "$ex" "$peak" "$db" "$da" >> "$STEPS"
  if [ "$ex" -eq 0 ]; then
    printf '  \033[32m✓\033[0m %-10s ~%s\n' "$label" \
      "$(awk -v b="$disp" 'BEGIN{if(b>=1073741824)printf "%.2fGiB",b/1073741824;else printf "%.0fMiB",b/1048576}')"
  else
    printf '  \033[31m✗\033[0m %-10s (exit %s) — see results/run_%s/log_%s.txt\n' "$label" "$ex" "$TS" "$label"
  fi
}

# ---- graceful shutdown -----------------------------------------------------
MON_PID=""
cleanup() {
  [ -n "$MON_PID" ] && touch "$STOPFILE" 2>/dev/null && wait "$MON_PID" 2>/dev/null
  if [ "$KEEP" -eq 0 ] && [ -n "${JOB_HOST:-}" ] && [ -d "$JOB_HOST" ]; then
    rm -rf "$JOB_HOST"
  fi
}
trap cleanup EXIT INT TERM

# ---- 1) calibration (machine reference score) ------------------------------
echo "==> Calibrating machine (fixed single-threaded R workload)..."
CALIB="$(docker exec "$CID" Rscript -e '
  Sys.setenv(OMP_NUM_THREADS=1, OPENBLAS_NUM_THREADS=1, MKL_NUM_THREADS=1)
  set.seed(1); n <- 1200L; x <- matrix(rnorm(n*n), n)
  t <- system.time(for (i in 1:8) y <- crossprod(x))[["elapsed"]]
  cat(sprintf("%.4f", t))' 2>/dev/null)"
CALIB="${CALIB:-1}"
echo "    calibration score: ${CALIB}s"

# ---- meta ------------------------------------------------------------------
MEMLIMIT="$(dexec 'cat /sys/fs/cgroup/memory.max 2>/dev/null')"
case "$MEMLIMIT" in ""|max) MEMLIMIT="$(dexec "awk '/MemTotal/{print \$2*1024}' /proc/meminfo" 2>/dev/null)";; esac
MEMLIMIT="${MEMLIMIT:-0}"
{
  echo "label:        $LABEL"
  echo "timestamp:    $TS"
  echo "host:         $(uname -s 2>/dev/null) $(uname -m 2>/dev/null)"
  echo "docker:       $(docker --version 2>/dev/null)"
  echo "dataset:      $DATASET"
  echo "method:       $METHOD"
  echo "dmr_cores:    $DMR_CORES"
  echo "dmr_boot:     $DMR_BOOT"
  echo "interval_s:   $INTERVAL"
  echo "calib_score:  $CALIB"
  echo "peak_source:  $PEAK_SRC"
  echo "container_cpus:   $(dexec 'nproc' 2>/dev/null)"
  echo "container_memlimit_bytes: $MEMLIMIT"
} > "$RES/meta.txt"

# ---- 2) stage the dataset --------------------------------------------------
echo "==> Staging dataset into $JOB_C ..."
mkdir -p "$JOB_HOST"
SHEET_SRC="$(find "$DATASET" -maxdepth 4 -type f -iname '*samplesheet*.csv' 2>/dev/null | head -1)"
[ -z "$SHEET_SRC" ] && SHEET_SRC="$(find "$DATASET" -maxdepth 4 -type f -iname '*.csv' 2>/dev/null | head -1)"
if [ -z "$SHEET_SRC" ]; then
  echo "ERROR: no sample-sheet CSV found under $DATASET" >&2; exit 1
fi
cp "$SHEET_SRC" "$JOB_HOST/SampleSheet.csv"
find "$DATASET" -type f \( -iname '*.idat' -o -iname '*.idat.gz' \) -exec cp {} "$JOB_HOST/" \; 2>/dev/null
NIDAT="$(find "$JOB_HOST" -type f \( -iname '*.idat' -o -iname '*.idat.gz' \) | wc -l | tr -d ' ')"
if [ "$NIDAT" -eq 0 ]; then
  echo "ERROR: no IDAT files found under $DATASET" >&2; exit 1
fi
echo "    sheet: $(basename "$SHEET_SRC")   idats: $NIDAT"

# runtime helper R snippets (single-quoted heredoc → no shell interpolation;
# relative paths work because we exec with -w "$JOB_C")
cat > "$JOB_HOST/_beta.R" <<'EOF'
suppressMessages(library(minfi))
saveRDS(getBeta(readRDS("normalized_data.rds")), "beta.rds")
EOF
cat > "$JOB_HOST/_hmap_input.R" <<'EOF'
ids <- head(as.character(readRDS("dmp_results.rds")$ID), 40)
write.csv(data.frame(ID = ids), "heatmap_input.csv", row.names = FALSE)
EOF

# ---- 3) start the monitor --------------------------------------------------
echo "==> Starting resource monitor (every ${INTERVAL}s)..."
bash "$SCRIPT_DIR/monitor.sh" "$CID" "$RES/timeline.csv" "$PHASE_FILE" "$INTERVAL" "$STOPFILE" &
MON_PID=$!

# ---- 4) run the pipeline steps in order ------------------------------------
echo "==> Benchmarking pipeline steps..."
measure filter    Rscript /app/r_backend/init_filter.R SampleSheet.csv .

ARRAY="$(dexec "cat $JOB_C/array_type.txt 2>/dev/null" | tr -d '[:space:]')"
ARRAY="${ARRAY:-EPICv2}"
echo "    detected array type: $ARRAY"

measure normalize Rscript /app/r_backend/normalize.R . "$METHOD"
measure beta      Rscript _beta.R
measure svd       Rscript /app/r_backend/batch_svd.R beta.rds SampleSheet.csv . svd_plot.png
measure dmr       Rscript /app/r_backend/dmr.R SampleSheet.csv . beta.rds 3 NULL 1 1000 "$ARRAY" "$DMR_BOOT" "$DMR_CORES"
measure dmp       Rscript /app/r_backend/dmp.R SampleSheet.csv . beta.rds 1 "$ARRAY"

# heatmap needs the selected-CpG file; build it from the DMP output first
if docker exec -w "$JOB_C" "$CID" test -f dmp_results.rds; then
  docker exec -w "$JOB_C" "$CID" Rscript _hmap_input.R >/dev/null 2>&1
  measure heatmap Rscript /app/r_backend/heatmap.R dmp_results.rds SampleSheet.csv .
else
  echo "  - heatmap    skipped (no dmp_results.rds)"
fi

# ---- 5) stop monitor + summarize -------------------------------------------
echo "==> Summarizing..."
touch "$STOPFILE"; wait "$MON_PID" 2>/dev/null; MON_PID=""

awk -f "$SCRIPT_DIR/summarize.awk" \
    -v calib="$CALIB" -v memlimit="$MEMLIMIT" \
    -v out_md="$RES/report.md" -v out_csv="$RES/report.csv" \
    "$STEPS" "$RES/timeline.csv"

echo
echo "==================== REPORT ===================="
cat "$RES/report.md"
echo "================================================"
echo "Full results: benchmarks/results/run_$TS/"
echo "  report.md / report.csv   per-step metrics"
echo "  timeline.csv             1 Hz RAM/CPU samples (for plotting)"
echo "  log_<step>.txt           per-step stdout/stderr"
