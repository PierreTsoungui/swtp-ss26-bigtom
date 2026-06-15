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

interface FaqCategory {
  title: string;
  questions: string[];
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
      "Compare available normalization methods using density and PCA plots, then select one method or continue without normalization.",
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
      "View DMP and DMR result tables, filter and sort the data, and generate heatmaps for selected genomic regions.",
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
      "What file formats are supported for the Sample Sheet?",
      "How many IDAT files do I need to upload?",
      "What is the maximum upload size?",
      "Why do IDAT files always come in pairs?",
      "What columns must the Sample Sheet contain?",
      "Can I upload an Excel file instead of a CSV?",
    ],
  },
  {
    title: "Analysis Process",
    questions: [
      "What is a Sample Sheet and what information does it contain?",
      "What does the filtering step do and which probes are removed?",
      "What is normalization and why is it necessary?",
      "How do I choose the right normalization method?",
      "What is a Batch Effect and how do I know if my data is affected?",
      "How long does the analysis take?",
      "Can I cancel a running analysis?",
    ],
  },
  {
    title: "Results & Tables",
    questions: [
      "What is a DMP (Differentially Methylated Position)?",
      "What is a DMR (Differentially Methylated Region)?",
      "What is a p-value and what threshold should I use?",
      "What does Delta-Beta mean?",
      "What is the difference between hyper- and hypomethylation?",
      "How do I filter the results table by gene name?",
      "Can I export the results?",
    ],
  },
  {
    title: "Visualizations",
    questions: [
      "What does the PCA plot show?",
      "What does the SVD plot show and how do I interpret it?",
      "What is a density plot?",
      "How do I create a heatmap for a specific genomic region?",
    ],
  },
  {
    title: "Data Privacy & Security",
    questions: [
      "Is my data stored on the server?",
      "How long is my session data kept?",
      "Is my data transfer encrypted?",
      "Who has access to my uploaded data?",
    ],
  },
];

export function LandingPage() {
  return (
    <div className="bg-slate-50 text-slate-800">
      <section className="border-b border-slate-200 bg-white px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">
                Full methylation analysis
              </p>
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 lg:text-6xl">
                DNA Methylation Analysis Platform
              </h1>
              <p className="mt-6 max-w-4xl text-base leading-8 text-slate-600 lg:text-lg">
                MethylAnalyzer provides a guided workflow for processing biological methylation
                data from IDAT files and Sample Sheets. The application supports seamless upload,
                quality filtering, interactive comparison of normalization methods and optional
                batch effect correction. It helps users identify differentially methylated
                positions and regions through reliable statistical analysis. Results are presented
                as interactive tables and visualizations such as heatmaps. Complex R-based
                methylation pipelines become accessible through a modern web interface without
                requiring coding or R knowledge.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <LandingLogo />
            </div>
          </div>

          <div className="mt-12 flex justify-center">
            <Link
              to="/upload"
              className="inline-flex min-w-60 items-center justify-center rounded-full bg-blue-600 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
            >
              Start Analysis
            </Link>
          </div>
        </div>
      </section>

      <section id="workflow" aria-labelledby="workflow-title" className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
              Analysis workflow
            </p>
            <h2 id="workflow-title" className="mt-2 text-3xl font-bold text-slate-950">
              From raw files to interpretable results
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Follow the five analysis stages while retaining control over normalization and batch
              correction decisions.
            </p>
          </div>

          <ol className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {workflowSteps.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="absolute right-5 top-5 text-sm font-bold text-slate-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="beginner-title"
        className="border-y border-slate-200 bg-white px-6 py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Getting started
            </p>
            <h2 id="beginner-title" className="mt-2 text-3xl font-bold text-slate-950">
              New to DNA methylation analysis?
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              This section will later explain the biological and technical concepts behind the
              workflow, including filtering, normalization, batch correction, DMPs, DMRs and
              visualizations. For now, it provides a short overview to help new users understand
              the purpose of each analysis step.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {beginnerTopics.map((topic) => (
              <article key={topic.title} className="rounded-xl bg-slate-100 p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-cyan-700 shadow-sm">
                  {topic.icon}
                </div>
                <h3 className="font-semibold text-slate-950">{topic.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{topic.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="help" aria-labelledby="help-title" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
              Help & FAQ
            </p>
            <h2 id="help-title" className="mt-2 text-3xl font-bold text-slate-950">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
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
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <h3 id={categoryId} className="mb-3 text-lg font-semibold text-slate-950">
                    {category.title}
                  </h3>
                  <div className="divide-y divide-slate-200">
                    {category.questions.map((question) => (
                      <details key={question} className="group py-3">
                        <summary className="cursor-pointer list-none rounded-md pr-2 font-medium text-slate-700 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
                          <span>{question}</span>
                          <span
                            aria-hidden="true"
                            className="float-right text-xl leading-5 text-blue-600 group-open:hidden"
                          >
                            +
                          </span>
                          <span
                            aria-hidden="true"
                            className="float-right hidden text-xl leading-5 text-blue-600 group-open:inline"
                          >
                            −
                          </span>
                        </summary>
                        <p className="mt-3 text-sm leading-6 text-slate-500">
                          A detailed answer will be added in a future update.
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
