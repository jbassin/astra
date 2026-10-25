"""heartwood-backfill, its loop, the reset and the request runner replay the old recipes'
children in order. The loop's ``just heartwood-agent <date> --no-push --yes`` and
``just _heartwood-push-deploy --yes`` hops now run in-process; the agent is faked here (its own
sequence is test_heartwood's) except in one test that runs the real one to its first refusal."""

from __future__ import annotations

import os
import signal
from pathlib import Path

import pytest
from astra_ops import backfill, cli
from astra_ops.context import Ctx
from astra_ops.testing import Call, Scripted, Step, clone, deploy_call, make_ctx, push_steps, uv


def sc(*args: str, rc: int = 0, stdout: str = "") -> Call:
    return Call(["systemctl", "--user", *args], rc=rc, stdout=stdout)


def hw(*args: str, rc: int = 0, stdout: str = "") -> Call:
    return Call(uv("astra-heartwood-agent", *args), rc=rc, stdout=stdout)


def lock_file(tmp: Path) -> Path:
    return tmp / "state" / "heartwood" / "backfill.lock"


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """Replace the in-process heartwood-agent with a step ``("agent", date)`` and an exit code
    per date (default 0)."""
    codes: dict[str, int] = {}

    def agent(ctx: Ctx, date: str) -> int:
        ctx.runner.note(("agent", date))
        return codes.get(date, 0)

    monkeypatch.setattr(backfill, "_agent_no_push", agent)
    return codes


def disarm(*, busy: int = 0) -> list[Step]:
    steps: list[Step] = [
        sc("stop", "linguist-commit.timer", "linguist-commit.path"),
        sc("stop", "heartwood-request.timer", "heartwood-request.path"),
    ]
    for _ in range(busy):
        steps += [
            sc("is-active", "linguist-commit.service", stdout="activating\n"),
            ("sleep", "15"),
        ]
    steps += [
        sc("is-active", "linguist-commit.service", rc=3, stdout="inactive\n"),
        sc("is-active", "heartwood-request.service", rc=3, stdout="inactive\n"),
    ]
    return steps


def rearm(*, linguist_rc: int = 0, requests_rc: int = 0) -> list[Step]:
    steps: list[Step] = [
        sc("start", "linguist-commit.timer", "linguist-commit.path", rc=linguist_rc),
        sc("start", "heartwood-request.timer", "heartwood-request.path", rc=requests_rc),
    ]
    if requests_rc == 0:
        steps.append(sc("start", "--no-block", "heartwood-request.service"))
    return steps


def rev_list(repo: str, ahead: str = "") -> Call:
    return Call(["git", "-C", repo, "rev-list", "origin/main..HEAD"], stdout=ahead)


# --- the launcher ----------------------------------------------------------------------------


def test_launch_runs_the_deploy_checkouts_loop_detached_with_yes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("PATH", "/usr/bin")
    monkeypatch.setenv("SSH_AUTH_SOCK", "/run/agent.sock")
    log = f"{tmp_path}/state/heartwood/backfill.log"
    steps: list[Step] = [
        sc("is-active", "--quiet", "heartwood-backfill.service", rc=3),
        sc("reset-failed", "heartwood-backfill.service"),
        Call(
            [
                "systemd-run", "--user", "--unit=heartwood-backfill", "--collect",
                f"--working-directory={tmp_path}/deploy",
                f"--setenv=PATH={tmp_path}/home/.deno/bin:/usr/bin",
                f"--setenv=HOME={tmp_path}/home",
                "--setenv=SSH_AUTH_SOCK=/run/agent.sock",
                "-p", f"StandardOutput=append:{log}", "-p", f"StandardError=append:{log}",
                "/just", "-f", f"{tmp_path}/deploy/justfile", "_heartwood-backfill-loop",
                "2026-1-2", "--yes",
            ]
        ),
    ]  # fmt: skip
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "heartwood-backfill", ["2026-1-2", "--yes"]) == 0
    r.assert_done()
    assert f"launched detached — tail -f {log}" in capsys.readouterr().out


