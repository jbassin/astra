"""The producer's read-only tools: they write nothing and honour the show/time boundary."""

from __future__ import annotations

import builtins
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from astra_linguist.chronicle import ShowInfo
from astra_mouthpiece.producer.tools import ProducerTools, permitted_dates

TARGET = "2026-1-8"

SHOWS = {
    "show-a": ShowInfo(slug="show-a", name="Show A", is_main=True, order=0),
    "show-b": ShowInfo(slug="show-b", name="Show B", is_main=False, order=1),
}

TRANSCRIPTS = {
    "000.show-a.2025-12-1.txt": "000001\tGamemaster: The Herald waits at the gate.\n",
    "000.show-a.2026-1-1.txt": "000001\tGamemaster: Galzu flees into the mist.\n"
    "000002\tAda: We will find her.\n",
    "000.show-a.2026-1-8.txt": "000001\tGamemaster: Tonight, the target.\n",
    "000.show-a.2026-1-15.txt": "000001\tGamemaster: Future spoilers about Galzu.\n",
    "000.show-b.2026-1-3.txt": "000001\tGamemaster: Another show mentions Galzu.\n",
    "000.show-a.2025-8-11.txt": "000001\tGamemaster: Excluded mislabel, Galzu.\n",
}

PAGES = {
    "People/Galzu": "---\ndate: 2026-01-01T00:00:00-04:00\ntags: []\n---\n\nGalzu is "
    "a sister of [[People/Anzu]].\n",
    "People/Anzu": "---\ndate: 2026-01-01T00:00:00-04:00\ntags: []\n---\n\nAnzu.\n",
}


def _entry(date: str, show: str, title: str) -> dict[str, Any]:
    return {
        "date": date,
        "show": show,
        "summary": {
            "title": title,
            "synopsis": f"syn {title}",
            "key_beats": ["beat"],
            "characters_present": ["Ada"],
            "locations": ["Mist"],
            "factions": [],
            "items": ["shackles"],
            "cliffhanger": "hook",
        },
    }


def _script(sid_key: str, sid: str, hosts_case: str, text: str) -> dict[str, Any]:
    keys = ("A", "B") if hosts_case == "upper" else ("a", "b")
    return {
        sid_key: sid,
        "title": "T",
        "hosts": {keys[0]: {"name": "Bram"}, keys[1]: {"name": "Maeve"}},
        "turns": [{"speaker": "A", "text": text}, {"speaker": "B", "text": "and the Herald"}],
    }


@pytest.fixture
def tree(tmp_path: Path) -> dict[str, Any]:
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    for name, text in TRANSCRIPTS.items():
        (tdir / name).write_text(text, encoding="utf-8")
    content = tmp_path / "content"
    for key, text in PAGES.items():
        f = content / f"{key}.vellum"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    eps = tmp_path / "timeline" / "episodes"
    eps.mkdir(parents=True)
    for e in (
        _entry("2026-1-1", "show-a", "Into the Mist"),
        _entry("2026-1-15", "show-a", "Future"),
        _entry("2026-1-3", "show-b", "Other Show"),
    ):
        (eps / f"{e['date']}.json").write_text(json.dumps(e), encoding="utf-8")
    scripts = tmp_path / "episodes"
    layout = {
        "2026-1-1": _script("session_id", "000.show-a.2026-1-1", "lower", "Galzu ran"),
        "000.show-a.2025-12-1": _script("sessionId", "000.show-a.2025-12-1", "upper", "legacy"),
        "000.show-a.2026-1-1-recap-of-2025-12-1": _script(
            "sessionId", "000.show-a.2026-1-1-recap-of-2025-12-1", "upper", "recap Galzu"
        ),
        "2026-1-15": _script("session_id", "000.show-a.2026-1-15", "lower", "future Galzu"),
        "2026-1-8": _script("session_id", "000.show-a.2026-1-8", "lower", "target Galzu"),
    }
    for d, raw in layout.items():
        (scripts / d).mkdir(parents=True)
        (scripts / d / "script.json").write_text(json.dumps(raw), encoding="utf-8")
    return {
        "root": tmp_path,
        "transcript_dir": tdir,
        "content_dir": content,
        "episodes_dir": eps,
        "seasons_path": tmp_path / "timeline" / "seasons.json",
        "scripts_root": scripts,
    }


def fake_resolver(name: str) -> Any:
    ent = SimpleNamespace(canonical="Galzu", kind="person", page="People/Galzu")
    return SimpleNamespace(status="resolved", entity=ent, confidence=0.91, candidates=[(ent, 0.91)])


def make(tree: dict[str, Any]) -> ProducerTools:
    kw = {k: v for k, v in tree.items() if k != "root"}
    return ProducerTools(
        target_date=TARGET, show="show-a", shows=SHOWS, resolver=fake_resolver, **kw
    )


def _tree_hash(root: Path) -> str:
    h = hashlib.sha256()
    for f in sorted(root.rglob("*")):
        if f.is_file():
            h.update(f.relative_to(root).as_posix().encode())
            h.update(f.read_bytes())
    return h.hexdigest()


# ── boundary ──
def test_permitted_dates_are_same_show_strictly_earlier_and_not_excluded(tree) -> None:
    dates = permitted_dates(TARGET, "show-a", transcript_dir=tree["transcript_dir"], shows=SHOWS)
    assert dates == ["2025-12-1", "2026-1-1"]  # date_key order, not string order


