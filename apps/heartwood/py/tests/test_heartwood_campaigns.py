"""The ``campaigns`` frontmatter field: text edits, the end-of-run stamp, the write_page
guard, and the agent's campaign context. Hermetic: a tmp corpus and a fixture ``being``."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_heartwood.agent.campaigns import (
    add_campaign,
    campaign_context,
    merge,
    page_campaigns,
    set_campaigns,
    stamp_campaign,
)
from astra_heartwood.agent.tools import HeartwoodTools
from astra_heartwood.agent.workspace import Workspace
from astra_ontology import Resolution
from astra_ontology.models import Being, Campaign

TARGET = "2025-8-28"


def being(*campaigns: tuple[str, str, str, bool]) -> Being:
    return Being(
        players=[],
        guest_color="#000000",
        astra_worlds=["faerrin", "althane"],
        campaigns=[
            Campaign(slug=s, name=n, edition="pf2e", main=m, world=w, roles=[])
            for s, n, w, m in campaigns
        ],
        weal_hosts=[],
        podcast_personas=[],
    )


# ── text edits ──
def test_merge_keeps_first_place_and_drops_repeats() -> None:
    assert merge(["a", "b"], ["b", "c", "a"]) == ["a", "b", "c"]


def test_set_campaigns_appends_a_flow_line_and_keeps_other_lines() -> None:
    text = "---\ntags:\n  - Cat\ndate: 2025-01-01\n---\n\nBody.\n"
    out = set_campaigns(text, ["song"])
    assert out == "---\ntags:\n  - Cat\ndate: 2025-01-01\ncampaigns: [song]\n---\n\nBody.\n"
    assert page_campaigns(out) == ["song"]


def test_set_campaigns_replaces_a_block_list_in_place() -> None:
    text = "---\ncampaigns:\n  - old\n  - older\ntags: []\n---\nBody.\n"
    assert set_campaigns(text, ["old", "new"]) == (
        "---\ncampaigns: [old, new]\ntags: []\n---\nBody.\n"
    )


def test_set_campaigns_empty_removes_the_key() -> None:
    assert set_campaigns("---\ntags: []\ncampaigns: [a]\n---\nB\n", []) == "---\ntags: []\n---\nB\n"
    assert set_campaigns("---\ncampaigns: [a]\n---\nB\n", []) == "---\n---\nB\n"
    assert set_campaigns("No frontmatter.\n", []) == "No frontmatter.\n"


def test_set_campaigns_is_a_no_op_when_the_list_matches() -> None:
    text = "---\ncampaigns:\n  - a\n  - b\n---\nB\n"  # block style is left alone
    assert set_campaigns(text, ["a", "b", "a"]) == text


def test_set_campaigns_adds_frontmatter_when_missing() -> None:
    assert set_campaigns("Body.\n", ["a"]) == "---\ncampaigns: [a]\n---\n\nBody.\n"


def test_set_campaigns_quotes_odd_slugs() -> None:
    out = set_campaigns("---\n---\nB\n", ["a b"])
    assert out == '---\ncampaigns: ["a b"]\n---\nB\n'
    assert page_campaigns(out) == ["a b"]


def test_add_campaign_is_idempotent_and_ordered() -> None:
    once = add_campaign("---\ncampaigns: [old]\n---\nB\n", "new")
    assert page_campaigns(once) == ["old", "new"]
    assert add_campaign(once, "new") == once
    assert add_campaign(once, "old") == once


# ── the end-of-run stamp ──
def _workspace(tmp_path: Path, pages: dict[str, str]) -> Workspace:
    live = tmp_path / "live"
    for key, text in pages.items():
        f = live / f"{key}.vellum"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    return Workspace.create(TARGET, content_dir=live, artifacts_root=tmp_path / "art", run_id="r")


def test_stamp_campaign_marks_new_pages_and_listed_pages_it_touched(tmp_path: Path) -> None:
    ws = _workspace(
        tmp_path,
        {
            "A/Edited": "---\ncampaigns: [old]\n---\nA.\n",
            "A/Same": "---\n---\nSame.\n",
            "A/Moved": "---\ncampaigns: [old]\n---\nM.\n",
            "A/Lore": "---\n---\nL.\n",
            "A/LoreMoved": "---\n---\nLM.\n",
            "A/Gone": "---\n---\nG.\n",
            "A/Untouched": "---\n---\nU.\n",
        },
    )
    ws.write("A/Edited", "---\ncampaigns: [old]\n---\nA, revised.\n")
    ws.write("A/Same", "---\n---\nSame.\n")  # identical bytes: no change, no stamp
    ws.write("A/New", "---\n---\nN.\n")
    ws.write("A/Lore", "---\n---\nL, revised.\n")  # shared lore: edited, never stamped
    ws.move("A/Moved", "B/Moved")
    ws.move("A/LoreMoved", "B/LoreMoved")
    ws.delete("A/Gone")

    assert stamp_campaign(ws, "song") == ["A/Edited", "A/New", "B/Moved"]
    read = {p: page_campaigns(ws.file(p).read_text()) for p in ws.pages()}
    assert read == {
        "A/Edited": ["old", "song"],
        "A/Lore": [],
        "A/New": ["song"],
        "A/Same": [],
        "A/Untouched": [],
        "B/LoreMoved": [],
        "B/Moved": ["old", "song"],
    }
    cs = ws.changeset()
    assert (cs.created, cs.updated, cs.deleted) == (["A/New"], ["A/Edited", "A/Lore"], ["A/Gone"])
    assert [(m.src, m.dst, m.edited) for m in cs.moved] == [
        ("A/LoreMoved", "B/LoreMoved", False),
        ("A/Moved", "B/Moved", True),
    ]
    assert stamp_campaign(ws, "song") == []  # a second stamp changes nothing


# ── write_page keeps the list ──
def _tools(ws: Workspace, tmp_path: Path) -> HeartwoodTools:
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    (tdir / "000.song.2025-8-28.txt").write_text("000001\tGamemaster: Hi.\n", encoding="utf-8")
    return HeartwoodTools(
        ws,
        target_date=TARGET,
        validator=lambda _dir: None,
        transcript_dir=tdir,
        being=being(("song", "song", "faerrin", True)),
        resolver=lambda _name: Resolution("unknown", None, [], 0.0),
    )


def test_write_page_keeps_existing_campaigns_and_ignores_the_models(tmp_path: Path) -> None:
    ws = _workspace(tmp_path, {"A/Old": "---\ntags: []\ncampaigns: [deep-eyes]\n---\nOld.\n"})
    t = _tools(ws, tmp_path)
    # the model drops the field: the existing list survives
    t.write_page("A/Old", "---\ntags: []\n---\nRewritten.\n")
    assert page_campaigns(t.read_page("A/Old")) == ["deep-eyes"]
    # the model invents a list: it is replaced by the existing one
    t.write_page("A/Old", "---\ncampaigns: [made-up, deep-eyes]\n---\nAgain.\n")
    assert page_campaigns(t.read_page("A/Old")) == ["deep-eyes"]
    # a new page gets no list from the model
    t.write_page("A/New", "---\ncampaigns: [made-up]\n---\nNew.\n")
    assert page_campaigns(t.read_page("A/New")) == []


# ── the agent's context ──
@pytest.mark.parametrize(
    ("slug", "expected"),
    [
        (
            "song",
            "This session is from Through a Song, Darkly (`song`), the current main "
            "campaign, set in the world `faerrin`.",
        ),
        (
            "deep",
            "This session is from Deep Eyes (`deep`), set in the world `althane`. The current "
            "main campaign is Through a Song, Darkly (`song`), set in `faerrin`.",
        ),
        (
            "nope",
            "This session is from the campaign `nope`. The current main campaign is Through a "
            "Song, Darkly (`song`), set in `faerrin`.",
        ),
    ],
)
def test_campaign_context(slug: str, expected: str) -> None:
    b = being(
        ("deep", "Deep Eyes", "althane", False),
        ("song", "Through a Song, Darkly", "faerrin", True),
    )
    assert campaign_context(slug, b) == expected
