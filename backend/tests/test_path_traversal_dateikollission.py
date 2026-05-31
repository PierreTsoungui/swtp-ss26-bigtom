from io import BytesIO
from pathlib import Path
from app.services.file_handler import save_idat_files, save_sample_sheet
from fastapi import UploadFile
import pytest
def create_upload_file(filename: str, content: bytes = b"test"):
    return UploadFile(
        filename=filename,
        file=BytesIO(content)
    )

def test_save_sample_sheet_success(tmp_path):
    file = create_upload_file("sheet.csv")

    saved_path = save_sample_sheet(file, tmp_path)

    assert Path(saved_path).exists()
    assert Path(saved_path).name == "sheet.csv"

    
def test_save_sample_sheet_sanitizes_filename(tmp_path):
    file = create_upload_file("../../etc/passwd")

    saved_path = save_sample_sheet(file, tmp_path)

    assert Path(saved_path).exists()
    assert Path(saved_path).name == "passwd"


def test_save_idat_files_success(tmp_path):
    files = [
        create_upload_file("sample1.idat"),
        create_upload_file("sample2.idat"),
    ]

    result = save_idat_files(files, tmp_path)

    assert len(result) == 2



def test_save_idat_files_duplicate_filename(tmp_path):
    files = [
        create_upload_file("sample.idat"),
        create_upload_file("sample.idat"),
    ]

    with pytest.raises(ValueError, match="Doppelter Dateiname erkannt"):
        save_idat_files(files, tmp_path)