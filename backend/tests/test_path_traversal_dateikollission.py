# tests/test_path_traversal_dateikollission.py

from io import BytesIO
from pathlib import Path
from app.services.file_handler import save_idat_files, save_sample_sheet
from fastapi import UploadFile
import pytest


def create_upload_file(filename: str, content: bytes = b"test"):
    """Create a test UploadFile."""
    return UploadFile(
        filename=filename,
        file=BytesIO(content)
    )


# ── TESTS FOR save_sample_sheet ─────────────────────────────────────────────

def test_save_sample_sheet_success(tmp_path):
    """Test successful sample sheet saving."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    file = create_upload_file("sheet.csv")

    saved_path = save_sample_sheet(file, tmp_path)

    expected_path = tmp_path / "SampleSheet.csv"
    assert expected_path.exists()
    assert saved_path == str(expected_path)


def test_save_sample_sheet_sanitizes_filename(tmp_path):
    """Test that save_sample_sheet always saves as 'SampleSheet.csv'."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    file = create_upload_file("../../etc/passwd")

    saved_path = save_sample_sheet(file, tmp_path)

    expected_path = tmp_path / "SampleSheet.csv"
    assert expected_path.exists()
    assert saved_path == str(expected_path)
    assert Path(saved_path).name == "SampleSheet.csv"


def test_save_sample_sheet_creates_directory(tmp_path):
    """Test that save_sample_sheet creates the directory if it doesn't exist."""
    nested_path = tmp_path / "sub" / "dir"
    # ─── FIX: Create directory first ──────────────────────────────────────
    nested_path.mkdir(parents=True, exist_ok=True)
    
    file = create_upload_file("sheet.csv")

    saved_path = save_sample_sheet(file, nested_path)

    expected_path = nested_path / "SampleSheet.csv"
    assert expected_path.exists()
    assert saved_path == str(expected_path)


def test_save_sample_sheet_with_excel_file(tmp_path):
    """Test saving an Excel file (should also be saved as SampleSheet.csv)."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    file = create_upload_file("data.xlsx", b"fake_excel_data")

    saved_path = save_sample_sheet(file, tmp_path)

    expected_path = tmp_path / "SampleSheet.csv"
    assert expected_path.exists()
    assert saved_path == str(expected_path)


# ── TESTS FOR save_idat_files ────────────────────────────────────────────────

def test_save_idat_files_success(tmp_path):
    """Test successful IDAT file saving."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    files = [
        create_upload_file("sample1.idat"),
        create_upload_file("sample2.idat"),
    ]

    result = save_idat_files(files, tmp_path)

    assert len(result) == 2
    assert (tmp_path / "sample1.idat").exists()
    assert (tmp_path / "sample2.idat").exists()


def test_save_idat_files_duplicate_filename(tmp_path):
    """Test that duplicate filenames raise an error."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    files = [
        create_upload_file("sample.idat"),
        create_upload_file("sample.idat"),
    ]

    with pytest.raises(ValueError, match="Duplicate filename detected"):
        save_idat_files(files, tmp_path)


def test_save_idat_files_creates_directory(tmp_path):
    """Test that save_idat_files creates nested directories."""
    nested_path = tmp_path / "sub" / "dir"
    # ─── FIX: Create directory first ──────────────────────────────────────
    nested_path.mkdir(parents=True, exist_ok=True)
    
    files = [
        create_upload_file("sample1.idat"),
        create_upload_file("sample2.idat"),
    ]

    result = save_idat_files(files, nested_path)

    assert len(result) == 2
    assert (nested_path / "sample1.idat").exists()
    assert (nested_path / "sample2.idat").exists()


def test_save_idat_files_with_special_characters(tmp_path):
    """Test saving IDAT files with special characters in filename."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    files = [
        create_upload_file("sample_1.idat"),
        create_upload_file("sample@2.idat"),
    ]

    result = save_idat_files(files, tmp_path)

    assert len(result) == 2
    assert (tmp_path / "sample_1.idat").exists()
    assert (tmp_path / "sample@2.idat").exists()


def test_save_idat_files_empty_list(tmp_path):
    """Test saving an empty list of IDAT files."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    files = []

    result = save_idat_files(files, tmp_path)

    assert result == []


def test_save_idat_files_large_files(tmp_path):
    """Test saving large IDAT files."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    large_content = b"x" * 1024 * 1024  # 1MB
    files = [
        create_upload_file("large1.idat", large_content),
        create_upload_file("large2.idat", large_content),
    ]

    result = save_idat_files(files, tmp_path)

    assert len(result) == 2
    assert (tmp_path / "large1.idat").stat().st_size == len(large_content)
    assert (tmp_path / "large2.idat").stat().st_size == len(large_content)


# ── TESTS FOR BOTH FUNCTIONS (Integration) ──────────────────────────────────

def test_save_both_sample_sheet_and_idat(tmp_path):
    """Test saving both sample sheet and IDAT files in the same directory."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    sheet = create_upload_file("samples.csv")
    idat_files = [
        create_upload_file("sample1.idat"),
        create_upload_file("sample2.idat"),
    ]

    sheet_path = save_sample_sheet(sheet, tmp_path)
    idat_paths = save_idat_files(idat_files, tmp_path)

    assert (tmp_path / "SampleSheet.csv").exists()
    assert (tmp_path / "sample1.idat").exists()
    assert (tmp_path / "sample2.idat").exists()
    assert len(idat_paths) == 2


# ── EDGE CASES ────────────────────────────────────────────────────────────────

def test_save_sample_sheet_with_empty_content(tmp_path):
    """Test saving a sample sheet with empty content."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    file = create_upload_file("sheet.csv", b"")

    saved_path = save_sample_sheet(file, tmp_path)

    expected_path = tmp_path / "SampleSheet.csv"
    assert expected_path.exists()
    assert expected_path.read_bytes() == b""


def test_save_idat_files_with_empty_files(tmp_path):
    """Test saving empty IDAT files."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    files = [
        create_upload_file("empty1.idat", b""),
        create_upload_file("empty2.idat", b""),
    ]

    result = save_idat_files(files, tmp_path)

    assert len(result) == 2
    assert (tmp_path / "empty1.idat").exists()
    assert (tmp_path / "empty2.idat").exists()
    assert (tmp_path / "empty1.idat").stat().st_size == 0