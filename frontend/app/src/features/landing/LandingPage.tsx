import AnalyticsIcon from "@mui/icons-material/Analytics";
import BiotechIcon from "@mui/icons-material/Biotech";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import InsightsIcon from "@mui/icons-material/Insights";
import ScienceIcon from "@mui/icons-material/Science";
import TuneIcon from "@mui/icons-material/Tune";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import BookIcon from "@mui/icons-material/Book";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LandingLogo } from "./LandingLogo";


/**
 * A single entry in the glossary of terms.
 */
interface DictionaryItem {
  /** The technical or biological term. */
  term: string;
  /** A concise, human-readable definition of the term. */
  definition: string;
}

/**
 * Data structure for informational tiles displayed on the landing page.
 */
interface InformationCard {
  title: string;
  description: string;
  /** Visual representation, typically an icon from Material-UI. */
  icon: ReactNode;
}

/**
 * A single question and answer pair for the FAQ section.
 */
interface FaqItem {
  question: string;
  answer: string;
}

/**
 * A grouped collection of FAQ items, categorized by topic.
 */
interface FaqCategory {
  /** The name of the category (e.g., "Upload & Files"). */
  title: string;
  /** List of questions belonging to this category. */
  questions: FaqItem[];
}



/**
 * Glossary of biological and technical terminology used within the platform.
 * Provides concise, scientifically accurate definitions for the epigenetic and
 * bioinformatics concepts that appear across the workflow. Ordered roughly along
 * the analysis: input data, core biology, quality-control criteria,
 * normalization, batch assessment, and result concepts.
 */
const biologyDictionary: DictionaryItem[] = [
  {
    term: "IDAT File",
    definition:
      "The raw intensity data format produced by Illumina scanners. Each sample is represented by two IDAT files, one per colour channel (Red and Green), which together encode the measured signal for every probe on the array.",
  },
  {
    term: "Sample Sheet",
    definition:
      "A tabular file (CSV or Excel) that lists the samples in the experiment and their metadata. It links each sample to its IDAT files via array identifiers such as Sentrix_ID and Sentrix_Position, and records the group assignments that define the comparison.",
  },
  {
    term: "DNA Methylation",
    definition:
      "An epigenetic modification in which a methyl group is added to a cytosine base, most commonly producing 5-methylcytosine at CpG sites. It can influence gene expression and chromatin structure without altering the underlying DNA sequence.",
  },
  {
    term: "CpG Site",
    definition:
      "A position where a cytosine is directly followed by a guanine along the same DNA strand, joined by a phosphate group (the 'p' in CpG). CpG sites are the principal targets of DNA methylation in mammals and should not be confused with a C–G base pair across the two strands.",
  },
  {
    term: "Beta-value",
    definition:
      "A measure of methylation at a single CpG site, defined as the methylated signal divided by the total signal. It ranges from 0 (fully unmethylated) to 1 (fully methylated) and is the scale on which most results are reported.",
  },
  {
    term: "detP (Detection p-value)",
    definition:
      "A quality metric indicating whether a probe's signal can be reliably distinguished from background noise, which is estimated from negative control probes. Probes or samples with high detection p-values are considered unreliable and are removed.",
  },
  {
    term: "BeadCount",
    definition:
      "The number of physical beads on the Illumina array that contribute to the measurement of a given probe. Because each bead provides a replicate reading, probes with too few beads are removed due to low statistical precision.",
  },
  {
    term: "SNP (Single Nucleotide Polymorphism)",
    definition:
      "A single-base position in the genome that varies commonly between individuals. Probes overlapping known SNPs are removed because such sequence variation can distort the methylation readout and be mistaken for a true epigenetic difference.",
  },
  {
    term: "NonCpG",
    definition:
      "Probes that measure cytosine methylation outside the canonical CpG context (for example CHG or CHH). In most human somatic tissues non-CpG methylation is rare, so these probes are commonly removed to focus on standard CpG methylation.",
  },
  {
    term: "MultiHit",
    definition:
      "Cross-reactive probes whose sequence matches more than one location in the genome. The resulting signal is ambiguous because it cannot be attributed to a single site, so these probes are filtered out to preserve accuracy.",
  },
  {
    term: "XY (Sex Chromosome Probes)",
    definition:
      "Probes located on the X and Y chromosomes. They are frequently removed so that systematic methylation differences between the sexes, such as those arising from X-chromosome inactivation, do not dominate a comparison focused on other biological factors.",
  },
  {
    term: "SampleQuality",
    definition:
      "An aggregate, per-sample assessment of overall signal intensity and integrity. Samples that fall below the quality threshold are excluded entirely, because their measurements would undermine the reliability of the whole analysis.",
  },
  {
    term: "Normalization",
    definition:
      "A set of computational corrections that reduce technical differences between samples, such as dye bias between channels and effects of the two probe chemistries, so that the remaining variation more faithfully reflects biology. Available methods here include Noob, Quantile, SWAN and Functional normalization.",
  },
  {
    term: "Batch Effect",
    definition:
      "Systematic technical variation introduced when samples are processed in different groups, on different days, on different arrays, or by different operators. It is problematic when it aligns with the biological grouping, because it can be mistaken for a real difference.",
  },
  {
    term: "PCA (Principal Component Analysis)",
    definition:
      "A method that summarises the many methylation measurements per sample into a few components capturing the largest sources of variation. Each sample is shown as a point, and samples with similar profiles appear close together.",
  },
  {
    term: "SVD (Singular Value Decomposition)",
    definition:
      "A matrix factorization that decomposes the data into its principal components of variation and relates them to sample characteristics. It is used here to reveal whether variation is driven by biological factors or by technical batch effects.",
  },
  {
    term: "DMP (Differentially Methylated Position)",
    definition:
      "A single CpG site whose methylation level differs to a statistically significant degree between the compared sample groups. DMPs are the finest-grained result of the analysis.",
  },
  {
    term: "DMR (Differentially Methylated Region)",
    definition:
      "A contiguous genomic region containing several neighbouring CpG sites that together show a consistent and statistically significant methylation difference between groups. In this platform, regions are identified using the Bumphunter approach.",
  },
  {
    term: "Delta-Beta (Δβ)",
    definition:
      "The difference between the mean Beta-values of two groups at a given site. It quantifies the size and direction of the methylation change (the effect size); the sign indicates in which group methylation is higher.",
  },
  {
    term: "Adjusted p-value (FDR)",
    definition:
      "A p-value corrected for the large number of tests performed simultaneously across all CpG sites. Adjustment, for example by controlling the false discovery rate (FDR), limits the expected proportion of false positives among the reported findings.",
  },
];

