"""``InstanceOnlyDockerRunLauncher`` launches what dagster.yaml says, whatever a run's stored
origin asks for: a crafted ``container_context`` or ``container_image`` (written by anyone
with the run database's password) must not reach ``docker create``."""

from __future__ import annotations

import weakref
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import dagster as dg
import pytest
from astra_pipeline_resources.run_launcher import InstanceOnlyDockerRunLauncher
from dagster._core.code_pointer import FileCodePointer
from dagster._core.launcher.base import LaunchRunContext
from dagster._core.origin import JobPythonOrigin, RepositoryPythonOrigin
from dagster._core.storage.dagster_run import DagsterRun
from dagster_docker import DockerRunLauncher

IMAGE = "astra-dagster:local"
NETWORKS = ["astra_pipeline", "astra_dagster-db"]
KWARGS = {
    "user": "1000:1000",
    "auto_remove": True,
    "labels": {"astra.role": "dagster-run"},
    "volumes": ["/ruby/data/astra-state/scribe/data:/ruby/data/astra-state/scribe/data:rw"],
}
EVIL_CONTEXT = {
    "env_vars": ["EVIL=1"],
    "docker": {
        "networks": ["host"],
        "env_vars": ["EVIL2=1"],
        "container_kwargs": {"privileged": True, "volumes": ["/:/host:rw"], "user": "0:0"},
    },
}


@dataclass
class _Container:
    id: str = "c0ffee"
    started: bool = False

    def start(self) -> None:
        self.started = True


@dataclass
class _Network:
    name: str
    connected: list[_Container] = field(default_factory=list)

    def connect(self, container: _Container) -> None:
        self.connected.append(container)


@dataclass
class _Client:
    created: list[dict[str, Any]] = field(default_factory=list)
    nets: dict[str, _Network] = field(default_factory=dict)

    @property
    def containers(self) -> _Client:
        return self

    @property
    def networks(self) -> _Client:
        return self

    def create(self, **kwargs: Any) -> _Container:
        self.created.append(kwargs)
        return _Container()

    def get(self, name: str) -> _Network:
        return self.nets.setdefault(name, _Network(name))


def _launcher(cls: type[DockerRunLauncher], instance: dg.DagsterInstance) -> DockerRunLauncher:
    launcher = cls(
        image=IMAGE, env_vars=["DAGSTER_PG_PASSWORD"], networks=NETWORKS, container_kwargs=KWARGS
    )
    launcher._instance_weakref = weakref.ref(instance)
    return launcher


def _crafted_run(instance: dg.DagsterInstance) -> DagsterRun:
    origin = JobPythonOrigin(
        job_name="sleepy_job",
        repository_origin=RepositoryPythonOrigin(
            executable_path="/opt/venv/bin/python",
            code_pointer=FileCodePointer("definitions.py", "defs", "/opt/dagster/app"),
            container_image="evil/image:latest",
            entry_point=None,
            container_context=EVIL_CONTEXT,
        ),
    )
    return instance.add_run(DagsterRun(job_name="sleepy_job", job_code_origin=origin))


@pytest.fixture
def instance(tmp_path: Path) -> Any:
    with dg.DagsterInstance.local_temp(str(tmp_path)) as inst:
        yield inst


def _launch(
    cls: type[DockerRunLauncher], instance: dg.DagsterInstance, monkeypatch: pytest.MonkeyPatch
) -> _Client:
    monkeypatch.setenv("DAGSTER_PG_PASSWORD", "pw")
    client = _Client()
    launcher = _launcher(cls, instance)
    monkeypatch.setattr(launcher, "_get_client", lambda _ctx: client)
    run = _crafted_run(instance)
    launcher.launch_run(LaunchRunContext(dagster_run=run, workspace=None))
    return client


def test_a_crafted_origin_gets_only_the_instance_config(
    instance: dg.DagsterInstance, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _launch(InstanceOnlyDockerRunLauncher, instance, monkeypatch)
    (created,) = client.created
    assert created["image"] == IMAGE
    assert created["user"] == "1000:1000"
    assert created["volumes"] == KWARGS["volumes"]
    assert "privileged" not in created
    env = {"DAGSTER_PG_PASSWORD": "pw", "DAGSTER_RUN_JOB_NAME": "sleepy_job"}
    assert created["environment"] == env
    assert created["network"] == NETWORKS[0]
    assert list(client.nets) == NETWORKS[1:]
    assert created["labels"]["astra.role"] == "dagster-run"


def test_the_stock_launcher_would_have_obeyed_it(
    instance: dg.DagsterInstance, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The control: without the subclass the crafted origin reaches docker create."""
    client = _launch(DockerRunLauncher, instance, monkeypatch)
    (created,) = client.created
    assert created["image"] == "evil/image:latest"
    assert created["privileged"] is True
    assert created["volumes"] == ["/:/host:rw"]


def test_terminate_and_health_use_the_instance_context(instance: dg.DagsterInstance) -> None:
    launcher = _launcher(InstanceOnlyDockerRunLauncher, instance)
    context = launcher.get_container_context(_crafted_run(instance))
    assert list(context.networks) == NETWORKS
    assert dict(context.container_kwargs) == KWARGS
    assert list(context.env_vars) == ["DAGSTER_PG_PASSWORD"]


def test_no_image_is_an_error(instance: dg.DagsterInstance) -> None:
    launcher = InstanceOnlyDockerRunLauncher(networks=NETWORKS)
    run = _crafted_run(instance)
    with pytest.raises(RuntimeError, match="no image"):
        assert run.job_code_origin is not None
        launcher._get_docker_image(run.job_code_origin)
