# Architecture Specification: R-Executor

**Scope:** `backend/app/services/r_executor/` (This is the subpackage that runs R scripts inside the Docker worker and turns their output into typed results)

---

## 1. Purpose

`run_r_script()` is the single, mode-agnostic entry point for executing any R script. It starts a subprocess (`docker exec ... Rscript ...`), streams its output, forwards structured progress to the caller, enforces a per-command timeout, supports cooperative cancellation, and resolves to exactly one typed result.

The executor knows nothing about individual R scripts. Each script is represented by an `RCommand` object that knows how to build its own command line and optionally post-process the result. Adding a new R step therefore means adding a command class and never touching `executor.py`.

```
run_r_script(command, cancel_event, on_progress) --> ExecutionResult
                 |
                 |-- command.build_cmd() => docker exec argv
                 |-- subprocess + stream read => progress via on_progress
                 +-- command.parse_stdout() => extra payload (e.g. filter_stats)
```

---

## 2. Package Layout

```
app/services/r_executor/
├── __init__.py        # public exports
├── executor.py        # run_r_script() -- the engine (do not edit per new step)
├── result.py          # ExecutionResult, ExecutionStatus
├── protocol.py        # extract_json_objects() -- robust JSON-line scanner
└── commands/
    ├── base.py        # RCommand (abstract base)
    └── commands.py    # one dataclass per R script
```

**Public API** (`from app.services.r_executor import ...`):

| Symbol | Kind | Role |
|---|---|---|
| `run_r_script` | coroutine | The engine. |
| `ExecutionResult` | dataclass | The return value. |
| `ExecutionStatus` | str-enum | `completed` / `failed` / `cancelled` / `timeout` |
| `RCommand` | abstract dataclass | Base class for every command. |
| `FilteringCommand`, `NormalizationCommand`, `NormalizationPreviewCommand`, `HeatmapCommand`, `BatchInitCommand`, `SvdPlotCommand`, `BatchCorrectionCommand`, `DmrAnalysisCommand`, `DmpAnalysisCommand`, `BetaExtractionCommand` | dataclasses | The concrete commands. |

---

## 3. Core Types

### 3.1 `run_r_script`

```python
async def run_r_script(
    command: RCommand,
    cancel_event: asyncio.Event,
    on_progress: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> ExecutionResult
```

- `command` is the R step to run (see Section 5).
- `cancel_event` is a cooperative cancel signal. In production it is injected by `pipeline_task`. Callers never create it themselves (see Section 6).
- `on_progress` is an optional async callback invoked for each structured message R emits (see Section 4). May be `None` (e.g. `BetaExtractionCommand`).

### 3.2 `ExecutionResult`

```python
@dataclass
class ExecutionResult:
    status:     ExecutionStatus
    returncode: int | None
    stdout:     str
    stderr:     str
    extra:      dict[str, Any] = {}

    @property is_success(self)   -> bool   # status == COMPLETED
    @property is_cancelled(self) -> bool   # status == CANCELLED
    @property is_timeout(self)   -> bool   # status == TIMEOUT
```

`extra` carries optional, command-specific payloads:

| Key | Set by | When |
|---|---|---|
| `filter_stats` | `FilteringCommand.parse_stdout` | on success, if `filter_stats.json` exists |
| `r_error` | the executor | whenever R emitted a `{"type":"error",...}` message |

### 3.3 `ExecutionStatus`

| Value | Meaning | `returncode` |
|---|---|---|
| `completed` | R exited 0 | `0` |
| `failed` | R exited non-zero, failed to start, or internal error | `!= 0` or `None` |
| `cancelled` | `cancel_event` was set | `None` or kill code |
| `timeout` | exceeded `command.timeout_seconds` | `None` or kill code |

**Invariant:** `status == completed` if and only if `returncode == 0`.

### 3.4 `RCommand` (base)

```python
@dataclass
class RCommand(ABC):
    script:          str            # R filename, e.g. "init_filter.R"
    job_id:          str
    job_dir:         str            # HOST path (for post-run file I/O)
    sample_sheet:    str
    timeout_seconds: int = 600      # per-command wall-clock budget

    R_WORKER_CONTAINER = "swtp-ss26-bigtom-r_worker-1"

    @property def docker_job_dir(self) -> str   # "/app/jobs/<job_id>" (container path)
    @property def script_path(self)    -> str   # "/app/r_backend/<script>" (container path)
    @abstractmethod def build_cmd(self) -> list[str]
    def parse_stdout(self, result) -> ExecutionResult   # optional hook, default: identity
    @property def mode_label(self) -> str        # class name, for logging
```

