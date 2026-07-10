"""Deployment-configuration invariants (regression guards for audit B-1 and N-1).

These lock the shipped ``docker-compose.yml`` defaults to the values the backend
code assumes, so a future edit cannot silently reintroduce:

* **B-1** — a ``DMR_CORES`` default above the memory-safe value. Each DMR
  bootstrap worker holds a full copy of the beta matrix, so a higher shipped
  default risks an OOM kill under ``R_WORKER_MEM_LIMIT``.
* **N-1** — an ``r_worker`` container name that no longer matches the fixed
  target the backend uses for ``docker exec``. A mismatch makes every R step fail
  with "No such container", breaking the whole pipeline.
"""

import re
from pathlib import Path

import pytest

from app.services.r_executor.commands.base import RCommand

# PyYAML parses the compose file; skip cleanly if it is unavailable.
yaml = pytest.importorskip("yaml")

COMPOSE_PATH = Path(__file__).resolve().parents[2] / "docker-compose.yml"

if not COMPOSE_PATH.exists():
    pytest.skip(
        "docker-compose.yml not found at the repository root", allow_module_level=True
    )


def _compose() -> dict:
    """Parse the repository's ``docker-compose.yml``."""
    with open(COMPOSE_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _service_env(service: dict) -> dict[str, str]:
    """Return a service's ``environment:`` as a ``{name: raw_value}`` mapping.

    Compose accepts either a list of ``"KEY=VALUE"`` strings or a mapping; both
    shapes are normalised to a dict here.
    """
    env = service.get("environment", {})
    if isinstance(env, dict):
        return {str(k): "" if v is None else str(v) for k, v in env.items()}
    result: dict[str, str] = {}
    for item in env:
        key, _, value = str(item).partition("=")
        result[key] = value
    return result


def _interpolation_default(value: str) -> str | None:
    """Extract the default of a ``${VAR:-default}`` / ``${VAR-default}`` form."""
    match = re.fullmatch(
        r"\$\{[A-Za-z_][A-Za-z0-9_]*:?-(?P<default>[^}]*)\}", value.strip()
    )
    return match.group("default") if match else None


def test_compose_defines_the_expected_services():
    services = _compose().get("services", {})
    assert "backend" in services
    assert "r_worker" in services


def test_dmr_cores_default_is_memory_safe():
    """B-1: the shipped ``DMR_CORES`` default must be the memory-safe value ``1``."""
    env = _service_env(_compose()["services"]["backend"])
    assert "DMR_CORES" in env, "backend service must set DMR_CORES"

    default = _interpolation_default(env["DMR_CORES"])
    assert default == "1", (
        f"docker-compose DMR_CORES default is {default!r}; expected '1' — each DMR "
        "bootstrap worker copies the beta matrix, so a higher default risks an OOM "
        "kill (audit B-1). Must match app.core.config.DMR_CORES' default."
    )


def test_r_worker_container_name_matches_backend_exec_target():
    """N-1: ``r_worker.container_name`` must equal the backend's ``docker exec`` target."""
    r_worker = _compose()["services"]["r_worker"]
    assert r_worker.get("container_name") == RCommand.R_WORKER_CONTAINER, (
        "r_worker.container_name must equal RCommand.R_WORKER_CONTAINER so the "
        "backend's `docker exec` target resolves regardless of the compose project "
        "name or checkout directory (audit N-1)."
    )
