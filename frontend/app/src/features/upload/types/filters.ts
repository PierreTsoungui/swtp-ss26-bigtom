/**
 * Configuration for the Detection P-Value filter.
 * This filter identifies probes that cannot be distinguished from background noise.
 */
export type DetPFilterType = {
  /**
   * Whether the filter is active.
   * If disabled, all probes are retained regardless of their signal-to-noise ratio.
   * @default true
   */
  enabled: boolean;

  /**
   * Significance threshold for the detection p-value.
   * Probes with a p-value above this threshold are excluded.
   * - **Strict:** `0.01` (removes more noise, but also more data)
   * - **Standard:** `0.05` (standard significance level)
   * @default 0.01
   */
  cutoff: number;
};

/**
 * Configuration for the Bead Count filter.
 * Ensures that each methylation measurement is supported by a sufficient number of beads.
 */
export type BeadCountFilterType = {
  /** @default false */
  enabled: boolean;

  /**
   * Maximum allowed fraction of failed samples per probe.
   * Probes that fail in too many samples are removed from the dataset.
   * @default 0.05
   */
  bead_cutoff: number;
};

/**
 * Configuration for the Non-CpG filter.
 * Removes probes that do not target CpG sites.
 */
export type NonCpgFilterType = {
  /** @default false */
  enabled: boolean;
};

/**
 * Configuration for the SNP filter.
 * Removes probes that overlap known genetic variants (SNPs) to prevent genetic bias.
 */
export type SnpFilterType = {
  /** @default false */
  enabled: boolean;

  /**
   * Minor Allele Frequency (MAF) threshold.
   * Probes are removed if the associated SNP has a MAF greater than or equal to this value.
   * - `0.0`: Removes any probe with any known SNP.
   * - `0.05`: Removes probes where the SNP occurs in ≥5% of the population.
   * @default 0.05
   */
  maf_cutoff: number;
};

/**
 * Configuration for the Multi-Hit filter.
 * Removes probes that bind to multiple locations in the genome.
 */
export type MultiHitFilterType = {
  /** @default false */
  enabled: boolean;
};

/**
 * Configuration for the Sex Chromosome (XY) filter.
 * Useful when analyzing mixed-sex cohorts where sex differences are not the primary interest.
 */
export type XYChromosomesFilterType = {
  /** @default false */
  enabled: boolean;
};

/**
 * Configuration for sample-level quality control.
 * Evaluates the overall performance of each individual sample based on failed probes.
 */
export type SampleQualityFilterType = {
  /** @default true */
  enabled: boolean;

  /**
   * P-value threshold used to count "failed" probes within a sample.
   * Typically higher than `det_p.cutoff` for broader counting.
   * @default 0.05
   */
  detection_p_cutoff: number;

  /**
   * Maximum allowed fraction of failed probes per sample.
   * Samples exceeding this rate are flagged as poor quality.
   * @default 0.1
   */
  sample_failure_rate: number;

  /**
   * If true, low-quality samples are automatically excluded.
   * If false, they are only flagged for manual review.
   * @default true
   */
  remove_failed_samples: boolean;

  /**
   * Performs Principal Component Analysis (PCA) to identify statistical
   * outliers that may indicate laboratory errors or contamination.
   * @default true
   */
  enable_pca_outlier_detection: boolean;
};

/**
 * Complete filter configuration for the analysis pipeline.
 */
export type FilterSettings = {
  filter_settings: {
    /** {@link DetPFilterType} */
    det_p: DetPFilterType;
    /** {@link BeadCountFilterType} */
    bead_count: BeadCountFilterType;
    /** {@link NonCpgFilterType} */
    non_cpg: NonCpgFilterType;
    /** {@link SnpFilterType} */
    snp: SnpFilterType;
    /** {@link MultiHitFilterType} */
    multi_hit: MultiHitFilterType;
    /** {@link XYChromosomesFilterType} */
    xy_chromosomes: XYChromosomesFilterType;
    /** {@link SampleQualityFilterType} */
    sample_quality: SampleQualityFilterType;
  };
};

/**
 * Default filter configuration used if no custom settings are provided.
 */
export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  filter_settings: {
    det_p: { enabled: true, cutoff: 0.01 },
    bead_count: { enabled: false, bead_cutoff: 0.05 },
    non_cpg: { enabled: false },
    snp: { enabled: false, maf_cutoff: 0.05 },
    multi_hit: { enabled: false },
    xy_chromosomes: { enabled: false },
    sample_quality: {
      enabled: true,
      detection_p_cutoff: 0.05,
      sample_failure_rate: 0.1,
      remove_failed_samples: true,
      enable_pca_outlier_detection: true,
    },
  },
};
