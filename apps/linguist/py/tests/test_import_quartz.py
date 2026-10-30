"""`scripts/import_quartz.py`: quartz transcript pages → astra's published transcript files.

The script is loaded by path. The campaigns are the real being.kdl ones (the earlier
campaigns are appended there), and the corrections are an identity replacer so the fixture
text comes through verbatim.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest
from astra_ontology import load_being
from astra_ontology_being import BEING_KDL_PATH

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import_quartz.py"


def _page(date: str, blocks: list[tuple[str, str, str]]) -> str:
    """A quartz transcript page: (second, user, text) blocks after the audio line."""
    body = "".join(
        f':::transcript-line{{second="{s}" user="{u}" char="{u}" start="00:00:0{int(float(s))}"}}'
        f"\n{t}\n:::\n\n"
        for s, u, t in blocks
    )
    return (
        "---\ntags:\n  - Script\n---\n\n"
        f'::transcript-audio{{date="{date}" audio="https://static-audio.iridi.cc/{date}/audio.mp3"}}'
        f"\n\n{body}"
    )


@pytest.fixture(scope="module")
def iq() -> ModuleType:
    spec = importlib.util.spec_from_file_location("astra_import_quartz", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses resolve annotations through sys.modules
    spec.loader.exec_module(module)
    return module


def same(text: str) -> str:
    return text.strip()


def test_strip_links(iq: ModuleType) -> None:
    assert iq.strip_links("in [[Geography/Calaria/index|Calaria]] now") == "in Calaria now"
    assert iq.strip_links("lost [[Hearts|hearts]] and [[Org/The Scale]]") == (
        "lost hearts and The Scale"
    )
    assert iq.strip_links("no links here") == "no links here"


def test_parse_joins_multiline_text_and_strips_links(iq: ModuleType) -> None:
    page = _page(
        "2025-1-6",
        [("1.043", "Mike", "Oh."), ("2.95", "Josh", "Welcome to\n[[Geography/Haven|Haven]].")],
    )
    session = iq.parse_quartz(page)
    assert session.date == "2025-1-6"
    assert [(ln.second, ln.user, ln.text) for ln in session.lines] == [
        (1.043, "Mike", "Oh."),
        (2.95, "Josh", "Welcome to Haven."),
    ]
    assert session.lines[1].start == "00:00:02"


def test_duration_is_the_gap_to_the_next_line(iq: ModuleType) -> None:
    page = _page(
        "2025-1-6", [("1.043", "Mike", "Oh."), ("2.95", "Josh", "Hi."), ("6.5", "Noah", "Yo")]
    )
    transcript = iq.to_transcript(iq.parse_quartz(page), same, load_being(BEING_KDL_PATH))
    assert [ln.duration for ln in transcript.script] == [1.907, 3.55, iq.LAST_LINE_SECONDS]
    assert transcript.audio == "https://static-audio.iridi.cc/2025-1-6/audio.mp3"
    josh = transcript.script[1].user
    assert (josh.name, josh.color) == ("Josh", "--textJosh")


def _convert(iq: ModuleType, date: str, slug: str, blocks: list[tuple[str, str, str]]):
    return iq.convert(iq.parse_quartz(_page(date, blocks)), slug, load_being(BEING_KDL_PATH), same)


def test_bills_each_player_as_their_roster_character(iq: ModuleType) -> None:
    # Naming Big Fish (Noah's earlier, dead character) does not change the billing.
    out = _convert(
        iq,
        "2025-1-6",
        "deep-eyes",
        [
            ("1", "Josh", "Big Fish's old boat, Big Fish's old net."),
            ("2", "Noah", "Big Fish would have liked it."),
            ("3", "Jorge", "Lev nods."),
            ("4", "Tanner", "Hm."),
            ("5", "Mike", "Hi."),
        ],
    )
    assert out.stem == "108.deep-eyes"
    assert out.canonical == (
        "000001\tGamemaster: Big Fish's old boat, Big Fish's old net.  \n"
        "000002\tDawnmonger: Big Fish would have liked it.  \n"
        "000003\tLev: Lev nods.  \n"
        "000004\tHenrik: Hm.  \n"
        "000005\tDivex: Hi.  \n"
    )


def test_an_unknown_speaker_is_billed_by_name(iq: ModuleType) -> None:
    out = _convert(iq, "2025-1-6", "deep-eyes", [("1", "Guest", "Hello.")])
    assert out.canonical == "000001\tGuest: Hello.  \n"
    assert out.transcript.script[0].user.color == "--textGuest"


def test_a_player_with_two_roles_is_refused(iq: ModuleType) -> None:
    view = iq.CampaignView(
        name="Two Hats",
        is_main=False,
        roles={"Noah": [iq.CharacterRole("A", []), iq.CharacterRole("B", [])]},
    )
    with pytest.raises(ValueError, match="2 roles"):
        iq.roster_billing(view)


def test_one_shot_prefixes_follow_the_being_order(iq: ModuleType) -> None:
    sun = _convert(iq, "2024-10-21", "the-midnight-sun", [("1", "Tanner", "Hm.")])
    heist = _convert(iq, "2024-11-20", "hildebrandt-heist", [("1", "Mike", "Hm.")])
    assert (sun.stem, heist.stem) == ("109.the-midnight-sun", "110.hildebrandt-heist")
    assert sun.canonical == "000001\tGiancarlo: Hm.  \n"
    assert heist.canonical == "000001\tChris Gangle: Hm.  \n"


def test_main_writes_both_files_and_keeps_existing_data(
    iq: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    quartz = tmp_path / "quartz"
    quartz.mkdir()
    for date in ("2025-1-6", "2024-10-21"):
        (quartz / f"{date}.md").write_text(_page(date, [("1", "Josh", "[[Færrin]]?")]))
    monkeypatch.setattr(iq, "SESSIONS", {"2025-1-6": "deep-eyes", "2024-10-21": "the-midnight-sun"})
    root = tmp_path / "astra-data"
    kept = root / "linguist" / "data" / "2024-10-21.json"
    kept.parent.mkdir(parents=True)
    kept.write_text("published")

    assert iq.main([str(root), "--quartz-dir", str(quartz)]) == 0

    transcripts = root / "linguist" / "transcripts"
    assert sorted(p.name for p in transcripts.iterdir()) == [
        "108.deep-eyes.2025-1-6.txt",
        "109.the-midnight-sun.2024-10-21.txt",
    ]
    assert (
        (transcripts / "108.deep-eyes.2025-1-6.txt")
        .read_text()
        .startswith("000001\tGamemaster: Færrin?  \n")
    )
    data = json.loads((root / "linguist" / "data" / "2025-1-6.json").read_text())
    assert list(data) == ["date", "audio", "script"]
    assert data["script"][0]["user"] == {"name": "Josh", "color": "--textJosh"}
    assert kept.read_text() == "published"


def test_main_refuses_the_live_clone_and_missing_sources(iq: ModuleType, tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="live clone"):
        iq.main([str(iq.LIVE_CLONE / "linguist")])
    assert iq.main([str(tmp_path / "out"), "--quartz-dir", str(tmp_path)]) == 1
