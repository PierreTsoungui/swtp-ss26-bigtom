"""Crash-safe JSON persistence helpers.

Job artifacts (batch history, filter settings, …) are written while a job runs
and read back on later requests. A naive ``open(path, "w")`` truncates the file
first, so a crash mid-write leaves a corrupt or empty file that breaks every
subsequent read. These helpers write to a temporary file in the same directory
and atomically ``os.replace`` it into place, so a reader ever only sees the old
or the new complete file — never a half-written one.
"""
import contextlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def write_json_atomic(path: Path | str, data: Any, *, indent: int | None = None) -> None:
    """Serialize ``data`` to ``path`` atomically (temp file + ``os.replace``).

    The temp file is created in the destination directory so the final rename
    stays on the same filesystem (a cross-device rename is not atomic).
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        # Never leave a stray temp file behind if writing or replacing fails.
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise


def read_json_or_default(path: Path | str, default: Any) -> Any:
    """Return the parsed JSON at ``path``, or ``default`` if it is missing/corrupt.

    Treats a missing file, an unreadable file and invalid JSON the same way — as
    "no usable data" — so a damaged artifact degrades gracefully instead of
    surfacing as a 500.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default
