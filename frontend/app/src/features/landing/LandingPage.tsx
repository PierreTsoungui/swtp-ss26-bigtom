import AnalyticsIcon from "@mui/icons-material/Analytics";
import BiotechIcon from "@mui/icons-material/Biotech";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import InsightsIcon from "@mui/icons-material/Insights";
import ScienceIcon from "@mui/icons-material/Science";
import TuneIcon from "@mui/icons-material/Tune";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LandingLogo } from "./LandingLogo";

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
      "Check whether uploaded files are complete and valid. Missing or invalid IDAT pairs are detected before the analysis starts.",
    icon: <FactCheckIcon fontSize="large" />,
  },
  {
    title: "Normalization",
    description:
      "Reduce technical differences between samples to make measurements more comparable and improve the reliability of the analysis. Compare available normalization methods using density and PCA plots, then select one method or continue without normalization.",
    icon: <InsightsIcon fontSize="large" />,
  },
  {
    title: "Optional Batch Correction",
    description:
      "Inspect potential batch effects and apply correction if necessary to improve comparability between samples.",
    icon: <TuneIcon fontSize="large" />,
  },
  {
    title: "Results",
    description:
      "Explore statistically significant methylation differences, apply filters, sort results and generate visualizations such as heatmaps.",
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
        question: "What file formats are supported for the Sample Sheet?",
        answer:
          "The Sample Sheet can be uploaded as a CSV (.csv) or Excel (.xlsx) file.",
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
      {
        question: "What columns must the Sample Sheet contain?",
        answer:
          "The Sample Sheet must contain the information required to identify samples and assign them to experimental groups. Required columns may vary depending on the analysis configuration.",
      },
      {
        question: "Can I upload an Excel file instead of a CSV?",
        answer:
          "Yes. Both CSV and Excel files are supported for Sample Sheet uploads.",
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
          "Filtering removes unreliable probes that may produce inaccurate measurements. This improves the quality and reliability of downstream analyses.",
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
        question: "What is a Batch Effect and how do I know if my data is affected?",
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
          "If supported by the current deployment, running analyses can be cancelled before completion.",
      },
    ],
  },
  {
    title: "Results & Tables",
    questions: [
      {
        question: "What is a DMP ?",
        answer:
          "A DMP(Differentially Methylated Position) is a single CpG site that shows a statistically significant methylation difference between comparison groups.",
      },
      {
        question: "What is a DMR ?",
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
          "The SVD plot helps identify factors that explain variation in the dataset and can reveal potential batch effects.",
      },
      {
        question: "What is a density plot?",
        answer:
          "A density plot shows the distribution of methylation values across samples and helps evaluate normalization quality.",
      },
      {
        question: "How do I create a heatmap for a specific genomic region?",
        answer:
          "Select a genomic region from the results table and generate a heatmap to visualize methylation patterns across samples.",
      },
    ],
  },
  {
    title: "Data Privacy & Security",
    questions: [
      {
        question: "Is my data stored on the server?",
        answer:
          "Uploaded data is stored only for analysis purposes and handled according to the deployment configuration.",
      },
      {
        question: "How long is my session data kept?",
        answer:
          "Retention time depends on the server configuration and project policies.",
      },
      {
        question: "Is my data transfer encrypted?",
        answer:
          "When deployed with HTTPS, all communication between browser and server is encrypted.",
      },
      {
        question: "Who has access to my uploaded data?",
        answer:
          "Access is restricted to authorized users and system administrators responsible for operating the platform.",
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
                It helps researchers process raw methylation data from Illumina IDAT files
                without requiring programming or bioinformatics expertise.

                The application guides users through data upload, quality control,
                normalization, optional batch effect correction, and statistical analysis.
                Results are presented in interactive tables and visualizations, making it
                easy to identify biologically relevant methylation differences between
                sample groups.

                Whether you are new to methylation analysis or an experienced researcher,
                MethylAnalyzer provides a transparent and user-friendly workflow from raw
                data to interpretable results.
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
    </div>
  );
}
