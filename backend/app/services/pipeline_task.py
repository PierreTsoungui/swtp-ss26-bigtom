# app/services/pipeline_task.py
"""
Zentraler Einstiegspunkt für alle R-Pipeline-Background-Tasks.

Siehe r_executor_spec.md, Abschnitt 6 ("Cancellation Protocol"):
Registrierung und Freigabe des cancel_event sowie der Task-Referenz selbst
laufen ausschließlich hier. Services (upload.py, normalize.py,
batch_service.py, heatmap_service.py) rufen niemals direkt
job_manager.register_cancel_event() / unregister_cancel_event() auf —
sie übergeben stattdessen ihre Pipeline-Coroutine an start_job_pipeline()
und bekommen dafür ein bereits erzeugtes cancel_event injiziert.

Das hält das Lifecycle-Management an einer Stelle: ein Bugfix hier wirkt
automatisch auf jede Pipeline, ohne dass jeder Service sein eigenes
try/finally für Registrierung pflegen muss.
"""
import asyncio
import logging
from typing import Awaitable, Callable

from app.services import job_manager

logger = logging.getLogger(__name__)

# Eine Pipeline-Coroutine-Factory erhält das cancel_event und liefert die
# auszuführende Coroutine zurück. So kann jeder Service sein eigenes
# Signature beibehalten, ohne dass pipeline_task irgendetwas über
# Job-Phasen oder R-Skripte wissen muss.
PipelineFactory = Callable[[asyncio.Event], Awaitable[None]]


def start_job_pipeline(job_id: str, pipeline_factory: PipelineFactory) -> asyncio.Task:
    """
    Startet eine Pipeline-Coroutine als verwalteten Background-Task.

    - Erzeugt genau ein cancel_event für diese Pipeline-Ausführung.
    - Registriert Event und Task zentral im job_manager.
    - Garantiert Freigabe beider Registrierungen nach Abschluss
      (Erfolg, Fehler, Cancellation oder eine unerwartete Exception).

    Verwendung in einem Service:

        def my_pipeline(cancel_event: asyncio.Event):
            async def _run():
                result = await run_r_script(command=..., cancel_event=cancel_event, ...)
                ...
            return _run()

        background_tasks.add_task(
            lambda: pipeline_task.start_job_pipeline(job_id, my_pipeline)
        )

    Hinweis: FastAPI BackgroundTasks erwartet eine awaitable Funktion, kein
    Task-Objekt. Services rufen daher in der Praxis direkt
    `await run_job_pipeline(job_id, my_pipeline)` auf (siehe unten) statt
    `start_job_pipeline` — letzteres existiert für Aufrufer, die bewusst
    eine fire-and-forget-Task außerhalb von BackgroundTasks erzeugen wollen
    (z.B. zukünftige WebSocket- oder Queue-Trigger).
    """
    cancel_event = asyncio.Event()
    job_manager.register_cancel_event(job_id, cancel_event)

    async def _managed_run() -> None:
        try:
            await pipeline_factory(cancel_event)
        except Exception:
            logger.exception("Unbehandelte Exception in Pipeline-Task: job_id=%s", job_id)
        finally:
            job_manager.unregister_cancel_event(job_id)
            job_manager.unregister_job_task(job_id)

    task = asyncio.create_task(_managed_run())
    job_manager.register_job_task(job_id, task)
    return task


async def run_job_pipeline(job_id: str, pipeline_factory: PipelineFactory) -> None:
    """
    Awaitable Variante für den Einsatz mit FastAPI BackgroundTasks
    (background_tasks.add_task ruft seine Zielfunktion selbst auf und
    awaitet sie — ein zusätzliches asyncio.create_task ist hier unnötig
    und würde die Lebenszeit-Steuerung von FastAPI duplizieren).

    Übernimmt exakt dieselbe Registrierungs-/Freigabe-Garantie wie
    start_job_pipeline(), aber ohne eigene Task-Erzeugung — die Task
    existiert bereits implizit durch BackgroundTasks.
    """
    cancel_event = asyncio.Event()
    job_manager.register_cancel_event(job_id, cancel_event)

    current_task = asyncio.current_task()
    if current_task is not None:
        job_manager.register_job_task(job_id, current_task)

    try:
        await pipeline_factory(cancel_event)
    except Exception:
        logger.exception("Unbehandelte Exception in Pipeline-Task: job_id=%s", job_id)
    finally:
        job_manager.unregister_cancel_event(job_id)
        job_manager.unregister_job_task(job_id)