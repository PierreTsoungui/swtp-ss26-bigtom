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

/**
 * Filter-Einstellungen für den Non-CpG Filter.
 */
export type NonCpgFilter = {
    /**
     * Gibt an, ob der Non-Cpg Filter aktiv ist.
     *
     * @defaultValue true
     */
    enabled: boolean;
}

/**
 * Filter-Einstellungen für den SNP Filter.
 */
export type SnpFilter = {
    /**
     * Gibt an ob der SNP Filter aktiv ist.
     */
    enabled: boolean;

    /**
     * Minor Allele Frequency (MAF) Schwellenwert.
     *
     * Proben werden entfernt, wenn der zugehörige SNP eine MAF
     * **größer oder gleich** diesem Wert in der Referenzpopulation hat.
     * Ein Wert von `0.05` entfernt alle Proben mit SNPs, die in mindestens
     * 5 % der Population vorkommen.
     *
     * - **Minimum:** `0.0` — entfernt alle Proben mit irgendeinem bekannten SNP
     * - **Maximum:** `0.5` — theoretisches Maximum (MAF kann per Definition nie > 0.5 sein)
     * - **Schritt:** `0.01`
     *
     * @defaultValue 0.05
     */
    maf: number;
}

/**
 * Filter-Einstellungen für den Multi-Hit Filter.
 */
export type MultiHitFilter = {
    /**
     * Gibt an ob Multi-Hit Filer aktiv ist.
     *
     * @defaultValue true
     */
    enabled: boolean;
}

/**
 * Gesamte Filter-Konfiguration für den Upload-Schritt
 *
 * Wird als optionales JSON-Feld im `multipart/form-data` Request an
 * `POST /api/v1/upload` übergeben. Wenn nicht angegeben, verwendet
 * das Backend die Standard-Werte aller Filter.
 *
 * @example
 * ```typescript
 * const filter_settings: FilterSettings = {
 *   filter_settings: {
 *     det_p:         { enabled: true, cutoff: 0.01 },
 *     bead_count:    { enabled: true, min_beads: 3, sample_fraction: 0.05 },
 *     non_cpg:       { enabled: true },
 *     snp:           { enabled: true, maf: 0.05 },
 *     multi_hit:     { enabled: true }
 *   }
 * };
 * ```
 */
export type FilterSettings = {
    filter_settings : {
        /** {@link DetPFilter} **/
        det_p : DetPFilter,

        /** {@link BeadCountFilter} **/
        bead_count : BeadCountFilter,

        /** {@link NonCpgFilter} **/
        non_cpg : NonCpgFilter,

        /** {@link SnpFilter} **/
        snp : SnpFilter,

        /** {@link MultiHitFilter} **/
        multi_hit : MultiHitFilter,
    }
}

/**
 * Standard-Filterkonfiguration die verwendet wird wenn der Nutzer
 * keine eigenen Einstellungen vorgenommen hat.
 */
export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
    filter_settings: {
        det_p:          { enabled: true,  cutoff: 0.01 },
        bead_count:     { enabled: true,  min_beads: 3, sample_fraction: 0.05 },
        non_cpg:        { enabled: true },
        snp:            { enabled: true,  maf: 0.05 },
        multi_hit:      { enabled: true }
    },
};