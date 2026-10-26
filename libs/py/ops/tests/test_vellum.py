"""``vellum-parity-live``: node goes first on the script's PATH, and the script runs under the
git-publish and host-tooling locks, both shared; a busy lock skips the run without failing."""

from __future__ import annotations

import fcntl
from pathlib import Path

import pytest
from astra_ops import cli, vellum
from astra_ops.context import Ctx
from astra_ops.testing import Call, Step, make_ctx, uv

CONTENT = "/clone/akasha/content"
CFG = {"data.akasha-content": CONTENT}


#: The directories the command put first on PATH (recorded instead of changing this process's).
prepended: list[Path] = []


@pytest.fixture(autouse=True)
def _record_path(monkeypatch: pytest.MonkeyPatch) -> None:
    prepended.clear()
    monkeypatch.setattr(Ctx, "prepend_path", lambda _self, d: prepended.append(d))


def parity(tmp: Path, node_dir: str, rc: int = 0) -> Call:
    script = f"{tmp}/repo/{vellum.SCRIPT}"

    def node_first() -> None:
        assert prepended == [Path(node_dir)]

    return Call(uv("python", script, "--dir", CONTENT), rc=rc, effect=node_first)


def test_runs_the_script_under_both_shared_locks(tmp_path: Path) -> None:
    steps: list[Step] = [
        ("lock", "git-publish", "sh"),
        ("lock", "host-tooling", "sh"),
        parity(tmp_path, "/usr/bin"),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=CFG)
    assert cli.dispatch(ctx, "vellum-parity-live", []) == 0
    r.assert_done()


def test_passes_the_script_s_failure(tmp_path: Path) -> None:
    steps: list[Step] = [
        ("lock", "git-publish", "sh"),
        ("lock", "host-tooling", "sh"),
        parity(tmp_path, "/usr/bin", rc=1),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=CFG)
    assert cli.dispatch(ctx, "vellum-parity-live", []) == 1
    r.assert_done()


def test_falls_back_to_the_newest_nvm_node(tmp_path: Path) -> None:
    for v in ("v20.9.0", "v24.1.0", "v9.0.0"):
        node = tmp_path / "home" / ".nvm" / "versions" / "node" / v / "bin" / "node"
        node.parent.mkdir(parents=True)
        node.touch()
    newest = f"{tmp_path}/home/.nvm/versions/node/v24.1.0/bin"
    steps: list[Step] = [
        ("lock", "git-publish", "sh"),
        ("lock", "host-tooling", "sh"),
        parity(tmp_path, newest),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=CFG, node=None)
    assert cli.dispatch(ctx, "vellum-parity-live", []) == 0
    r.assert_done()


def test_no_node_is_127_and_checks_nothing(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [], config=CFG, node=None)
    assert cli.dispatch(ctx, "vellum-parity-live", []) == 127
    r.assert_done()


def test_a_busy_lock_skips_the_run_without_failing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ctx, r = make_ctx(
        tmp_path,
        [("lock", "git-publish", "sh"), ("lock-busy", "git-publish")],
        config=CFG,
    )
    ctx.git_publish_lock.parent.mkdir(parents=True)
    with ctx.git_publish_lock.open("w") as held:
        fcntl.flock(held.fileno(), fcntl.LOCK_EX)  # a publisher mid-write
        assert cli.dispatch(ctx, "vellum-parity-live", []) == 0
    r.assert_done()
    assert "git-publish lock stayed busy" in capsys.readouterr().err


def test_takes_no_arguments(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [], config=CFG)
    assert cli.dispatch(ctx, "vellum-parity-live", ["--yes"]) == 64
    r.assert_done()
