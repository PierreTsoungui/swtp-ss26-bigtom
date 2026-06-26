# app/core/upload_limits.py
"""Central, single-source limits and allow-lists for the folder/ZIP upload.

Every component that touches an upload (``archive_utils``, the inspect and
commit services) imports its limits from here, so the security envelope is
defined in exactly one place and cannot drift between modules. See
``docs/architecture/upload-ordner-zip-konzept.md`` §7/§8.
"""

_KB = 1024
_MB = 1024 * _KB
_GB = 1024 * _MB

# ── Size / count limits ───────────────────────────────────────────────────────
# Sized for real EPIC data (one IDAT pair ~16 MB; IDATs barely compress).
MAX_UPLOAD_REQUEST_BYTES = 1 * _GB     # total bytes accepted in one inspect call
MAX_UNPACKED_TOTAL_BYTES = 2 * _GB     # total size after unpacking a ZIP
MAX_SINGLE_FILE_BYTES    = 100 * _MB   # cap for any single extracted/staged file
MAX_SAMPLE_SHEET_BYTES   = 10 * _MB    # a sample sheet is small
MAX_ARCHIVE_FILE_COUNT   = 2000        # ~1000 samples worth of IDAT pairs

# Zip-bomb guard: refuse archives whose declared/real expansion ratio is absurd.
MAX_COMPRESSION_RATIO    = 50          # real IDAT ZIPs stay well under 2:1
# Only enforce the ratio once the payload is large enough to matter, so that a
# tiny, highly compressible text file does not trip the guard.
COMPRESSION_RATIO_MIN_BYTES = 10 * _MB

# ── Allow-lists ───────────────────────────────────────────────────────────────
ALLOWED_IDAT_EXTENSIONS  = {".idat"}
ALLOWED_SHEET_EXTENSIONS = {".csv", ".xls", ".xlsx"}
ALLOWED_EXTENSIONS       = ALLOWED_IDAT_EXTENSIONS | ALLOWED_SHEET_EXTENSIONS