/**
 * High-level overview of the analysis pipeline.
 * Used to visualize the sequential stages from data ingestion to result exploration.
 */
const workflowSteps: InformationCard[] = [
  {
    title: "Select Files",
    description:
      "Upload the raw IDAT files, either individually or by selecting the folder that contains them, together with the corresponding Sample Sheet in CSV or Excel format. Illumina 450K, EPIC v1 and EPIC v2 arrays are supported.",
    icon: <UploadFileIcon fontSize="large" />,
  },
  {
    title: "Initial Filtering",
    description:
      "Remove low-quality probes and samples according to established technical and biological criteria (detP, BeadCount, SNP, NonCpG, MultiHit, XY, and SampleQuality) to ensure reliable downstream analysis. Missing or unpaired IDAT files are flagged before the analysis begins.",
    icon: <FactCheckIcon fontSize="large" />,
  },
  {
    title: "Normalization",
    description:
      "Reduce technical variation between samples to improve comparability. Compare the available methods (Noob, Quantile, SWAN and Functional normalization) using density and PCA plots, then select one method or continue without normalization.",
    icon: <InsightsIcon fontSize="large" />,
  },
  {
    title: "Optional Batch Correction",
    description:
      "Assess potential batch effects using SVD plots and, if required, apply correction iteratively via limma::removeBatchEffect while protecting the biological grouping of interest.",
    icon: <TuneIcon fontSize="large" />,
  },
  {
    title: "Results",
    description:
      "Explore statistically significant differences as differentially methylated positions (DMPs) and regions (DMRs). Filter and sort the results, export them as CSV, and generate visualizations such as heatmaps.",
    icon: <AnalyticsIcon fontSize="large" />,
  },
];

/**
 * Extended, plain-language explanations for users who are new to DNA methylation
 * analysis. Each entry describes the purpose of a stage and how it fits into the
 * overall workflow, providing the context that the concise workflow cards omit.
 */
