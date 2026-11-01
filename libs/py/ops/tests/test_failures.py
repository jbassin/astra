"""Steps that fail outside the child (a seed dir that can't be made, a deploy.sh that can't
start), Ctrl-C, and the import guard: each behaves as the bash recipes did."""

from __future__ import annotations

import fcntl
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest
from astra_ops import boot, context, publish
from astra_ops.context import Runner
from astra_ops.publish import AKASHA_SEED_SH
from astra_ops.testing import Call, Step, clone, make_ctx, push_steps, uv


def linguist_config(repo: str) -> dict[str, str]:
    return {
        "data.content-root": repo,
        "data.linguist-transcripts": f"{repo}/linguist/transcripts",
        "data.linguist-data": f"{repo}/linguist/data",
        "data.linguist-timeline": f"{repo}/linguist/timeline",
        "data.mouthpiece-snapshot": f"{repo}/mouthpiece/snapshot",
        "data.akasha-content": f"{repo}/akasha/content",
        "data.akasha-snapshot": f"{repo}/akasha/snapshot",
    }


def head_with_new_files(repo: str) -> list[Step]:
    """linguist-commit up to the push: one new file committed, no snapshot change."""
    g = ["git", "-C", repo]
    lp = [f"{repo}/linguist/transcripts", f"{repo}/linguist/data", f"{repo}/linguist/timeline"]
    snap = f"{repo}/mouthpiece/snapshot/episodes-index.json"
    names = [*g, "diff", "--cached", "--name-only", "--no-renames"]
    return [
        ("lock", "git-publish", "ex"),
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
        Call([*g, "add", *lp]),
        Call([*g, "diff", "--cached", "--quiet", "--", *lp], rc=1),
        Call([*names, "--", *lp], stdout="a\n"),
        Call([*names, "-z", "--", *lp], stdout=b"a\0"),
        Call(
            [
                *g,
                "commit",
                "--no-verify",
                "-q",
                "--only",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
                "-m",
                "chore(content): add 1 linguist transcript/data file(s)",
                "-m",
                "Pipeline-generated source-of-record, committed by the linguist-commit timer.",
            ]
        ),
        Call(uv("python", "-m", "astra_mouthpiece.publish")),
        Call([*g, "add", snap]),
        Call([*g, "diff", "--cached", "--quiet", "--", snap]),
    ]


def test_seed_dir_failure_is_reported_and_the_redeploy_still_runs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """bash: `mkdir -p` failed → akasha-seed exited 1 → "akasha-seed FAILED", deploy anyway."""
    repo = clone(tmp_path)
    (tmp_path / "state" / "audio").write_text("a file where the audio dir should be")
    deploy = Call(
        [f"{tmp_path}/repo/deploy/deploy.sh", "--skip-failed", "akasha-frontend"],
        env={"ASTRA_DATA_ROOT": f"{tmp_path}/state", "HOST_TOOLING_LOCK_TIMEOUT": "0"},
    )
    steps = [*head_with_new_files(repo), *push_steps(repo), deploy, ("unlock", "git-publish")]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.linguist_commit(ctx) == 0
    r.assert_done()
    err = capsys.readouterr().err
    assert "mkdir: cannot create directory" in err
    assert "linguist-commit: akasha-seed FAILED (rerun: just akasha-seed)" in err


def test_missing_deploy_sh_is_a_failed_redeploy_not_a_crash(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """deploy.sh absent: exit 127 (bash's code), "redeploy FAILED", push failure still
    reported, final exit 1 — the same as the bash recipe."""
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    audio = f"{tmp_path}/state/audio/akasha"
    seed = Call(
        ["docker", "run", "--rm", "-v", f"{audio}:/audio", "-v",
         f"{tmp_path}/state/scribe/data/saved:/live:ro", "alpine", "sh", "-c", AKASHA_SEED_SH,
         "sh", audio]
    )  # fmt: skip
    steps: list[Step] = [
        *head_with_new_files(repo),
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
        Call([*g, "fetch", "-q", "origin"], rc=128),
        seed,
        ("unlock", "git-publish"),
    ]
    deploy_sh = f"{tmp_path}/repo/deploy/deploy.sh"
    ctx, r = make_ctx(
        tmp_path, steps, config=linguist_config(repo), passthrough=frozenset({deploy_sh})
    )
    assert publish.linguist_commit(ctx) == 1
    r.assert_done()
    err = capsys.readouterr().err
    assert "akasha-frontend redeploy FAILED (exit 127" in err
    assert "astra-data push FAILED (exit 8)" in err


def test_runner_maps_start_failures_to_bash_codes(tmp_path: Path) -> None:
    assert Runner().run([str(tmp_path / "nope")]).returncode == 127
    script = tmp_path / "not-executable"
    script.write_text("#!/bin/sh\n")
    assert Runner().run([str(script)]).returncode == 126
    blocked = tmp_path / "dir" / "out"
    assert Runner().run(["true"], out="file", out_path=blocked).returncode == 1


def _child(code: str) -> subprocess.Popen[bytes]:
    proc = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE)
    assert proc.stdout is not None
    proc.stdout.readline()  # wait until its handler is installed
    return proc


def test_ctrl_c_lets_the_child_clean_up(tmp_path: Path) -> None:
    done = tmp_path / "cleaned"
    proc = _child(
        "import signal, sys, time\n"
        "def h(*_):\n"
        "    time.sleep(0.5)\n"
        f"    open({str(done)!r}, 'w').close()\n"
        "    sys.exit(130)\n"
        "signal.signal(signal.SIGINT, h)\n"
        "print('ready', flush=True)\n"
        "time.sleep(60)\n"
    )
    context._interrupted(proc)
    assert proc.returncode == 130
    assert done.exists()  # not SIGKILLed after 0.25 s, as subprocess.run would


def test_ctrl_c_kills_a_child_that_ignores_sigint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(context, "INTERRUPT_GRACE_S", 0.5)
    proc = _child(
        "import signal, time\n"
        "signal.signal(signal.SIGINT, signal.SIG_IGN)\n"
        "print('ready', flush=True)\n"
        "time.sleep(60)\n"
    )
    started = time.monotonic()
    context._interrupted(proc)
    assert proc.returncode == -signal.SIGKILL
    assert time.monotonic() - started < 10


# --- the import guard (boot) -----------------------------------------------------------------


def test_boot_reads_the_data_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRA_DATA_ROOT", "")
    assert boot.data_root_from(["linguist-commit", "--data-root", "/x"]) == Path(
        "/ruby/data/astra-state"
    )
    assert boot.data_root_from(["--uv", "u", "--data-root", "/x", "akasha-seed"]) == Path("/x")
    assert boot.data_root_from(["--data-root=/y", "akasha-seed"]) == Path("/y")
    monkeypatch.setenv("ASTRA_DATA_ROOT", "/env")
    assert boot.data_root_from(["akasha-seed"]) == Path("/env")


def test_boot_waits_for_a_deploys_exclusive_lock(tmp_path: Path) -> None:
    lock = tmp_path / "locks" / "host-tooling.lock"
    lock.parent.mkdir()
    with lock.open("w") as held:
        fcntl.flock(held.fileno(), fcntl.LOCK_EX)  # deploy.sh syncing the venv
        assert boot.wait_for_tooling(tmp_path, wait_s=0.3) is None
    fd = boot.wait_for_tooling(tmp_path, wait_s=0.3)
    assert fd is not None
    with lock.open("w") as other, pytest.raises(BlockingIOError):
        fcntl.flock(other.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)  # shared: keeps deploy out
    os.close(fd)
