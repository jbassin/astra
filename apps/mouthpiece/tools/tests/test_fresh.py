"""The freshness check against scratch git repos: a clean clone at origin/main and a
checkout containing origin/main pass; local changes, a lagging clone or checkout fail."""

from __future__ import annotations

import subprocess
from pathlib import Path

from astra_mouthpiece_tools.roundtable.fresh import stale_reasons


def git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


def repo_pair(tmp: Path, name: str) -> tuple[Path, Path]:
    """A bare origin with one commit on main, and a clone of it."""
    seed = tmp / f"{name}-seed"
    seed.mkdir()
    git(seed, "init", "-q", "-b", "main")
    (seed / "page.vellum").write_text("x")
    git(seed, "add", "-A")
    git(seed, "commit", "-qm", "seed")
    origin = tmp / f"{name}.git"
    git(tmp, "clone", "-q", "--bare", str(seed), str(origin))
    clone = tmp / name
    git(tmp, "clone", "-q", str(origin), str(clone))
    return origin, clone


def push_new_commit(tmp: Path, origin: Path, name: str) -> None:
    other = tmp / f"{name}-other"
    git(tmp, "clone", "-q", str(origin), str(other))
    (other / "new.vellum").write_text("y")
    git(other, "add", "-A")
    git(other, "commit", "-qm", "new")
    git(other, "push", "-q", "origin", "main")


def test_current_trees_pass(tmp_path: Path) -> None:
    _, data = repo_pair(tmp_path, "data")
    _, code = repo_pair(tmp_path, "code")
    assert stale_reasons(data, code) == []


def test_local_changes_and_a_lagging_clone_fail(tmp_path: Path) -> None:
    data_origin, data = repo_pair(tmp_path, "data")
    _, code = repo_pair(tmp_path, "code")
    (data / "page.vellum").write_text("edited")
    push_new_commit(tmp_path, data_origin, "data")
    reasons = stale_reasons(data, code)
    assert any("uncommitted changes" in r for r in reasons)
    assert any("not origin/main" in r for r in reasons)


def test_a_checkout_without_origin_main_fails(tmp_path: Path) -> None:
    _, data = repo_pair(tmp_path, "data")
    code_origin, code = repo_pair(tmp_path, "code")
    push_new_commit(tmp_path, code_origin, "code")
    (reason,) = stale_reasons(data, code)
    assert "does not contain origin/main" in reason


def test_a_wiki_outside_git_fails(tmp_path: Path) -> None:
    _, code = repo_pair(tmp_path, "code")
    plain = tmp_path / "plain"
    plain.mkdir()
    (reason,) = stale_reasons(plain, code)
    assert "not in a git clone" in reason
