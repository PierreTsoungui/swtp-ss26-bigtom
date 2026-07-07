"""Unit tests for the upload intake guards (sample count + total job disk)."""

import pytest

from app.core import config
from app.core.error_types import AppException
from app.services import intake_guards


# ── Sample-count guard ────────────────────────────────────────────────────────

def test_sample_limit_allows_at_or_under(monkeypatch):
    monkeypatch.setattr(config, "MAX_SAMPLES_PER_JOB", 10)
    intake_guards.enforce_sample_limit(10, "/api/upload")  # equal is allowed


def test_sample_limit_rejects_over(monkeypatch):
    monkeypatch.setattr(config, "MAX_SAMPLES_PER_JOB", 10)
    with pytest.raises(AppException) as exc:
        intake_guards.enforce_sample_limit(11, "/api/upload")
    assert exc.value.status_code == 400


def test_sample_limit_zero_means_unlimited(monkeypatch):
    monkeypatch.setattr(config, "MAX_SAMPLES_PER_JOB", 0)
    intake_guards.enforce_sample_limit(10_000, "/api/upload")  # no cap


# ── Total-disk guard ──────────────────────────────────────────────────────────

def test_storage_limit_zero_means_unlimited(monkeypatch):
    monkeypatch.setattr(config, "MAX_JOBS_DISK_GB", 0.0)
    # Even a huge reported usage must not raise when the guard is disabled.
    monkeypatch.setattr(intake_guards, "jobs_dir_size_bytes", lambda: 999 * 1024 ** 3)
    intake_guards.enforce_storage_limit("/api/upload")


def test_storage_limit_rejects_when_full(monkeypatch):
    monkeypatch.setattr(config, "MAX_JOBS_DISK_GB", 1.0)
    monkeypatch.setattr(intake_guards, "jobs_dir_size_bytes", lambda: 2 * 1024 ** 3)
    with pytest.raises(AppException) as exc:
        intake_guards.enforce_storage_limit("/api/upload")
    assert exc.value.status_code == 507


def test_storage_limit_allows_when_room(monkeypatch):
    monkeypatch.setattr(config, "MAX_JOBS_DISK_GB", 10.0)
    monkeypatch.setattr(intake_guards, "jobs_dir_size_bytes", lambda: 1 * 1024 ** 3)
    intake_guards.enforce_storage_limit("/api/upload")
