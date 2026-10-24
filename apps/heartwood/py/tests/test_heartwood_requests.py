"""The 0036 request protocol + host runner (D36-2, D36-3) — no recipe, no LLM, no network.

The command runner is injected: it writes what ``just heartwood-agent`` would print into
the log (``RUN_DIR=`` + the ``committed`` line) and returns an exit code.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_heartwood import requests as rq
from astra_heartwood.agent import cli

TOOLS = {k: f"/opt/{k}/bin/{k}" for k in ("node", "deno", "git", "docker", "uv", "just")}


@pytest.fixture
def root(tmp_path: Path) -> Path:
    return tmp_path / "requests"


@pytest.fixture
def ledger_path(tmp_path: Path) -> Path:
    path = tmp_path / "agent-runs.jsonl"
    path.write_text(json.dumps({"date": "2026-10-19", "run_id": "old"}) + "\n", encoding="utf-8")
    return path


def fake_run(tmp_path: Path, code: int, *, calls: list[list[str]] | None = None):
    """A runner that leaves a summary.json + the recipe's machine lines, exits ``code``."""

    def runner(argv: list[str], env: dict[str, str], log_path: Path) -> int:
        if calls is not None:
            calls.append(argv)
        date = argv[2]
        run_dir = tmp_path / "runs" / date
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "summary.json").write_text(
            json.dumps({"run_id": "R1", "status": "ok", "cost_usd": 0.31, "counts": {"created": 2}})
        )
        lines = [f"RUN_DIR={run_dir}"]
        if code == 0:
            lines.append("heartwood-agent: committed abc1234 feat(akasha): heartwood agent x")
        log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        assert "/opt/node/bin" in env["PATH"].split(":")
        return code

    return runner


def drain(root: Path, tmp_path: Path, ledger_path: Path, **kw):
    kw.setdefault("tools", TOOLS)
    kw.setdefault("backfill_lock", tmp_path / "backfill.lock")
    return rq.drain_requests(root, ledger_path=ledger_path, **kw)


# ── protocol ──
def test_file_request_replaces_old_result_and_round_trips(root: Path) -> None:
    old = rq.file_request(root, "2026-10-26")
    rq.write_result(
        root,
        rq.Result(
            request_id=old.request_id,
            date="2026-10-26",
            outcome="published",
            exit_code=0,
            meaning="ok",
            started_at="t",
            finished_at="t",
        ),
    )
    assert rq.read_result(root, "2026-10-26", old.request_id) is not None
    new = rq.file_request(root, "2026-10-26", dagster_run_id="run-9")
    assert new.request_id != old.request_id
    assert not rq.result_path(root, "2026-10-26").exists()
    raw = json.loads(rq.request_path(root, "2026-10-26").read_text())
    assert raw["schema"] == 1 and raw["dagster_run_id"] == "run-9"
    assert [r.request_id for r in rq.pending(root)] == [new.request_id]


def test_pending_skips_matching_results_ignores_tmp_and_sorts_by_date(root: Path) -> None:
    a = rq.file_request(root, "2026-10-5")
    b = rq.file_request(root, "2025-12-30")
    c = rq.file_request(root, "2026-9-17")
    (root / "2026-1-1.request.json.tmp").write_text("{half")
    rq.write_result(
        root,
        rq.Result(
            request_id=c.request_id,
            date=c.date,
            outcome="failed",
            exit_code=1,
            meaning="run failed",
            started_at="t",
            finished_at="t",
        ),
    )
    assert [r.date for r in rq.pending(root)] == [b.date, a.date]


def test_meanings_and_next_steps() -> None:
    assert rq.meaning(2) == "incomplete (iteration cap)"
    assert rq.meaning(99) == "unexpected exit"
    assert "_heartwood-push-deploy" in rq.next_step(9, "d") and "do NOT" in rq.next_step(8, "d")
    assert "just heartwood-agent 2026-1-1" in rq.next_step(1, "2026-1-1")


def test_child_env_prepends_tool_dirs_once() -> None:
    env = rq.child_env({"a": "/x/bin/a", "b": "/x/bin/b", "c": None}, {"PATH": "/usr/bin"})
    assert env["PATH"] == "/x/bin:/usr/bin"


