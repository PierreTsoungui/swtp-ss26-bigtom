import { Link } from "react-router";

import { buttonClasses } from "@shared/components/buttonStyles.ts";
import { LandingLogo } from "./LandingLogo";

/**
 * Hero / overview section of the landing page.
 *
 * Introduces the platform, shows the branding logo, and presents the primary
 * call to action that routes users to the upload flow. Rendered under the
 * `overview` anchor referenced by the header navigation.
 */
export function HeroSection() {
  return (
    <section
      id="overview"
      className="scroll-mt-24 border-b border-neutral-borderDefault bg-neutral-card px-6 py-16 lg:py-20"
    >
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
              MethylAnalyzer is a web-based platform for DNA methylation analysis. It enables
              researchers to analyze and interpret raw DNA methylation data from Illumina IDAT
              files, minimizing the need for extensive programming or bioinformatics expertise.
              <br />
              <br />
              The application guides users through data upload, quality control, normalization,
              optional batch effect correction, and statistical analysis. Results are presented in
              interactive tables and visualizations, enabling the identification of biologically
              relevant methylation differences across sample groups.
              <br />
              <br />
              Designed for both newcomers and experienced researchers, MethylAnalyzer provides a
              transparent and reproducible workflow from raw data to interpretable results.
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            <LandingLogo />
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          {/* The landing call-to-action reuses the shared button styling for
              consistency, and is the single button allowed to carry a glow. */}
          <Link
            to="/upload"
            className={buttonClasses(
              "primary",
              "lg",
              "min-w-60 px-10 py-4 text-lg shadow-lg shadow-primary/20",
            )}
          >
            Start Analysis
          </Link>
        </div>
      </div>
    </section>
  );
}
