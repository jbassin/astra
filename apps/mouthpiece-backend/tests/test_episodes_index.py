"""The `episodes_index` catalog (D1, plan 0012) — pure helpers + the build over
the committed golden fixtures (the 7 real `through-a-song-darkly` sessions:
6 regular + 1 mega recap).

The build is exercised through its pure core (`build_index`) against the real
ontology-being arc titles + hosts (committed + deterministic, like
`test_mouthpiece` uses `load_hosts`). The Dagster wiring is asserted in
`test_assets`.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_mouthpiece.episodes_index import (
    EpisodeHost,
    SessionInput,
    _read_hosts,
    build_episode_numbers,
    build_index,
    discover_sessions,
    episode_title,
    is_recap,
    parse_id,
    strip_audio_tags,
)

GOLDEN = Path(__file__).parent / "fixtures" / "golden"
SCRIPTS = sorted(GOLDEN.glob("*.script.json"))

MEGA_ID = "000.through-a-song-darkly.2026-6-8-recap-of-2026-5-7"
# The 6 regular sessions in date order → their expected 1-based episode numbers.
REGULAR_IN_ORDER = [
    "000.through-a-song-darkly.2026-5-7",
    "000.through-a-song-darkly.2026-5-11",
    "000.through-a-song-darkly.2026-5-21",
    "000.through-a-song-darkly.2026-5-25",
    "000.through-a-song-darkly.2026-6-1",
    "000.through-a-song-darkly.2026-6-8",
]


# ── pure helpers ─────────────────────────────────────────────────────────────


def test_strip_audio_tags() -> None:
    assert strip_audio_tags("[warm] Hey — [laughs] big week.") == "Hey — big week."
    assert strip_audio_tags("clean prose") == "clean prose"
    # punctuation isn't stranded after a removed tag
    assert strip_audio_tags("Wait [beat] , no.") == "Wait, no."


def test_parse_id_regular() -> None:
    assert parse_id("000.through-a-song-darkly.2026-5-25") == (
        0,
        "through-a-song-darkly",
        "2026-5-25",
    )


def test_parse_id_mega_keeps_recap_token_as_date() -> None:
    assert parse_id(MEGA_ID) == (0, "through-a-song-darkly", "2026-6-8-recap-of-2026-5-7")


def test_is_recap() -> None:
    assert is_recap(MEGA_ID)
    assert not is_recap("000.through-a-song-darkly.2026-6-8")


def test_episode_title_strips_campaign_prefix() -> None:
    assert (
        episode_title("Through a Song, Darkly — The Ballroom", "Through a Song, Darkly")
        == "The Ballroom"
    )
    # tolerant of a colon separator + case
    assert episode_title("through a song, darkly: Canary", "Through a Song, Darkly") == "Canary"
    # no prefix → unchanged
    assert (
        episode_title("We're Hot Rod People Now", "Through a Song, Darkly")
        == "We're Hot Rod People Now"
    )
    # an all-prefix title falls back to the full title (never empties)
    assert (
        episode_title("Through a Song, Darkly", "Through a Song, Darkly")
        == "Through a Song, Darkly"
    )


def test_build_episode_numbers_ranks_by_date_recap_zero() -> None:
    ids = [*REGULAR_IN_ORDER, MEGA_ID]
    numbers = build_episode_numbers(ids)
    assert [numbers[i] for i in REGULAR_IN_ORDER] == [1, 2, 3, 4, 5, 6]
    assert numbers[MEGA_ID] == 0


def test_build_episode_numbers_is_date_ordered_not_input_ordered() -> None:
    # shuffle the input; numbering must follow date, not list order
    numbers = build_episode_numbers(list(reversed(REGULAR_IN_ORDER)))
    assert numbers["000.through-a-song-darkly.2026-5-7"] == 1
    assert numbers["000.through-a-song-darkly.2026-6-8"] == 6


# ── build over the golden fixtures ───────────────────────────────────────────


def _session_inputs() -> list[SessionInput]:
    out: list[SessionInput] = []
    for script_path in SCRIPTS:
        sid = script_path.name[: -len(".script.json")]
        script = json.loads(script_path.read_text())
        digest = json.loads((GOLDEN / f"{sid}.digest.json").read_text())
        out.append(
            SessionInput(
                id=sid,
                title=script["title"],
                synopsis=digest["synopsis"],
                duration_ms=0,
                has_audio=False,
                has_transcript=False,
                audio_version="",
                turns=tuple((t["speaker"], t["text"]) for t in script["turns"]),
                hosts=_read_hosts(script),
            )
        )
    return out


@pytest.fixture
def index():
    from astra_mouthpiece.assets import _arc_maps, _episode_hosts

    arc_titles, arc_main = _arc_maps()
    return build_index(
        _session_inputs(), arc_titles=arc_titles, arc_main=arc_main, hosts=_episode_hosts()
    )


def test_index_covers_every_golden_session(index) -> None:
    assert len(index.episodes) == 7
    assert {e.id for e in index.episodes} == {*REGULAR_IN_ORDER, MEGA_ID}


def test_index_sorted_arc_then_date_recap_last(index) -> None:
    # the mega shares 2026-6-8's sort key but is the capstone → sorts last
    assert [e.id for e in index.episodes] == [*REGULAR_IN_ORDER, MEGA_ID]


def test_index_episode_numbers(index) -> None:
    by_id = {e.id: e for e in index.episodes}
    assert [by_id[i].episode_no for i in REGULAR_IN_ORDER] == [1, 2, 3, 4, 5, 6]
    assert by_id[MEGA_ID].episode_no == 0


def test_index_arc_title_and_main_from_ontology(index) -> None:
    for e in index.episodes:
        assert e.arc_slug == "through-a-song-darkly"
        assert e.arc_title == "Through a Song, Darkly"
        assert e.is_main is True


def test_index_hosts_and_episode_title(index) -> None:
    e = index.episodes[0]
    assert e.hosts["A"].name == "Bram"
    assert e.hosts["B"].name == "Maeve"
    assert e.hosts["C"].name == "Pip"
    # episode_title never empties and has no leading arc prefix
    assert e.episode_title
    assert not e.episode_title.lower().startswith("through a song, darkly")


def test_index_inlines_a_stripped_named_transcript(index) -> None:
    import re

    e = index.episodes[0]
    assert e.transcript, "transcript turns are inlined into the manifest (D4)"
    for line in e.transcript:
        # speaker labels resolve to host names; no leftover ElevenLabs [..] cues
        assert line.speaker in {"A", "B", "C"}
        assert line.name in {"Bram", "Maeve", "Pip"}
        assert not re.search(r"\[[^\][]*\]", line.text)


def test_index_dumps_camelcase_for_the_ts_consumer(index) -> None:
    row = json.loads(index.model_dump_json(by_alias=True))["episodes"][0]
    for key in (
        "arcNo",
        "arcTitle",
        "episodeNo",
        "isMain",
        "dateSortKey",
        "episodeTitle",
        "durationMs",
        "hasAudio",
        "hasTranscript",
        "audioVersion",
        "transcript",
    ):
        assert key in row
    assert row["hosts"]["A"]["name"] == "Bram"
    assert row["transcript"][0]["name"] in {"Bram", "Maeve", "Pip"}


# ── the impure shell over a session-dir tree ─────────────────────────────────


def test_discover_sessions_globs_dirs_and_skips_scriptless(tmp_path: Path) -> None:
    # two real sessions laid out as episodes_path/<id>/{script,digest}.json
    for sid in ("000.through-a-song-darkly.2026-5-7", "000.through-a-song-darkly.2026-6-8"):
        d = tmp_path / sid
        d.mkdir()
        (d / "script.json").write_text((GOLDEN / f"{sid}.script.json").read_text())
        (d / "digest.json").write_text((GOLDEN / f"{sid}.digest.json").read_text())
    # a dir with no script.json is skipped
    (tmp_path / "000.through-a-song-darkly.2026-9-9").mkdir()

    sessions = discover_sessions(tmp_path)
    assert {s.id for s in sessions} == {
        "000.through-a-song-darkly.2026-5-7",
        "000.through-a-song-darkly.2026-6-8",
    }
    for s in sessions:
        assert s.title
        assert s.synopsis
        assert s.turns  # script turns read for the inlined transcript
        assert s.has_audio is False  # no mp3 seeded in this tree
        assert s.duration_ms == 0
        assert s.audio_version == ""


def test_build_index_dedups_same_id_keeping_most_complete() -> None:
    # the migrated back-catalog (metadata only) and a live render can both surface an
    # id; the live one (audio on disk + fuller transcript) must win, exactly once.
    from astra_mouthpiece.assets import _arc_maps, _episode_hosts

    eid = "000.through-a-song-darkly.2026-5-7"
    historical = SessionInput(
        id=eid, title="t", synopsis="s", duration_ms=0, has_audio=False,
        has_transcript=False, audio_version="", turns=(("A", "hi"),),
    )  # fmt: skip
    live = SessionInput(
        id=eid, title="t", synopsis="s", duration_ms=1000, has_audio=True,
        has_transcript=True, audio_version="ab-cd", turns=(("A", "hi"), ("B", "yo")),
    )  # fmt: skip
    arc_titles, arc_main = _arc_maps()
    index = build_index(
        [historical, live], arc_titles=arc_titles, arc_main=arc_main, hosts=_episode_hosts()
    )
    assert len(index.episodes) == 1
    e = index.episodes[0]
    assert e.has_audio is True  # the live render won
    assert len(e.transcript) == 2


def test_discover_sessions_keys_on_script_id_not_dir_name(tmp_path: Path) -> None:
    # The LIVE pipeline keys its dir by DATE but names audio/transcript by episode id
    # (assemble_episode) and writes the id into script.json as snake_case `session_id`.
    # Discovery must key on the script id, not the date dir, and still find the audio.
    episode_id = "000.through-a-song-darkly.2026-6-22"
    date_dir = tmp_path / "2026-6-22"
    date_dir.mkdir()
    script = json.loads((GOLDEN / "000.through-a-song-darkly.2026-6-8.script.json").read_text())
    del script["sessionId"]  # astra model dump uses snake_case, not the faerrin wire key
    script["session_id"] = episode_id
    (date_dir / "script.json").write_text(json.dumps(script))
    (date_dir / "digest.json").write_text(
        (GOLDEN / "000.through-a-song-darkly.2026-6-8.digest.json").read_text()
    )
    # audio + transcript are named by the EPISODE ID, not the date dir
    (date_dir / f"{episode_id}.episode.mp3").write_bytes(b"\x00")
    (date_dir / f"{episode_id}.transcript.md").write_text("# x")

    sessions = discover_sessions(tmp_path)
    assert len(sessions) == 1
    s = sessions[0]
    assert s.id == episode_id  # the real id, not "2026-6-22"
    assert s.has_audio is True  # found despite the date-keyed dir
    assert s.has_transcript is True
    assert s.audio_version  # cache-bust token computed off the seeded mp3


def test_episode_host_model_drops_voice_id() -> None:
    # the manifest host shape carries name+persona only (voice ids stay TTS-only)
    assert set(EpisodeHost(name="Bram", persona="warm").model_dump().keys()) == {"name", "persona"}
