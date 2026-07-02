# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [1.1.0] - 2026-06-29

### Added
- Normalization Preview PDF Export: The normalization preview R script now generates PDF outputs in addition to PNG plots, and the corresponding backend route was updated to support PDF format requests.
- Sample Sheet Preview and Group Selection: Added a sample sheet preview component and dropdowns for selecting the test group on the upload and normalization pages, based on stakeholder feedback.
- ZIP File Upload Support: Extended the upload workflow to support ZIP file uploads, including new backend service functions for unpacking and processing compressed IDAT archives.
- Upload Configuration Limits: Added a central upload configuration module in the backend core defining file size and count limits.
- HTTPS Support (TT-34): Added HTTPS support to the deployment infrastructure.

### Changed
- Normalization Preview Layout: Reworked the normalization preview based on stakeholder feedback — raw data is now displayed on the left, and PCA plots are stored as JSON and rendered via a dedicated plotter component in the frontend.
- Upload Page Redesign: Overhauled the upload page to include drag-and-drop support, a ZIP file button, sample sheet preview, and sample sheet column selection.
- Upload Backend Refactor: Updated the upload router and model to handle ZIP files and sample sheet column selection; added a sample sheet normalizer.
- Plot Display Unification (TT-45): Unified the display of all plot types (Density, SVD, Heatmap) in the frontend and extracted a shared PlotView and export module.
- Help System Modularization (TT-44): Split help texts from a single `helpTexts.ts` file into individual Markdown files with a mapper, and introduced `registry.ts` to centralize help button registration; all existing help button implementations migrated to the new standard.
- Heatmap Filter Alignment: Fixed heatmap filtering by aligning the backend heatmap module with the same filtering logic used by the table module.
- Batch Correction Fixes and Options: Updated the batch route and service to fix batch correction behavior and extend batch options; sample sheet preview integrated into the batch workflow.
- DMP/DMR P-Value and SVD Plot Refactor: Increased the p-value threshold for DMP/DMR analysis and refactored the SVD plot display to show all principal component blocks including percentage values at a larger size.
- Table Filters Extension: Added additional filter options to the result table in both backend and frontend.
- DMR Analysis Core Allocation: Increased the number of CPU cores allocated for DMR analysis in Docker.
- R Script Review Cleanup: Applied all outstanding review feedback to `normalization_preview.R` and `init_filter.R`.
- Error Handling for Upload: Added additional error messages for upload validation in the backend main module.

### Fixed
- Heatmap Dendrogram Layout: Fixed dendrogram readability by placing the group label on the left to prevent legend overlap, and adjusted the upper branch rendering.
- Heatmap Help Button: Added the missing help button to the heatmap view.
- Help Content Updates (TT-45): Brought help content up to date and improved phrasing across existing help texts.
- Docker Annotation Support (TT-43): Added the 450K, EpicV1, and EpicV2 annotation packages to the R backend Dockerfile to ensure all array types are handled correctly — a Docker rebuild is required.
- Refractory DMP/DMR Issues (TT-29): Fixed persistent issues in DMP/DMR analysis affecting correctness of results.
- Filter and Normalization Pipeline (TT-29): Resolved additional bugs in the filter and normalization batch workflow.
- Error Type Adjustments (TT-25): Corrected error type definitions and handling in the backend.
- Backend Batch Tests: Updated backend batch tests to reflect current batch correction behavior.
- Backend Upload Tests: Added and improved backend upload tests.

### Refactored
- R Test Suite Overhaul (TT-26): Comprehensively revised all R testthat suites for the analysis pipeline. Tests rewritten or extended for `batch_correct.R`, `batch_svd.R`, `dmp.R`, `dmr.R`, `heatmap.R`, `normalize.R`, `normalization_preview.R`, and `scatterplot_normalization.R`. Includes input validation tests, edge case coverage (Inf/NaN guards, log-FC guards, whitelist guards), corrected test fixtures, and full English inline documentation.
- Sample Sheet Path Validation: Added pre-flight validation of `sample_sheet_path` before reading in the R backend.
- Batch Correct Source Environment: Fixed `batch_correct.R` to source into the caller environment instead of `globalenv` to prevent state leakage between tests.

