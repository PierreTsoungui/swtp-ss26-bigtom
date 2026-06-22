/**
 * Interface, das die Statistiken der verschiedenen Filterungsschritte
 * während der Analyse beschreibt.
 *
 * @remarks
 * Die 3 Felder bilden die Basisstatistiken für jeden Filterungsschritt ab,
 * die in allen Schritten gleich sind. Sie können erweitert werden, um
 * spezifische Informationen für jeden Schritt zu speichern (z.B. die
 * verwendeten Cutoff-Werte).
 */
export interface BaseFilterStats {
  /** Gibt an, ob der Filterungsschritt aktiviert war. */
  enabled: boolean;

  /** Die Anzahl der Datensätze, die in diesem Schritt entfernt wurden. */
  removed: number;

  /** Die Anzahl der Datensätze, die nach diesem Schritt noch übrig sind. */
  after: number;
}

/**
 * Statistiken für den Bead-Count-Filterungsschritt.
 *
 * @remarks
 * Dieser Schritt filtert Sonden (Probes) heraus, die in zu vielen Proben
 * nicht die minimale Anzahl an physischen Kügelchen (Beads) erreicht haben.
 *
 * @see {@link BaseFilterStats} für die gemeinsamen Basis-Statistikfelder.
 */
export interface BeadCountStats extends BaseFilterStats {
  /**
   * Der maximale Prozentsatz erlaubter fehlerhafter Proben pro Sonde.
   *
   * @remarks
   * Wert zwischen 0 und 1 (z. B. `0.05` für 5%). Eine Sonde fliegt aus der
   * Analyse, wenn sie bei mehr als diesem Anteil aller Proben zu wenige Beads besitzt.
   */
  bead_cutoff: number;
}

export interface DetPStats extends BaseFilterStats {
  cutoff: number;
}
export interface MultiHitStats extends BaseFilterStats {}
export interface NonCpgStats extends BaseFilterStats {}
export interface SnpStats extends BaseFilterStats {
  maf_cutoff: number
}
export interface XyChromosomeStats extends BaseFilterStats {}

export interface SampleQualityStats {
  enabled: boolean;

  detection_p_cutoff: number;
  sample_failure_rate: number;

  enable_pca_outlier_detection: boolean;
  remove_failed_samples: boolean;

  samples_before: number;
  samples_after: number;
  samples_removed: number;
}

export interface FilteringStatsType {
  total_start: number;
  total_end: number;
  total_removed: number;

  bead_count: BeadCountStats;
  det_p: DetPStats;
  multi_hit: MultiHitStats;
  non_cpg: NonCpgStats;
  snp: SnpStats;
  xy_chromosomes: XyChromosomeStats;

  sample_quality: SampleQualityStats;
}

/**
 * Interface, das die Informationen zu einem einzelnen Filterungsschritt beschreibt,
 * die in der {@link FilteringStats}-Komponente angezeigt werden.
 */
export interface FilterStep {
  name: string;
  label?: string;
  labelValue?: number;
  removed: number;
  after: number;
}