def test_transcript_tools_refuse_target_future_other_show_and_excluded(tree) -> None:
    t = make(tree)
    for bad in (TARGET, "2026-1-15", "2026-1-3", "2025-8-11"):
        with pytest.raises(ValueError):
            t.read_transcript(bad)
        with pytest.raises(ValueError):
            t.read_episode(bad)
        with pytest.raises(ValueError):
            t.read_script(bad)
    hits = t.search_transcripts("galzu")
    assert [h["date"] for h in hits] == ["2026-1-1"]
    assert hits[0] == {
        "date": "2026-1-1",
        "line": 1,
        "speaker": "Gamemaster",
        "text": hits[0]["text"],
    }


def test_scripts_skip_recaps_find_legacy_dirs_and_name_hosts(tree) -> None:
    t = make(tree)
    assert sorted(t.scripts) == ["2025-12-1", "2026-1-1"]
    assert t.read_script("2025-12-1") == "Bram: legacy\nMaeve: and the Herald"
    assert t.read_script("2026-1-1").startswith("Bram: Galzu ran")
    hits = t.search_scripts("galzu")
    assert hits == [{"date": "2026-1-1", "speaker": "Bram", "text": "Galzu ran"}]


def test_scripts_skip_a_special_by_its_stored_kind(tree) -> None:
    """A special whose id has no recap marker is still not a prior session."""
    raw = _script("session_id", "000.show-a.2026-1-1", "lower", "special Galzu")
    special = tree["scripts_root"] / "special"  # sorts after 2026-1-1, so it would win
    special.mkdir()
    (special / "script.json").write_text(json.dumps({**raw, "kind": "special"}))
    assert make(tree).read_script("2026-1-1").startswith("Bram: Galzu ran")


def test_chronicle_tools(tree) -> None:
    t = make(tree)
    eps = t.list_episodes()
    assert [e["date"] for e in eps] == ["2025-12-1", "2026-1-1"]
    assert eps[0]["title"] == "" and eps[0]["has_script"] is True
    assert eps[1]["title"] == "Into the Mist"
    ep = t.read_episode("2026-1-1")
    assert ep["cliffhanger"] == "hook" and ep["season"] == ""
    assert ep["items"] == ["shackles"]
    with pytest.raises(ValueError, match="no chronicle entry"):
        t.read_episode("2025-12-1")


def test_wiki_tools_and_resolve(tree) -> None:
    t = make(tree)
    assert t.list_pages() == ["People/Anzu", "People/Galzu"]
    assert "sister" in t.read_page("People/Galzu")
    with pytest.raises(ValueError):
        t.read_page("People/Nobody")
    assert t.search_wiki("SISTER") == [
        {"path": "People/Galzu", "line": 6, "text": "Galzu is a sister of [[People/Anzu]]."}
    ]
    assert t.backlinks("People/Anzu") == ["People/Galzu"]
    with pytest.raises(ValueError):
        t.search_wiki("(", regex=True)
    r = t.resolve_name("Galzoo")
    assert r["canonical"] == "Galzu" and r["page_exists"] is True and r["candidates"] == ["Galzu"]


# ── read-only ──
def test_no_tool_writes_anything(tree, monkeypatch: pytest.MonkeyPatch) -> None:
    before = _tree_hash(tree["root"])
    t = make(tree)

    def no_write(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("a producer tool tried to write")

    real_open = builtins.open

    def guarded_open(file: Any, mode: str = "r", *a: Any, **k: Any) -> Any:
        if any(c in mode for c in "wax+"):
            raise AssertionError(f"write-mode open of {file}")
        return real_open(file, mode, *a, **k)

    monkeypatch.setattr(Path, "write_text", no_write)
    monkeypatch.setattr(Path, "write_bytes", no_write)
    monkeypatch.setattr(builtins, "open", guarded_open)
    t.list_pages()
    t.read_page("People/Galzu")
    t.search_wiki("galzu")
    t.backlinks("People/Anzu")
    t.resolve_name("Galzu")
    t.list_episodes()
    t.read_episode("2026-1-1")
    t.read_transcript("2026-1-1")
    t.search_transcripts("galzu")
    t.read_script("2026-1-1")
    t.search_scripts("herald")
    monkeypatch.undo()
    assert _tree_hash(tree["root"]) == before
    assert len(t.tools()) == 11


def test_earlier_sessions_read_with_todays_corrections(tree: dict[str, Any]) -> None:
    # Older transcripts, chronicle entries and scripts keep their day's spellings.
    root = tree["root"]
    (tree["transcript_dir"] / "000.show-a.2026-1-1.txt").write_text(
        "000001\tGamemaster: Ocelith says no.\n000002\tAda: Ask Oceloth.\n", encoding="utf-8"
    )
    entry = _entry("2026-1-1", "show-a", "Oceloth Speaks")
    entry["summary"]["synopsis"] = "They ask Ocelith about flogiston."
    (tree["episodes_dir"] / "2026-1-1.json").write_text(json.dumps(entry), encoding="utf-8")
    (root / "episodes" / "2026-1-1" / "script.json").write_text(
        json.dumps(_script("session_id", "000.show-a.2026-1-1", "lower", "Oceloth is an owl")),
        encoding="utf-8",
    )
    t = make(tree)
    assert t.read_transcript("2026-1-1") == (
        "000001\tGamemaster: Osyluth says no.\n000002\tAda: Ask Osyluth.\n"
    )
    ep = t.read_episode("2026-1-1")
    assert ep["title"] == "Osyluth Speaks"
    assert ep["synopsis"] == "They ask Osyluth about phlogiston."
    assert "Osyluth is an owl" in t.read_script("2026-1-1")
    assert [e["title"] for e in t.list_episodes() if e["date"] == "2026-1-1"] == ["Osyluth Speaks"]
