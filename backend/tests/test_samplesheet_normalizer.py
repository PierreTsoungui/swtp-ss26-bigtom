"""Tests for the sample-sheet normalizer.

Every uploaded sample sheet — regardless of container format, delimiter,
Illumina column aliases, or Excel's float coercion — must come out as one
canonical ``[Data]`` CSV with the column names the R backend relies on.
The fixtures here mirror the real sheets customers have actually uploaded.
"""
import csv
import io
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.samplesheet_normalizer import normalize_sample_sheet


# ── Helpers ────────────────────────────────────────────────────────────────────

def parse_canonical(text: str):
    """Parse normalizer output back into (headers, rows), asserting the shape."""
    lines = text.splitlines()
    assert lines[0] == "[Data]", "canonical sheet must start with the [Data] marker"
    reader = csv.reader(lines[1:])
    rows = list(reader)
    return rows[0], rows[1:]


def make_xlsx(grid) -> bytes:
    """Build an .xlsx with no header inference, preserving the raw cell grid."""
    buf = io.BytesIO()
    pd.DataFrame(grid).to_excel(buf, index=False, header=False)
    return buf.getvalue()


# ── EPIC sheet: standard Illumina [Header]/[Data] CSV ──────────────────────────

EPIC_CSV = b"""[Header],,,,,,
Source,https://example.com,,,,,
Investigator Name,Steven Gruber,,,,,
,,,,,,
[Data],,,,,,
Sample_Name,Sample_Well,Sample_Plate,Sample_Group,Pool_ID,Sentrix_ID,Sentrix_Position
HeLa,,,Cellline,,206891110001,R01C01
Jurkat,,,Cellline,,206891110001,R03C01
NA12873,,,Coriell,,206891110001,R08C01
"""


def test_epic_csv_keeps_canonical_columns_and_data():
    headers, rows = parse_canonical(normalize_sample_sheet(EPIC_CSV, "SampleSheet.csv"))
    assert headers == [
        "Sample_Name", "Sample_Well", "Sample_Plate",
        "Sample_Group", "Pool_ID", "Sentrix_ID", "Sentrix_Position",
    ]
    assert rows[0] == ["HeLa", "", "", "Cellline", "", "206891110001", "R01C01"]
    assert len(rows) == 3


# ── 450K sheet: no [Header]/[Data] block, header is the first row ───────────────

SHEET_450K = b"""Sample_ID,Sample_Plate,Sample_Name,Project,Sample_Well,Sentrix_ID,Sentrix_Position,Sample_Group
6005486014_R01C01,,1,Ill-450k-demo,,6005486014,R01C01,A
6005486014_R02C02,,2,Ill-450k-demo,,6005486014,R02C02,A
6005486021_R03C02,,5,Ill-450k-demo,,6005486021,R03C02,B
"""


def test_450k_csv_without_data_marker_gets_marker_added():
    text = normalize_sample_sheet(SHEET_450K, "Samplesheet.csv")
    headers, rows = parse_canonical(text)  # asserts [Data] is now present
    assert "Sentrix_ID" in headers and "Sentrix_Position" in headers
    assert rows[0][headers.index("Sample_Name")] == "1"
    assert len(rows) == 3


# ── Column aliases: SentrixBarcode_A / SentrixPosition_A → canonical ────────────

ALIAS_CSV = b"""[Data]
Sample_ID,Sample_Name,SentrixBarcode_A,SentrixPosition_A,Sample_Group
HeLa,HeLa,206891110001,R01C01,Cellline
Jurkat,Jurkat,206891110001,R03C01,Cellline
"""


def test_sentrix_aliases_are_renamed_to_canonical():
    headers, rows = parse_canonical(normalize_sample_sheet(ALIAS_CSV, "x.csv"))
    assert "Sentrix_ID" in headers
    assert "Sentrix_Position" in headers
    assert "SentrixBarcode_A" not in headers
    assert "SentrixPosition_A" not in headers
    sid = headers.index("Sentrix_ID")
    assert rows[0][sid] == "206891110001"


# ── Excel upload: float-coerced barcode must survive as a clean integer ─────────

def test_xlsx_barcode_not_corrupted_to_float():
    grid = [
        ["[Data]"],
        ["Sample_Name", "SentrixBarcode_A", "SentrixPosition_A", "Sample_Group"],
        ["HeLa", 206891110001, "R01C01", "Cellline"],
        ["Jurkat", 206891110001, "R03C01", "Cellline"],
    ]
    headers, rows = parse_canonical(
        normalize_sample_sheet(make_xlsx(grid), "customer.xlsx")
    )
    sid = headers.index("Sentrix_ID")
    # Not "2.06891E+11" and not "206891110001.0".
    assert rows[0][sid] == "206891110001"
    assert "Sentrix_Position" in headers


def test_xlsx_with_header_block_aligns_columns():
    """Sparse rows (many empty cells) keep their column positions through Excel."""
    grid = [
        ["Source", "https://example.com"],
        ["[Data]"],
        ["Sample_ID", "Sample_Plate", "Sample_Name", "SentrixBarcode_A",
         "SentrixPosition_A", "Sample_Group"],
        ["HeLa", None, "HeLa", 206891110001, "R01C01", "Cellline"],
    ]
    headers, rows = parse_canonical(
        normalize_sample_sheet(make_xlsx(grid), "customer.xlsx")
    )
    assert rows[0][headers.index("Sample_Name")] == "HeLa"
    assert rows[0][headers.index("Sentrix_ID")] == "206891110001"
    assert rows[0][headers.index("Sentrix_Position")] == "R01C01"
    assert rows[0][headers.index("Sample_Group")] == "Cellline"


# ── Delimiter detection ────────────────────────────────────────────────────────

def test_semicolon_delimited_csv():
    sheet = b"[Data]\nSample_Name;Sentrix_ID;Sentrix_Position\nHeLa;206891110001;R01C01\n"
    headers, rows = parse_canonical(normalize_sample_sheet(sheet, "x.csv"))
    assert headers == ["Sample_Name", "Sentrix_ID", "Sentrix_Position"]
    assert rows[0] == ["HeLa", "206891110001", "R01C01"]


# ── Trailing empty columns are dropped ─────────────────────────────────────────

def test_trailing_empty_header_columns_dropped():
    sheet = b"[Data]\nSample_Name,Sentrix_ID,Sentrix_Position,,\nHeLa,206891110001,R01C01,,\n"
    headers, _ = parse_canonical(normalize_sample_sheet(sheet, "x.csv"))
    assert headers == ["Sample_Name", "Sentrix_ID", "Sentrix_Position"]


# ── Basename-only sheet (used by the minimal upload test fixture) ──────────────

def test_basename_only_sheet_is_accepted():
    sheet = b"Basename\nsample_1\nsample_2\n"
    headers, rows = parse_canonical(normalize_sample_sheet(sheet, "x.csv"))
    assert headers == ["Basename"]
    assert rows == [["sample_1"], ["sample_2"]]


# ── Error handling ─────────────────────────────────────────────────────────────

def test_empty_sheet_raises():
    with pytest.raises(ValueError):
        normalize_sample_sheet(b"", "x.csv")


def test_data_marker_without_table_raises():
    with pytest.raises(ValueError):
        normalize_sample_sheet(b"[Header]\n[Data]\n", "x.csv")


def test_unsupported_extension_raises():
    with pytest.raises(ValueError):
        normalize_sample_sheet(b"whatever", "x.pdf")
