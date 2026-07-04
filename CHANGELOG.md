# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [1.2.0] - 2026-07-04

### Added
- **Local HTTPS Support**: Added local HTTPS support for the Dockerized application, enabling secure local development and testing environments.
- **API Rate Limiting**: Implemented rate limiting across all API routes via NGINX and adjusted the frontend job-polling interval to 3 seconds to reduce request pressure on the backend.
- **Batch Round Tracker**: Introduced a round tracker (`startRound()` / `observe()`) for the batch correction workflow, now triggered on every submit or skip action on the Batch page.
- **Fallback & Error Pages**: Added dedicated fallback and error pages to the frontend for improved handling of unexpected states.

### Changed
- **Reverse Proxy Routing**: Updated NGINX routes to match the latest API version.
- **Normalization Error Handling**: Improved handling of HTTP 429 errors on the Normalization page.

### Fixed
- **EPICv2 Annotation Fallback**: Fixed a failure in the R worker by ensuring the required EPICv2 annotation package is installed.
- **HTTP Security Headers**: Fixed a low-severity issue identified by an OWASP ZAP scan caused by missing HTTP security headers, resolved via middleware.
- **Docker Image Hardening**: Fixed security issues in the Dockerfile flagged by Trivy.
- **Dependency Security**: Upgraded npm dependencies to secure versions following a security audit.
- Minor English text correction in the frontend.

### Refactored
- **Frontend Accessibility & Readability**: Reworked frontend components to improve WCAG accessibility and readability.
- **Test Suites Modernized**: Adapted backend and frontend test suites to the updated project architecture.

### Documentation
- **Complete English TypeDoc Coverage**: Extended and translated TypeDoc documentation to English across all frontend modules (Analysis, Batch, Landing, Normalization, TableView, Shared), including an English rewrite of the privacy policy.

## [1.1.0] - 2026-07-02

### Added
- **ZIP Upload:** The upload workflow now accepts a ZIP archive of the IDAT files (single upload field), with safe server-side extraction and validation, in addition to folder upload.
- **Sample Sheet Preview & Column Selection:** The upload page shows a preview of the sample sheet and lets the user map the required roles (e.g. the sample group) to the actual sheet columns before starting the analysis.
- **Interactive PCA Plotter (Normalization Preview):** The PCA of each normalization method is now stored as JSON points and rendered by a dedicated interactive frontend plotter (colour by group, label toggle, client-side export) instead of a static image.
- **PNG + PDF Export Everywhere:** Every static plot (normalization density, SVD diagnostic, heatmap) can be exported as both PNG and a vector PDF.
- **Additional Result-Table Filters:** Extended the DMP/DMR result table with additional filter columns in both backend and frontend.
- **R Utility Test Suites:** New testthat suites for the shared R utility layer (arraytype, beta, columns, heatmap_anno, plotting, progress, runtime, samplesheet, stats).
- **End-to-End Pipeline Test:** A chained integration test that runs the real scripts in sequence (init_filter → normalize → SVD → DMR → DMP → heatmap) and verifies every hand-off.

### Changed
- **Normalization Preview Layout:** The raw (unnormalized) data is now shown on the left; density plots are delivered as PNG/PDF and the PCA as the interactive plotter.
- **Unified Plot Display (Zoom + Export):** Density, SVD and heatmap plots now share a single display component with consistent zoom and PNG/PDF export across the whole application.
- **Help Buttons Reworked:** Help texts were split into individual Markdown files behind a central registry, are now rendered as Markdown, and the hover behaviour was fixed.
- **Heatmap Rework:** Improved annotation placement and grouping-column selection, and added PNG + PDF export.
- **Upload Page Redesign:** Drag-and-drop, a ZIP-file button, the sample-sheet preview and the column selection were integrated into the upload page.
- **DMR Core Allocation:** Increased the number of CPU cores allocated to DMR analysis in Docker.

### Fixed
- **Chromosome & CpG-Context Table Filters:** The chromosome filter compared the UI value `chr1` against the stored bare `1`, and the CpG-context filter compared `Island` against the stored `island`, so both silently returned no rows. The backend filter engine now normalizes chromosomes (tolerant to a `chr` prefix and case) and categorical labels (case-insensitive).
- **DMP/DMR Correctness & Robustness:** Reconstruct the EPIC v2 `probe.features` annotation from the minfi manifest (was missing in ChAMPdata); reject identical within-group replicates up front with a clear message instead of the opaque limma "No sample variance"; make the DMP↔DMR overlap linking fast (interval join) so it no longer times out; treat "no DMRs found" as a valid empty result rather than a failure.
- **Heatmap Dendrogram & Help Button:** Fixed dendrogram readability (group label moved left to avoid legend overlap, upper branch rendering adjusted) and added the missing help button to the heatmap view.

