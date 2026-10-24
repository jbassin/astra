"""``pipeline-terminate``: the cancel runs inside dagster-daemon, the one container with the
Docker socket (ADR 0030), after the LIVE confirmation."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from astra_config import find_repo_root
from astra_ops import cli, pipeline
from astra_ops.testing import Call, make_ctx

REPO = find_repo_root()
RUN = "34a303d6-c43b-47fe-9db8-825109a1fc40"


def test_terminates_through_the_daemon_container(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("ASTRA_DAGSTER_DAEMON_CONTAINER", raising=False)
    argv = ["docker", "exec", "astra-dagster-daemon", "python", "-c", pipeline.TERMINATE, RUN]
    ctx, r = make_ctx(tmp_path, [Call(argv, rc=0)])
    assert cli.dispatch(ctx, "pipeline-terminate", [RUN, "--yes"]) == 0
    r.assert_done()


def test_passes_the_cancel_s_exit_code(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [Call(pipeline.terminate_argv(RUN), rc=2)])
    assert cli.dispatch(ctx, "pipeline-terminate", [RUN, "--yes"]) == 2
    r.assert_done()


def test_usage(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [])
    assert cli.dispatch(ctx, "pipeline-terminate", []) == 64
    assert cli.dispatch(ctx, "pipeline-terminate", ["--yes"]) == 64
    assert cli.dispatch(ctx, "pipeline-terminate", [RUN, "extra"]) == 64
    r.assert_done()


def test_the_script_is_valid_python() -> None:
    compile(pipeline.TERMINATE, "<terminate>", "exec")


def test_the_daemon_is_the_only_service_with_the_socket() -> None:
    compose = yaml.safe_load((REPO / "deploy" / "docker-compose.yml").read_text())
    daemon = compose["services"]["dagster-daemon"]
    assert daemon["container_name"] == pipeline.DAEMON_CONTAINER
    socket = "/var/run/docker.sock"
    mounting = [
        name
        for name, svc in compose["services"].items()
        if any(isinstance(v, dict) and v.get("source") == socket for v in svc.get("volumes", []))
    ]
    assert mounting == ["dagster-daemon"]
