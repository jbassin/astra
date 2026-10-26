"""Only services whose image has no fitting CMD set a compose `command:`.

A `command:` that repeats an image's CMD drifts from it (the 2026-10-24 outage), so the Node
services, which all run node.Dockerfile's CMD, set none. The exceptions: the three Dagster
services share one image with no CMD, and node-exporter's `command:` passes flags to the stock
image's entrypoint.
"""

from __future__ import annotations

from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
COMPOSE = REPO / "deploy" / "docker-compose.yml"

WITH_COMMAND = {"dagster-code", "dagster-webserver", "dagster-daemon", "node-exporter"}


def _services() -> dict[str, dict[str, object]]:
    return yaml.safe_load(COMPOSE.read_text())["services"]


def _dockerfile(svc: dict[str, object]) -> object:
    build = svc.get("build")
    return build.get("dockerfile") if isinstance(build, dict) else None


def test_only_the_listed_services_set_a_command() -> None:
    have = {name for name, svc in _services().items() if "command" in svc}
    assert have == WITH_COMMAND


def test_no_node_service_sets_a_command() -> None:
    services = _services()
    node = [name for name, svc in services.items() if _dockerfile(svc) == "deploy/node.Dockerfile"]
    assert node, "no service builds deploy/node.Dockerfile"
    assert not [name for name in node if "command" in services[name]]