### Refactored
- **Full R-Script Overhaul:** All pipeline R scripts (`init_filter.R`, `normalization_preview.R`, `normalize.R`, `batch_svd.R`, `batch_correct.R`, `dmr.R`, `dmp.R`, `heatmap.R`) were reworked for robustness, uniform documentation (roxygen-2, English) and a consistent, testable script/guard structure, with 450K / EPIC v1 / EPIC v2 handled uniformly.
- **Shared R Utility Layer:** Extracted and hardened the common utilities (runtime, arraytype, columns, beta, samplesheet, plotting, stats, progress, heatmap_anno) as the single source of truth for the analysis scripts.
- **R Test Suites Extended:** All R script test suites were rewritten and extended with input validation and edge-case coverage (fully documented in English).

## [1.0.0] - 2026-06-23

### Added
- **SVD Plot Zoom:** Added an enlargement feature for SVD plots using MUI components, improving the visual inspection of batch correction results.
- **Help System Integration:** Integrated help buttons into the analysis workflow, including upload, normalization, batch correction and result table views.
- **Central WCAG Color Theme:** Added a central WCAG-compliant color system and integrated it across the frontend application.
- **Backend Job Manager:** Introduced a new backend job manager to centralize job state transitions and improve pipeline state handling.
- **Backend Exceptions:** Added a dedicated backend exception structure for job state transitions.
- **Backend Logging Setup:** Added a central backend logging configuration and integrated the initial logging setup into the FastAPI application, upload route and R executor.
- **Frontend Tests:** Added and extended frontend tests for help buttons, upload filters, normalization, result pages, table tabs, heatmap components and color definitions.

### Changed
- **Job State Handling:** Updated backend routes and services to use the new job state transition logic across upload, normalization preview, normalization, batch correction, heatmap, table, stats, status and reset workflows.
- **Frontend Job State Integration:** Updated frontend status and phase handling to match the revised backend job states.
- **Progress Bar:** Adjusted progress bar behavior and error handling to better reflect failed states and pipeline progress.
- **Landing Page:** Revised the landing page and related tests according to review feedback.
- **Batch Analysis UI:** Improved button disabling and button labeling during batch analysis.
- **Filter Validation:** Adjusted validation logic for SNP, Bead Count and SampleQuality filter parameters.
- **SampleQuality Defaults:** Updated the default values for SampleQuality filter settings.
- **Help Text Structure:** Moved help texts into the shared frontend structure and updated the corresponding imports.
- **Frontend Refactoring:** Reorganized frontend files, moved tests closer to their related components and removed unused frontend types.
- **WCAG Styling:** Applied the central color theme across analysis, batch, landing page, normalization, table, upload, layout and shared UI components.
- **Type Definitions:** Consolidated job-related frontend types into a shared `JobTypes` utility.

### Fixed
- **Error Modal Close Function:** Fixed the close behavior of the error message modal.
- **Error Message Component:** Adjusted the size and close behavior of the shared `ErrorMessage` component.
- **Progress Bar Error Display:** Fixed the visual display of errors in the progress bar by using red coloring and corresponding error messages.
- **Filter Statistics Display:** Fixed the display of SNP and Bead Count parameter values in the filter statistics.
- **Normalization Preview Feedback:** Replaced the previous “Filterstats not available” display with clearer MUI Alert-based feedback for normalization preview results.
- **Batch Page Cleanup:** Removed a remaining debug line from the `BatchPage`.
- **Backend Failed State Recovery:** Added a new backend state transition that allows jobs to continue after renewed user input from the `FAILED` state.
- **Backend Error Values:** Fixed incorrect error values related to failed job states.
- **Text Colors:** Corrected frontend text colors to improve accessibility and consistency with the WCAG color concept.

### Removed
- **Temporary Backend Files:** Removed previously versioned temporary backend files, including sample IDAT files and sample CSV files from backend temp directories.
- **Unused Frontend Files:** Removed obsolete upload test files and unused table view type definitions.

