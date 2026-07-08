#!/usr/bin/env bash
#
# stress.sh — realistic concurrency stress test.
#
# Simulates N users submitting analyses at once, but reproduces the REAL
# production behaviour: the backend admits heavy R work through a memory+core
# budget (app.core.resource_governor) and QUEUES the rest, so only MAX_PARALLEL
# run at a time. This script mirrors that — it submits N jobs but never runs more
# than MAX_PARALLEL concurrently (derived from the same .env budget), the rest
# wait for a free slot. So it shows what the server actually does under load
# (graceful queueing), not a raw unthrottled overload.
#
# Reports: MAX_PARALLEL, per-job outcome, aggregate peak RAM, OOM kills, wall time.
#
# Usage:
#   ./benchmarks/stress.sh <dataset_dir> [N] [options]
#     N                 number of jobs to submit (default 2)
#     --max-parallel K  force the concurrency cap (default: derived from .env budget)
#     --no-throttle     run all N at once (raw overload — for finding the ceiling)
#     --method m | --dmr-cores n | --dmr-boot n
#     --force           bypass the host-oversubscription safety guard (danger)
#
# See ../docs/performance-benchmark-concept.md, section 3.3.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

METHOD="noob"; DMR_CORES="1"; DMR_BOOT="50"; DATASET=""; N=2; FORCE=0
MAX_PAR_OVERRIDE=0; NO_THROTTLE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --method) METHOD="$2"; shift 2 ;;
    --dmr-cores) DMR_CORES="$2"; shift 2 ;;
    --dmr-boot) DMR_BOOT="$2"; shift 2 ;;
    --max-parallel) MAX_PAR_OVERRIDE="$2"; shift 2 ;;
    --no-throttle) NO_THROTTLE=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) if [ -z "$DATASET" ]; then DATASET="$1"; else N="$1"; fi; shift ;;
  esac
done
[ -d "$DATASET" ] || { echo "ERROR: pass a dataset directory. See --help." >&2; exit 2; }

CID="$(docker compose ps -q r_worker 2>/dev/null)"
[ -n "$CID" ] || { echo "ERROR: r_worker not running (docker compose up -d)." >&2; exit 1; }

# ── Admission control: mirror the backend resource governor ──────────────────
# The real app runs at most MAX_PARALLEL heavy analyses at once (the rest queue).
# Derive the same cap from the .env budget so this test reflects production, not a
# raw overload. DMR is the binding (heaviest) step, so it sets the cap.
envval() {  # $1=key $2=default — environment wins, then .env, then default
  local k="$1" d="$2"
  local v="${!k-}"   # indirect expansion needs k already assigned (separate line)
  if [ -z "$v" ] && [ -f "$REPO_ROOT/.env" ]; then
    v="$(grep -E "^$k=" "$REPO_ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  fi
  echo "${v:-$d}"
}
BUDGET_GB="$(envval PIPELINE_MEMORY_BUDGET_GB 8)"
DMR_MEM_GB="$(envval PIPELINE_DMR_MEMORY_GB 6)"
CORE_BUDGET="$(envval PIPELINE_CORE_BUDGET 2)"
if [ "$NO_THROTTLE" -eq 1 ]; then
  MAX_PAR="$N"
elif [ "$MAX_PAR_OVERRIDE" -gt 0 ]; then
  MAX_PAR="$MAX_PAR_OVERRIDE"
else
  MAX_PAR="$(awk -v b="$BUDGET_GB" -v m="$DMR_MEM_GB" -v c="$CORE_BUDGET" -v jc="$DMR_CORES" \
    'BEGIN{ pm=(m>0)?int(b/m):1; pc=(jc>0)?int(c/jc):1; p=(pm<pc)?pm:pc; if(p<1)p=1; print p }')"
fi
[ "$MAX_PAR" -gt "$N" ] && MAX_PAR="$N"
QUEUED=$(( N > MAX_PAR ? N - MAX_PAR : 0 ))
echo "==> Admission control: budget=${BUDGET_GB}GiB, DMR=${DMR_MEM_GB}GiB/job → max ${MAX_PAR} of ${N} run at once (${QUEUED} queued)."

# ── Safety guard: never let the test crash the tester's host ─────────────────
# With throttling, concurrent memory <= MAX_PAR × DMR is bounded by the budget.
# We still refuse if even that would oversubscribe an UNLIMITED container.
PEAK_CONCURRENT_GB="$(awk -v p="$MAX_PAR" -v m="$DMR_MEM_GB" 'BEGIN{print p*m}')"
LIMIT_BYTES="$(docker inspect -f '{{.HostConfig.Memory}}' "$CID" 2>/dev/null || echo 0)"; LIMIT_BYTES="${LIMIT_BYTES:-0}"
DOCKER_MEM="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"; DOCKER_MEM="${DOCKER_MEM:-0}"
hbg() { awk -v b="$1" 'BEGIN{printf "%.1f GiB", b/1073741824}'; }
if [ "$LIMIT_BYTES" -gt 0 ]; then
  echo "Guard: r_worker mem_limit = $(hbg "$LIMIT_BYTES") → host protected (container caps everything)."