const beginnerTopics: InformationCard[] = [
  {
    title: "What DNA methylation is",
    description:
      "DNA methylation is a chemical mark, the addition of a methyl group to cytosine bases, that cells use to regulate which genes are active without changing the genetic code itself. Methylation patterns differ between tissues, developmental stages and disease states, which makes them informative for research into gene regulation, development and conditions such as cancer. This platform measures methylation at hundreds of thousands of defined positions across the genome using Illumina arrays.",
    icon: <ScienceIcon />,
  },
  {
    title: "The data you provide",
    description:
      "Two kinds of input are required. The raw measurements arrive as IDAT files, with two files per sample, one for each colour channel of the array. A Sample Sheet, supplied as CSV or Excel, lists the samples, links each one to its IDAT files, and records which experimental group every sample belongs to. The group labels in the Sample Sheet determine which comparison the analysis performs.",
    icon: <UploadFileIcon />,
  },
  {
    title: "Quality control and filtering",
    description:
      "Not every measurement on an array is trustworthy. The filtering step automatically removes probes and samples affected by known technical problems, such as weak signal relative to background, too few replicate beads, overlap with common genetic variants, and cross-reactive probes. Removing these measurements before analysis prevents unreliable data from producing false results, and the criteria applied are standard practice in the field.",
    icon: <FilterAltIcon />,
  },
  {
    title: "Normalization",
    description:
      "Even after filtering, samples carry technical differences that have nothing to do with biology, for instance because the array combines two different probe chemistries. Normalization adjusts the data to reduce these differences so that samples become directly comparable. The platform lets you compare several established methods using diagnostic plots and then choose one, or proceed without normalization if you prefer.",
    icon: <InsightsIcon />,
  },
  {
    title: "Batch effect correction",
    description:
      "When samples are processed in separate groups, on different days or on different arrays, systematic technical differences known as batch effects can arise. If such effects coincide with the biological groups, they can be mistaken for genuine findings. Using SVD visualizations you can check whether batch effects are present and, if necessary, apply a correction that removes the technical variation while protecting the biological differences you intend to study. This step is optional.",
    icon: <CleaningServicesIcon />,
  },
  {
    title: "Statistical analysis and results",
    description:
      "Finally, the platform compares methylation between your groups and reports the positions and regions that differ significantly. Results are presented as interactive tables of differentially methylated positions (individual CpG sites) and differentially methylated regions (clusters of neighbouring sites), each accompanied by an effect size and a measure of statistical significance. You can filter, sort and export these tables and generate visualizations such as heatmaps to explore and communicate the findings.",
    icon: <BiotechIcon />,
  },
];

/**
 * Frequently Asked Questions grouped by functional categories.
 * Addresses common hurdles in data preparation and analysis interpretation.
 */
