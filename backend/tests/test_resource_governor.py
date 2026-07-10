"""Unit tests for the resource-governor admission control.

These verify the guarantees the deployment relies on:
  * work that fits the budget runs in parallel,
  * work that does not fit is queued (serialised) instead of oversubscribing,
  * the core budget constrains independently of memory,
  * a step larger than the whole budget still runs (alone) — never deadlocks,
  * the on_wait hook fires exactly when a caller has to queue.

Written with plain ``asyncio.run`` so no pytest-asyncio plugin is required.
"""

import asyncio

from app.core.resource_governor import ResourceGovernor


def _run(coro):
    return asyncio.run(coro)


def test_parallel_within_budget():
    """Two 4 GiB steps both fit a 10 GiB budget → they overlap."""

    async def scenario():
        gov = ResourceGovernor(memory_budget_gb=10, core_budget=4)
        events = []

        async def job(name):
            async with gov.slot(4, 1, label=name):
                events.append(f"start:{name}")
                await asyncio.sleep(0.15)
                events.append(f"end:{name}")

        await asyncio.gather(job("A"), job("B"))
        return events

    events = _run(scenario())
    # Both started before either finished → concurrent.
    assert set(events[:2]) == {"start:A", "start:B"}


def test_memory_budget_serialises():
    """Two 8 GiB steps cannot share a 10 GiB budget → they run one after another."""

    async def scenario():
        gov = ResourceGovernor(memory_budget_gb=10, core_budget=4)
        events = []

        async def job(name):
            async with gov.slot(8, 1, label=name):
                events.append(f"start:{name}")
                await asyncio.sleep(0.15)
                events.append(f"end:{name}")

        await asyncio.gather(job("A"), job("B"))
        return events

    events = _run(scenario())
    # No overlap: the first must fully finish before the second starts.
    assert events in (
        ["start:A", "end:A", "start:B", "end:B"],
        ["start:B", "end:B", "start:A", "end:A"],
    )


def test_core_budget_serialises_independently_of_memory():
    """Memory is plentiful but the 2-core budget only admits one 2-core step."""

    async def scenario():
        gov = ResourceGovernor(memory_budget_gb=100, core_budget=2)
        events = []

        async def job(name):
            async with gov.slot(1, 2, label=name):
                events.append(f"start:{name}")
                await asyncio.sleep(0.15)
                events.append(f"end:{name}")

        await asyncio.gather(job("A"), job("B"))
        return events

    events = _run(scenario())
    assert events in (
        ["start:A", "end:A", "start:B", "end:B"],
        ["start:B", "end:B", "start:A", "end:A"],
    )


def test_oversized_step_runs_alone_without_deadlock():
    """A step needing more than the whole budget is clamped and still runs."""

    async def scenario():
        gov = ResourceGovernor(memory_budget_gb=8, core_budget=2)
        ran = []
        async with gov.slot(100, 8, label="huge"):  # both needs exceed the budget
            ran.append(True)
        return ran

    assert _run(scenario()) == [True]


def test_on_wait_fires_only_when_queued():
    """The queued-notice hook fires for the step that has to wait, not the first."""

    async def scenario():
        gov = ResourceGovernor(memory_budget_gb=10, core_budget=4)
        waited = []

        async def job(name):
            async def note():
                waited.append(name)

            async with gov.slot(8, 1, label=name, on_wait=note):
                await asyncio.sleep(0.15)

        await asyncio.gather(job("A"), job("B"))
        return waited

    waited = _run(scenario())
    # Exactly one of the two had to queue (the budget fits only one 8 GiB step).
    assert len(waited) == 1


def test_budget_fully_restored_after_release():
    """Every acquire is matched by a release → the budget returns to full."""

    async def scenario():
        gov = ResourceGovernor(memory_budget_gb=12, core_budget=2)
        async with gov.slot(12, 2, label="all"):
            pass
        return gov.stats

    stats = _run(scenario())
    assert stats["memory_available_gb"] == 12
    assert stats["cores_available"] == 2
    assert stats["queued"] == 0