else
  NEED_BYTES="$(awk -v g="$PEAK_CONCURRENT_GB" 'BEGIN{printf "%d", g*1073741824}')"
  if [ "$DOCKER_MEM" -gt 0 ] && [ "$NEED_BYTES" -gt "$DOCKER_MEM" ] && [ "$FORCE" -ne 1 ]; then
    echo "REFUSING: no r_worker mem_limit, and ${MAX_PAR} × ~${DMR_MEM_GB} GiB ≈ ${PEAK_CONCURRENT_GB} GiB exceeds Docker's ~$(hbg "$DOCKER_MEM"). Could OOM-crash the host." >&2
    echo "Fix: set R_WORKER_MEM_LIMIT in .env + 'docker compose up -d r_worker', lower --max-parallel, or --force." >&2
    exit 3
  fi
fi

TS="$(date +%Y%m%d_%H%M%S)"
RES="$REPO_ROOT/benchmarks/results/stress_${TS}_N${N}"
mkdir -p "$RES"
PHASE_FILE="$RES/phase.txt"; echo "stress_N$N" > "$PHASE_FILE"
STOPFILE="$RES/.stop"
JOBS_HOST=(); JOBS_C=()

dexec() { docker exec "$CID" sh -c "$1"; }

cleanup() {
  touch "$STOPFILE" 2>/dev/null; wait 2>/dev/null
  for jh in "${JOBS_HOST[@]:-}"; do [ -n "$jh" ] && rm -rf "$jh"; done
}
trap cleanup EXIT INT TERM

# ---- stage N job dirs ------------------------------------------------------
SHEET_SRC="$(find "$DATASET" -maxdepth 4 -type f -iname '*samplesheet*.csv' 2>/dev/null | head -1)"
[ -z "$SHEET_SRC" ] && SHEET_SRC="$(find "$DATASET" -maxdepth 4 -type f -iname '*.csv' 2>/dev/null | head -1)"
[ -n "$SHEET_SRC" ] || { echo "ERROR: no sample sheet found under $DATASET" >&2; exit 1; }

echo "==> Staging $N job copies..."
for j in $(seq 1 "$N"); do
  name="bench_stress_${TS}_$j"
  jh="$REPO_ROOT/jobs/$name"
  mkdir -p "$jh"
  cp "$SHEET_SRC" "$jh/SampleSheet.csv"
  find "$DATASET" -type f \( -iname '*.idat' -o -iname '*.idat.gz' \) -exec cp {} "$jh/" \; 2>/dev/null
  cat > "$jh/_beta.R" <<'EOF'
suppressMessages(library(minfi)); saveRDS(getBeta(readRDS("normalized_data.rds")), "beta.rds")
EOF
  JOBS_HOST+=("$jh"); JOBS_C+=("/app/jobs/$name")
done

# full chain for one job (sequential within the job)
run_chain() {
  local jc="$1" log="$2"
  {
    docker exec -w "$jc" "$CID" Rscript /app/r_backend/init_filter.R SampleSheet.csv . || exit 10
    local at; at="$(docker exec "$CID" sh -c "cat $jc/array_type.txt 2>/dev/null" | tr -d '[:space:]')"; at="${at:-EPICv2}"
    docker exec -w "$jc" "$CID" Rscript /app/r_backend/normalize.R . "$METHOD" || exit 11
    docker exec -w "$jc" "$CID" Rscript _beta.R || exit 12
    docker exec -w "$jc" "$CID" Rscript /app/r_backend/dmr.R SampleSheet.csv . beta.rds 3 NULL 1 1000 "$at" "$DMR_BOOT" "$DMR_CORES" || exit 13
    docker exec -w "$jc" "$CID" Rscript /app/r_backend/dmp.R SampleSheet.csv . beta.rds 1 "$at" || exit 14
  } > "$log" 2>&1
}

# ---- baseline + monitor ----------------------------------------------------
OOM_BEFORE="$(dexec "awk '/oom_kill /{print \$2}' /sys/fs/cgroup/memory.events 2>/dev/null" || echo 0)"; OOM_BEFORE="${OOM_BEFORE:-0}"
dexec 'echo 0 > /sys/fs/cgroup/memory.peak 2>/dev/null || true'
bash "$SCRIPT_DIR/monitor.sh" "$CID" "$RES/timeline.csv" "$PHASE_FILE" 1 "$STOPFILE" &
MON_PID=$!

