"""Unit tests for the upload intake guards (sample count + total job disk)."""

import errno
import shutil

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


# ── Free-space preflight guard ────────────────────────────────────────────────

def _fake_usage(free_bytes):
    return lambda _path: shutil._ntuple_diskusage(free_bytes * 2, free_bytes, free_bytes)


def test_free_disk_guard_zero_means_disabled(monkeypatch):
    monkeypatch.setattr(config, "MIN_FREE_DISK_MB", 0)
    # Even with almost nothing free, a disabled guard never raises.
    monkeypatch.setattr(shutil, "disk_usage", _fake_usage(1))
    intake_guards.enforce_free_disk_space("/api/upload")


def test_free_disk_guard_rejects_when_low(monkeypatch):
    monkeypatch.setattr(config, "MIN_FREE_DISK_MB", 500)
    monkeypatch.setattr(shutil, "disk_usage", _fake_usage(100 * 1024 ** 2))  # 100 MB free
    with pytest.raises(AppException) as exc:
        intake_guards.enforce_free_disk_space("/api/upload")
    assert exc.value.status_code == 507


def test_free_disk_guard_allows_when_ample(monkeypatch):
    monkeypatch.setattr(config, "MIN_FREE_DISK_MB", 500)
    monkeypatch.setattr(shutil, "disk_usage", _fake_usage(5 * 1024 ** 3))  # 5 GB free
    intake_guards.enforce_free_disk_space("/api/upload")


def test_free_disk_guard_tolerates_unmeasurable_volume(monkeypatch):
    monkeypatch.setattr(config, "MIN_FREE_DISK_MB", 500)

    def _boom(_path):
        raise OSError("cannot stat")

    monkeypatch.setattr(shutil, "disk_usage", _boom)
    intake_guards.enforce_free_disk_space("/api/upload")  # must not raise


# ── Disk-write error mapper ───────────────────────────────────────────────────

def test_storage_error_maps_enospc_to_507():
    exc = intake_guards.storage_error(OSError(errno.ENOSPC, "No space left on device"))
    assert exc.status_code == 507
    assert exc.error_body["type"] == "/errors/storage-limit-exceeded"


def test_storage_error_maps_other_oserror_to_500():
    exc = intake_guards.storage_error(OSError(errno.EIO, "I/O error"))
    assert exc.status_code == 500
    assert exc.error_body["type"] == "/errors/save-failed"
