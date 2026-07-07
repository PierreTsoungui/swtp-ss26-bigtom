# summarize.awk — turn the raw benchmark logs into report.md + report.csv.
#
# Inputs (order matters; distinguished by FILENAME):
#   steps.csv     step,start_epoch,end_epoch,exit,peak_bytes,disk_before,disk_after
#   timeline.csv  epoch,phase,mem_bytes,cpu_usec        (1 Hz samples from monitor.sh)
#
# Passed via -v:
#   calib   = machine calibration score in seconds (for normalised time)
#   out_md  = path of the Markdown report to write
#   out_csv = path of the machine-readable CSV to write
#   memlimit= container memory limit in bytes (for a headroom note; optional)
#
# Peak RAM per step = max(cgroup memory.peak for the step, timeline max for the
# phase). Both are exact container totals (they include the ~0.1 GB idle
# baseline — that is real memory the server must provide).

BEGIN { FS = "," }

# ---- timeline samples: aggregate per phase --------------------------------
FILENAME ~ /timeline/ && FNR > 1 {
    ph = $2; ep = $1 + 0; mem = $3 + 0; cpu = $4 + 0
    if (mem > tmax[ph]) tmax[ph] = mem
    if (!(ph in cmin) || cpu < cmin[ph]) cmin[ph] = cpu
    if (cpu > cmax[ph]) cmax[ph] = cpu
    if (!(ph in emin) || ep < emin[ph]) emin[ph] = ep
    if (ep > emax[ph]) emax[ph] = ep
    next
}

# ---- per-step records ------------------------------------------------------
FILENAME ~ /steps/ && FNR > 1 {
    n++
    step[n] = $1; st[n] = $2 + 0; en[n] = $3 + 0; ex[n] = $4
    pk[n] = $5 + 0; db[n] = $6 + 0; da[n] = $7 + 0
    next
}

function human(b,    v) {
    if (b >= 1073741824) return sprintf("%.2f GiB", b / 1073741824)
    return sprintf("%.0f MiB", b / 1048576)
}
function secs(s) { return sprintf("%.1f s", s) }

END {
    if (calib <= 0) calib = 1

    print  "# Benchmark report"                                       > out_md
    print  ""                                                         > out_md
    printf "Calibration score (machine reference): **%.2f s** — divide raw times by this to compare machines.\n", calib > out_md
    if (memlimit + 0 > 0)
        printf "\nContainer memory limit on this machine: **%s**.\n", human(memlimit) > out_md
    print  ""                                                         > out_md
    print  "| Step | Peak RAM | Duration | Norm. time | CPU (cores eq.) | Disk Δ | Status |" > out_md
    print  "|---|---:|---:|---:|---:|---:|:--:|"                       > out_md

    print "step,peak_ram_bytes,peak_ram_mib,duration_s,norm_time,cpu_cores_eq,disk_delta_bytes,exit_code" > out_csv

    total_dur = 0; max_peak = 0; total_disk = 0
    for (i = 1; i <= n; i++) {
        s   = step[i]
        dur = en[i] - st[i];         if (dur < 0) dur = 0
        peak = pk[i]; if (tmax[s] > peak) peak = tmax[s]
        disk = da[i] - db[i]
        cores = 0
        if ((s in emax) && emax[s] > emin[s])
            cores = (cmax[s] - cmin[s]) / ((emax[s] - emin[s]) * 1000000.0)
        status = (ex[i] == "0") ? "ok" : ("FAIL(" ex[i] ")")

        printf "| %s | %s | %s | %.2f | %.2f | %s | %s |\n", \
            s, human(peak), secs(dur), dur / calib, cores, human(disk), status > out_md
        printf "%s,%d,%.1f,%.1f,%.3f,%.2f,%d,%s\n", \
            s, peak, peak / 1048576, dur, dur / calib, cores, disk, ex[i] > out_csv

        total_dur += dur
        if (peak > max_peak) max_peak = peak
        total_disk += disk
    }

    printf "| **TOTAL** | **peak %s** | **%s** | **%.2f** | | **%s** | |\n", \
        human(max_peak), secs(total_dur), total_dur / calib, human(total_disk) > out_md
    print  ""                                                         > out_md
    print  "**Deployment-sizing takeaways (hardware-independent):**"  > out_md
    printf "- Single-job RAM peak: **%s** → server RAM ≥ peak × concurrent-jobs + ~25%% headroom.\n", human(max_peak) > out_md
    printf "- Total job disk footprint: **%s** (per concurrent job).\n", human(total_disk) > out_md
    print  "- Durations are hardware-*dependent*; compare across machines via the normalised column." > out_md
}
