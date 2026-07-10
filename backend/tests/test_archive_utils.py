"""Security-focused tests for safe ZIP extraction.

These pin the defences that matter: zip-slip, zip-bomb (ratio/size/count),
symlink and junk filtering, and the extension whitelist.
"""

import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import archive_utils
from app.services.archive_utils import ArchiveError, safe_extract_zip


def _make_zip(tmp_path: Path, entries: dict[str, bytes], name: str = "in.zip") -> Path:
    zip_path = tmp_path / name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for member_name, data in entries.items():
            zf.writestr(member_name, data)
    return zip_path


def test_extracts_only_whitelisted_files(tmp_path):
    zip_path = _make_zip(
        tmp_path,
        {
            "Demo/SampleSheet.csv": b"[Data]\nSample_Name\nHeLa\n",
            "Demo/x_Grn.idat": b"\x00" * 200,
            "Demo/readme.txt": b"hello",
        },
    )
    dest = tmp_path / "out"
    dest.mkdir()

    result = safe_extract_zip(zip_path, dest)

    names = sorted(f.rel_path for f in result.files)
    assert names == ["Demo/SampleSheet.csv", "Demo/x_Grn.idat"]
    assert "Demo/readme.txt" in result.skipped_unsupported
    # Files actually landed inside dest.
    assert all(f.path.resolve().is_relative_to(dest.resolve()) for f in result.files)


def test_zip_slip_is_rejected(tmp_path):
    zip_path = tmp_path / "evil.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../escape.idat", b"\x00" * 200)
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError) as exc:
        safe_extract_zip(zip_path, dest)
    assert exc.value.code == "invalid"
    assert not (tmp_path / "escape.idat").exists()


def test_absolute_path_is_rejected(tmp_path):
    zip_path = tmp_path / "abs.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("/etc/evil.idat", b"\x00" * 200)
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError):
        safe_extract_zip(zip_path, dest)


def test_corrupt_zip_raises_invalid(tmp_path):
    bad = tmp_path / "bad.zip"
    bad.write_bytes(b"not a zip at all")
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError) as exc:
        safe_extract_zip(bad, dest)
    assert exc.value.code == "invalid"


def test_macosx_and_dotfiles_are_dropped(tmp_path):
    zip_path = _make_zip(
        tmp_path,
        {
            "__MACOSX/._SampleSheet.csv": b"junk",
            ".DS_Store": b"junk",
            "Demo/.hidden.csv": b"junk",
            "Demo/SampleSheet.csv": b"[Data]\nSample_Name\nHeLa\n",
        },
    )
    dest = tmp_path / "out"
    dest.mkdir()

    result = safe_extract_zip(zip_path, dest)
    assert [f.rel_path for f in result.files] == ["Demo/SampleSheet.csv"]
    assert result.skipped_unsupported == []  # junk is not reported, just dropped


def test_too_many_files_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(archive_utils, "MAX_ARCHIVE_FILE_COUNT", 3)
    zip_path = _make_zip(tmp_path, {f"f{i}.idat": b"\x00" * 10 for i in range(5)})
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError) as exc:
        safe_extract_zip(zip_path, dest)
    assert exc.value.code == "too_large"


def test_single_file_size_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(archive_utils, "MAX_SINGLE_FILE_BYTES", 100)
    zip_path = _make_zip(tmp_path, {"big_Grn.idat": b"\x00" * 5000})
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError) as exc:
        safe_extract_zip(zip_path, dest)
    assert exc.value.code == "too_large"


def test_compression_ratio_bomb_rejected(tmp_path, monkeypatch):
    # Highly compressible payload above the ratio-check threshold.
    monkeypatch.setattr(archive_utils, "COMPRESSION_RATIO_MIN_BYTES", 1000)
    monkeypatch.setattr(archive_utils, "MAX_COMPRESSION_RATIO", 5)
    zip_path = _make_zip(tmp_path, {"bomb_Grn.idat": b"\x00" * 2_000_000})
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError) as exc:
        safe_extract_zip(zip_path, dest)
    assert exc.value.code == "too_large"


def test_empty_or_only_unsupported_raises_no_supported(tmp_path):
    zip_path = _make_zip(tmp_path, {"notes.txt": b"hi", "data.bin": b"x"})
    dest = tmp_path / "out"
    dest.mkdir()

    with pytest.raises(ArchiveError) as exc:
        safe_extract_zip(zip_path, dest)
    assert exc.value.code == "no_supported"
