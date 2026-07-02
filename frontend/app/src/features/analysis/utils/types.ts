/**
 * Common statistics for a single filtering step.
 */
export interface BaseFilterStats {
  /** Whether this filtering stage was active. */
  enabled: boolean;
  /** Number of probes removed during this step. */
  removed: number;
  /** Number of probes remaining after this step. */
  after: number;
}

/**
 * Statistics for the Bead Count filtering stage.
 */
export interface BeadCountStats extends BaseFilterStats {
  /** Maximum allowed fraction of failed samples per probe (0.0 - 1.0). */
  bead_cutoff: number;
}

export interface DetPStats extends BaseFilterStats {
  /** Significance threshold used for detection p-values. */
  cutoff: number;
}
export interface MultiHitStats extends BaseFilterStats {}
export interface NonCpgStats extends BaseFilterStats {}
export interface SnpStats extends BaseFilterStats {
  /** Minor Allele Frequency (MAF) threshold used for exclusion. */
  maf_cutoff: number
}
export interface XyChromosomeStats extends BaseFilterStats {}

/**
 * Quality control statistics evaluated at the sample level.
 */
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

/**
 * Container for the complete filtering results and audit trail.
 */
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
 * UI representation of a filtering step used in the results display.
 */
export interface FilterStep {
  name: string;
  /** Optional descriptive label for the filter's primary parameter. */
  label?: string;
  /** The value associated with the label (e.g., the cutoff used). */
  labelValue?: number;
  removed: number;
  after: number;
}