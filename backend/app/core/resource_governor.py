"""Weighted admission control for the R compute workload.

Every heavy pipeline step runs as an ``Rscript`` process inside the single
``r_worker`` container. Without a limit, N concurrent uploads spawn N concurrent
R processes; on memory-heavy steps (DMR peaks around 11 GiB) that oversubscribes
the host RAM and the kernel OOM-killer takes the whole machine down.

The :class:`ResourceGovernor` is a small, dependency-free scheduler that admits
work against a **memory (GiB) and CPU-core budget**. A step acquires a slot sized
to its estimated need; if the remaining budget is insufficient it *waits in a
queue* until earlier steps release their slots. The result is graceful
degradation — jobs get slower under load instead of crashing the server.

The budget is the single source of truth from configuration
(:mod:`app.core.config`), so deploying to a bigger/smaller machine is just a
matter of changing the ``PIPELINE_*`` environment variables. A hard container
``mem_limit`` in docker-compose backs this up as a last-resort wall.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Awaitable, Callable, Optional

from app.core import config

logger = logging.getLogger(__name__)


class ResourceGovernor:
    """Admit R work against a shared memory + core budget, queueing when full.

    Concurrency-safe for a single asyncio event loop (all backend R launches run
    on the FastAPI loop). Fairness is best-effort: waiters are re-checked on
    every release via a shared condition; a step that needs more than the whole
    budget is clamped so it can still run (alone) instead of waiting forever.
    """

    def __init__(self, memory_budget_gb: float, core_budget: int) -> None:
        self._total_mem = float(memory_budget_gb)
        self._total_cores = int(core_budget)
        self._avail_mem = self._total_mem
        self._avail_cores = self._total_cores
        self._cond = asyncio.Condition()
        self._waiting = 0
        logger.info(
            "ResourceGovernor initialised: memory_budget=%.1fGiB core_budget=%d",
            self._total_mem, self._total_cores,
        )

    @property
    def stats(self) -> dict:
        """Current utilisation snapshot (for logging / a future status endpoint)."""
        return {
            "memory_total_gb": self._total_mem,
            "memory_available_gb": self._avail_mem,
            "cores_total": self._total_cores,
            "cores_available": self._avail_cores,
            "queued": self._waiting,
        }

    @asynccontextmanager
    async def slot(
        self,
        mem_gb: float,
        cores: int,
        *,
        label: str = "R",
        on_wait: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        """Hold a memory+core slot for the duration of the ``async with`` block.

        Blocks (cooperatively) until the request fits the remaining budget. If
        the caller has to wait, ``on_wait`` is invoked once so the UI can show a
        "queued" state. Needs larger than the whole budget are clamped to the
        budget, so an oversized step runs alone rather than deadlocking.
        """
        need_mem = min(float(mem_gb), self._total_mem)
        need_cores = min(int(cores), self._total_cores) if self._total_cores > 0 else 0

        async with self._cond:
            fits = self._avail_mem >= need_mem and self._avail_cores >= need_cores
            if not fits:
                self._waiting += 1
                logger.info(
                    "Compute slot QUEUED: label=%s need=(%.1fGiB,%dc) "
                    "available=(%.1fGiB,%dc) queued=%d",
                    label, need_mem, need_cores,
                    self._avail_mem, self._avail_cores, self._waiting,
                )
                if on_wait is not None:
                    try:
                        await on_wait()
                    except Exception:
                        logger.exception("on_wait hook failed: label=%s", label)
                try:
                    await self._cond.wait_for(
                        lambda: self._avail_mem >= need_mem
                        and self._avail_cores >= need_cores
                    )
                finally:
                    self._waiting -= 1
            self._avail_mem -= need_mem
            self._avail_cores -= need_cores
            logger.info(
                "Compute slot ACQUIRED: label=%s remaining=(%.1fGiB,%dc)",
                label, self._avail_mem, self._avail_cores,
            )

        try:
            yield
        finally:
            async with self._cond:
                self._avail_mem += need_mem
                self._avail_cores += need_cores
                # Wake every waiter: the freed capacity may satisfy a large
                # request that a single notify() (FIFO) would keep starved.
                self._cond.notify_all()
                logger.info(
                    "Compute slot RELEASED: label=%s remaining=(%.1fGiB,%dc)",
                    label, self._avail_mem, self._avail_cores,
                )


# Process-wide singleton, sized from the deployment configuration.
governor = ResourceGovernor(
    memory_budget_gb=config.PIPELINE_MEMORY_BUDGET_GB,
    core_budget=config.PIPELINE_CORE_BUDGET,
)
