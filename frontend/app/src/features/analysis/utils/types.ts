export interface BaseFilterStats {
  enabled: boolean;
  removed: number;
  after: number;
}
export interface BeadCountStats extends BaseFilterStats {}
export interface DetPStats extends BaseFilterStats {
  cutoff: number;
}
export interface MultiHitStats extends BaseFilterStats {}
export interface NonCpgStats extends BaseFilterStats {}
export interface SnpStats extends BaseFilterStats {}
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