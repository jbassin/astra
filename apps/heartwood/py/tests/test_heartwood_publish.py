"""The S4 publish CLI (0033 §5): publish-sync, ledger-append/-revert, budget-check,
sessions ledger skip, commit-message wrapping, unresolved-delta.

Hermetic: drives ``cli.cli()`` (no telemetry) against fixture corpora, run dirs and
ledgers under tmp_path. The live corpus and the committed ledger are never touched.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_heartwood.agent import cli as cli_mod
from astra_heartwood.agent import ledger
from astra_heartwood.agent.cli import (
    EXIT_BUDGET,
    EXIT_CONFLICT,
    EXIT_OK,
    EXIT_REFUSED,
    cli,
    pending_sessions,
)
from astra_heartwood.agent.publish import BODY_WIDTH, commit_message, unresolved_delta, wrap_text
from astra_heartwood.agent.workspace import Workspace, hash_tree

PAGES = {
    "index": "---\ndate: 2026-06-05T16:40:21-04:00\n---\n\nHome. [[Bestiary/Auger]]\n",
    "Bestiary/Auger": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nAn auger.\n",
    "Bestiary/Ugathal": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nUgathal.\n",
}


def make_corpus(root: Path) -> Path:
    for key, text in PAGES.items():
        f = root / f"{key}.vellum"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    return root


def write_summary(run_dir: Path, *, status: str = "ok", cost: float | None = 0.5, **extra) -> None:
    s = {
        "status": status,
        "date": "2025-8-28",
        "campaign": "through-a-song-darkly",
        "run_id": run_dir.name,
        "model": "openrouter/deepseek/deepseek-v4.1-flash",
        "sub_model": "openrouter/z-ai/glm-5.3",
        "cost_usd": cost,
        "counts": {"created": 1, "updated": 1, "moved": 0, "deleted": 1},
        "iterations": 9,
        "tokens": 45678,
        "changelog": "- Created Bestiary/Grell (L2).",
    }
    s.update(extra)
    (run_dir / "summary.json").write_text(json.dumps(s), encoding="utf-8")


@pytest.fixture
def live(tmp_path: Path) -> Path:
    return make_corpus(tmp_path / "live")


@pytest.fixture
def run_dir(tmp_path: Path, live: Path) -> Path:
    """An ``ok`` run that created, updated and deleted one page each."""
    ws = Workspace.create(
        "2025-8-28", content_dir=live, artifacts_root=tmp_path / "art", run_id="20261010T000000Z"
    )
    ws.write("Bestiary/Grell", "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nGrell.\n")
    ws.write("Bestiary/Auger", "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nAugers!\n")
    ws.delete("Bestiary/Ugathal")
    write_summary(ws.run_dir)
    return ws.run_dir


# ── publish-sync ──
def test_publish_sync_applies_the_changeset(
    run_dir: Path, live: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli(["publish-sync", str(run_dir), "--content-dir", str(live)]) == EXIT_OK
    assert hash_tree(live) == hash_tree(run_dir / "content")
    assert not (live / "Bestiary/Ugathal.vellum").exists()
    assert "created 1, updated 1, moved 0, deleted 1" in capsys.readouterr().out


def test_publish_sync_conflict_exits_3_and_writes_nothing(
    run_dir: Path, live: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (live / "Bestiary/Auger.vellum").write_text("edited live meanwhile\n", encoding="utf-8")
    before = hash_tree(live)
    assert cli(["publish-sync", str(run_dir), "--content-dir", str(live)]) == EXIT_CONFLICT
    assert hash_tree(live) == before
    assert "Bestiary/Auger: edited live" in capsys.readouterr().err


@pytest.mark.parametrize("status", ["incomplete", "failed"])
def test_publish_sync_refuses_non_ok_run(run_dir: Path, live: Path, status: str) -> None:
    write_summary(run_dir, status=status)
    before = hash_tree(live)
    assert cli(["publish-sync", str(run_dir), "--content-dir", str(live)]) == EXIT_REFUSED
    assert hash_tree(live) == before


def test_publish_sync_refuses_dir_without_summary(run_dir: Path, live: Path) -> None:
    (run_dir / "summary.json").unlink()
    assert cli(["publish-sync", str(run_dir), "--content-dir", str(live)]) == EXIT_REFUSED


# ── ledger subcommands ──
def test_ledger_append_and_revert_cli(run_dir: Path, tmp_path: Path) -> None:
    led = tmp_path / "agent-runs.jsonl"
    assert cli(["ledger-revert", "2025-8-28", "--check", "--ledger", str(led)]) == EXIT_REFUSED
    assert cli(["ledger-append", str(run_dir), "--ledger", str(led)]) == EXIT_OK
    assert cli(["ledger-append", str(run_dir), "--ledger", str(led)]) == EXIT_REFUSED  # double
    assert cli(["ledger-revert", "2025-8-28", "--check", "--ledger", str(led)]) == EXIT_OK
    assert len(ledger.entries(led)) == 1  # --check writes nothing
    assert cli(["ledger-revert", "2025-8-28", "--ledger", str(led)]) == EXIT_OK
    assert cli(["ledger-revert", "2025-8-28", "--ledger", str(led)]) == EXIT_REFUSED
    assert [e.get("reverted", False) for e in ledger.entries(led)] == [False, True]


def test_ledger_append_refuses_non_ok(run_dir: Path, tmp_path: Path) -> None:
    write_summary(run_dir, status="incomplete")
    led = tmp_path / "agent-runs.jsonl"
    assert cli(["ledger-append", str(run_dir), "--ledger", str(led)]) == EXIT_REFUSED
    assert not led.exists()


# ── budget-check ──
def test_budget_check(run_dir: Path, tmp_path: Path) -> None:
    led = tmp_path / "agent-runs.jsonl"
    assert cli(["budget-check", "--budget", "1", "--ledger", str(led)]) == EXIT_OK
    ledger.append_publish(run_dir, led)  # cost 0.5
    assert cli(["budget-check", "--budget", "1", "--ledger", str(led)]) == EXIT_OK
    assert cli(["budget-check", "--budget", "0.5", "--ledger", str(led)]) == EXIT_BUDGET


def test_budget_check_stops_on_unknown_cost(run_dir: Path, tmp_path: Path) -> None:
    write_summary(run_dir, cost=None)
    led = tmp_path / "agent-runs.jsonl"
    ledger.append_publish(run_dir, led)
    assert cli(["budget-check", "--budget", "1000", "--ledger", str(led)]) == EXIT_BUDGET


# ── sessions ──
def test_pending_sessions_skips_published_dates(tmp_path: Path) -> None:
    led = tmp_path / "agent-runs.jsonl"
    dates = ["2025-8-28", "2025-9-8", "2025-10-20", "2026-1-5"]
    for date, run_id in [("2025-8-28", "A"), ("2025-9-8", "B")]:
        d = tmp_path / run_id
        d.mkdir()
        write_summary(d, date=date)
        ledger.append_publish(d, led)
    ledger.append_revert("2025-9-8", led)
    assert pending_sessions(ledger_path=led, dates=dates) == ["2025-9-8", "2025-10-20", "2026-1-5"]
    # --from is a date_key floor (2025-10-20 sorts after 2025-9-8), inclusive
    assert pending_sessions("2025-10-20", ledger_path=led, dates=dates) == [
        "2025-10-20",
        "2026-1-5",
    ]


def test_sessions_cli_prints_pending(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli_mod, "ingestible_dates", lambda: ["2025-8-28", "2025-9-8"])
    led = tmp_path / "agent-runs.jsonl"
    d = tmp_path / "A"
    d.mkdir()
    write_summary(d)
    ledger.append_publish(d, led)
    assert cli(["sessions", "--ledger", str(led)]) == EXIT_OK
    assert capsys.readouterr().out.splitlines() == ["2025-9-8"]


# ── commit message ──
def test_commit_message_shape(run_dir: Path) -> None:
    msg = commit_message(run_dir)
    lines = msg.splitlines()
    assert lines[0] == "feat(akasha): heartwood agent 2025-8-28"
    assert lines[1] == ""
    assert "Pages: 1 created, 1 updated, 0 moved, 1 deleted" in lines
    assert (
        "Model: openrouter/deepseek/deepseek-v4.1-flash (sub-model: openrouter/z-ai/glm-5.3)"
        in lines
    )
    assert "Cost: $0.5000 (9 iterations, 45,678 tokens)" in lines
    assert lines[lines.index("Changelog:") + 1] == "- Created Bestiary/Grell (L2)."


def test_commit_message_unknown_cost_and_empty_changelog(run_dir: Path) -> None:
    write_summary(run_dir, cost=None, changelog="  ")
    msg = commit_message(run_dir)
    assert "Cost: unknown (9 iterations, 45,678 tokens)" in msg
    assert msg.rstrip().endswith("(the agent wrote no changelog)")


def test_commit_body_wraps_at_100_with_hanging_bullets(run_dir: Path) -> None:
    long_bullet = "- " + " ".join(["Updated Geography/Hallia/index with the canal district"] * 6)
    numbered = "12. " + "word " * 60
    unbreakable = "- " + "x" * 250
    changelog = "\n".join(["## Pages", long_bullet, "  - " + "nested " * 40, numbered, unbreakable])
    write_summary(run_dir, changelog=changelog)
    lines = commit_message(run_dir).splitlines()
    assert all(len(line) <= BODY_WIDTH for line in lines), max(lines, key=len)
    body = lines[lines.index("Changelog:") + 1 :]
    assert body[0] == "## Pages"
    first = body.index(next(line for line in body if line.startswith("- Updated")))
    assert body[first + 1].startswith("  ") and not body[first + 1].startswith("  -")
    nested = next(i for i, line in enumerate(body) if line.startswith("  - nested"))
    assert body[nested + 1].startswith("    nested")
    num = next(i for i, line in enumerate(body) if line.startswith("12. "))
    assert body[num + 1].startswith("    word")
    # no words lost or reordered by wrapping
    assert " ".join(wrap_text(long_bullet).split()) == " ".join(long_bullet.split())


def test_commit_message_cli(run_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli(["commit-message", str(run_dir)]) == EXIT_OK
    assert capsys.readouterr().out == commit_message(run_dir)


# ── unresolved delta ──
def test_unresolved_delta(tmp_path: Path) -> None:
    def snap(name: str, pairs: list[tuple[str, str]]) -> Path:
        p = tmp_path / name
        unresolved = [{"source": s, "target": t} for s, t in pairs]
        p.write_text(json.dumps({"pages": [], "edges": [], "unresolved": unresolved}))
        return p

    before = snap("a.json", [("A", "X"), ("B", "Y")])
    after = snap("b.json", [("B", "Y"), ("C", "Z"), ("D", "W")])
    report = unresolved_delta(before, after)
    assert report.splitlines()[0] == "unresolved links: 2 -> 3 (+1)"
    assert "  new: C -> [[Z]]" in report and "  new: D -> [[W]]" in report
    assert "  fixed: A -> [[X]]" in report