### Documentation
- README and Project Standard (US-63): Added a standardized README following the project documentation standard.
- How-to-Test Documentation (US-64): Added developer documentation explaining how to run and extend the test suite.
- Color Concept (TT-16): Finalized and committed the WCAG-compliant color concept documentation.
- Changelog Maintenance (TT-3, TT-24): Ongoing changelog maintenance and extension for v1.0.0 and v1.1.0.

---

## [1.0.0] - 2026-06-23

### Added
- SVD Plot Zoom: Added an enlargement feature for SVD plots using MUI components, improving the visual inspection of batch correction results.
- Help System Integration: Integrated help buttons into the analysis workflow, including upload, normalization, batch correction and result table views.
- Central WCAG Color Theme: Added a central WCAG-compliant color system and integrated it across the frontend application.
- Backend Job Manager: Introduced a new backend job manager to centralize job state transitions and improve pipeline state handling.
- Backend Exceptions: Added a dedicated backend exception structure for job state transitions.
- Backend Logging Setup: Added a central backend logging configuration and integrated the initial logging setup into the FastAPI application, upload route and R executor.
- Frontend Tests: Added and extended frontend tests for help buttons, upload filters, normalization, result pages, table tabs, heatmap components and color definitions.

### Changed
- Job State Handling: Updated backend routes and services to use the new job state transition logic across upload, normalization preview, normalization, batch correction, heatmap, table, stats, status and reset workflows.
- Frontend Job State Integration: Updated frontend status and phase handling to match the revised backend job states.
- Progress Bar: Adjusted progress bar behavior and error handling to better reflect failed states and pipeline progress.
- Landing Page: Revised the landing page and related tests according to review feedback.
- Batch Analysis UI: Improved button disabling and button labeling during batch analysis.
- Filter Validation: Adjusted validation logic for SNP, Bead Count and SampleQuality filter parameters.
- SampleQuality Defaults: Updated the default values for SampleQuality filter settings.
- Help Text Structure: Moved help texts into the shared frontend structure and updated the corresponding imports.
- Frontend Refactoring: Reorganized frontend files, moved tests closer to their related components and removed unused frontend types.
- WCAG Styling: Applied the central color theme across analysis, batch, landing page, normalization, table, upload, layout and shared UI components.
- Type Definitions: Consolidated job-related frontend types into a shared JobTypes utility.

### Fixed
- Error Modal Close Function: Fixed the close behavior of the error message modal.
- Error Message Component: Adjusted the size and close behavior of the shared ErrorMessage component.
- Progress Bar Error Display: Fixed the visual display of errors in the progress bar by using red coloring and corresponding error messages.
- Filter Statistics Display: Fixed the display of SNP and Bead Count parameter values in the filter statistics.
- Normalization Preview Feedback: Replaced the previous "Filterstats not available" display with clearer MUI Alert-based feedback for normalization preview results.
- Batch Page Cleanup: Removed a remaining debug line from the BatchPage.
- Backend Failed State Recovery: Added a new backend state transition that allows jobs to continue after renewed user input from the FAILED state.
- Backend Error Values: Fixed incorrect error values related to failed job states.
- Text Colors: Corrected frontend text colors to improve accessibility and consistency with the WCAG color concept.

### Removed
- Temporary Backend Files: Removed previously versioned temporary backend files, including sample IDAT files and sample CSV files from backend temp directories.
- Unused Frontend Files: Removed obsolete upload test files and unused table view type definitions.

### Documentation
- API Contract: Added and updated the backend API contract documentation.
- Pipeline Progress Specification: Added architecture documentation for unified pipeline progress handling.
- Backend Logging Specification: Added architecture documentation for the unified backend logging concept.
- Architecture File Naming: Renamed architecture documentation files to align with the existing specification naming structure.
- State Naming Clarification: Updated the API contract by renaming the success state to completed, since the state marks the end of a pipeline step rather than the final success of the complete analysis.