`job_dir` is the host path used by `parse_stdout` to read files the backend sees. `docker_job_dir` and `script_path` are the container paths used inside `build_cmd` (Mixing them up will therefore result in a bug)

---

## 4. The R / Python Protocol

R scripts emit one JSON object per stdout line via `r_backend/utils/progress.R`:

| Message | Emitted by R | Executor behavior |
|---|---|---|
| `{"type":"progress","percent":N,"message":"..."}` | `emit_progress()` | forwarded verbatim to `on_progress` |
| `{"type":"error","message":"..."}` | `emit_error()` (then `quit(1)`) | captured into `extra["r_error"]`; forwarded to `on_progress` as a `status:"failed"` payload |
| `{"type":"done", ...}` | `emit_done()` | forwarded to `on_progress` as `status:"running", progress_percent:100` |
| `{"type":"plot","method":...,"plot_kind":...,"file":...}` | `emit_plot()` | ignored by the executor (consumers scan files instead) |

Parsing uses `protocol.extract_json_objects()`, a brace-aware scanner that correctly handles nested objects and braces inside strings, and ignores any non-JSON log noise on the same line. See [pipeline-progress.md](./pipeline-progress.md) for the full message contract.

> Note: progress JSON travels on **stdout**. R package banners and warnings go to **stderr** and never reach `on_progress`.

---

## 5. Using the Executor

### 5.1 Canonical call (from a pipeline service)

```python
from app.services.r_executor import run_r_script, FilteringCommand
from app.services.job_manager import set_progress, transition_job, JobPhase, JobStatusValue

async def run_filtering(job_id: str, job_dir: str, cancel_event: asyncio.Event) -> None:
    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            set_progress(job_id,
                         percent=data.get("percent", 0),
                         message=data.get("message", ""))

    result = await run_r_script(
        command=FilteringCommand(
            script="init_filter.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="SampleSheet.csv",
            extra_args=[json.dumps(filter_settings)],
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if result.is_cancelled:
        return                       # reset deletes the job; do not transition
    if result.is_timeout:
        transition_job(job_id, JobPhase.FILTERING, JobStatusValue.FAILED,
                       error={"detail": "Filtering timeout."})
        return
    if not result.is_success:
        detail = result.extra.get("r_error") or result.stderr or "Filtering failed."
        transition_job(job_id, JobPhase.FILTERING, JobStatusValue.FAILED,
                       error={"detail": detail})
        return

    stats = result.extra.get("filter_stats")
    transition_job(job_id, JobPhase.FILTERING, JobStatusValue.COMPLETED, progress_percent=100)
```

### 5.2 Handling the result — the required four-branch shape

Every caller must distinguish all four statuses, in this order:

1. **`is_cancelled`** — return silently. `reset_service` owns deletion. Do not write a final state, as it would be a no-op anyway (see Section 6).
2. **`is_timeout`** — transition to `FAILED` with a timeout detail.
3. **`not is_success`** (failed) — transition to `FAILED`, preferring `extra["r_error"]` (the message R emitted) over `stderr`.
4. **success** — read `extra`, advance the state machine.

### 5.3 Where `cancel_event` comes from

Never create it in a service or route. The route schedules the pipeline through `pipeline_task` (`run_job_pipeline` / `start_job_pipeline`), which creates the `cancel_event`, registers the task, and injects the event into your coroutine. This is what makes `POST /reset` able to cancel the job. See [backend-architecture.md](./backend-architecture.md) Sections 4.2 and 4.3.

---

## 6. Execution Guarantees and Semantics

The executor provides the following guarantees so callers do not have to:

**Full output capture.** It waits for both stdout and stderr to reach EOF before reaping the process, so the tail of the output (e.g. the closing `done` line, or data needed by `parse_stdout`) is never lost.

**Per-command timeout.** Enforced from `command.timeout_seconds`. On expiry the process is killed and the status is `timeout`.

**Cooperative cancellation.** When `cancel_event` is set the status becomes `cancelled`. The executor is the only code that kills the subprocess. No external `process.kill()`.

**Failure isolation.** A failing `build_cmd()`, a failing `parse_stdout()` hook, a reader-loop exception, or a misbehaving `on_progress` callback are all caught and logged. They never crash the background task or mask the status.

