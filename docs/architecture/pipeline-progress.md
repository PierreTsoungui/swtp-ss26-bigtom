# Architecture Specification: Unified Pipeline Progress Contract

**Scope:** R Backend, FastAPI Backend, React Frontend  
**Goal:** Define a standardized, mandatory interface for all R scripts to report progress, errors, and completion to the backend and ultimately to the frontend.

---

## Table of Contents

- [1. Introduction & Scope](#1-introduction--scope)
- [2. Layer 1: R Script → Python Backend (stdout Specification)](#2-layer-1-r-script--python-backend-stdout-specification)
- [3. Layer 2: Python Backend → Frontend (API Data Contract)](#3-layer-2-python-backend--frontend-api-data-contract)
- [4. Layer 3: Frontend (UI Specification)](#4-layer-3-frontend-ui-specification)
- [5. Developer Checklist for New R Scripts](#5-developer-checklist-for-new-r-scripts)

---

## 1. Introduction & Scope

This document defines the binding communication contract for progress reporting between R scripts, the coordinating Python backend (FastAPI), and the React frontend. Every R script in the pipeline must adhere to this interface.

The sole purpose of this contract is to ensure that every R script has a fixed, standardized way to share its progress. Progress reporting is only relevant while a job is in `status: "running"`. The pipeline phase is irrelevant to this contract — the mechanism is identical regardless of which phase is executing.

The architecture is divided into three layers:

1. **Layer 1 (Data Generation):** R writes structured JSON lines to stdout.
2. **Layer 2 (State Management):** The backend parses stdout and updates the global job status.
3. **Layer 3 (Presentation):** The frontend reads the job status via polling and renders a progress component.

---

## 2. Layer 1: R Script → Python Backend (stdout Specification)

Communication from the R process to the backend occurs exclusively through standardized JSON objects written as single-line strings to standard output (stdout). All other text output (e.g., package loading logs) is ignored by the backend parser.

### 2.1 The Utility Interface (`utils/progress.R`)

Every R script imports the central utility file as its first line:

```r
source("/app/r_backend/utils/progress.R")
```

This provides three core functions:

- **`emit_progress(percent, message)`** — Sends the current progress percentage and a human-readable status message.
- **`emit_error(message)`** — Sends an error object and hard-aborts the script (`quit(status=1)`).
- **`emit_done()`** — Signals successful completion of the script.

Each function must call `flush(stdout())` immediately after writing to stdout. Because the R process is launched as a non-TTY subprocess by the FastAPI backend, R's stdout is block-buffered by default. Without an explicit flush after every write, emitted events will remain in the buffer and never reach the backend in real time. The flush call is therefore a hard implementation requirement of `utils/progress.R` itself, not a responsibility of individual script authors.

### 2.2 JSON Payload Formats (R Output)

#### Progress Event

Called after every atomic computation step. The `percent` value must be monotonically non-decreasing — it must never regress to a value lower than the one previously emitted. This constraint must be enforced inside `emit_progress()` by tracking the last emitted value and clamping any smaller input.

```json
{"type": "progress", "percent": 50, "message": "Step X completed"}
```

#### Error Event

Triggers immediate termination of the script. No further output may follow on stdout after this event.

```json
{"type": "error", "message": "The pheno vector does not match the columns of the beta matrix."}
```

#### Done Event

The final signal of a successfully completed script. Must always be preceded by `emit_progress(100, ...)`.

```json
{"type": "done"}
```

---

## 3. Layer 2: Python Backend → Frontend (API Data Contract)

The backend monitors the stdout stream of the R subprocess, intercepts JSON lines, and maps them to fields on the global job status object.

### 3.1 The `JobStatus` Data Contract

The endpoint `GET /api/v1/status/{job_id}` exposes the job state. The fields relevant to progress reporting are defined in the following TypeScript interface:

```typescript
export interface JobStatus {
  job_id: string;
  status: JobStatusValue;   // "running" | "waiting" | "completed" | "failed"
  phase: JobPhase;          // Current technical pipeline step
  progress_percent: number; // Progress of the current phase (0–100)
  current_step: string;     // Human-readable live message from the R script
  error?: ProblemDetail;    // Per RFC 9457; present only when status === "failed"
}
```

The full `JobStatus` contract including all valid `status` and `phase` values is defined in the API Contract document. For progress reporting purposes, only `progress_percent`, `current_step`, and `error` are written by the R-to-backend mapping described below.

### 3.2 Mapping of R Output in the Backend Worker

When the backend reads a line from R's stdout, it applies the following state updates. The parser must wrap each line's JSON parsing in a try/catch. Lines that fail to parse (truncated output, stray text from third-party packages, or any non-JSON content) must be skipped silently without crashing the worker or affecting the job's status.

| R Event | Backend Action |
|---|---|
| `"type": "progress"` | Set `progress_percent = data["percent"]`, `current_step = data["message"]`, `status = "running"` |
| `"type": "error"` | Set `status = "failed"`, populate `error` per RFC 9457 with `data["message"]` as the `detail` |
| `"type": "done"` | Set `progress_percent = 100`, advance phase and status per the pipeline state machine |

---

## 4. Layer 3: Frontend (UI Specification)

The frontend polls `GET /api/v1/status/{job_id}` at a fixed interval (currently 1.5 s) and renders progress via a dedicated component that is fully decoupled from pipeline phase logic.

### 4.1 The `ProgressBar` Component

```typescript
interface ProgressBarProps {
  percent: number;      // Value from 0 to 100 for the bar width
  message: string;      // The currently executing step
  hasError?: boolean;   // Switches the component into the red warning state
}
```

### 4.2 Declarative Integration in Feature Pages

```tsx
const jobStatus = useJobPolling(jobId);

<ProgressBar
  percent={jobStatus?.progress_percent ?? 0}
  message={jobStatus?.current_step ?? "Waiting for pipeline..."}
  hasError={jobStatus?.status === "failed"}
/>
```

### 4.3 Polling Stop Condition

The `useJobPolling` hook must stop polling once the job reaches a terminal state. Polling must cease as soon as `status` is `"completed"` or `"failed"`. Continuing to poll after a terminal state is reached wastes bandwidth and must not occur.

---

## 5. Developer Checklist for New R Scripts

Every developer writing a new R script for the pipeline must implement the following steps.

1. **Import:** Call `source("/app/r_backend/utils/progress.R")` as the first line of the script.
2. **Initialize:** Immediately after loading libraries, call `emit_progress(0, "Script initialized")`.
3. **Pacing:** After every critical computation step, increase the percentage and send it via `emit_progress()`. The value must never decrease relative to the previously emitted value.
4. **Errors:** Never use R's native `stop()` directly. All errors must be reported via `emit_error("Human-readable cause")`. The script's main execution block must be wrapped in a top-level `tryCatch()` that calls `emit_error()` for any uncaught condition — this ensures that errors raised internally by third-party packages (e.g., ChAMP, minfi, limma) are translated into a proper error event instead of producing an unhandled crash with no JSON output.
5. **Completion:** At the end of the script, always call `emit_progress(100, "Processing completed")` followed by `emit_done()`.

### Reference: Minimal Compliant R Script Structure

```r
source("/app/r_backend/utils/progress.R")

library(minfi)
# ... further library() calls ...

emit_progress(0, "Script initialized")

tryCatch({

  emit_progress(20, "Loading input data")
  # ... computation ...

  emit_progress(60, "Running analysis")
  # ... computation ...

  emit_progress(90, "Saving results")
  # ... computation ...

  emit_progress(100, "Processing completed")
  emit_done()

}, error = function(e) {
  emit_error(conditionMessage(e))
})
```

---

*Unified Pipeline Progress Contract — BigTom / THM*