# ── runner ──
def test_runs_pending_oldest_first_and_records_results(
    root: Path, tmp_path: Path, ledger_path: Path
) -> None:
    rq.file_request(root, "2026-11-2")
    rq.file_request(root, "2026-10-26")
    calls: list[list[str]] = []
    report = drain(root, tmp_path, ledger_path, runner=fake_run(tmp_path, 0, calls=calls))
    assert [c[2] for c in calls] == ["2026-10-26", "2026-11-2"]
    # unattended: --yes answers heartwood-agent's PAID + LIVE confirmation
    assert calls[0] == ["/opt/just/bin/just", "heartwood-agent", "2026-10-26", "--yes"]
    res = report.results[0]
    assert (res.outcome, res.exit_code, res.commit, res.cost_usd) == (
        "published",
        0,
        "abc1234",
        0.31,
    )
    assert res.run_id == "R1" and res.counts == {"created": 2} and res.log
    assert rq.pending(root) == []


def test_failure_records_meaning(root: Path, tmp_path: Path, ledger_path: Path) -> None:
    req = rq.file_request(root, "2026-10-26")
    drain(root, tmp_path, ledger_path, runner=fake_run(tmp_path, 2))
    res = rq.read_result(root, "2026-10-26", req.request_id)
    assert res is not None and res.outcome == "failed" and res.exit_code == 2
    assert res.meaning == "incomplete (iteration cap)" and res.commit is None


def test_already_published_runs_nothing(root: Path, tmp_path: Path, ledger_path: Path) -> None:
    rq.file_request(root, "2026-10-19")
    calls: list[list[str]] = []
    report = drain(root, tmp_path, ledger_path, runner=fake_run(tmp_path, 0, calls=calls))
    assert calls == [] and report.results[0].outcome == "already-published"


def test_preflight_miss_fails_every_request_and_runs_nothing(
    root: Path, tmp_path: Path, ledger_path: Path
) -> None:
    rq.file_request(root, "2026-10-26")
    rq.file_request(root, "2026-11-2")
    calls: list[list[str]] = []
    tools = {**TOOLS, "node": None}
    report = drain(
        root, tmp_path, ledger_path, tools=tools, runner=fake_run(tmp_path, 0, calls=calls)
    )
    assert calls == []
    assert [(r.exit_code, r.meaning) for r in report.results] == [
        (-1, "preflight: missing tool: node")
    ] * 2


def test_backfill_lock_checked_before_each_request(
    root: Path, tmp_path: Path, ledger_path: Path
) -> None:
    rq.file_request(root, "2026-10-26")
    rq.file_request(root, "2026-11-2")
    lock = tmp_path / "backfill.lock"
    inner = fake_run(tmp_path, 0)

    def runner(argv: list[str], env: dict[str, str], log_path: Path) -> int:
        lock.touch()  # the backfill starts while the first session runs
        return inner(argv, env, log_path)

    report = drain(root, tmp_path, ledger_path, runner=runner, backfill_lock=lock)
    assert [r.date for r in report.results] == ["2026-10-26"]
    assert report.stopped_for_backfill and [r.date for r in rq.pending(root)] == ["2026-11-2"]


def test_request_filed_mid_run_is_picked_up_by_the_rescan(
    root: Path, tmp_path: Path, ledger_path: Path
) -> None:
    rq.file_request(root, "2026-10-26")
    inner = fake_run(tmp_path, 0)

    def runner(argv: list[str], env: dict[str, str], log_path: Path) -> int:
        if argv[2] == "2026-10-26":
            rq.file_request(root, "2026-11-2")
        return inner(argv, env, log_path)

    report = drain(root, tmp_path, ledger_path, runner=runner)
    assert [r.date for r in report.results] == ["2026-10-26", "2026-11-2"]


def test_runner_exception_fails_that_request_and_continues(
    root: Path, tmp_path: Path, ledger_path: Path
) -> None:
    rq.file_request(root, "2026-10-26")
    rq.file_request(root, "2026-11-2")
    inner = fake_run(tmp_path, 0)

    def runner(argv: list[str], env: dict[str, str], log_path: Path) -> int:
        if argv[2] == "2026-10-26":
            raise OSError("boom")
        return inner(argv, env, log_path)

    report = drain(root, tmp_path, ledger_path, runner=runner)
    assert [(r.date, r.exit_code) for r in report.results] == [("2026-10-26", -2), ("2026-11-2", 0)]
    assert "OSError: boom" in report.results[0].meaning


def test_cli_drain_on_a_published_date_spends_nothing(
    root: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    rq.file_request(root, "2025-8-28")  # published in the real ledger
    monkeypatch.setattr(rq, "resolve_tools", lambda: TOOLS)
    monkeypatch.setattr(rq, "BACKFILL_LOCK", tmp_path / "none.lock")
    assert cli.cli(["drain-requests", "--requests", str(root)]) == 0
    out = capsys.readouterr().out
    assert "2025-8-28: already-published" in out
    assert "preflight ok: node=/opt/node/bin/node" in out
