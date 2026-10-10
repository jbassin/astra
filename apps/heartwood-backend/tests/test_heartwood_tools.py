"""The agent's host-side tools (0033 §3, gate B).

Hermetic: a fixture corpus with a crossref web, a fixture ``being`` with one faerrin and
one non-faerrin campaign, four fixture transcripts around the 2025-8-28 target (earlier
same-world, earlier other-world, the target, a later same-world one), a fake validator
and a fake resolver. One real-node validator test skips when node / node_modules are
absent (CI's py-test lane).
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from astra_akasha_backend.snapshot import REPO_ROOT
from astra_heartwood.agent.tools import HeartwoodTools, make_tools, stamp_date
from astra_heartwood.agent.validate import find_node, node_validator
from astra_heartwood.agent.workspace import Workspace, hash_tree
from astra_ontology import EntityRef, Resolution
from astra_ontology.models import Being, Campaign

TARGET = "2025-8-28"
TARGET_ISO = "2025-08-28T00:00:00-04:00"

PAGES = {
    "index": "---\ntitle: Home\ndate: 2026-06-05T16:40:21-04:00\n---\n\n"
    "See [[Bestiary/Auger]] and [[Ugathal|the ugathal]].\n",
    "Bestiary/Auger": "---\ndate: 2025-08-20T00:00:00-04:00\ntags: []\n---\n\n"
    "Augers hunt [[Ugathal]] near [[Geography/Hallia|Hallia]].\n",
    "Bestiary/Ugathal": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\n"
    "Ugathal wear flesh. Prey of the [[Auger]].\n",
    "Geography/Hallia/index": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\n"
    "The city of Hallia. Home of [[Org/Amber Call/People/Mr. Whiskers]].\n",
    "Org/Amber Call/People/Mr. Whiskers": "---\ntags:\n  - Cat\naliases:\n  - Whiskers\n"
    "date: 2026-06-05T16:40:21-04:00\n---\n\nA cat of [[Geography/Hallia]].\n",
    "Divinity/Aut": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nA god. No links.\n",
}

TRANSCRIPTS = {
    "000.song.2025-8-20.txt": "000001\tGamemaster: The auger circles Hallia.  \n"
    "000002\tAda: I hide.\n",
    "000.stars.2025-8-25.txt": "000001\tGamemaster: Other world auger, secret.\n",
    "000.song.2025-8-28.txt": "000001\tGamemaster: An Ugathal appears.\n"
    "000002\tBran: Is that the AUGER again?\n"
    "garbage line without a tab\n",
    "000.song.2025-10-6.txt": "000001\tGamemaster: Future auger spoilers.\n",
}


def fixture_being() -> Being:
    def campaign(slug: str, world: str) -> Campaign:
        return Campaign(slug=slug, name=slug, edition="pf2e", main=False, world=world, roles=[])

    return Being(
        players=[],
        guest_color="#000000",
        campaigns=[campaign("song", "faerrin"), campaign("stars", "sedecium")],
        weal_hosts=[],
        podcast_personas=[],
    )


class FakeValidator:
    """Rejects any page containing a `#word` sigil or `:trait[`; records each call."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, directory: str) -> str | None:
        files = sorted(Path(directory).rglob("*.vellum"))
        self.calls.append([f.relative_to(directory).as_posix() for f in files])
        for f in files:
            text = f.read_text()
            if ":trait[" in text or " #" in text:
                return f"✖ {directory}/{f.relative_to(directory).as_posix()}  (sigil collisions)"
        return None


def fake_resolver(name: str) -> Resolution:
    ugathal = EntityRef(canonical="Ugathal", kind="creature", page="Bestiary/Ugathal", being=None)
    ichel = EntityRef(canonical="Ichel", kind="person", page="People/Ichel", being=None)
    if name.lower() == "ugathal":
        return Resolution("resolved", ugathal, [(ugathal, 1.0)], 1.0)
    if name.lower() == "yshael":
        return Resolution("ambiguous", None, [(ichel, 0.7), (ugathal, 0.65)], 0.7)
    return Resolution("unknown", None, [], 0.0)


@pytest.fixture
def env(tmp_path: Path) -> tuple[Workspace, HeartwoodTools, FakeValidator, Path]:
    live = tmp_path / "live"
    for key, text in PAGES.items():
        f = live / f"{key}.vellum"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    for name, text in TRANSCRIPTS.items():
        (tdir / name).write_text(text, encoding="utf-8")
    ws = Workspace.create(TARGET, content_dir=live, artifacts_root=tmp_path / "art", run_id="r1")
    validator = FakeValidator()
    tools = HeartwoodTools(
        ws,
        target_date=TARGET,
        validator=validator,
        transcript_dir=tdir,
        being=fixture_being(),
        resolver=fake_resolver,
    )
    return ws, tools, validator, tdir