const faqCategories: FaqCategory[] = [
  {
    title: "Upload & Files",
    questions: [
      {
        question: "Which columns are required in the Sample Sheet?",
        answer:
          "The Sample Sheet must allow each sample to be matched to its raw IDAT files. This requires the Illumina array identifiers Sentrix_ID and Sentrix_Position, or alternatively a single Basename column that combines them. A column describing the group or condition of each sample is also strongly recommended, because the statistical comparison is defined by these group labels.",
      },
      {
        question: "How many IDAT files do I need to upload?",
        answer:
          "Every sample is measured in two colour channels, so each sample is represented by exactly two IDAT files: one for the Red channel and one for the Green channel. Both files of a pair are required, and every sample listed in the Sample Sheet must have a matching, complete pair. Incomplete or unpaired files are detected and reported before the analysis begins.",
      },
      {
        question: "What is the maximum upload size?",
        answer:
          "The maximum upload size is determined by the server configuration rather than by a fixed limit in the interface. Studies with many samples produce correspondingly large uploads, because each sample contributes two IDAT files. If an upload exceeds the configured limit, consider processing fewer samples at once or contacting the operator of your deployment.",
      },
      {
        question: "Why do IDAT files always come in pairs?",
        answer:
          "Illumina methylation arrays record two fluorescence intensities per probe, one in the Red channel and one in the Green channel, and these are written to two separate IDAT files. Both channels are needed to compute a methylation value, so a sample cannot be processed unless both files of the pair are present.",
      },
    ],
  },
  {
    title: "Analysis Process",
    questions: [
      {
        question: "What is a Sample Sheet and what information does it contain?",
        answer:
          "A Sample Sheet is a tabular description of the experiment. In addition to the technical identifiers that link each sample to its IDAT files, it records metadata such as sample names, group or condition assignments, and further variables (for example sex, batch or treatment). The group assignments define which samples are compared during the statistical analysis, and the additional variables can be used to inspect or correct for batch effects.",
      },
      {
        question: "What does the filtering step do and which probes are removed?",
        answer:
          "Filtering removes probes and samples whose measurements are unlikely to be reliable, so that later statistics are not distorted by technical noise. Seven criteria are applied: detection p-value (signal versus background), bead count (measurement replication), overlap with known SNPs, non-CpG probes, cross-reactive (multi-hit) probes, probes on the X and Y chromosomes, and an overall per-sample quality assessment. Each criterion targets a specific, well-characterised source of unreliability on Illumina arrays.",
      },
      {
        question: "What is normalization and why is it necessary?",
        answer:
          "Raw methylation measurements contain technical variation unrelated to biology, such as differences between the two probe chemistries used on the array, dye bias between channels, and variation introduced during sample processing. Normalization adjusts the data to reduce these effects so that differences observed between groups are more likely to reflect genuine biological signal. It is recommended in most workflows, but it remains optional here so that you retain full control over the analysis.",
      },
      {
        question: "How do I choose the right normalization method?",
        answer:
          "The platform offers several established methods (Noob, Quantile, SWAN and Functional normalization), each making different assumptions about the data. To support an informed choice, density plots and PCA plots are provided so that you can compare the effect of each method. A suitable method typically makes the overall signal distributions of samples more consistent while preserving the biological differences you intend to study; no single method is optimal for every dataset.",
      },
      {
        question: "What is a batch effect and how do I know if my data is affected?",
        answer:
          "A batch effect is a systematic technical difference between groups of samples that were processed separately, for example on different days, on different arrays, or by different operators. It is especially problematic when it is confounded with the biological grouping, because it can then be mistaken for a real difference. PCA and SVD visualizations help to reveal such effects: if samples separate primarily according to a technical variable rather than the biological condition, a batch effect is likely present.",
      },
      {
        question: "How long does the analysis take?",
        answer:
          "The runtime depends mainly on the number of samples, the processing steps you select, and the resources of the server. Small datasets may complete within a few minutes, whereas large studies, region detection and batch correction can take considerably longer. Progress is reported continuously so that you can follow each stage.",
      },
      {
        question: "Can I cancel a running analysis?",
        answer:
          "Yes. A running analysis can be stopped at any time from the interface. Doing so signals the processing job to terminate and releases its resources, after which the associated working data can be removed. This is useful if you notice an incorrect configuration and wish to restart with different settings.",
      },
    ],
  },
  {
    title: "Results & Tables",
    questions: [
      {
        question: "What is a DMP?",
        answer:
          "A Differentially Methylated Position (DMP) is an individual CpG site at which the methylation level differs significantly between the groups being compared. DMPs are the finest-grained result of the analysis and are reported together with their effect size (Delta-Beta) and a measure of statistical significance.",
      },
      {
        question: "What is a DMR?",
        answer:
          "A Differentially Methylated Region (DMR) is a stretch of the genome containing several nearby CpG sites that show a coordinated methylation difference between groups. Because biological regulation often acts over regions rather than isolated positions, DMRs can be more robust and more readily interpretable than single positions. Regions are identified here using the Bumphunter method.",
      },
      {
        question: "What is a p-value and what threshold should I use?",
        answer:
          "A p-value expresses how likely an observed difference would be if there were in fact no real difference between the groups; smaller values indicate stronger evidence. A threshold of 0.05 is a common convention, but because methylation arrays test many CpG sites simultaneously, an adjusted p-value that controls the false discovery rate should be used to limit false positives. Stricter thresholds are appropriate when a low tolerance for false discoveries is required.",
      },
      {
        question: "What does Delta-Beta mean?",
        answer:
          "Delta-Beta is the difference in average methylation between the two groups at a given site, expressed on the Beta-value scale from 0 to 1. It describes both the magnitude and the direction of the change: larger absolute values indicate a bigger difference, while the sign indicates in which group methylation is higher. Considering Delta-Beta alongside statistical significance helps distinguish changes that are both reliable and biologically meaningful.",
      },
      {
        question: "What is the difference between hyper- and hypomethylation?",
        answer:
          "Hypermethylation and hypomethylation describe the direction of a methylation change relative to a reference group. Hypermethylation means a site or region carries more methylation in the group of interest, which at gene promoters is often associated with reduced gene expression. Hypomethylation means it carries less methylation, which can be associated with increased expression or, at the genome-wide scale, with reduced genomic stability.",
      },
      {
        question: "How do I filter the results table by gene name?",
        answer:
          "Use the filter controls above the results table and enter the gene name, or part of it, in the corresponding field. The table then displays only the CpG sites annotated to matching genes. Filters can be combined with sorting and with other column filters to narrow the results to the positions or regions of interest.",
      },
      {
        question: "Can I export the results?",
        answer:
          "Yes. Both the DMP and DMR result tables can be exported as CSV files, which can be opened in spreadsheet software or imported into other analysis environments. The exported file reflects the current contents of the table, so any filters you have applied are included in the download.",
      },
    ],
  },
  {
    title: "Visualizations",
    questions: [
      {
        question: "What does the PCA plot show?",
        answer:
          "A PCA (Principal Component Analysis) plot reduces the many thousands of methylation measurements per sample to a small number of components that capture the largest sources of variation. Each point represents one sample, and samples with similar methylation profiles appear close together. This makes it possible to see at a glance whether samples group according to the biological condition or according to a technical factor.",
      },
      {
        question: "What does the SVD plot show and how do I interpret it?",
        answer:
          "The SVD plot summarises the main components of variation in the data and relates them to sample characteristics, helping to distinguish biological signal from technical batch effects. The platform generates these plots both before and after batch correction, so that you can judge directly whether a correction has reduced unwanted technical variation without removing the biological differences of interest.",
      },
      {
        question: "What is a density plot?",
        answer:
          "A density plot shows the distribution of methylation (Beta) values across all probes for each sample, typically with a characteristic two-peak shape corresponding to unmethylated and methylated states. Comparing these curves across samples is a convenient way to assess data quality and to judge whether a normalization method has made the samples more comparable.",
      },
      {
        question: "How do I create a heatmap for a specific set of sites?",
        answer:
          "Heatmaps are generated from the DMP results. Select the grouping variables from the columns of your Sample Sheet and apply the desired table filters; the heatmap then displays the methylation values of the selected CpG sites across all samples, annotated and arranged by your chosen groups. This makes it easy to see whether the selected sites separate the experimental groups.",
      },
    ],
  },
  {
    title: "Data Privacy & Security",
    questions: [
      {
        question: "Is my data stored on the server?",
        answer:
          "Uploaded files and intermediate results are stored on the server only temporarily and solely for the purpose of running your analysis. They are held in a working directory that is specific to your job and are removed automatically once the retention period elapses or when you reset the job.",
      },
      {
        question: "How long is my session data kept?",
        answer:
          "By default, a job and its associated files are automatically deleted approximately 24 hours after they were created or last modified. You can also remove your data immediately at any time by resetting the job from the interface. The exact retention period may be adjusted by the operator of your deployment.",
      },
      {
        question: "Is my data transfer encrypted?",
        answer:
          "When the application is served over HTTPS, data exchanged between your browser and the server is encrypted in transit using TLS. This is transport-layer encryption; the server necessarily processes the data in unencrypted form in order to run the analysis. Whether HTTPS is enforced depends on how your instance is deployed.",
      },
      {
        question: "Who has access to my uploaded data?",
        answer:
          "Each analysis runs in its own isolated job context, and data belonging to one job is not exposed to other users through the application. Any administrative access to the underlying server infrastructure depends on how and where the platform is deployed and is governed by the policies of the operator.",
      },
    ],
  },
];

