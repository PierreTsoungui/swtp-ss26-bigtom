# app/services/samplesheet_normalizer.py
"""Normalize any uploaded sample sheet into one canonical Illumina CSV.

Customers hand us sample sheets in whatever Illumina / Excel produced for them,
and that "whatever" varies a lot:

  * the container is .xlsx, .xls *or* .csv;
  * the delimiter may be ``,`` or ``;``;
  * an optional ``[Header]`` / ``[Data]`` block may or may not be present;
  * the chip columns appear under different Illumina aliases
    (``SentrixBarcode_A`` vs. ``Sentrix_ID``, ``SentrixPosition_A`` vs.
    ``Sentrix_Position``); and
  * Excel happily turns a chip barcode into a float, so ``206891110001``
    comes back as ``2.06891E+11`` / ``206891110001.0`` and the IDAT match breaks.

The R backend, on the other hand, expects exactly one shape: a ``[Data]`` marker
followed by a header row using the canonical column names (``Sample_Name``,
``Sentrix_ID``, ``Sentrix_Position`` ...). See ``r_backend/utils/samplesheet.R``.

Rather than teach every R script and every Python parser to cope with all the
variants, we convert *once*, here, at upload time. Everything downstream then
reads a single canonical CSV. This module is the single source of truth for that
conversion; nothing else should parse a raw upload.
"""
import csv
import io
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

logger = logging.getLogger(__name__)

# Marker the R backend greps for (``^\[Data\]``) to find the column header row.
DATA_MARKER = "[Data]"

# The four roles every downstream consumer (R scripts, heatmap, batch, preview)
# reads by name. ``Sentrix_ID``/``Sentrix_Position`` locate the IDAT files and
# build the array id; ``Sample_Name`` identifies a sample; ``Sample_Group`` is
# the biological grouping for DMP/DMR. When a sheet uses names the alias table
# below does not know, the user maps these roles explicitly (see
# ``normalize_sample_sheet(..., column_mapping=...)``).
CANONICAL_ROLES: Tuple[str, ...] = (
    "Sentrix_ID",
    "Sentrix_Position",
    "Sample_Group",
    "Sample_Name",
)

# Delimiters we try to detect in CSV uploads, most-specific first.
_CSV_DELIMITERS = (";", "\t", ",")

# Illumina ships the same logical column under several names depending on the
# tool/version that wrote the sheet. We map every known alias onto the canonical
# name the R backend relies on. The key is the *normalized* header (lowercased,
# stripped of spaces/underscores), so "Sentrix Barcode", "sentrix_barcode" and
# "SentrixBarcode_A" all collapse to the same lookup.
_HEADER_ALIASES = {
    # chip / slide barcode  ->  Sentrix_ID
    "sentrixid": "Sentrix_ID",
    "sentrixbarcode": "Sentrix_ID",
    "sentrixbarcodea": "Sentrix_ID",
    "slide": "Sentrix_ID",  # minfi's renamed form
    # position on the chip  ->  Sentrix_Position
    "sentrixposition": "Sentrix_Position",
    "sentrixpositiona": "Sentrix_Position",
    "array": "Sentrix_Position",  # minfi's renamed form
    # descriptive columns the downstream scripts read by name
    "samplename": "Sample_Name",
    "samplegroup": "Sample_Group",
    "samplewell": "Sample_Well",
    "sampleplate": "Sample_Plate",
    "poolid": "Pool_ID",
}


def normalize_sample_sheet(
    content: bytes,
    filename: str,
    column_mapping: Optional[Dict[str, str]] = None,
) -> str:
    """Convert a raw uploaded sample sheet into the canonical CSV text.

    Accepts the raw bytes of an .xlsx, .xls or .csv upload and returns a UTF-8
    CSV string of the form::

        [Data]
        Sample_Name,...,Sentrix_ID,Sentrix_Position
        HeLa,...,206891110001,R01C01
        ...

    ``column_mapping`` (optional) explicitly assigns the four canonical roles to
    *raw* column names, e.g.::

        {"Sentrix_ID": "Chip_Barcode", "Sentrix_Position": "Well",
         "Sample_Group": "Disease_State", "Sample_Name": "Patient_ID"}

    When given, exactly those columns are renamed to the canonical role names and
    every other column is passed through verbatim (the user is authoritative).
    When omitted, the legacy Illumina alias detection is applied instead — this
    keeps the deprecated single-shot upload and already-canonical sheets working.

    Raises ``ValueError`` (with a human-readable, German message) on any
    structural problem so the upload layer can surface it as a 400.
    """
    raw_headers, rows = read_sample_sheet_table(content, filename)

    if column_mapping:
        headers = _apply_explicit_mapping(raw_headers, column_mapping)
    else:
        headers = _canonicalize_headers(raw_headers)

    return _write_canonical_csv(headers, rows)