# ── factory ──
def test_make_tools_names_and_docstrings(env) -> None:
    ws, _, validator, tdir = env
    fns = make_tools(
        ws, target_date=TARGET, validator=validator, transcript_dir=tdir, being=fixture_being()
    )
    names = [getattr(f, "__name__", "") for f in fns]
    assert names == [
        "list_pages", "read_page", "search_wiki", "write_page", "move_page", "delete_page",
        "backlinks", "list_sessions", "read_transcript", "search_transcripts", "resolve_name",
    ]  # fmt: skip
    for name, f in zip(names, fns, strict=True):
        doc = f.__doc__ or ""
        assert "Returns" in doc or "Raises" in doc or "sorted" in doc, name


def test_non_ingestible_target_raises(env) -> None:
    ws, _, validator, tdir = env
    for bad in ["2025-8-25", "2025-1-1"]:  # other world; no transcript
        with pytest.raises(ValueError, match="not an ingestible"):
            make_tools(
                ws, target_date=bad, validator=validator, transcript_dir=tdir, being=fixture_being()
            )


# ── path guards (gate B) ──
@pytest.mark.parametrize("bad", ["../live/index", "/etc/passwd", "Bestiary/../../x", "x.vellum"])
def test_bad_paths_raise_in_every_path_tool(env, bad: str) -> None:
    ws, t, _, _ = env
    before = hash_tree(ws.content_dir)
    for call in [
        lambda: t.read_page(bad),
        lambda: t.write_page(bad, "text"),
        lambda: t.move_page(bad, "Ok/Dst"),
        lambda: t.move_page("Bestiary/Auger", bad),
        lambda: t.delete_page(bad),
        lambda: t.backlinks(bad),
    ]:
        with pytest.raises(ValueError):
            call()
    assert hash_tree(ws.content_dir) == before
    assert ws.ops() == []


# ── wiki reads ──
def test_list_and_read(env) -> None:
    _, t, _, _ = env
    assert t.list_pages() == sorted(PAGES)
    assert t.read_page("Divinity/Aut") == PAGES["Divinity/Aut"]
    with pytest.raises(ValueError, match="no page"):
        t.read_page("Divinity/Nope")


def test_search_wiki(env) -> None:
    _, t, _, _ = env
    hits = t.search_wiki("HALLIA")
    hallia = PAGES["Geography/Hallia/index"].splitlines()[5]
    assert {"path": "Geography/Hallia/index", "line": 6, "text": hallia} in hits
    assert all("hallia" in h["text"].lower() for h in hits)
    assert t.search_wiki("[[Ugathal")  # literal: '[' is not a regex class
    assert [h["path"] for h in t.search_wiki(r"^A (god|cat)", regex=True)] == [
        "Divinity/Aut", "Org/Amber Call/People/Mr. Whiskers",
    ]  # fmt: skip
    with pytest.raises(ValueError, match="invalid regex"):
        t.search_wiki("(unclosed", regex=True)
    with pytest.raises(ValueError):
        t.search_wiki("")
    json.dumps(hits)


def test_search_wiki_cap(env) -> None:
    ws, t, _, _ = env
    ws.write("Big", "\n".join(f"line {i}" for i in range(500)))
    assert len(t.search_wiki("line")) == 200


# ── write_page (D33-4, D33-5) ──
def test_write_creates_with_inserted_frontmatter(env) -> None:
    ws, t, validator, _ = env
    assert t.write_page("Bestiary/New/Grell", "A grell.") == "created Bestiary/New/Grell"
    text = t.read_page("Bestiary/New/Grell")
    assert text == f"---\ndate: {TARGET_ISO}\ntags: []\n---\n\nA grell.\n"
    assert validator.calls == [["Bestiary/New/Grell.vellum"]]  # validated alone, in a temp dir
    assert ws.ops() == [{"op": "write", "path": "Bestiary/New/Grell"}]


def test_write_update_keeps_later_date_and_other_frontmatter(env) -> None:
    _, t, _, _ = env
    new = (
        "---\ntags:\n  - Cat\naliases:\n  - Whiskers\n  - Sir W\ndate: 2020-01-01\n---\n\nA cat.\n"
    )
    assert t.write_page("Org/Amber Call/People/Mr. Whiskers", new) == (
        "updated Org/Amber Call/People/Mr. Whiskers"
    )
    text = t.read_page("Org/Amber Call/People/Mr. Whiskers")
    # existing 2026-06-05 > target 2025-08-28 → existing wins, verbatim; agent's date ignored
    assert text == new.replace("date: 2020-01-01", "date: 2026-06-05T16:40:21-04:00")