/**
 * Main landing page component.
 *
 * Serves as the entry point of the application, providing educational resources,
 * a technical dictionary, and a step-by-step guide to the methylation workflow.
 */
export function LandingPage() {
  return (
    <div className="bg-neutral-background text-neutral-textPrimary">
      <section id="overview" className="scroll-mt-24 border-b border-neutral-borderDefault bg-neutral-card px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-wide text-primary">
                Full methylation analysis
              </p>
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-neutral-textPrimary lg:text-6xl">
                DNA Methylation Analysis Platform
              </h1>
              <p className="mt-6 max-w-4xl text-base leading-8 text-neutral-textSecondary lg:text-lg">
                MethylAnalyzer is a web-based platform for DNA methylation analysis.
                It enables researchers to analyze and interpret raw DNA methylation data from Illumina IDAT files,
                minimizing the need for extensive programming or bioinformatics expertise.
                <br /><br />
                The application guides users through data upload, quality control,
                normalization, optional batch effect correction, and statistical analysis.
                Results are presented in interactive tables and visualizations, enabling the
                identification of biologically relevant methylation differences across sample groups.
                <br /><br />
                Designed for both newcomers and experienced researchers, MethylAnalyzer
                provides a transparent and reproducible workflow from raw data to interpretable results.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <LandingLogo />
            </div>
          </div>

          <div className="mt-12 flex justify-center">
            <Link
              to="/upload"
              className="inline-flex min-w-60 items-center justify-center rounded-full bg-primary px-10 py-4 text-lg font-bold text-primary-text shadow-lg shadow-primary/20 transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Start Analysis
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION: WORKFLOW STEPS */}
      <section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-24 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Analysis workflow
            </p>
            <h2 id="workflow-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              From raw files to interpretable results
            </h2>
            <p className="mt-4 leading-7 text-neutral-textSecondary">
              The analysis proceeds through five stages, while you retain control over the
              normalization and batch correction decisions.
            </p>
          </div>

          <ol className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {workflowSteps.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-neutral-borderDefault bg-neutral-card p-6 shadow-sm"
              >
                <span className="absolute right-5 top-5 text-sm font-bold text-neutral-borderEmphasis">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-info-badgeBackground text-info-hover">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold text-neutral-textPrimary">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-textSecondary">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* SECTION: GETTING STARTED */}
      <section
        id="getting-started"
        aria-labelledby="beginner-title"
        className="scroll-mt-24 border-y border-neutral-borderDefault bg-neutral-card px-6 py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-tertiary-hover">
              Getting started
            </p>
            <h2 id="beginner-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              New to DNA methylation analysis?
            </h2>
            <p className="mt-4 leading-7 text-neutral-textSecondary">
              DNA methylation analysis transforms raw signal from a methylation array into a list
              of the genomic positions and regions that differ between groups of samples. Several
              processing steps are needed along the way, each addressing a specific technical or
              statistical issue, before biological conclusions can be drawn with confidence. The
              sections below explain the purpose of each stage in plain terms and describe how the
              individual steps fit together, so that users who are new to the field understand what
              the platform does with their data and why.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {beginnerTopics.map((topic) => (
              <article
                key={topic.title}
                className="rounded-xl border border-neutral-borderDefault bg-neutral-surface p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-card text-tertiary-hover shadow-sm">
                  {topic.icon}
                </div>
                <h3 className="text-lg font-semibold text-neutral-textPrimary">{topic.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-textSecondary">{topic.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: HELP & FAQ ACCORDION */}
      <section id="help" aria-labelledby="help-title" className="scroll-mt-24 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Help & FAQ
            </p>
            <h2 id="help-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-neutral-textSecondary">
              Browse common questions by topic. The answers provide practical guidance on preparing
              data, running the analysis, and interpreting the results.
            </p>
          </div>

          <div className="mt-10 space-y-6">
            {faqCategories.map((category) => {
              const categoryId = `faq-${category.title.replaceAll(" ", "-").toLowerCase()}`;

              return (
                <section
                  key={category.title}
                  aria-labelledby={categoryId}
                  className="rounded-2xl border border-neutral-borderDefault bg-neutral-card p-5 shadow-sm"
                >
                  <h3 id={categoryId} className="mb-3 text-lg font-semibold text-neutral-textPrimary">
                    {category.title}
                  </h3>
                  <div className="divide-y divide-neutral-borderDefault">
                    {category.questions.map((item) => (
                      <details key={item.question} className="group py-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-1.5 font-medium text-neutral-textPrimary transition-colors hover:bg-neutral-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                          <span>{item.question}</span>
                          <ExpandMoreIcon
                            fontSize="small"
                            aria-hidden
                            className="shrink-0 text-neutral-textSecondary transition-transform duration-200 group-open:rotate-180"
                          />
                        </summary>

                        <p className="mt-3 px-2 text-sm leading-6 text-neutral-textSecondary">
                          {item.answer}
                        </p>
                      </details>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>
      {/* SECTION: BIOLOGICAL GLOSSARY */}
      <section id="glossary" aria-labelledby="glossary-title" className="scroll-mt-24 border-t border-neutral-borderDefault bg-neutral-card px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-success">
              Knowledge Base
            </p>
            <h2 id="glossary-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              Biological & Technical Glossary
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-neutral-textSecondary">
              Look up the scientific terms, parameters, and methods that appear throughout the
              workflow steps.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {biologyDictionary.map((item) => (
              <div
                key={item.term}
                className="rounded-xl border border-neutral-borderDefault bg-neutral-background p-5"
              >
                <div className="flex items-center gap-2">
                  <BookIcon className="h-5 w-5 text-success" fontSize="small" />
                  <h4 className="font-bold text-neutral-textPrimary">{item.term}</h4>
                </div>
                <p className="mt-2 text-sm leading-6 text-neutral-textSecondary">{item.definition}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