def read_sample_sheet_table(content: bytes, filename: str) -> Tuple[List[str], List[List[str]]]:
    """Read a sheet's data section into ``(raw_headers, rows)`` without renaming.

    This is the shared front-half of the normalization: it reads the source
    format, finds the column-header row, drops unnamed (padding) columns and
    projects every data row onto the kept columns. The headers are returned
    *exactly as the user wrote them* (stripped of surrounding whitespace) so the
    upload UI can offer them as the options for the four role dropdowns.
    """
    ext = Path(filename).suffix.lower()

    if ext in (".xlsx", ".xls"):
        grid = _read_excel_grid(content, ext)
    elif ext == ".csv":
        grid = _read_csv_grid(content)
    else:
        # validate_sample_sheet gates this, but never trust the caller.
        raise ValueError(f"Nicht unterstütztes SampleSheet-Format: '{ext}'")

    header_idx = _locate_header_row(grid)
    raw_headers = grid[header_idx]
    raw_rows = grid[header_idx + 1:]

    # Keep only columns that actually have a name; trailing empty cells are a
    # common artefact of Excel exports (a fixed grid width padded with blanks).
    keep = [i for i, name in enumerate(raw_headers) if name.strip()]
    if not keep:
        raise ValueError("SampleSheet enthält keine benannten Spalten.")

    headers = [raw_headers[i].strip() for i in keep]
    rows = [_select_and_pad(row, keep) for row in raw_rows]
    rows = [row for row in rows if any(cell.strip() for cell in row)]

    if not rows:
        raise ValueError("SampleSheet enthält keine Datenzeilen.")

    return headers, rows


def suggest_column_mapping(raw_headers: List[str]) -> Dict[str, str]:
    """Best-effort role → raw-column guess used to pre-fill the role dropdowns.

    Reuses the Illumina alias table: every raw header that resolves to one of the
    four canonical roles becomes that role's suggestion (first match wins, so an
    explicit ``Sentrix_ID`` beats a later ``SentrixBarcode_A``). Roles without a
    confident match are simply absent — the user picks those manually.
    """
    suggestion: Dict[str, str] = {}
    for name in raw_headers:
        key = name.strip().lower().replace(" ", "").replace("_", "")
        role = _HEADER_ALIASES.get(key)
        if role in CANONICAL_ROLES and role not in suggestion:
            suggestion[role] = name.strip()
    return suggestion


# ── Reading the various source formats into a string grid ──────────────────────

def _read_excel_grid(content: bytes, ext: str) -> List[List[str]]:
    """Read the first worksheet into a grid of strings.

    ``dtype=object`` + ``header=None`` keeps the raw cell layout intact (so the
    optional ``[Header]``/``[Data]`` block survives), and ``_cell_to_str``
    repairs Excel's float coercion of numeric barcodes.
    """
    engine = "openpyxl" if ext == ".xlsx" else "xlrd"
    try:
        df = pd.read_excel(
            io.BytesIO(content), sheet_name=0, header=None, dtype=object, engine=engine
        )
    except ImportError as exc:
        # xlrd is optional; give an actionable message instead of a stack trace.
        raise ValueError(
            f"Excel-Datei ('{ext}') kann nicht gelesen werden: {exc}"
        ) from exc
    except Exception as exc:
        raise ValueError(f"Excel-Datei konnte nicht gelesen werden: {exc}") from exc

    return [[_cell_to_str(cell) for cell in row] for row in df.itertuples(index=False)]


def _read_csv_grid(content: bytes) -> List[List[str]]:
    """Decode and parse a CSV upload into a grid of strings."""
    text = content.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()
    delimiter = _detect_delimiter(lines)
    reader = csv.reader(lines, delimiter=delimiter)
    return [[cell.strip() for cell in row] for row in reader]


