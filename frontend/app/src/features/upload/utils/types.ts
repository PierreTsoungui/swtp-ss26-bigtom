/**
 * Filter-Einstellungen für den Detection P-Value Filter.
 */
export type DetPFilter = {
    /**
     * Gibt an, ob der Detection P-Value Filter aktiviert ist. oder nicht.
     *
     * Wenn deaktiviert, werden alle Proben unabhängig vom P-Value beibehalten.
     *
     * @defaultValue true
     */
    enabled: boolean;

    /**
     * Schwellenwert für den Detection P-Value Filter.
     *
     * Proben mit einem P-Value größer diesem Schwellenwert werden ausgeschlossen.
     *
     * - **Minimum:** `0.0001` - sehr streng, entfernt viele Proben
     * - **Maximum:** `0.05` - Standard-Signifikanzniveau
     *
     * @defaultValue 0.01
     */
    cutoff: number;
}

/**
 * Filter-Einstellungen für den Bead Count Filter
 */
export type BeadCountFilter = {
    /**
     * Gibt an, ob der Bead Count Filter aktiviert ist.
     *
     * @defaultValue true
     */
    enabled: boolean;

    /**
     * Minimale Anzahl an Bead pro Probe pro Sample.
     *
     * - **Minimum:** `1`
     * - **Maximum:** `10`
     * - **Schritt:** `1`
     *
     * @defaultValue 3
     */
    min_beads: number;

    /**
     * Maximaler Anteil der Samples, der die Mindestanzahl an Beads
     * *unterschreiten* darf, bevor eine Probe entfernt wird.
     *
     * - **Minimum:** `0.0` - alle Samples müssen `min_beads` erfüllen
     * - **Maximum:** `0.2` - mehr als 20% wäre zu tolerant
     * - **Schritt:** `0.01`
     *
     * @defaultValue 0.05
     */
    sample_fraction: number;
}

export type NonCpgFilter = {
    enabled: boolean;
}

export type SnpFilter = {
    enabled: boolean;
    maf: number;
}

export type MultiHitFilter = {
    enabled: boolean;
}

export type FilterSettings = {
    filter_settings : {
        det_p : DetPFilter,
        bead_count : BeadCountFilter,
        non_cpg : NonCpgFilter,
        snp : SnpFilter,
        multi_hit : MultiHitFilter,
    }
}