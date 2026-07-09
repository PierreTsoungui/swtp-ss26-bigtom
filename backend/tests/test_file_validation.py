"""Edge-case tests for IDAT upload validation.

These cover the rejection paths of ``validate_idat_files`` and the low-level
``looks_like_idat`` heuristic, which decide what reaches the R pipeline.
"""

from io import BytesIO

from fastapi import UploadFile

from app.services import file_handler
from app.services.file_handler import looks_like_idat, validate_idat_files

# A plausible IDAT chunk: binary, well over the minimum size, plenty of null bytes.
VALID_IDAT = b"\x00" * 200


def _upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


def _idat(name: str) -> UploadFile:
    return _upload(name, VALID_IDAT)


# ── looks_like_idat heuristic ─────────────────────────────────────────────────


def test_looks_like_idat_accepts_binary_content():
    ok, reason = looks_like_idat(_upload("s.idat", VALID_IDAT))
    assert ok is True
    assert reason == "OK"


def test_looks_like_idat_rejects_tiny_files():
    ok, reason = looks_like_idat(_upload("s.idat", b"\x00" * 10))
    assert ok is False
    assert reason == "file too small"


def test_looks_like_idat_rejects_pdf_content():
    ok, reason = looks_like_idat(_upload("s.idat", b"%PDF-1.7" + b"\x00" * 200))
    assert ok is False
    assert reason == "PDF detected"


def test_looks_like_idat_rejects_plain_text():
    ok, reason = looks_like_idat(_upload("s.idat", b"A" * 200))
    assert ok is False
    assert reason == "no typical binary structure"


def test_looks_like_idat_does_not_consume_the_file_pointer():
    upload = _upload("s.idat", VALID_IDAT)
    looks_like_idat(upload)
    # A later reader must still see the full content.
    assert file_handler.get_file_size(upload) == len(VALID_IDAT)


# ── validate_idat_files ───────────────────────────────────────────────────────


def test_empty_upload_is_rejected():
    ok, info = validate_idat_files([])
    assert ok is False
    assert info["error"] == "FILE_MISSING"


def test_valid_pair_is_accepted():
    ok, info = validate_idat_files([_idat("a_Grn.idat"), _idat("a_Red.idat")])
    assert ok is True
    assert info["expected_sample_count"] == 1


def test_non_idat_extension_is_rejected():
    ok, info = validate_idat_files([_idat("a_Grn.idat"), _upload("notes.txt", VALID_IDAT)])
    assert ok is False
    assert info["error"] == "INVALID_FILE_FORMAT"


def test_tiny_file_is_rejected_as_invalid_content():
    ok, info = validate_idat_files([_upload("a_Grn.idat", b"\x00" * 10), _idat("a_Red.idat")])
    assert ok is False
    assert info["error"] == "INVALID_IDAT_CONTENT"


def test_pdf_disguised_as_idat_is_rejected():
    ok, info = validate_idat_files(
        [_upload("a_Grn.idat", b"%PDF" + b"\x00" * 200), _idat("a_Red.idat")]
    )
    assert ok is False
    assert info["error"] == "INVALID_IDAT_CONTENT"


def test_odd_number_of_files_is_rejected():
    ok, info = validate_idat_files([_idat("a_Grn.idat"), _idat("a_Red.idat"), _idat("b_Grn.idat")])
    assert ok is False
    assert info["error"] == "INVALID_IDAT_COUNT"


def test_total_size_over_the_limit_is_rejected(monkeypatch):
    monkeypatch.setattr(file_handler, "MAX_TOTAL_SIZE", 10)
    ok, info = validate_idat_files([_idat("a_Grn.idat"), _idat("a_Red.idat")])
    assert ok is False
    assert info["error"] == "TOTAL_SIZE_TOO_LARGE"