def test_write_update_advances_older_date(env) -> None:
    _, t, _, _ = env
    t.write_page("Bestiary/Auger", "---\ntags: []\n---\n\nAugers, revised.\n")
    # existing 2025-08-20 < target → target; missing date line appended to the block
    assert t.read_page("Bestiary/Auger") == (
        f"---\ntags: []\ndate: {TARGET_ISO}\n---\n\nAugers, revised.\n"
    )


def test_stamp_date_max_compares_as_datetimes() -> None:
    # same instant spelled in another offset is not "later"; string order would say it is
    assert stamp_date("x", existing="2025-08-28T04:00:00+00:00", target_iso=TARGET_ISO).startswith(
        f"---\ndate: {TARGET_ISO}\n"
    )
    later = "2025-08-28T05:00:00+00:00"
    assert f"date: {later}\n" in stamp_date("x", existing=later, target_iso=TARGET_ISO)
    assert f"date: {TARGET_ISO}\n" in stamp_date("x", existing="garbage", target_iso=TARGET_ISO)
    assert stamp_date("---\n---\nbody\n", existing=None, target_iso=TARGET_ISO) == (
        f"---\ndate: {TARGET_ISO}\n---\nbody\n"
    )


def test_rejected_write_leaves_staging_byte_identical(env) -> None:
    ws, t, _, _ = env
    before = hash_tree(ws.content_dir)
    files_before = sorted(p.relative_to(ws.content_dir) for p in ws.content_dir.rglob("*"))
    out = t.write_page("Bestiary/Auger", "Augers have :trait[] now.")
    assert out.startswith("rejected: ")
    assert "Bestiary/Auger.vellum" in out and "heartwood-validate-" not in out  # tmp dir hidden
    out = t.write_page("Bestiary/Brand/New", "Tagged #oops")
    assert out.startswith("rejected: ")
    assert hash_tree(ws.content_dir) == before
    assert sorted(p.relative_to(ws.content_dir) for p in ws.content_dir.rglob("*")) == files_before
    assert ws.ops() == []
    assert ws.changeset().is_empty()


def test_write_empty_text_raises(env) -> None:
    _, t, _, _ = env
    with pytest.raises(ValueError):
        t.write_page("Bestiary/X", "   ")


# ── backlinks / move / delete ──
def test_backlinks_use_akasha_resolver(env) -> None:
    _, t, _, _ = env
    # [[Ugathal]] and [[Ugathal|…]] resolve by basename; [[Auger]] likewise
    assert t.backlinks("Bestiary/Ugathal") == ["Bestiary/Auger", "index"]
    assert t.backlinks("Bestiary/Auger") == ["Bestiary/Ugathal", "index"]
    # folder link [[Geography/Hallia]] → its index page
    assert t.backlinks("Geography/Hallia/index") == [
        "Bestiary/Auger", "Org/Amber Call/People/Mr. Whiskers",
    ]  # fmt: skip
    assert t.backlinks("Divinity/Aut") == []
    assert t.backlinks("Nope/Missing") == []


def test_backlinks_follow_mutations(env) -> None:
    _, t, _, _ = env
    assert t.backlinks("Divinity/Aut") == []
    t.write_page("Divinity/Iris", "Sister of [[Aut]].")
    assert t.backlinks("Divinity/Aut") == ["Divinity/Iris"]


def test_move_page(env) -> None:
    ws, t, _, _ = env
    out = t.move_page("Geography/Hallia/index", "Geography/Hallia City")
    assert out == {
        "moved": ["Geography/Hallia/index", "Geography/Hallia City"],
        "backlinks": ["Bestiary/Auger", "Org/Amber Call/People/Mr. Whiskers"],
    }
    assert not (ws.content_dir / "Geography" / "Hallia").exists()  # pruned
    assert ws.ops() == [
        {"op": "move", "src": "Geography/Hallia/index", "dst": "Geography/Hallia City"}
    ]
    # a basename-keeping move does not break [[Ugathal]] links
    t.move_page("Bestiary/Ugathal", "Bestiary/Flesh/Ugathal")
    assert t.backlinks("Bestiary/Flesh/Ugathal") == ["Bestiary/Auger", "index"]
    with pytest.raises(ValueError, match="already exists"):
        t.move_page("Bestiary/Auger", "Divinity/Aut")
    with pytest.raises(ValueError, match="no page"):
        t.move_page("Bestiary/Gone", "Bestiary/Elsewhere")
    json.dumps(out)