def _detect_delimiter(lines: List[str]) -> str:
    """Pick the delimiter from the first table-like line.

    Lines without any candidate delimiter are skipped, so a bare ``[Data]``
    marker (or a single-column sheet) never masks the real delimiter used by the
    header and data rows. Defaults to ``,`` when nothing else applies.
    """
    for line in lines:
        if not line.strip():
            continue
        counts = {d: line.count(d) for d in _CSV_DELIMITERS}
        best = max(counts, key=counts.get)
        if counts[best] > 0:
            return best
    return ","


def _cell_to_str(value) -> str:
    """Render a single cell as a string, undoing Excel's numeric coercion.

    Excel stores a chip barcode like ``206891110001`` as a float, which pandas
    surfaces as ``206891110001.0`` (or scientific notation). Integral floats are
    rendered without the spurious ``.0`` so the value still matches the IDAT
    filename. ``NaN`` / ``None`` become empty strings.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


# ── Structural normalization ───────────────────────────────────────────────────

def _locate_header_row(grid: List[List[str]]) -> int:
    """Return the index of the column-header row.

    If a ``[Data]`` marker is present (Illumina format), the header is the next
    non-empty row after it. Otherwise the first non-empty row *is* the header
    (sheets that ship the data table directly, e.g. the 450K demo sheet).
    """
    if not grid:
        raise ValueError("SampleSheet ist leer.")

    for i, row in enumerate(grid):
        if any(cell.strip().lower() == DATA_MARKER.lower() for cell in row):
            for j in range(i + 1, len(grid)):
                if any(cell.strip() for cell in grid[j]):
                    return j
            raise ValueError("SampleSheet enthält [Data], aber keine Tabelle danach.")

    for i, row in enumerate(grid):
        if any(cell.strip() for cell in row):
            return i

    raise ValueError("SampleSheet enthält keine verwertbaren Zeilen.")


def _canonicalize_headers(headers: List[str]) -> List[str]:
    """Map known Illumina aliases onto the canonical column names.

    A column is only renamed if its canonical target is not already present, so a
    sheet carrying both ``Sentrix_ID`` and ``SentrixBarcode_A`` never collapses
    into two columns with the same name.
    """
    result: List[str] = []
    seen = set()
    for name in headers:
        cleaned = name.strip()
        key = cleaned.lower().replace(" ", "").replace("_", "")
        canonical = _HEADER_ALIASES.get(key, cleaned)
        if canonical in seen and canonical != cleaned:
            canonical = cleaned  # avoid creating a duplicate canonical column
        result.append(canonical)
        seen.add(canonical)
    return result


def _apply_explicit_mapping(raw_headers: List[str], mapping: Dict[str, str]) -> List[str]:
    """Rename the user-mapped columns to their canonical role names.

    ``mapping`` is ``role -> raw column name`` (e.g. ``{"Sentrix_ID": "Chip"}``).
    Every mapped column is renamed to its role; every other column keeps its
    original name. A non-mapped column whose raw name happens to collide with a
    canonical role name is disambiguated (``<name>_original``) so the canonical
    role names appear exactly once — R's ``read_csv`` would otherwise silently
    mangle duplicate headers into ``Sample_Group``/``Sample_Group.1``.
    """
    missing = sorted({raw for raw in mapping.values() if raw not in raw_headers})
    if missing:
        raise ValueError(f"Zugeordnete Spalte(n) nicht im SampleSheet vorhanden: {missing}")

    raw_to_role = {raw: role for role, raw in mapping.items()}
    targets = set(mapping.keys())

    result: List[str] = []
    assigned: set[str] = set()
    for name in raw_headers:
        role = raw_to_role.get(name)
        if role is not None and role not in assigned:
            assigned.add(role)
            result.append(role)
        elif name in targets:
            result.append(f"{name}_original")
        else:
            result.append(name)
    return result


def _select_and_pad(row: List[str], keep: List[int]) -> List[str]:
    """Project a data row onto the kept column indices, padding short rows."""
    return [row[i] if i < len(row) else "" for i in keep]


def _write_canonical_csv(headers: List[str], rows: List[List[str]]) -> str:
    """Serialize headers + rows as the canonical ``[Data]`` CSV text."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    buffer.write(f"{DATA_MARKER}\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()
