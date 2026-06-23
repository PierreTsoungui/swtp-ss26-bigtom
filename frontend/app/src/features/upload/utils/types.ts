/**
 * Filter-Einstellungen für den Detection P-Value Filter.
 */
export type DetPFilterType = {
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
     * - **Minimum:** `0.01` - sehr streng, entfernt viele Proben
     * - **Maximum:** `0.05` - Standard-Signifikanzniveau
     *
     * @defaultValue 0.01
     */
    cutoff: number;
}

/**
 * Filter-Einstellungen für den Bead Count Filter
 */
export type BeadCountFilterType = {
    /**
     * Gibt an, ob der Bead Count Filter aktiviert ist.
     *
     * @defaultValue false
     */
    enabled: boolean;

    /**
     * Maximal erlaubter Anteil schlechter Samples pro Probe
     *
     * - **Minimum:** `0.0`
     * - **Maximum:** `1.0`
     * - **Schritt:** `0.01`
     *
     * @defaultValue 0.05
     */
    bead_cutoff: number;
}

/**
 * Filter-Einstellungen für den Non-CpG Filter.
 */
export type NonCpgFilterType = {
    /**
     * Gibt an, ob der Non-Cpg Filter aktiv ist.
     *
     * @defaultValue false
     */
    enabled: boolean;
}

/**
 * Filter-Einstellungen für den SNP Filter.
 */
export type SnpFilterType = {
    /**
     * Gibt an ob der SNP Filter aktiv ist.
     *
     * @defaultValue false
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
    maf_cutoff: number;
}

/**
 * Filter-Einstellungen für den Multi-Hit Filter.
 */
export type MultiHitFilterType = {
    /**
     * Gibt an ob Multi-Hit Filer aktiv ist.
     *
     * @defaultValue false
     */
    enabled: boolean;
}

/**
 * Filter-Einstellungen für den
 */
export type XYChromosomesFilterType = {
    /**
     * Gibt an ob der XY-Chromosomen Filter aktiv ist.
     *
     * @defaultValue false
     */
    enabled: boolean;
}


/**
 * Filter-Einstellungen für die Sample-Qualitätskontrolle.
 *
 * Während der Detection P-Value Filter einzelne Sonden über alle Samples
 * prüft, bewertet dieser Filter die Gesamtqualität jedes einzelnen Samples.
 * Ein Sample gilt als fehlgeschlagen wenn zu viele seiner Sonden
 * unzuverlässige Signale liefern.
 */
export type SampleQualityFilterType = {
    /**
     * Gibt an ob die Sample-Qualitätskontrolle aktiv ist.
     *
     * @defaultValue true
     */
    enabled: boolean;

    /**
     * P-Value Schwellenwert um eine einzelne Sonde innerhalb
     * eines Samples als "fehlgeschlagen" zu werten.
     *
     * Bewusst höher als det_p.cutoff — hier geht es nur ums Zählen,
     * nicht ums direkte Entfernen von Sonden.
     *
     * - **Minimum:** `0.01`
     * - **Maximum:** `0.05`
     *
     * @defaultValue 0.05
     */
    detection_p_cutoff: number;

    /**
     * Maximaler Anteil fehlgeschlagener Sonden pro Sample.
     *
     * Überschreitet ein Sample diesen Anteil, wird es als
     * qualitativ unzureichend markiert.
     *
     * - **Minimum:** `0.05` (0.5%)
     * - **Maximum:** `0.2`  (20%)
     *
     * @defaultValue 0.1
     */
    sample_failure_rate: number;

    /**
     * Wenn `true`: fehlerhafte Samples werden automatisch entfernt.
     * Wenn `false`: fehlerhafte Samples werden nur als Warnung angezeigt,
     * die Biologin entscheidet selbst ob sie entfernt werden sollen.
     *
     * @defaultValue true
     */
    remove_failed_samples: boolean;

    /**
     * Wenn `true`: PCA wird durchgeführt um statistische Ausreißer
     * unter den Samples zu identifizieren. Ausreißer können auf
     * Laborfehler oder Kontaminationen hinweisen.
     *
     * @defaultValue true
     */
    enable_pca_outlier_detection: boolean;
};
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
 *    filter_settings: {
 *         det_p:          { enabled: true,  cutoff: 0.01 },
 *         bead_count:     { enabled: false, bead_cutoff: 0.05 },
 *         non_cpg:        { enabled: false },
 *         snp:            { enabled: false,  maf_cutoff: 0.05 },
 *         multi_hit:      { enabled: false },
 *         xy_chromosomes: { enabled: false },
 *         sample_quality: {
 *             enabled: true,
 *             detection_p_cutoff: 0.1,
 *             sample_failure_rate: 0.01,
 *             remove_failed_samples: true,
 *             enable_pca_outlier_detection: true
 *         }
 *     }
 * };
 * ```
 */
export type FilterSettings = {
    filter_settings : {
        /** {@link DetPFilterType} **/
        det_p : DetPFilterType,

        /** {@link BeadCountFilterType} **/
        bead_count : BeadCountFilterType,

        /** {@link NonCpgFilterType} **/
        non_cpg : NonCpgFilterType,

        /** {@link SnpFilterType} **/
        snp : SnpFilterType,

        /** {@link MultiHitFilterType} **/
        multi_hit : MultiHitFilterType,

        /** {@link XYChromosomesFilterType} **/
        xy_chromosomes : XYChromosomesFilterType,

        /** {@link SampleQualityFilterType} **/
        sample_quality : SampleQualityFilterType,
    }
}

/**
 * Standard-Filterkonfiguration die verwendet wird wenn der Nutzer
 * keine eigenen Einstellungen vorgenommen hat.
 */
export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
    filter_settings: {
        det_p:          { enabled: true,  cutoff: 0.01 },
        bead_count:     { enabled: false, bead_cutoff: 0.05 },
        non_cpg:        { enabled: false },
        snp:            { enabled: false,  maf_cutoff: 0.05 },
        multi_hit:      { enabled: false },
        xy_chromosomes: { enabled: false },
        sample_quality: {
            enabled: true,
            detection_p_cutoff: 0.05,
            sample_failure_rate: 0.1,
            remove_failed_samples: true,
            enable_pca_outlier_detection: true
        }
    },
};

