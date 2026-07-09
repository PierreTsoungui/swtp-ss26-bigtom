"""Tests for batch_service.validate_group_selection.

Verifies each rejection path for the DMP/DMR comparison-group selection.
"""

import pytest

from app.core.error_types import AppException, ErrorTypes
from app.services.batch_service import validate_group_selection

SHEET = (
    "[Data]\n" "Sample_Name,Sample_Group\n" "S1,case\n" "S2,control\n" "S3,case\n" "S4,control\n"
)


@pytest.fixture
def job_dir(tmp_path):
    (tmp_path / "SampleSheet.csv").write_text(SHEET, encoding="utf-8")
    return tmp_path


def _error_type(exc: AppException) -> str:
    return exc.value.error_body["type"]


def test_valid_selection_passes(job_dir):
    # Must not raise.
    validate_group_selection(job_dir, "Sample_Group", "case", "control")


def test_case_equal_to_control_is_rejected(job_dir):
    with pytest.raises(AppException) as exc:
        validate_group_selection(job_dir, "Sample_Group", "case", "case")
    assert _error_type(exc) == ErrorTypes.INVALID_SELECTION.path


def test_unknown_column_is_rejected(job_dir):
    with pytest.raises(AppException) as exc:
        validate_group_selection(job_dir, "Does_Not_Exist", "case", "control")
    assert _error_type(exc) == ErrorTypes.INVALID_BATCH_VARIABLE.path


def test_value_missing_from_column_is_rejected(job_dir):
    with pytest.raises(AppException) as exc:
        validate_group_selection(job_dir, "Sample_Group", "case", "missing")
    assert _error_type(exc) == ErrorTypes.INVALID_SELECTION.path
