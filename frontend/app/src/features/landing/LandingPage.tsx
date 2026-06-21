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
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LandingLogo } from "./LandingLogo";


// BIOLOGICAL & TECHNICAL DICTIONARY

interface DictionaryItem {
  term: string;
  definition: string;
}

// COMPONENT INTERFACES
interface InformationCard {
  title: string;
  description: string;
  icon: ReactNode;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  title: string;
  questions: FaqItem[];
}

const biologyDictionary: DictionaryItem[] = [
  {
    term: "DNA Methylation",
    definition: "A biochemical process where methyl groups are added to the DNA molecule, altering gene expression without changing the underlying DNA sequence.",
  },
  {
    term: "CpG Site",
    definition: "Regions of DNA where a cytosine nucleotide is followed by a guanine nucleotide. These sites are the primary targets for DNA methylation in mammals.",
  },
  {
    term: "DMP (Differentially Methylated Position)",
    definition: "A single specific CpG site that demonstrates a statistically significant difference in methylation levels between compared sample groups.",
  },
  {
    term: "DMR (Differentially Methylated Region)",
    definition: "A genomic region containing multiple adjacent CpG sites that collectively show consistent and statistically significant methylation differences.",
  },
  {
    term: "Delta-Beta (Δβ)",
    definition: "The mathematical difference between the average methylation levels (Beta-values) of two groups, indicating the effect size of the methylation change.",
  },
  {
    term: "detP (Detection p-value)",
    definition: "A quality metric evaluating whether a probe signal is distinguishable from background noise. Probes with high detP values are unreliable and filtered out.",
  },
  {
    term: "BeadCount",
    definition: "The number of physical beads on the Illumina array targeting a specific CpG site. Probes with too few beads are removed due to low statistical precision.",
  },
  {
    term: "SNP (Single Nucleotide Polymorphism)",
    definition: "Common genetic variations. Probes overlapping known SNPs are filtered to prevent genetic mutations from being mistaken for epigenetic methylation changes.",
  },
  {
    term: "NonCpG",
    definition: "Probes designed to measure methylation outside of standard CpG contexts (e.g., CHH or CHG). These are often removed to isolate canonical CpG methylation behavior.",
  },
  {
    term: "MultiHit",
    definition: "Probes that accidentally bind to multiple different locations in the genome, creating ambiguous signals that must be filtered out for accuracy.",
  },
  {
    term: "XY (Sex Chromosome Probes)",
    definition: "Probes located on the X and Y sex chromosomes. They are frequently filtered to prevent gender-based biological differences from biasing the global analysis.",
  },
  {
    term: "SampleQuality",
    definition: "An aggregate technical threshold assessing the overall signal intensity and integrity of a sample. Substandard samples are discarded entirely.",
  },
  {
    term: "Batch Effect",
    definition: "Unwanted technical variation introduced when samples are processed in different groups, on different days, or by different lab technicians.",
  },
  {
    term: "SVD (Singular Value Decomposition)",
    definition: "A mathematical matrix factorization method used to identify and visualize the primary components driving technical or biological variance in a dataset.",
  },
];

const workflowSteps: InformationCard[] = [
  {
    title: "Select Files",
    description:
      "Upload IDAT files individually or by selecting a parent folder. Upload the corresponding Sample Sheet as CSV or Excel file.",
    icon: <UploadFileIcon fontSize="large" />,
  },
  {
    title: "Initial Filtering",
    description:
      "Filter out low-quality probes and samples based on biological and technical criteria (detP, BeadCount, SNP, NonCpG, MultiHit, XY, and SampleQuality) to ensure reliable downstream analysis. Missing or invalid IDAT pairs are flagged before the analysis begins.",
    icon: <FactCheckIcon fontSize="large" />,
  },
  {
    title: "Normalization",
    description:
      "Reduce technical variation between samples to improve measurement comparability and analysis reliability. Compare available normalization methods using density plots and PCA plots. Then select one method, or continue without normalization.",
    icon: <InsightsIcon fontSize="large" />,
  },
  {
    title: "Optional Batch Correction",
    description:
      "Visualize potential batch effects using SVD plots and apply correction iteratively via limma::removeBatchEffect if needed to improve comparability between samples.",
    icon: <TuneIcon fontSize="large" />,
  },
  {
    title: "Results",
    description:
      "Explore statistically significant differences in differentially methylated positions (DMPs) and regions (DMRs). Apply filters, sort results, export data as CSV, and generate visualizations such as heatmaps.",
    icon: <AnalyticsIcon fontSize="large" />,
  },
];