## [0.4.0] - 2026-06-15

### Added
- Landing Page: Introduction of a central landing page as the primary entry point for the application.
- Heatmap Visualization: Full implementation of heatmaps in both frontend and backend to display methylation patterns.
- Help System: New reusable Help-Button component along with the content development and integration of detailed help points for improved user guidance.
- Automated Job Deletion System: Implementation of an automatic cleanup system for expired or terminated analysis jobs.
- Deployment Infrastructure: First successful execution and validation of deployment tests.

### Changed
- Batch Correction (Refactor): Fundamental overhaul of the batch correction workflow, enabling the simultaneous correction of multiple batch variables.
- Table Frontend Optimization: Comprehensive upgrade of the table frontend; filtering, server-side pagination, and sorting now seamlessly work together and function completely error-free.

## [0.3.0] - 2026-06-06

### Added
- DMP/DMR Analysis: Implementation of DMP analysis (Differentially Methylated Positions) and DMR analysis (Differentially Methylated Regions).
- Batch Correction: Full workflow for batch corrections including dynamic selection of batch variables, SVD visualization before and after correction, as well as logging of multiple batch correction rounds.
- Result Tables: Provision of multiple table views featuring server-side pagination, sorting, filtering, and advanced table navigation.
- User Interface: Improved global layout, optimized navigation, as well as enhanced status displays and user guidance.
- Export: Functionality for CSV/TSV export of analysis results and PNG export for generated diagrams.

## [0.2.0] - 2026-05-22

### Added
- Initial Filtering (US-9): Implementation of initial data filtering in the R backend as well as storage and retrieval of filter statistics.
- Filter Statistics (US-12): Backend endpoints for filter statistics and frontend representation of filter results.
- Progress Bar (US-11): Progress indicator for ongoing analysis processes via status polling between frontend and backend.
- Normalization Preview (US-13, US-14, US-15): Preview of various normalization methods (BMIQ, FUNNORM, QUANTILE, etc.) featuring density and PCA plots, alongside a new frontend page for method comparison.
- Normalization (US-16, US-17): API endpoint for selecting and confirming normalization, including integration of R scripts for automatic processing.
- Result Table (US-18): Dynamic result table with sorting and loading states, integrated into the user interface.
- Table Handler (US-19): Server-side pagination for large datasets via the new /table API route.
- Analysis Abort (US-23): New endpoint POST /api/v1/reset/{job_id} to cancel running analyses from the frontend.

### Changed
- Adjusted error format to match the API contract (unified error structure).
- Improved file validation with API-compliant error responses.
- Overhaul of the normalization pipeline in the R backend.
- Improved status management of analysis jobs.
- Cleaned up the .gitignore structure (centralized in the root directory).

### Fixed
- Correct generation of all normalization plots (FUNNORM, QUANTILE).
- Fixed bug in PNG generation under Docker (pthread_create error).
- Corrected faulty API URLs in the frontend.
- Repaired the display of filter statistics.
- More stable communication between the frontend and R backend.

## [0.1.0] - 2026-05-08

### Added
- Project Foundation: Initial project structure featuring a React frontend (React Router), FastAPI backend, and a Docker environment including NGINX configuration.
- File Upload (US-2): Upload of IDAT files and sample sheets including validation using magic numbers, frontend component, custom hook for API calls, and Vitest tests.
- Job System: Introduction of the job data model (job.py), implementation of job management (job_manager.py), and integration of the status endpoint GET /status/{job_id}.
- Data Processing (US-4): First R integration via r_executor.py to process IDAT files and sample sheets with CSV output of processing results.
- Testing: Setup of the Vitest testing environment with jsdom, as well as initial frontend and backend tests (Upload, Job System).

### Changed
- Iteratively improved Docker configuration.
- Expanded API communication between frontend and backend.

### Fixed
- Repaired backend accessibility via NGINX configuration (fixed error on the upload page).
- Fixed blackscreen bug during faulty uploads.
- Corrected execution of R scripts in the Docker container.