def test_launch_without_from_passes_an_empty_first_date(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SSH_AUTH_SOCK", raising=False)
    ctx, r = make_ctx(tmp_path, [])
    seen: list[list[str]] = []

    def run(argv, **_kw):
        seen.append(list(argv))
        from astra_ops.context import Done

        return Done(3 if "is-active" in argv else 0)

    r.run = run  # ty: ignore[invalid-assignment]
    assert backfill.heartwood_backfill(ctx, "") == 0
    launch = seen[-1]
    assert launch[-2:] == ["", "--yes"]
    assert not any(a.startswith("--setenv=SSH_AUTH_SOCK") for a in launch)


def test_launch_refuses_while_running(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    ctx, r = make_ctx(tmp_path, [sc("is-active", "--quiet", "heartwood-backfill.service")])
    assert backfill.heartwood_backfill(ctx, "") == 1
    r.assert_done()
    assert "already running" in capsys.readouterr().err


def test_launch_and_loop_ask_first(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [], tty=False)
    assert cli.dispatch(ctx, "heartwood-backfill", []) == 64
    assert cli.dispatch(ctx, "heartwood-backfill-loop", ["2026-1-2"]) == 64
    assert cli.dispatch(ctx, "heartwood-backfill", ["a", "b"]) == 64
    assert cli.dispatch(ctx, "heartwood-backfill", ["--from", "--yes"]) == 64
    r.assert_done()


# --- the loop --------------------------------------------------------------------------------


def test_loop_publishes_every_pending_date_then_pushes_once(
    tmp_path: Path, fake_agent: dict[str, int], capsys: pytest.CaptureFixture[str]
) -> None:
    repo = clone(tmp_path)
    lock = lock_file(tmp_path)

    def lock_held() -> None:
        assert lock.exists()

    steps: list[Step] = [
        *disarm(busy=2),
        Call(uv("astra-heartwood-agent", "sessions"), stdout="d1\nd2\n", effect=lock_held),
        hw("budget-check"),
        ("agent", "d1"),
        hw("budget-check"),
        ("agent", "d2"),
        rev_list(repo, "abc\n"),
        *push_steps(repo),
        deploy_call(tmp_path, "akasha-frontend"),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert cli.dispatch(ctx, "heartwood-backfill-loop", ["", "--yes"]) == 0
    r.assert_done()
    assert not lock.exists()
    out = capsys.readouterr().out
    assert out.startswith("=== heartwood backfill start T (from: the first session)\n")
    assert "heartwood-backfill: waiting for linguist-commit.service (activating)…" in out
    assert "heartwood-backfill: 2 pending session(s): d1 d2\n--- T d1\n--- T d2\n" in out
    assert "published 2 session(s) this run" in out
    assert out.endswith(
        "heartwood-backfill: complete\nheartwood-backfill: linguist-commit timer + path "
        "re-armed\n=== heartwood backfill end T\n"
    )


def test_loop_stops_at_the_budget_and_prints_the_resume_date(
    tmp_path: Path, fake_agent: dict[str, int], capsys: pytest.CaptureFixture[str]
) -> None:
    repo = clone(tmp_path)
    steps: list[Step] = [
        *disarm(),
        Call(uv("astra-heartwood-agent", "sessions", "--from", "d0"), stdout="d1\n"),
        hw("budget-check", rc=1),
        rev_list(repo),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert backfill.backfill_loop(ctx, "d0") == 1
    r.assert_done()
    out = capsys.readouterr().out
    assert "(from: d0)" in out
    assert "heartwood-backfill: STOPPED — budget\n" in out
    assert "resume with: just heartwood-backfill d1\n" in out


def test_loop_stops_on_an_agent_failure_and_still_pushes_what_committed(
    tmp_path: Path, fake_agent: dict[str, int], capsys: pytest.CaptureFixture[str]
) -> None:
    fake_agent["d2"] = 7
    repo = clone(tmp_path)
    steps: list[Step] = [
        *disarm(),
        hw("sessions", stdout="d1\nd2\nd3\n"),
        hw("budget-check"),
        ("agent", "d1"),
        hw("budget-check"),
        ("agent", "d2"),
        rev_list(repo, "abc\n"),
        *push_steps(repo),
        deploy_call(tmp_path, "akasha-frontend", rc=1),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert backfill.backfill_loop(ctx, "") == 1
    r.assert_done()
    io = capsys.readouterr()
    assert "STOPPED — heartwood-agent d2 exited 7 (1 failed" in io.out
    assert "resume with: just heartwood-backfill d2" in io.out
    assert "push/redeploy FAILED — rerun: just _heartwood-push-deploy" in io.err


def test_an_agent_crash_still_pushes_what_committed_then_rearms(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def agent(ctx: Ctx, date: str) -> int:
        ctx.runner.note(("agent", date))
        if date == "d2":
            raise RuntimeError("boom")
        return 0

    monkeypatch.setattr(backfill, "_agent_no_push", agent)
    repo = clone(tmp_path)
    steps: list[Step] = [
        *disarm(),
        hw("sessions", stdout="d1\nd2\n"),
        hw("budget-check"),
        ("agent", "d1"),
        hw("budget-check"),
        ("agent", "d2"),
        rev_list(repo, "abc\n"),
        *push_steps(repo),
        deploy_call(tmp_path, "akasha-frontend"),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    with pytest.raises(RuntimeError, match="boom"):
        backfill.backfill_loop(ctx, "")
    r.assert_done()
    assert not lock_file(tmp_path).exists()
    err = capsys.readouterr().err
    assert "unexpected error after 1 session(s) — pushing what is committed" in err


def test_loop_runs_the_real_agent_in_process(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """No node: the agent refuses (exit 1) right after taking the host-tooling lock."""
    steps: list[Step] = [
        *disarm(),
        hw("sessions", stdout="d1\n"),
        hw("budget-check"),
        ("lock", "host-tooling", "sh"),
        ("unlock", "host-tooling"),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps, node=None)
    ctx.config_reader = lambda _keys: (_ for _ in ()).throw(RuntimeError("no config"))
    assert backfill.backfill_loop(ctx, "") == 1
    r.assert_done()
    io = capsys.readouterr()
    assert "heartwood: node not found" in io.err
    assert "heartwood-agent d1 exited 1" in io.out
    assert "could not read data.content-root — not pushing" in io.err  # never git -C ""


def test_loop_gives_up_on_a_unit_busy_for_30_minutes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    busy: list[Step] = []
    for _ in range(120):
        busy += [sc("is-active", "linguist-commit.service", stdout="active\n"), ("sleep", "15")]
    steps: list[Step] = [
        *disarm()[:2],
        *busy,
        sc("is-active", "linguist-commit.service", stdout="active\n"),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert backfill.backfill_loop(ctx, "") == 1
    r.assert_done()
    assert "linguist-commit.service still active after 30 min — aborting" in capsys.readouterr().err


def test_loop_that_cannot_disarm_still_rearms(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    steps: list[Step] = [
        sc("stop", "linguist-commit.timer", "linguist-commit.path", rc=5),
        *rearm(linguist_rc=1, requests_rc=5),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert backfill.backfill_loop(ctx, "") == 1
    r.assert_done()
    err = capsys.readouterr().err
    assert "could not stop linguist-commit units" in err
    assert "re-arm FAILED — run: just heartwood-backfill-reset" in err
    assert "heartwood-request re-arm skipped" in err
    assert not lock_file(tmp_path).exists()


def test_listing_failure_exits_1(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    steps: list[Step] = [*disarm(), hw("sessions", rc=2), *rearm()]
    ctx, r = make_ctx(tmp_path, steps)
    assert backfill.backfill_loop(ctx, "") == 1
    r.assert_done()
    assert "listing sessions FAILED" in capsys.readouterr().err


def test_sigterm_rearms_and_exits_143(tmp_path: Path) -> None:
    """`systemctl --user stop heartwood-backfill`: the real handler, a real signal."""

    def terminate() -> None:
        os.kill(os.getpid(), signal.SIGTERM)

    steps: list[Step] = [
        *disarm(),
        Call(uv("astra-heartwood-agent", "sessions"), effect=terminate),
        *rearm(),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    before = signal.getsignal(signal.SIGTERM)
    assert backfill.backfill_loop(ctx, "") == 143
    r.assert_done()
    assert signal.getsignal(signal.SIGTERM) is before  # handlers restored
    assert not lock_file(tmp_path).exists()


def test_ctrl_c_also_exits_143(tmp_path: Path) -> None:
    def interrupt() -> None:
        raise KeyboardInterrupt

    stop_requests = [
        "systemctl",
        "--user",
        "stop",
        "heartwood-request.timer",
        "heartwood-request.path",
    ]
    steps: list[Step] = [*disarm()[:1], Call(stop_requests, effect=interrupt), *rearm()]
    ctx, r = make_ctx(tmp_path, steps)
    assert backfill.backfill_loop(ctx, "") == 143
    r.assert_done()


# --- reset -----------------------------------------------------------------------------------


def test_reset_rearms_and_drops_the_lock(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    lock = lock_file(tmp_path)
    lock.parent.mkdir(parents=True)
    lock.touch()
    steps: list[Step] = [
        sc("is-active", "--quiet", "heartwood-backfill.service", rc=3),
        sc("reset-failed", "heartwood-backfill.service"),
        sc("start", "linguist-commit.timer", "linguist-commit.path"),
        sc("start", "heartwood-request.timer", "heartwood-request.path", rc=5),
        sc("is-active", "linguist-commit.timer", stdout="active\n"),
        sc("is-active", "linguist-commit.path", stdout="active\n"),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "heartwood-backfill-reset", []) == 0
    r.assert_done()
    assert not lock.exists()
    io = capsys.readouterr()
    assert "heartwood-request units not installed — skipped" in io.err
    assert io.out == (
        "heartwood-backfill-reset: linguist-commit.timer active, .path active; lock removed\n"
    )


def test_reset_refuses_while_the_backfill_runs(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [sc("is-active", "--quiet", "heartwood-backfill.service")])
    assert backfill.backfill_reset(ctx) == 1
    r.assert_done()


def test_reset_stops_when_linguist_will_not_start(tmp_path: Path) -> None:
    steps: list[Step] = [
        sc("is-active", "--quiet", "heartwood-backfill.service", rc=3),
        sc("reset-failed", "heartwood-backfill.service"),
        sc("start", "linguist-commit.timer", "linguist-commit.path", rc=5),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "heartwood-backfill-reset", []) == 5
    r.assert_done()


# --- the request runner ----------------------------------------------------------------------


def test_requests_hands_the_runner_just_and_uv(tmp_path: Path) -> None:
    steps: list[Step] = [
        Call(
            uv("astra-heartwood-agent", "drain-requests"), rc=2, env={"JUST": "/just", "UV": "/uv"}
        )
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "heartwood-requests", ["--yes"]) == 2
    r.assert_done()


def test_requests_without_yes_refuses_unattended(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [], tty=False)
    assert cli.dispatch(ctx, "heartwood-requests", []) == 64
    r.assert_done()
    assert isinstance(r, Scripted)


def test_the_unit_gets_the_callers_path_without_uvs_venv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VIRTUAL_ENV", "/repo/.venv")
    monkeypatch.setenv("PATH", "/repo/.venv/bin:/usr/local/bin:/usr/bin")
    assert backfill.caller_path() == "/usr/local/bin:/usr/bin"
    monkeypatch.setenv("PATH", "/usr/bin:/repo/.venv/bin")
    assert backfill.caller_path() == "/usr/bin:/repo/.venv/bin"  # only uv's own prefix goes
    monkeypatch.delenv("VIRTUAL_ENV")
    assert backfill.caller_path() == "/usr/bin:/repo/.venv/bin"
