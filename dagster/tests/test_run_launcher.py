"""The Docker run launcher (ADR 0030) gives each run's container what dagster-code has.

dagster.yaml's ``run_launcher`` repeats two lists from deploy/docker-compose.yml: the
``x-dagster-env`` keys (``env_vars``) and the ``x-dagster-volumes`` binds (``volumes``). YAML
cannot share them across the two files, so these tests fail when they drift.
"""

from pathlib import Path
from typing import Any

import pytest
import yaml
from astra_pipeline_resources.run_launcher import InstanceOnlyDockerRunLauncher
from dagster._serdes.config_class import ConfigurableClassData

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy" / "docker-compose.yml"
INSTANCE = ROOT / "dagster" / "dagster.yaml"


def _compose() -> dict[str, Any]:
    return yaml.safe_load(COMPOSE.read_text())


def _launcher() -> dict[str, Any]:
    return yaml.safe_load(INSTANCE.read_text())["run_launcher"]


def test_the_launcher_ignores_run_origins() -> None:
    launcher = _launcher()
    assert (launcher["module"], launcher["class"]) == (
        "astra_pipeline_resources.run_launcher",
        "InstanceOnlyDockerRunLauncher",
    )


def test_env_vars_are_the_compose_env_keys() -> None:
    env = _compose()["x-dagster-env"]
    # DAGSTER_RUN_* configure the launcher itself; a run's container does not need them.
    keys = [k for k in env if not k.startswith("DAGSTER_RUN_")]
    assert _launcher()["config"]["env_vars"] == keys


def test_volumes_are_the_compose_pipeline_binds() -> None:
    def spec(bind: dict[str, Any]) -> str:
        assert bind["type"] == "bind"
        mode = "ro" if bind.get("read_only") else "rw"
        return f"{bind['source']}:{bind['target']}:{mode}"

    binds = _compose()["x-dagster-volumes"]
    assert _launcher()["config"]["container_kwargs"]["volumes"] == [spec(b) for b in binds]


def test_the_run_container_matches_the_code_server() -> None:
    compose = _compose()
    code = compose["services"]["dagster-code"]
    kwargs = _launcher()["config"]["container_kwargs"]
    assert kwargs["user"] == code["user"]
    env = compose["x-dagster-env"]
    assert env["DAGSTER_RUN_IMAGE"] == code["image"]
    # The run container joins the trio's two nets, by their Docker names.
    nets = [f"{compose['name']}_{n}" for n in code["networks"]]
    assert [env["DAGSTER_RUN_NETWORK_PIPELINE"], env["DAGSTER_RUN_NETWORK_DB"]] == nets


def test_only_the_daemon_mounts_the_docker_socket() -> None:
    services = _compose()["services"]
    socket = "/var/run/docker.sock"
    mounting = sorted(
        name
        for name, svc in services.items()
        if any(isinstance(v, dict) and v.get("source") == socket for v in svc.get("volumes", []))
    )
    # Not the webserver: anyone on the LAN reaches it without auth.
    assert mounting == ["dagster-daemon"]
    assert "group_add" not in services["dagster-webserver"]


def test_the_launcher_config_loads(monkeypatch: pytest.MonkeyPatch) -> None:
    env = _compose()["x-dagster-env"]
    for key in ("DAGSTER_RUN_IMAGE", "DAGSTER_RUN_NETWORK_PIPELINE", "DAGSTER_RUN_NETWORK_DB"):
        monkeypatch.setenv(key, env[key])
    launcher = _launcher()
    config = yaml.dump(launcher["config"])
    data = ConfigurableClassData(launcher["module"], launcher["class"], config)
    built = data.rehydrate(InstanceOnlyDockerRunLauncher)
    assert built.image == "astra-dagster:local"
    assert built.networks == ["astra_pipeline", "astra_dagster-db"]
    assert built.container_kwargs["auto_remove"] is True