# ---- submit N jobs, at most MAX_PAR running at once (governor-style queue) --
echo "==> Submitting $N jobs (max $MAX_PAR concurrent; rest queued)..."
START="$(docker exec "$CID" date +%s.%N)"
declare -a RESULTS; for j in $(seq 1 "$N"); do RESULTS[$j]=-1; done
running_pids=(); running_idx=()

# Non-blocking reap: move finished slots into RESULTS, keep the rest running.
reap() {
  local np=() ni=() i p ix
  for i in "${!running_pids[@]}"; do
    p="${running_pids[$i]}"; ix="${running_idx[$i]}"
    if kill -0 "$p" 2>/dev/null; then
      np+=("$p"); ni+=("$ix")
    else
      wait "$p"; RESULTS[$ix]=$?
      echo "  ← job $ix finished (exit ${RESULTS[$ix]})"
    fi
  done
  # empty-array-safe reassignment (works under `set -u` on old bash too)
  running_pids=(${np[@]+"${np[@]}"}); running_idx=(${ni[@]+"${ni[@]}"})
}

for j in $(seq 1 "$N"); do
  # Block until a slot frees — this is the queue (exactly what the governor does).
  while [ "${#running_pids[@]}" -ge "$MAX_PAR" ]; do reap; [ "${#running_pids[@]}" -ge "$MAX_PAR" ] && sleep 1; done
  run_chain "${JOBS_C[$((j-1))]}" "$RES/job_$j.log" &
  running_pids+=("$!"); running_idx+=("$j")
  echo "  → job $j started (${#running_pids[@]}/$MAX_PAR slots busy)"
done
# Drain the remaining running jobs.
while [ "${#running_pids[@]}" -gt 0 ]; do reap; [ "${#running_pids[@]}" -gt 0 ] && sleep 1; done
END="$(docker exec "$CID" date +%s.%N)"

# ---- collect aggregate metrics ---------------------------------------------
OOM_AFTER="$(dexec "awk '/oom_kill /{print \$2}' /sys/fs/cgroup/memory.events 2>/dev/null" || echo 0)"; OOM_AFTER="${OOM_AFTER:-0}"
MEMLIMIT="$(dexec 'cat /sys/fs/cgroup/memory.max 2>/dev/null')"
case "$MEMLIMIT" in ""|max) MEMLIMIT="$(dexec "awk '/MemTotal/{print \$2*1024}' /proc/meminfo")";; esac
touch "$STOPFILE"; wait "$MON_PID" 2>/dev/null

# Aggregate peak = max sampled container memory across the whole run, taken from
# the timeline (memory.current). This is correct even where the cgroup
# memory.peak high-water mark cannot be reset between runs.
PEAK="$(awk -F, 'NR>1 && $3>m{m=$3} END{print m+0}' "$RES/timeline.csv" 2>/dev/null)"; PEAK="${PEAK:-0}"

WALL="$(awk -v a="$START" -v b="$END" 'BEGIN{printf "%.1f", b-a}')"
OOM_KILLS=$(( OOM_AFTER - OOM_BEFORE ))
hb() { awk -v b="$1" 'BEGIN{if(b>=1073741824)printf "%.2f GiB",b/1073741824;else printf "%.0f MiB",b/1048576}'; }

ok=0; for r in "${RESULTS[@]}"; do [ "$r" -eq 0 ] && ok=$((ok+1)); done

{
  echo "# Stress test — $N jobs submitted, max $MAX_PAR concurrent (governor-style)"
  echo
  echo "| Metric | Value |"
  echo "|---|---|"
  echo "| Jobs submitted | $N |"
  echo "| Concurrency cap (governor) | $MAX_PAR |"
  echo "| Jobs queued (waited for a slot) | $QUEUED |"
  echo "| Jobs succeeded | $ok / $N |"
  echo "| Aggregate peak RAM | $(hb "$PEAK") |"
  echo "| Container memory limit | $(hb "$MEMLIMIT") |"
  echo "| OOM kills during run | $OOM_KILLS |"
  echo "| Wall time (all jobs) | ${WALL}s |"
  echo
  echo "Per-job exit codes (job1..jobN): ${RESULTS[*]}"
  echo
  echo "**Interpretation (realistic mode):** with the queue, at most $MAX_PAR analyses"
  echo "run at once, so aggregate peak RAM stays within budget and the host survives —"
  echo "this is what the deployed server does under load. **All $N jobs should succeed**"
  echo "(the extra $QUEUED just waited). If OOM kills > 0 or a job failed, the per-job"
  echo "memory estimate (PIPELINE_DMR_MEMORY_GB) is too low for the container mem_limit —"
  echo "raise the estimate (fewer concurrent) or the limit."
} | tee "$RES/report.md"

echo
echo "Full results: benchmarks/results/stress_${TS}_N${N}/"
