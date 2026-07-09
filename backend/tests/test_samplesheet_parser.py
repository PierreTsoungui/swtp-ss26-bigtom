"""Tests for the shared SampleSheet parser.

These cover the delimiter/padding/section-detection paths that were previously
untested and are the most error-prone part of sheet handling.
"""

import pytest

from app.core.error_types import AppException, ErrorTypes
from app.services.samplesheet_parser import (
    columns_by_index,
    find_sample_sheet_name,
    read_data_section,
)


def _write_sheet(job_dir, content: str, *, encoding: str = "utf-8"):
    """Write ``content`` as the canonical SampleSheet.csv and return job_dir."""
    (job_dir / "SampleSheet.csv").write_text(content, encoding=encoding)
    return job_dir


def _write_sheet_bytes(job_dir, raw: bytes):
    (job_dir / "SampleSheet.csv").write_bytes(raw)
    return job_dir


# ── find_sample_sheet_name ────────────────────────────────────────────────────


def test_find_prefers_the_canonical_name(tmp_path):
    (tmp_path / "SampleSheet.csv").write_text("x")
    assert find_sample_sheet_name(tmp_path) == "SampleSheet.csv"


def test_find_falls_back_to_a_glob_match(tmp_path):
    (tmp_path / "Demo_EPIC_SampleSheet_16.csv").write_text("x")
    assert find_sample_sheet_name(tmp_path) == "Demo_EPIC_SampleSheet_16.csv"


def test_find_raises_when_no_sheet_present(tmp_path):
    with pytest.raises(AppException) as exc:
        find_sample_sheet_name(tmp_path)
    assert exc.value.error_body["type"] == ErrorTypes.SAMPLE_SHEET_NOT_FOUND.path


# ── read_data_section: delimiters ─────────────────────────────────────────────


def test_reads_comma_delimited_data_section(tmp_path):
    _write_sheet(tmp_path, "[Data]\nSample_Name,Group\nS1,A\nS2,B\n")
    headers, rows = read_data_section(tmp_path)
    assert headers == ["Sample_Name", "Group"]
    assert rows == [["S1", "A"], ["S2", "B"]]


def test_reads_semicolon_delimited_data_section(tmp_path):
    _write_sheet(tmp_path, "[Data]\nSample_Name;Group\nS1;A\nS2;B\n")
    headers, rows = read_data_section(tmp_path)
    assert headers == ["Sample_Name", "Group"]
    assert rows == [["S1", "A"], ["S2", "B"]]


# ── read_data_section: section detection ──────────────────────────────────────


def test_ignores_content_before_the_data_marker(tmp_path):
    _write_sheet(
        tmp_path,
        "[Header]\nInvestigator,Jane\n\n[Data]\nSample_Name,Group\nS1,A\n",
    )
    headers, rows = read_data_section(tmp_path)
    assert headers == ["Sample_Name", "Group"]
    assert rows == [["S1", "A"]]


def test_treats_whole_file_as_data_when_no_marker(tmp_path):
    _write_sheet(tmp_path, "Sample_Name,Group\nS1,A\nS2,B\n")
    headers, rows = read_data_section(tmp_path)
    assert headers == ["Sample_Name", "Group"]
    assert rows == [["S1", "A"], ["S2", "B"]]


def test_empty_file_returns_empty_headers_and_rows(tmp_path):
    _write_sheet(tmp_path, "")
    assert read_data_section(tmp_path) == ([], [])


def test_data_marker_without_rows_returns_empty(tmp_path):
    _write_sheet(tmp_path, "[Data]\n")
    assert read_data_section(tmp_path) == ([], [])


# ── read_data_section: ragged rows ────────────────────────────────────────────


def test_short_rows_are_padded_to_header_width(tmp_path):
    _write_sheet(tmp_path, "[Data]\nA,B,C\nx,y\n")
    _, rows = read_data_section(tmp_path)
    assert rows == [["x", "y", ""]]


def test_extra_columns_beyond_the_header_are_dropped(tmp_path):
    _write_sheet(tmp_path, "[Data]\nA,B\np,q,r,s\n")
    headers, rows = read_data_section(tmp_path)
    assert headers == ["A", "B"]
    assert rows == [["p", "q"]]


def test_blank_lines_within_the_data_section_are_skipped(tmp_path):
    _write_sheet(tmp_path, "[Data]\nA,B\nx,y\n\n\np,q\n")
    _, rows = read_data_section(tmp_path)
    assert rows == [["x", "y"], ["p", "q"]]


# ── read_data_section: encoding ───────────────────────────────────────────────


def test_bom_before_data_marker_does_not_corrupt_headers(tmp_path):
    # Illumina sheets carry a [Header]/[Data] structure, so a UTF-8 BOM sits well
    # before the header line and must not leak into a column name.
    _write_sheet_bytes(
        tmp_path,
        b"\xef\xbb\xbf[Data]\nSample_Name,Group\nS1,A\nS2,B\n",
    )
    headers, rows = read_data_section(tmp_path)
    assert headers == ["Sample_Name", "Group"]
    assert rows == [["S1", "A"], ["S2", "B"]]


def test_invalid_bytes_are_tolerated_without_crashing(tmp_path):
    _write_sheet_bytes(
        tmp_path,
        b"[Data]\nSample_Name,Group\nS1,A\n\xff\xfe2,B\n",
    )
    headers, rows = read_data_section(tmp_path)
    assert headers == ["Sample_Name", "Group"]
    assert len(rows) == 2  # the row with invalid bytes is still parsed


def test_missing_sheet_raises_not_found(tmp_path):
    with pytest.raises(AppException) as exc:
        read_data_section(tmp_path)
    assert exc.value.error_body["type"] == ErrorTypes.SAMPLE_SHEET_NOT_FOUND.path


# ── columns_by_index ──────────────────────────────────────────────────────────


def test_columns_by_index_groups_non_empty_values_per_column():
    headers = ["A", "B"]
    rows = [["1", "2"], ["3", ""], ["5", "6"]]
    assert columns_by_index(headers, rows) == {0: ["1", "3", "5"], 1: ["2", "6"]}


def test_columns_by_index_handles_no_rows():
    assert columns_by_index(["A", "B"], []) == {0: [], 1: []}