### Documentation
- **API Contract:** Added and updated the backend API contract documentation.
- **Pipeline Progress Specification:** Added architecture documentation for unified pipeline progress handling.
- **Backend Logging Specification:** Added architecture documentation for the unified backend logging concept.
- **Architecture File Naming:** Renamed architecture documentation files to align with the existing specification naming structure.
- **State Naming Clarification:** Updated the API contract by renaming the success state to `completed`, since the state marks the end of a pipeline step rather than the final success of the complete analysis.

## [0.4.0] - 2026-06-15

### Added
- **Landing Page:** Introduction of a central landing page as the primary entry point for the application.
- **Heatmap Visualization:** Full implementation of heatmaps in both frontend and backend to display methylation patterns.
- **Help System:** New reusable `Help-Button` component along with the content development and integration of detailed help points for improved user guidance.
- **Automated Job Deletion System:** Implementation of an automatic cleanup system for expired or terminated analysis jobs.
- **Deployment Infrastructure:** First successful execution and validation of deployment tests.

### Changed
- **Batch Correction (Refactor):** Fundamental overhaul of the batch correction workflow, enabling the simultaneous correction of multiple batch variables.
- **Table Frontend Optimization:** Comprehensive upgrade of the table frontend; filtering, server-side pagination, and sorting now seamlessly work together and function completely error-free.

## [0.3.0] - 2026-06-06

### Added
- **DMP/DMR Analysis:** Implementation of DMP analysis (Differentially Methylated Positions) and DMR analysis (Differentially Methylated Regions).
- **Batch Correction:** Full workflow for batch corrections including dynamic selection of batch variables, SVD visualization before and after correction, as well as logging of multiple batch correction rounds.
- **Result Tables:** Provision of multiple table views featuring server-side pagination, sorting, filtering, and advanced table navigation.
- **User Interface:** Improved global layout, optimized navigation, as well as enhanced status displays and user guidance.
- **Export:** Functionality for CSV/TSV export of analysis results and PNG export for generated diagrams.

## [0.2.0] - 2026-05-22

### Added
- **Initial Filtering (US-9):** Implementation of initial data filtering in the R backend as well as storage and retrieval of filter statistics.
- **Filter Statistics (US-12):** Backend endpoints for filter statistics and frontend representation of filter results.
- **Progress Bar (US-11):** Progress indicator for ongoing analysis processes via status polling between frontend and backend.
- **Normalization Preview (US-13, US-14, US-15):** Preview of various normalization methods (BMIQ, FUNNORM, QUANTILE, etc.) featuring density and PCA plots, alongside a new frontend page for method comparison.
- **Normalization (US-16, US-17):** API endpoint for selecting and confirming normalization, including integration of R scripts for automatic processing.
- **Result Table (US-18):** Dynamic result table with sorting and loading states, integrated into the user interface.
- **Table Handler (US-19):** Server-side pagination for large datasets via the new `/table` API route.
- **Analysis Abort (US-23):** New endpoint `POST /api/v1/reset/{job_id}` to cancel running analyses from the frontend.

### Changed
- Adjusted error format to match the API contract (unified error structure).
- Improved file validation with API-compliant error responses.
- Overhaul of the normalization pipeline in the R backend.
- Improved status management of analysis jobs.
- Cleaned up the `.gitignore` structure (centralized in the root directory).

### Fixed
- Correct generation of all normalization plots (FUNNORM, QUANTILE).
- Fixed bug in PNG generation under Docker (`pthread_create` error).
- Corrected faulty API URLs in the frontend.
- Repaired the display of filter statistics.
- More stable communication between the frontend and R backend.

## [0.1.0] - 2026-05-08

### Added
- **Project Foundation:** Initial project structure featuring a React frontend (React Router), FastAPI backend, and a Docker environment including NGINX configuration.
- **File Upload (US-2):** Upload of IDAT files and sample sheets including validation using magic numbers, frontend component, custom hook for API calls, and Vitest tests.
- **Job System:** Introduction of the job data model (`job.py`), implementation of job management (`job_manager.py`), and integration of the status endpoint `GET /status/{job_id}`.
- **Data Processing (US-4):** First R integration via `r_executor.py` to process IDAT files and sample sheets with CSV output of processing results.
- **Testing:** Setup of the Vitest testing environment with `jsdom`, as well as initial frontend and backend tests (Upload, Job System).

### Changed
- Iteratively improved Docker configuration.
- Expanded API communication between frontend and backend.

### Fixed
- Repaired backend accessibility via NGINX configuration (fixed error on the upload page).
- Fixed blackscreen bug during faulty uploads.
- Corrected execution of R scripts in the Docker container.