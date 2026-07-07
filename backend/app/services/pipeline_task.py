# app/services/pipeline_task.py
"""Central entry point for all R-pipeline background tasks.

See r_executor_spec.md, section 6 ("Cancellation Protocol"): registering and
releasing the cancel_event and the task reference itself happens exclusively
here. Services (upload.py, normalize.py, batch_service.py, heatmap_service.py)
never call job_manager.register_cancel_event() / unregister_cancel_event()
directly — instead they pass their pipeline coroutine to start_job_pipeline()
and get an already-created cancel_event injected.

This keeps lifecycle management in one place: a bug fix here applies to every
pipeline automatically, without each service maintaining its own try/finally
for registration.
"""
import asyncio
import logging
from typing import Awaitable, Callable

from app.services import job_manager

logger = logging.getLogger(__name__)

# A pipeline coroutine factory receives the cancel_event and returns the
# coroutine to run. This lets each service keep its own signature without
# pipeline_task having to know anything about job phases or R scripts.
PipelineFactory = Callable[[asyncio.Event], Awaitable[None]]


def start_job_pipeline(job_id: str, pipeline_factory: PipelineFactory) -> asyncio.Task:
    """Start a pipeline coroutine as a managed background task.

    - Creates exactly one cancel_event for this pipeline run.
    - Registers the event and the task centrally in job_manager.
    - Guarantees the release of both registrations on completion (success,
      failure, cancellation or an unexpected exception).

    Usage in a service::

        def my_pipeline(cancel_event: asyncio.Event):
            async def _run():
                result = await run_r_script(command=..., cancel_event=cancel_event, ...)
                ...
            return _run()

        background_tasks.add_task(
            lambda: pipeline_task.start_job_pipeline(job_id, my_pipeline)
        )

    Note: FastAPI BackgroundTasks expects an awaitable function, not a task
    object. In practice services therefore call ``await run_job_pipeline(job_id,
    my_pipeline)`` directly (see below) instead of ``start_job_pipeline`` — the
    latter exists for callers that deliberately create a fire-and-forget task
    outside BackgroundTasks (e.g. future WebSocket or queue triggers).
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
    """Run a pipeline as an awaitable, for use with FastAPI BackgroundTasks.

    ``background_tasks.add_task`` calls and awaits its target itself, so an extra
    ``asyncio.create_task`` is unnecessary here and would duplicate FastAPI's
    lifetime management.

    Provides exactly the same registration/cleanup guarantee as
    ``start_job_pipeline`` but without creating its own task — the task already
    exists implicitly through BackgroundTasks.
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