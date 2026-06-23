# Architecture Specification: Unified Backend Logging Standard

**Scope:** FastAPI Backend, Python Background Workers

---

## Table of Contents

1. [Introduction & Scope](#1-introduction--scope)
2. [Core Principles](#2-core-principles)
3. [Central Configuration](#3-central-configuration-appcorelogging_configpy)
4. [Log-Level Guidelines & Best Practices](#4-log-level-guidelines--best-practices)
5. [Developer Checklist & Code Blueprint](#5-developer-checklist--code-blueprint)

---

## 1. Introduction & Scope

This document establishes the binding standard for log management across the Python backend. Every newly implemented backend module, service, and asynchronous background worker must strictly comply with these guidelines. The primary objective is to produce machine-readable, consistently structured log outputs across all system boundaries, including Docker environments. This strict consistency ensures that logs can be effortlessly parsed and queried by modern log analysis applications (such as Loki) for rapid filtering and efficient troubleshooting.

---

## 2. Core Principles

The following rules are mandatory for every Python file in the backend.

### 2.1 No `print()` Statements

The use of built-in `print()` statements in application code is prohibited. `print()` ignores log levels, carries no metadata (timestamps, line numbers), and cannot be filtered in production environments.

### 2.2 No Custom Logger Classes

Creating custom wrapper classes or utility functions around the logging system is a known anti-pattern. Python's native `logging` module is fully production-ready and is used directly without any abstraction layer.

### 2.3 Module-Level Loggers

Every Python file instantiates its own logger using the standardized `__name__` convention. This ensures the exact module path is automatically captured in every log line without any manual configuration.

### 2.4 Protection of Sensitive Data

Since this system processes biological and medical data, a strict data protection rule applies. The following must **never** be logged:

- Passwords and API keys
- Personally identifiable patient data (e.g., full names)
- Sensitive sample IDs or file paths with direct personal references

---

## 3. Central Configuration (`app/core/logging_config.py`)

The entire logging system is configured **exactly once** at application startup. The configuration enforces a unified format and routes all output directly to `sys.stdout`.

### 3.1 Standardized Log Format

The system uses the following global format string:

```
%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d) -> %(message)s
```

| Field | Description |
|---|---|
| `%(asctime)s` | Timestamp in `YYYY-MM-DD HH:MM:SS` format |
| `%(levelname)s` | Log level in uppercase (`INFO`, `WARNING`, etc.) for fast visual scanning |
| `%(name)s` | Full module path of the file (e.g., `app.services.heatmap_service`) |
| `%(filename)s:%(lineno)d` | Filename and exact line number where the log was triggered |

### 3.2 Technical Implementation (`setup_logging`)

The `force=True` parameter ensures that the configuration overrides any default loggers pre-configured by third-party frameworks such as Uvicorn.

```python
# app/core/logging_config.py
import logging
import os
import sys

def setup_logging():
    log_format  = "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d) -> %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Dynamic log level from environment variable (default: INFO for production)
    env_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, env_level, logging.INFO)

    logging.basicConfig(
        level=log_level,
        format=log_format,
        datefmt=date_format,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True
    )

    # Suppress verbose output from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
```

> **Required:** `setup_logging()` must be called as the **very first action** in `app/main.py`, before the `FastAPI()` instance is created.

The log level can be controlled at runtime via the `LOG_LEVEL` environment variable (e.g., `LOG_LEVEL=DEBUG` for local development). If the variable is absent or invalid, the system defaults to `INFO`.

---

## 4. Log-Level Guidelines & Best Practices

Developers must select the log level based on the operational impact of the message.

| Level | When to Use | Example Scenario |
|---|---|---|
| `DEBUG` | Highly granular diagnostic information, relevant only during development | Filter settings successfully validated in Pydantic model |
| `INFO` | Important, successful state changes in the application lifecycle | Job `abc123` created: IDAT data saved and background filtering started |
| `WARNING` | Unexpected events that do not abort the job or application, but should be investigated | Upload cancelled: invalid JSON passed in `filter_settings` |
| `ERROR` | Critical failures that caused an operation or job to fail. The application continues running | `filter_stats.json` missing after R script run; job `abc123` marked as `FAILED` |
| `CRITICAL` | Unhandled exception that causes an entire background worker to crash | Unhandled exception in a background task |

### 4.1 Standardized Message Format (Structured Logging)

To allow log aggregators (such as Loki or Datadog) to efficiently filter log output, free-form text must be minimized. All variables must be appended at the end of the message using the `key=value` pattern.

```python
# Non-compliant => variables embedded in prose
logger.info("Job %s was started with method %s", job_id, method)

# Compliant => key=value pattern at the end
logger.info("Pipeline execution started: job_id=%s method=%s", job_id, method)
```

Note that variables are passed as `printf`-style arguments (`%s`), never as f-strings. This defers string formatting until the log entry is actually written, saving CPU cycles at high throughput.

### 4.2 Capturing Stack Traces (Exceptions)

`logger.exception()` is valid **exclusively inside an `except` block**. Outside of an active exception context, `exc_info` is empty and the method behaves identically to `logger.error()`, producing no stack trace.

Therefore: whenever an error is caught inside an `except` block, `logger.exception()` must be used instead of `logger.error()`. It automatically appends the full Python traceback to the log message, preserving the exact origin of the failure.

```python
try:
    # ... logic ...
except OSError as e:
    # Full stack trace is automatically attached
    logger.exception("Critical I/O error during processing: file_path=%s", file_path)
```

---

## 5. Developer Checklist & Code Blueprint

Every developer writing or modifying Python code in the backend must implement the following four steps.

1. **Instantiate at file level**: The logger is defined directly below the imports, before any class or function definition.
2. **Always use `__name__`**: Manual strings must never be passed to `getLogger()`.
3. **Use printf-style parameters**: Strings must not be pre-formatted with f-strings. Pass variables as `%s` arguments so the logging library defers formatting until the message is actually written.
4. **Mandatory stack trace on exceptions**: In every `except` block, `logger.exception()` must be called instead of `logger.error()` to automatically document the error origin.

### Reference: Minimal Compliant Python Module

```python
import logging
from pathlib import Path

# 1. Correct logger instantiation at module level
logger = logging.getLogger(__name__)


def process_analysis_data(file_path: Path):

    # 2. Correct parameter passing (printf-style, no f-string), key=value format
    logger.info("Data processing started: file_path=%s", file_path)

    try:
        if not file_path.exists():
            logger.warning("Optional file not found: file_path=%s", file_path)
            return

        # ... processing logic ...

        logger.info("Data processing completed: file_path=%s", file_path)

    except OSError:
        # 3. logger.exception() which is only valid inside an except block
        #    Automatically attaches the full stack trace
        logger.exception("Critical I/O error during processing: file_path=%s", file_path)
```

---

*Unified Backend Logging Standard — BigTom / THM*