**`r_error` capture.** The last `{"type":"error"}` message is always recorded in `extra["r_error"]`, even when `on_progress is None`.

**stderr severity.** stderr lines log at `DEBUG` by default. Only lines matching `error|warn|fehler|cannot|fail|halt` escalate to `WARNING`, so Bioconductor banners do not bury real diagnostics.

**No leaked tasks.** All internal tasks (readers, cancel waiter) are settled before returning. No "exception was never retrieved" warnings.

---

## 7. Extending: Adding a New R Step

A new command class as well as a service coroutine is needed. The executor is untouched.

### Step 1 — Write the command class (`commands/commands.py`)

```python
@dataclass
class MyAnalysisCommand(RCommand):
    extra_args:      list[str] = field(default_factory=list)
    timeout_seconds: int       = 900          # override only if 600 is wrong

    def build_cmd(self) -> list[str]:
        return [
            "docker", "exec", self.R_WORKER_CONTAINER,
            "Rscript", self.script_path,                       # container path
            f"{self.docker_job_dir}/{self.sample_sheet}",      # container path
            self.docker_job_dir,
            *self.extra_args,
        ]

    # Optional: only needed if you must read a file R wrote or parse stdout.
    def parse_stdout(self, result: ExecutionResult) -> ExecutionResult:
        out = Path(self.job_dir) / "my_stats.json"             # HOST path
        if result.is_success and out.exists():
            with open(out) as f:
                result.extra["my_stats"] = json.load(f)
        return result
```

Rules for `build_cmd`:
- Use `self.script_path` and `self.docker_job_dir` — container paths only. Never `self.job_dir` (host path) inside the argv.
- Keep it pure: only assembles a list of strings. No I/O, no side effects.

### Step 2 — Export it (`__init__.py`)

Add the class to the imports and `__all__`.

### Step 3 — Call it from a service

Write an async coroutine that takes `cancel_event`, calls `run_r_script`, and handles all four statuses (Section 5.2). Add the new `(phase, status)` transitions to `job_manager._ALLOWED_TRANSITIONS`. Schedule it from the route via `pipeline_task`.

### Step 4 — Done

Do not modify `executor.py`. If you feel you have to, the abstraction is leaking. Raise it for review instead.

### Special Cases

**No script file** (inline `Rscript -e`): see `BetaExtractionCommand`. It overrides `script_path` to raise (the file path must never be used) and builds an inline command from `docker_job_dir`.

**Environment variables**: see `HeatmapCommand`. Prepend `-e KEY=VAL` flags before the container name.

**Long-running steps**: set `timeout_seconds` on the class (e.g. DMR = 1200, DMP = 900).

---

## 8. Command Catalogue (Current)

| Command | Script | `timeout_seconds` | `extra` output |
|---|---|---|---|
| `FilteringCommand` | `init_filter.R` | 600 | `filter_stats` |
| `NormalizationCommand` | `normalize.R` | 600 | none |
| `NormalizationPreviewCommand` | `normalization_preview.R` | 600 | none (plots via PNG scan in the service) |
| `BatchInitCommand` | `batch_svd.R` | 600 | none |
| `SvdPlotCommand` | `batch_svd.R` | 600 | none |
| `BatchCorrectionCommand` | `batch_correct.R` | 600 | none |
| `DmrAnalysisCommand` | `dmr.R` | 1200 | none |
| `DmpAnalysisCommand` | `dmp.R` | 900 | none |
| `BetaExtractionCommand` | inline `-e` | 120 | none |
| `HeatmapCommand` | `heatmap.R` | 600 | none (env-flag based) |

---

## 9. Rules and Invariants

**One engine, no modes.** `executor.py` must never grow per-script branches.

**Commands are pure data plus `build_cmd`.** No I/O in `build_cmd`. File I/O only in `parse_stdout`, and only HOST paths there.

**Container vs host paths.** `build_cmd` uses container paths (`docker_job_dir`, `script_path`). `parse_stdout` uses `job_dir` (host).

**The executor owns the process.** Cancellation is cooperative via `cancel_event`. Nobody else kills the subprocess.

**Callers handle all four statuses** (Section 5.2). Treat `cancelled` as a clean, non-error outcome.

**`cancel_event` and the task lifecycle belong to `pipeline_task`**, not to services or routes.