const beginnerTopics: InformationCard[] = [
  {
    title: "Filtering",
    description: "Removes unreliable probes before statistical analysis.",
    icon: <FilterAltIcon />,
  },
  {
    title: "Normalization",
    description: "Reduces technical variation between samples.",
    icon: <ScienceIcon />,
  },
  {
    title: "Batch Correction",
    description: "Helps reduce unwanted technical differences between groups.",
    icon: <CleaningServicesIcon />,
  },
  {
    title: "Results",
    description:
      "Shows statistically relevant methylation differences as tables and visualizations.",
    icon: <BiotechIcon />,
  },
];

const faqCategories: FaqCategory[] = [
  {
    title: "Upload & Files",
    questions: [
      {
        question: "Which columns are required in the Sample Sheet?",
        answer:
          "The Sample Sheet must contain mandatory columns to map your data correctly, specifically Sentrix_ID and Sentrix_Position (or Basename).",
      },
      {
        question: "How many IDAT files do I need to upload?",
        answer:
          "Each sample requires two IDAT files: one Red channel file and one Green channel file. All samples referenced in the Sample Sheet must have matching IDAT pairs.",
      },
      {
        question: "What is the maximum upload size?",
        answer:
          "The maximum upload size depends on the server configuration. Large studies with many samples may require additional storage resources.",
      },
      {
        question: "Why do IDAT files always come in pairs?",
        answer:
          "Illumina methylation arrays generate measurements in two color channels (Red and Green). Both files are required to correctly process the data.",
      },
    ],
  },
  {
    title: "Analysis Process",
    questions: [
      {
        question: "What is a Sample Sheet and what information does it contain?",
        answer:
          "A Sample Sheet describes the samples included in the analysis and contains metadata such as sample identifiers, group assignments, and other experimental information.",
      },
      {
        question: "What does the filtering step do and which probes are removed?",
        answer:
          "Filtering automatically removes unreliable data using 7 specific technical and biological criteria: detP, BeadCount, SNP, NonCpG, MultiHit, XY, and SampleQuality to ensure statistical integrity.",
      },
      {
        question: "What is normalization and why is it necessary?",
        answer:
          "Normalization reduces technical variation between samples so that observed differences are more likely to reflect biological effects rather than measurement artifacts.",
      },
      {
        question: "How do I choose the right normalization method?",
        answer:
          "The platform provides density plots and PCA plots to compare methods. In general, choose the method that improves consistency between samples while preserving biological differences.",
      },
      {
        question: "What is a batch effect and how do I know if my data is affected?",
        answer:
          "Batch effects are unwanted technical differences caused by processing samples under different conditions. PCA and SVD visualizations can help identify such effects.",
      },
      {
        question: "How long does the analysis take?",
        answer:
          "Runtime depends on the number of samples and selected processing steps. Small datasets may finish within minutes, while larger datasets require more time.",
      },
      {
        question: "Can I cancel a running analysis?",
        answer:
          "Yes. You can actively reset or cancel a running job at any time via the interface, which triggers the system termination endpoint (POST /api/v1/reset/{job_id}).",
      },
    ],
  },
  {
    title: "Results & Tables",
    questions: [
      {
        question: "What is a DMP?",
        answer:
          "A DMP (Differentially Methylated Position) is a single CpG site that shows a statistically significant methylation difference between comparison groups.",
      },
      {
        question: "What is a DMR?",
        answer:
          "A DMR (Differentially Methylated Region) is a genomic region containing multiple nearby CpG sites that collectively show significant methylation differences.",
      },
      {
        question: "What is a p-value and what threshold should I use?",
        answer:
          "A p-value measures the statistical significance of an observed difference. A threshold of 0.05 is commonly used, although stricter thresholds may be appropriate.",
      },
      {
        question: "What does Delta-Beta mean?",
        answer:
          "Delta-Beta describes the magnitude of methylation difference between groups. Larger absolute values indicate stronger biological differences.",
      },
      {
        question: "What is the difference between hyper- and hypomethylation?",
        answer:
          "Hypermethylation means increased methylation in one group, while hypomethylation means decreased methylation compared to another group.",
      },
      {
        question: "How do I filter the results table by gene name?",
        answer:
          "Use the table filter controls and enter the gene name to restrict the displayed results.",
      },
      {
        question: "Can I export the results?",
        answer:
          "Yes. DMP and DMR result tables can be exported as CSV files for further analysis.",
      },
    ],
  },
  {
    title: "Visualizations",
    questions: [
      {
        question: "What does the PCA plot show?",
        answer:
          "A PCA plot visualizes similarities and differences between samples. Samples that cluster together have similar methylation profiles.",
      },
      {
        question: "What does the SVD plot show and how do I interpret it?",
        answer:
          "The SVD plot visualizes components of technical or biological variation. The platform generates these plots both before and after batch correction, allowing you to directly evaluate and compare the effectiveness of the correction.",
      },
      {
        question: "What is a density plot?",
        answer:
          "A density plot shows the distribution of methylation values across samples and helps evaluate normalization quality.",
      },
      {
        question: "How do I create a heatmap for a specific genomic region?",
        answer:
          "Heatmaps are generated from the DMP results and are structured based on the grouping variables defined in your Sample Sheet columns.",
      },
    ],
  },
  {
    title: "Data Privacy & Security",
    questions: [
      {
        question: "Is my data stored on the server?",
        answer:
          "Uploaded data is temporarily stored in an encrypted cache directory strictly for analysis purposes. No permanent records are kept on our cloud hosts.",
      },
      {
        question: "How long is my session data kept?",
        answer:
          "Session data is automatically purged from the system 24 hours after your last activity or immediately upon manual job reset.",
      },
      {
        question: "Is my data transfer encrypted?",
        answer:
          "Yes, the application enforces End-to-End Encryption (E2EE) via TLS 1.3/HTTPS, protecting data packages in transit between your browser and the server.",
      },
      {
        question: "Who has access to my uploaded data?",
        answer:
          "Access is programmatic and restricted solely to the execution node running your analysis. No user-to-user data access is architecturally possible.",
      },
    ],
  },
];
export function LandingPage() {
  return (
    <div className="bg-neutral-background text-neutral-textPrimary">
      <section className="border-b border-neutral-borderDefault bg-neutral-card px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
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
                provides a transparent and user-friendly workflow from raw data to interpretable results.
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
      <section id="workflow" aria-labelledby="workflow-title" className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Analysis workflow
            </p>
            <h2 id="workflow-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              From raw files to interpretable results
            </h2>
            <p className="mt-4 leading-7 text-neutral-textSecondary">
              Follow the five analysis stages while retaining control over normalization and batch
              correction decisions.
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
        aria-labelledby="beginner-title"
        className="border-y border-neutral-borderDefault bg-neutral-card px-6 py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-tertiary-hover">
              Getting started
            </p>
            <h2 id="beginner-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              New to DNA methylation analysis?
            </h2>
            <p className="mt-4 leading-7 text-neutral-textSecondary">
            DNA methylation analysis involves several processing steps before reliable
            biological conclusions can be drawn. The concepts below provide a simple
            introduction to the most important parts of the workflow and help new users
            understand what happens during the analysis.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {beginnerTopics.map((topic) => (
              <article key={topic.title} className="rounded-xl bg-neutral-surface p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-card text-tertiary-hover shadow-sm">
                  {topic.icon}
                </div>
                <h3 className="font-semibold text-neutral-textPrimary">{topic.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-textSecondary">{topic.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: HELP & FAQ ACCORDION */}
      <section id="help" aria-labelledby="help-title" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Help & FAQ
            </p>
            <h2 id="help-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-neutral-textSecondary">
              Browse common questions by topic. Detailed guidance will be expanded as the
              application documentation evolves.
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
                  <div className="divide-y divide-slate-200">
                    {category.questions.map((item) => (
                      <details key={item.question} className="group py-3">
                        <summary className="cursor-pointer list-none rounded-md pr-2 font-medium text-neutral-textSecondary">
                          {item.question}
                        </summary>

                        <p className="mt-3 text-sm leading-6 text-slate-500">
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

      {/* SECTION: NEW BIOLOGICAL GLOSSARY */}
      <section id="glossary" aria-labelledby="glossary-title" className="border-t border-slate-200 bg-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Knowledge Base
            </p>
            <h2 id="glossary-title" className="mt-2 text-3xl font-bold text-slate-950">
              Biological & Technical Glossary
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
              Quickly look up specific scientific terms, parameters, and algorithms used throughout the pipeline steps.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {biologyDictionary.map((item) => (
              <div
                key={item.term}
                className="rounded-xl border border-slate-100 bg-slate-50 p-5 transition hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <BookIcon className="text-emerald-600 h-5 w-5" fontSize="small" />
                  <h4 className="font-bold text-slate-950">{item.term}</h4>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.definition}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
