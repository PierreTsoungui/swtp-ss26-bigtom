"""Prüft die automatische Bereinigung abgelaufener Job-Daten.

Dieses Testmodul stellt sicher, dass der Cleanup-Service alte Job-Ordner
korrekt löscht, aktuelle Job-Ordner beibehält, Fehler robust behandelt
und automatisch über den FastAPI-Lifespan gestartet wird.
"""

import asyncio
import os
import time
from unittest.mock import AsyncMock

import pytest

import app.main as main_module
from app.services import job_cleanup_service
from app.services.job_cleanup_service import (
    cleanup_expired_jobs,
    run_job_cleanup_loop,
)


def set_age(path, age_seconds):
    """Setzt das Änderungsdatum einer Datei oder eines Ordners künstlich zurück.

    Warum?
    Für die Cleanup-Tests müssen Job-Ordner simuliert werden, die bereits
    älter als die konfigurierte Aufbewahrungsdauer sind.
    """
    timestamp = time.time() - age_seconds
    os.utime(path, (timestamp, timestamp))


def test_expired_job_directory_is_deleted(tmp_path):
    """Prüft, dass ein abgelaufener Job-Ordner gelöscht wird.

    Der Test erstellt einen Job-Ordner, setzt sein Änderungsdatum auf zwei
    Stunden in der Vergangenheit und verwendet eine Aufbewahrungsdauer von
    einer Stunde. Dadurch muss der Ordner als abgelaufen gelten.
    """
    job_dir = tmp_path / "expired-job"
    job_dir.mkdir()
    (job_dir / "result.csv").write_text("result", encoding="utf-8")

    # Der Ordner wird künstlich älter gemacht als die erlaubte Retention.
    set_age(job_dir, age_seconds=2 * 3600)

    deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 1
    assert not job_dir.exists()


def test_recent_job_directory_is_kept(tmp_path):
    """Prüft, dass ein noch nicht abgelaufener Job-Ordner erhalten bleibt.

    Der Job-Ordner ist nur 30 Minuten alt. Bei einer Aufbewahrungsdauer von
    einer Stunde darf er deshalb nicht gelöscht werden.
    """
    job_dir = tmp_path / "recent-job"
    job_dir.mkdir()

    # Der Ordner ist jünger als die konfigurierte Aufbewahrungsdauer.
    set_age(job_dir, age_seconds=30 * 60)

    deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 0
    assert job_dir.exists()


def test_missing_jobs_directory_does_not_fail(tmp_path):
    """Prüft, dass ein fehlendes Job-Verzeichnis keinen Fehler verursacht.

    Warum?
    Beim ersten Start des Backends oder in bestimmten Testumgebungen kann es
    sein, dass das Job-Verzeichnis noch nicht existiert. Der Cleanup darf dann
    nicht abstürzen.
    """
    missing_dir = tmp_path / "missing"

    deleted_count = cleanup_expired_jobs(missing_dir, retention_hours=1)

    assert deleted_count == 0


def test_regular_files_are_ignored(tmp_path):
    """Prüft, dass normale Dateien im Job-Verzeichnis ignoriert werden.

    Der Cleanup-Service soll nur Job-Ordner löschen. Einzelne Dateien im
    Basisverzeichnis dürfen nicht entfernt werden.
    """
    regular_file = tmp_path / "keep-me.txt"
    regular_file.write_text("not a job", encoding="utf-8")

    # Auch wenn die Datei alt ist, darf sie nicht gelöscht werden,
    # weil der Cleanup nur Verzeichnisse entfernt.
    set_age(regular_file, age_seconds=2 * 3600)

    deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 0
    assert regular_file.exists()


def test_cleanup_logs_deleted_directory(tmp_path, caplog):
    """Prüft, dass das Löschen eines Job-Ordners protokolliert wird.

    Das ist wichtig, damit Löschvorgänge später nachvollziehbar sind.
    """
    job_dir = tmp_path / "expired-job"
    job_dir.mkdir()

    # Der Ordner ist älter als die erlaubte Retention und muss gelöscht werden.
    set_age(job_dir, age_seconds=2 * 3600)

    with caplog.at_level("INFO"):
        deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 1
    assert "Deleted expired job directory" in caplog.text
    assert "deleted 1 expired directory" in caplog.text


def test_cleanup_loop_continues_after_unexpected_error(monkeypatch, caplog):
    """Prüft, dass unerwartete Fehler im Cleanup geloggt werden.

    Die Cleanup-Schleife darf nicht stillschweigend abbrechen, wenn beim
    Bereinigen ein Fehler auftritt. Deshalb wird hier ein Fehler simuliert
    und anschließend geprüft, ob er korrekt protokolliert wurde.
    """
    cleanup_calls = 0

    def failing_cleanup(*args):
        """Simuliert einen Fehler während der Bereinigung."""
        nonlocal cleanup_calls
        cleanup_calls += 1
        raise RuntimeError("cleanup failed")

    async def stop_after_first_iteration(_interval):
        """Beendet die Schleife nach der ersten Iteration kontrolliert für den Test."""
        raise asyncio.CancelledError

    # Die echte Cleanup-Funktion wird durch eine fehlerwerfende Funktion ersetzt.
    monkeypatch.setattr(job_cleanup_service, "cleanup_expired_jobs", failing_cleanup)

    # asyncio.sleep wird ersetzt, damit der Test nicht wirklich warten muss.
    monkeypatch.setattr(
        job_cleanup_service.asyncio,
        "sleep",
        AsyncMock(side_effect=stop_after_first_iteration),
    )

    with caplog.at_level("ERROR"):
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(run_job_cleanup_loop(interval_seconds=1))

    assert cleanup_calls == 1
    assert "Unexpected error during job cleanup" in caplog.text


def test_lifespan_starts_cleanup_task(monkeypatch):
    """Prüft, dass der Cleanup-Dienst beim FastAPI-Start automatisch startet.

    Der echte Cleanup-Loop wird durch eine kontrollierte Testfunktion ersetzt.
    Dadurch kann geprüft werden, ob FastAPI beim Start eine Hintergrundaufgabe
    für den Cleanup erstellt und diese beim Shutdown wieder beendet.
    """

    async def exercise_lifespan():
        """Führt den FastAPI-Lifespan im Test aus."""
        started = asyncio.Event()
        keep_running = asyncio.Event()

        async def fake_cleanup_loop():
            """Simuliert einen dauerhaft laufenden Cleanup-Dienst."""
            started.set()
            await keep_running.wait()

        # Der echte Cleanup-Loop wird ersetzt, damit der Test kontrollierbar bleibt.
        monkeypatch.setattr(
            main_module,
            "run_job_cleanup_loop",
            fake_cleanup_loop,
        )

        async with main_module.lifespan(main_module.app):
            await asyncio.wait_for(started.wait(), timeout=1)
            cleanup_task = main_module.app.state.job_cleanup_task

            # Während der Anwendungslaufzeit muss die Cleanup-Task aktiv sein.
            assert not cleanup_task.done()

        # Nach dem Verlassen des Lifespans muss die Task sauber abgebrochen sein.
        assert cleanup_task.cancelled()

    asyncio.run(exercise_lifespan())