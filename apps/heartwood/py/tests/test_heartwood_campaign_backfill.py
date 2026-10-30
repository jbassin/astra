"""The one-off ``campaigns`` backfill: replay a fixture ledger and run records over a tmp
astra-data root."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_heartwood.agent.campaign_backfill import backfill
from astra_heartwood.agent.campaigns import page_campaigns
from astra_heartwood.agent.workspace import ChangeSet, Move, Workspace


def _page(root: Path, key: str, text: str) -> None:
    f = root / f"{key}.vellum"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(text, encoding="utf-8")


def _record(arts: Path, date: str, run_id: str, cs: ChangeSet) -> None:
    d = arts / date / run_id
    d.mkdir(parents=True)
    (d / "changeset.json").write_text(cs.model_dump_json(), encoding="utf-8")


@pytest.fixture
def world(tmp_path: Path) -> tuple[Path, Path]:
    root, arts = tmp_path / "astra-data", tmp_path / "heartwood"
    content = root / "akasha" / "content"
    for key in ("A/Kept", "A/Moved", "A/Both", "Org/Folder/index", "A/Quiet"):
        _page(content, key, "---\ntags: []\n---\nText.\n")
    _page(content, "A/Hand", "---\ncampaigns: [hand-set]\n---\nText.\n")

    _record(arts, "1", "r1", ChangeSet(created=["A/Kept", "A/Old", "Org/Folder"], updated=[]))
    _record(arts, "2", "r2", ChangeSet(created=["A/Both"], updated=["A/Hand"], deleted=["A/Old"]))
    _record(
        arts,
        "3",
        "r3",
        ChangeSet(updated=["A/Both"], moved=[Move(src="A/Kept", dst="A/Moved", edited=False)]),
    )
    _record(arts, "4", "r4", ChangeSet(created=["A/Kept"]))
    _record(arts, "5", "r5", ChangeSet(updated=["A/Quiet"]))  # reverted below
    # run 6 has no changeset.json: replayed from its journal + baseline
    live = tmp_path / "live6"
    _page(live, "A/Both", "---\n---\nBefore.\n")
    ws = Workspace.create("6", content_dir=live, artifacts_root=arts, run_id="r6")
    ws.write("A/Both", "---\n---\nAfter.\n")
    (arts / "7" / "r7").mkdir(parents=True)  # run 7 left no readable record

    ledger = [
        {"date": "1", "run_id": "r1", "campaign": "song"},
        {"date": "2", "run_id": "r2", "campaign": "spark"},
        {"date": "3", "run_id": "r3", "campaign": "hunt"},
        {"date": "4", "run_id": "r4", "campaign": "hunt"},
        {"date": "5", "run_id": "r5", "campaign": "song"},
        {"date": "5", "run_id": "r5", "reverted": True},
        {"date": "6", "run_id": "r6", "campaign": "song"},
        {"date": "7", "run_id": "r7", "campaign": "song"},
    ]
    (root / "heartwood").mkdir()
    (root / "heartwood" / "agent-runs.jsonl").write_text(
        "".join(json.dumps(r) + "\n" for r in ledger), encoding="utf-8"
    )
    return root, arts


def _campaigns(root: Path) -> dict[str, list[str]]:
    content = root / "akasha" / "content"
    return {
        f.relative_to(content).as_posix().removesuffix(".vellum"): page_campaigns(f.read_text())
        for f in sorted(content.rglob("*.vellum"))
    }


def test_dry_run_reports_and_writes_nothing(world: tuple[Path, Path]) -> None:
    root, arts = world
    before = _campaigns(root)
    report = backfill(root, arts, write=False)
    assert _campaigns(root) == before
    assert report.runs == 6 and report.reverted == ["5/r5"] and report.from_journal == ["6/r6"]
    assert len(report.unreadable) == 1 and report.unreadable[0].startswith("7/r7: ")
    assert report.pages == 6 and report.with_history == 5  # A/Quiet: its only run was reverted
    assert report.missing == []  # A/Old was deleted; Org/Folder became Org/Folder/index
    assert report.changed == ["A/Both", "A/Hand", "A/Kept", "A/Moved", "Org/Folder/index"]
    assert report.per_campaign == {"song": 3, "spark": 2, "hunt": 3, "hand-set": 1}
    assert report.several == {
        "A/Both": ["spark", "hunt", "song"],
        "A/Hand": ["spark", "hand-set"],
        "A/Moved": ["song", "hunt"],
    }


def test_write_rebuilds_lists_and_a_second_pass_changes_nothing(world: tuple[Path, Path]) -> None:
    root, arts = world
    backfill(root, arts, write=True)
    assert _campaigns(root) == {
        "A/Both": ["spark", "hunt", "song"],
        "A/Hand": ["spark", "hand-set"],  # history first; the hand-set slug is kept
        "A/Kept": ["hunt"],  # recreated after its first page moved away
        "A/Moved": ["song", "hunt"],
        "A/Quiet": [],
        "Org/Folder/index": ["song"],
    }
    assert (root / "akasha/content/A/Kept.vellum").read_text() == (
        "---\ntags: []\ncampaigns: [hunt]\n---\nText.\n"
    )
    assert backfill(root, arts, write=True).changed == []


def test_refuses_to_write_into_the_forbidden_clone(world: tuple[Path, Path]) -> None:
    root, arts = world
    with pytest.raises(ValueError, match="refusing to write"):
        backfill(root, arts, write=True, forbidden=root / "." / "")
    assert backfill(root, arts, write=False, forbidden=root).changed  # a dry run may read it


def test_read_only_pages_get_no_history(tmp_path: Path) -> None:
    root, arts = tmp_path / "astra-data", tmp_path / "heartwood"
    _page(root / "akasha" / "content", "Timeline", "---\ntags: []\n---\nText.\n")
    _record(arts, "1", "r1", ChangeSet(updated=["Timeline"]))  # edited before it was protected
    (root / "heartwood").mkdir()
    (root / "heartwood" / "agent-runs.jsonl").write_text(
        json.dumps({"date": "1", "run_id": "r1", "campaign": "song"}) + "\n", encoding="utf-8"
    )
    report = backfill(root, arts, write=True)
    assert report.changed == [] and report.missing == []
    assert _campaigns(root) == {"Timeline": []}