def test_delete_page(env) -> None:
    ws, t, _, _ = env
    out = t.delete_page("Org/Amber Call/People/Mr. Whiskers")
    assert out == {
        "deleted": "Org/Amber Call/People/Mr. Whiskers",
        "backlinks": ["Geography/Hallia/index"],
    }
    assert not (ws.content_dir / "Org").exists()
    with pytest.raises(ValueError, match="no page"):
        t.delete_page("Org/Amber Call/People/Mr. Whiskers")


# ── transcripts (D33-6) ──
def test_list_sessions_filters_world_and_future(env) -> None:
    _, t, _, _ = env
    assert t.list_sessions() == [
        {"date": "2025-8-20", "campaign": "song", "is_target": False},
        {"date": "2025-8-28", "campaign": "song", "is_target": True},
    ]


def test_read_transcript_guard(env) -> None:
    _, t, _, _ = env
    assert t.read_transcript("2025-8-20") == TRANSCRIPTS["000.song.2025-8-20.txt"]
    assert t.read_transcript(TARGET).startswith("000001\tGamemaster: An Ugathal")
    for bad in ["2025-10-6", "2025-8-25", "2025-1-1", "../x"]:  # future, other world, absent
        with pytest.raises(ValueError, match="not available"):
            t.read_transcript(bad)


def test_search_transcripts(env) -> None:
    _, t, _, _ = env
    hits = t.search_transcripts("auger")
    assert hits == [
        {
            "date": "2025-8-20",
            "line": 1,
            "speaker": "Gamemaster",
            "text": "The auger circles Hallia.",
        },
        {"date": "2025-8-28", "line": 2, "speaker": "Bran", "text": "Is that the AUGER again?"},
    ]
    assert [h["line"] for h in t.search_transcripts(r"^(I|An) ", regex=True)] == [2, 1]
    assert t.search_transcripts("again?") != []  # literal: '?' is not a regex quantifier
    with pytest.raises(ValueError):
        t.search_transcripts("(", regex=True)


# ── resolve_name ──
def test_resolve_name_json_shape(env) -> None:
    ws, t, _, _ = env
    r = t.resolve_name("ugathal")
    assert r == {
        "status": "resolved",
        "canonical": "Ugathal",
        "kind": "creature",
        "page": "Bestiary/Ugathal",
        "page_exists": True,
        "confidence": 1.0,
        "candidates": ["Ugathal"],
    }
    amb = t.resolve_name("Yshael")
    assert amb["status"] == "ambiguous" and amb["canonical"] == "" and amb["page"] == ""
    assert amb["page_exists"] is False and amb["candidates"] == ["Ichel", "Ugathal"]
    unk = t.resolve_name("Zzz")
    assert unk == {
        "status": "unknown", "canonical": "", "kind": "", "page": "",
        "page_exists": False, "confidence": 0.0, "candidates": [],
    }  # fmt: skip
    for value in (r, amb, unk):
        assert json.loads(json.dumps(value)) == value
        assert None not in value.values()
    # page_exists re-checks staging, not the registry's seed-time page
    t.delete_page("Bestiary/Ugathal")
    assert t.resolve_name("ugathal")["page_exists"] is False
    with pytest.raises(ValueError):
        t.resolve_name(" ")


def test_resolve_name_real_registry_shape(env) -> None:
    ws, _, validator, tdir = env
    t = HeartwoodTools(
        ws, target_date=TARGET, validator=validator, transcript_dir=tdir, being=fixture_being()
    )
    r = t.resolve_name("Ugathal")
    assert set(r) == {
        "status", "canonical", "kind", "page", "page_exists", "confidence", "candidates",
    }  # fmt: skip
    assert r["status"] == "resolved" and r["canonical"] == "Ugathal"


# ── the real validator (skips without node + node_modules) ──
def _node_ready() -> bool:
    try:
        find_node()
    except FileNotFoundError:
        return False
    return (REPO_ROOT / "node_modules").is_dir() or (
        REPO_ROOT / "libs/ts/vellum-lang/node_modules"
    ).is_dir()


@pytest.mark.skipif(not _node_ready(), reason="node / node_modules absent (CI py-test lane)")
def test_real_validator(tmp_path: Path) -> None:
    good = tmp_path / "good"
    (good / "Bestiary").mkdir(parents=True)
    (good / "Bestiary" / "Auger.vellum").write_text(
        f"---\ndate: {TARGET_ISO}\ntags: []\n---\n\nAugers hunt [[Ugathal]].\n"
    )
    assert node_validator(str(good)) is None
    for i, body in enumerate(["Augers have :trait[] here.", "Augers are #dangerous here."]):
        bad = tmp_path / f"bad{i}"
        shutil.copytree(good, bad)
        (bad / "Bestiary" / "Auger.vellum").write_text(f"---\ntags: []\n---\n\n{body}\n")
        report = node_validator(str(bad))
        assert report is not None and "Bestiary/Auger.vellum" in report
