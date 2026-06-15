# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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