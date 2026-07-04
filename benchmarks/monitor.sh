#!/usr/bin/env bash
#
# monitor.sh — 1 Hz resource sampler for the r_worker container.
#
# Samples the container's cgroup v2 counters (exact, host-OS-independent) and
# tags every sample with the pipeline phase that run.sh is currently executing.
# It is started in the background by run.sh / stress.sh and stops when the
# <stopfile> appears.
#
# One `docker exec` per tick reads, from *inside* the container:
#   - a high-resolution epoch          (date +%s.%N — the container's GNU date)
#   - memory.current  (bytes)          — current resident memory of the cgroup
#   - cpu.stat usage_usec (µs, cumul.) — CPU time, for cores-equivalent later
#
# Output CSV columns: epoch,phase,mem_bytes,cpu_usec
#
# Usage: monitor.sh <container_id> <out_csv> <phase_file> <interval_s> <stopfile>

set -uo pipefail

CID="$1"        # r_worker container id
OUT="$2"        # timeline CSV to append to
PHASE_FILE="$3" # run.sh writes the current step name here
INTERVAL="$4"   # seconds between samples
STOPFILE="$5"   # loop exits once this file exists

echo "epoch,phase,mem_bytes,cpu_usec" > "$OUT"

# Single command executed each tick. Kept as one exec to minimise overhead and
# to read all three counters at (almost) the same instant.
read_cmd='printf "%s %s %s\n" \
  "$(date +%s.%N)" \
  "$(cat /sys/fs/cgroup/memory.current 2>/dev/null || echo 0)" \
  "$(awk "/^usage_usec/{print \$2}" /sys/fs/cgroup/cpu.stat 2>/dev/null || echo 0)"'

while [ ! -f "$STOPFILE" ]; do
  phase="$(cat "$PHASE_FILE" 2>/dev/null || echo '-')"
  # -T: no TTY (keeps output clean for piping).
  sample="$(docker exec "$CID" sh -c "$read_cmd" 2>/dev/null)"
  if [ -n "$sample" ]; then
    # sample = "<epoch> <mem_bytes> <cpu_usec>"
    set -- $sample
    printf '%s,%s,%s,%s\n' "${1:-0}" "$phase" "${2:-0}" "${3:-0}" >> "$OUT"
  fi
  sleep "$INTERVAL"
done
