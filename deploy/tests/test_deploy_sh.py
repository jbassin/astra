"""deploy.sh's dry-run path against a scratch origin, deploy checkout and data root.

Covers what runs before any build: the staged origin/main tooling (step 2a), the rollback
pin, the lenient history.jsonl reads and --skip-failed. No Docker, sops or uv is needed.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

DEPLOY_DIR = Path(__file__).resolve().parents[1]
MARKER = "log 'origin/main tooling is running'"


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    ).stdout.strip()


def _env(**extra: str) -> dict[str, str]:
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("GIT_") and not k.startswith("ASTRA_")
    }
    return {**env, **extra}


@dataclass
class Rig:
    deploy_root: Path
    data_root: Path
    old: str
    main: str

    @property
    def history(self) -> Path:
        return self.data_root / "deploy" / "history.jsonl"

    def run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.deploy_root / "deploy" / "deploy.sh"), *args],
            check=False,
            capture_output=True,
            text=True,
            env=_env(
                ASTRA_DEPLOY_ROOT=str(self.deploy_root),
                ASTRA_DATA_ROOT=str(self.data_root),
                ASTRA_CONTENT_ROOT=str(self.data_root / "astra-data"),
            ),
        )

    def last_record(self) -> dict[str, object]:
        return json.loads(self.history.read_text().splitlines()[-1])


@pytest.fixture
def rig(tmp_path: Path) -> Rig:
    """origin: `old` = today's deploy tooling, `main` = the same plus a log marker after
    step 2b's heading. The deploy checkout is detached at `old` (as after a rollback)."""
    if not shutil.which("jq") or not shutil.which("flock"):
        pytest.skip("needs jq and flock")
    src = tmp_path / "src"
    (src / "deploy").mkdir(parents=True)
    for f in ("deploy.sh", "wait-healthy.sh"):
        shutil.copy2(DEPLOY_DIR / f, src / "deploy" / f)
    _git(src, "init", "-q", "-b", "main")
    _git(src, "add", "-A")
    _git(src, "commit", "-qm", "old")
    old = _git(src, "rev-parse", "HEAD")
    script = src / "deploy" / "deploy.sh"
    text = script.read_text()
    assert "# 2b. The target.\n" in text
    script.write_text(text.replace("# 2b. The target.\n", f"# 2b. The target.\n{MARKER}\n"))
    _git(src, "commit", "-qam", "main")
    main = _git(src, "rev-parse", "HEAD")
    deploy_root = tmp_path / "deploy-root"
    _git(tmp_path, "clone", "-q", str(src), str(deploy_root))
    _git(deploy_root, "checkout", "-q", "--detach", old)
    data_root = tmp_path / "data"
    (data_root / "deploy").mkdir(parents=True)
    return Rig(deploy_root, data_root, old, main)


def test_runs_origin_main_tooling_from_an_old_checkout(rig: Rig) -> None:
    r = rig.run("--dry-run", "codex")
    assert r.returncode == 0, r.stderr
    assert "origin/main tooling is running" in r.stderr
    staged = rig.data_root / "deploy" / "bin" / "deploy.sh"
    assert MARKER in staged.read_text()
    assert (rig.data_root / "deploy" / "bin" / "wait-healthy.sh").exists()
    assert f"target {rig.main}" in r.stderr
    # One history line per run, written by the staged copy.
    assert len(rig.history.read_text().splitlines()) == 1


def test_a_corrupt_history_line_is_skipped_and_the_pin_is_followed(rig: Rig) -> None:
    pinned = {"mode": "deploy", "sha": rig.old, "data_sha": "", "pinned": True}
    rig.history.write_text(
        json.dumps({**pinned, "services": "all", "result": "ok", "exit": 0})
        + '\n{not json, a torn write\n42\n["not an object"]\n'
        + json.dumps({**pinned, "services": ["codex"], "result": "failed", "exit": 7})
        + "\n"
    )
    r = rig.run("--dry-run", "codex")
    assert r.returncode == 0, r.stderr
    assert f"pinned at {rig.old[:12]}" in r.stderr
    assert f"target {rig.old}" in r.stderr
    assert rig.last_record()["pinned"] is True
    # An explicit --sha origin/main clears the pin.
    r = rig.run("--dry-run", "--sha", "origin/main", "codex")
    assert r.returncode == 0, r.stderr
    assert f"target {rig.main}" in r.stderr
    assert rig.last_record()["pinned"] is False


@pytest.mark.parametrize(("exit_code", "want"), [(7, 11), (10, 11), (3, 0)])
def test_skip_failed_skips_only_a_failed_build_at_the_same_target(
    rig: Rig, exit_code: int, want: int
) -> None:
    rig.history.write_text(
        json.dumps(
            {
                "mode": "deploy",
                "sha": rig.main,
                "data_sha": "",
                "services": ["codex"],
                "result": "failed",
                "exit": exit_code,
            }
        )
        + "\n"
    )
    r = rig.run("--dry-run", "--skip-failed", "codex")
    assert r.returncode == want, r.stderr
    if want == 11:
        assert "already failed" in r.stderr
        assert rig.last_record()["result"] == "skipped"
        # A skip does not mask the failure: the next run still skips.
        assert rig.run("--dry-run", "--skip-failed", "codex").returncode == 11
    # Other services, or no --skip-failed, still deploy.
    assert rig.run("--dry-run", "--skip-failed", "menhir").returncode == 0
    assert rig.run("--dry-run", "codex").returncode == 0
