"""mega + sharpen + threads + linguist I/O tests — hermetic."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from astra_linguist.chronicle import EpisodeEntry, EpisodeSummary, Season
from astra_llm import ToolCallRequest
from astra_mouthpiece.continuity import CONTINUITY_BUDGET, build_continuity_block
from astra_mouthpiece.linguist_io import (
    new_sessions,
    parse_canonical_transcript,
    parse_filename,
)
from astra_mouthpiece.mega import (
    MegaMember,
    build_mega_user_content,
    date_in_range,
    date_sort_key,
    fuse_digests,
    mega_id,
    select_members,
)
from astra_mouthpiece.models import (
    Beat,
    GroundingEntry,
    HostConfig,
    HostPersona,
    Script,
    ScriptTurn,
    SessionDigest,
    Thread,
)
from astra_mouthpiece.prompts import build_script_user_content
from astra_mouthpiece.script import ScriptParseError
from astra_mouthpiece.sharpen import sharpen_voices
from astra_mouthpiece.threads import format_threads, load_threads, merge_threads, save_threads

HOSTS = HostConfig(
    a=HostPersona(name="Bram", persona="x"),
    b=HostPersona(name="Maeve", persona="x"),
    c=HostPersona(name="Pip", persona="x"),
)


def _digest(session_id: str, date: str) -> SessionDigest:
    return SessionDigest(
        session_id=session_id, synopsis=f"syn {date}", beats=[Beat(order=1, summary="b")]
    )


def _member(date: str, arc: str = "through-a-song-darkly") -> MegaMember:
    sid = f"000.{arc}.{date}"
    return MegaMember(session_id=sid, date=date, arc=arc, digest=_digest(sid, date))


# ── mega selection + synthetic id (pure) ───────────────────────────────────
def test_date_sort_key_and_range() -> None:
    assert date_sort_key("2026-5-7") < date_sort_key("2026-5-11")
    assert date_in_range("2026-5-9", "2026-5-7", "2026-5-11")
    assert not date_in_range("2026-6-1", "2026-5-7", "2026-5-11")


def test_select_members_and_mega_id() -> None:
    members = [_member("2026-5-7"), _member("2026-5-11"), _member("2026-6-1")]
    picked = select_members(members, "2026-5-7", "2026-5-11")
    assert [m.date for m in picked] == ["2026-5-7", "2026-5-11"]
    assert mega_id(picked) == "000.through-a-song-darkly.2026-5-11-recap-of-2026-5-7"


def test_select_members_rejects_cross_arc() -> None:
    members = [_member("2026-5-7", "arc-one"), _member("2026-5-8", "arc-two")]
    with pytest.raises(ValueError, match="multiple arcs"):
        select_members(members, "2026-5-1", "2026-6-1")


def test_build_mega_user_content_has_budget_and_members() -> None:
    content = build_mega_user_content([_member("2026-5-7"), _member("2026-5-11")], target_beats=15)
    assert "Beat budget: about 15 beats" in content
    assert "Session 1 —" in content and "Session 2 —" in content


def test_fuse_digests_reuses_distill_tool() -> None:
    class Stub:
        def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
            self.req = req
            return {"synopsis": "fused", "beats": [{"order": 1, "summary": "big"}], "discarded": []}

        def call_text(self, req: Any) -> str:  # satisfies the protocol
            return ""

    stub = Stub()
    fused = fuse_digests(stub, "mega-id", [_member("2026-5-7"), _member("2026-5-11")])
    assert fused.session_id == "mega-id"
    assert fused.synopsis == "fused"
    assert "MONTH-IN-REVIEW" in stub.req.system  # the mega system prompt


# ── sharpen ─────────────────────────────────────────────────────────────────
def _script() -> Script:
    return Script(
        session_id="s",
        title="t",
        hosts=HOSTS,
        turns=[ScriptTurn(speaker="A", text="one"), ScriptTurn(speaker="B", text="two")],
    )


def test_sharpen_runs_one_pass_per_host() -> None:
    class Stub:
        def __init__(self) -> None:
            self.passes = 0

        def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
            self.passes += 1
            return {
                "title": "t",
                "turns": [{"speaker": "A", "text": "1"}, {"speaker": "B", "text": "2"}],
            }

        def call_text(self, req: Any) -> str:
            return ""

    stub = Stub()
    sharpen_voices(stub, _script(), HOSTS)
    assert stub.passes == 2  # one pass per host (A, B)


def test_sharpen_rejects_turn_count_drift() -> None:
    class Stub:
        def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
            return {"title": "t", "turns": [{"speaker": "A", "text": "only one"}]}

        def call_text(self, req: Any) -> str:
            return ""

    with pytest.raises(ScriptParseError, match="turn count"):
        sharpen_voices(Stub(), _script(), HOSTS)


# ── threads ─────────────────────────────────────────────────────────────────
def test_threads_merge_dedup_and_cap() -> None:
    existing = [Thread(text="the milk thing", kind="joke")]
    incoming = [Thread(text="The Milk Thing!", kind="joke"), Thread(text="new bit", kind="bit")]
    merged = merge_threads(existing, incoming)
    assert [t.text for t in merged] == ["the milk thing", "new bit"]  # normalized dup dropped
    assert merge_threads(existing, incoming, max_threads=1) == [Thread(text="new bit", kind="bit")]


def test_threads_format_and_roundtrip(tmp_path: Path) -> None:
    threads = [Thread(text="a grudge", kind="grudge")]
    assert "RUNNING THREADS" in format_threads(threads)
    assert format_threads([]) == ""
    p = tmp_path / "threads.json"
    save_threads(p, threads)
    assert load_threads(p) == threads
    assert load_threads(tmp_path / "missing.json") == []


# ── 0021 Change B: recap continuity block + script-stage injection ───────────
def _ep(
    date: str,
    title: str,
    *,
    synopsis: str = "syn",
    cliff: str = "",
    beats: list[str] | None = None,
) -> EpisodeEntry:
    return EpisodeEntry(
        date=date,
        show="through-a-song-darkly",
        summary=EpisodeSummary(
            title=title,
            synopsis=synopsis,
            key_beats=beats or [],
            characters_present=[],
            locations=[],
            factions=[],
            items=[],
            cliffhanger=cliff,
        ),
    )


def test_continuity_block_renders_season_and_priors() -> None:
    prior = [
        _ep("2025-10-20", "E1"),
        _ep("2025-10-27", "E2"),
        _ep("2025-11-4", "E3", cliff="A door opens.", beats=["b1", "b2"]),  # most-recent
    ]
    season = Season(number=1, title="The Descent", arc_summary="They go under.", episode_dates=[])
    block = build_continuity_block(prior, season)
    assert 'SEASON — "The Descent": They go under.' in block
    assert "PREVIOUSLY, on this show" in block
    assert "- E1 — syn" in block and "- E2 — syn" in block  # older: title + synopsis only
    # the most-recent episode gets its cliffhanger + a few beats
    assert "Cliffhanger: A door opens." in block
    assert "Beats: b1; b2" in block
    # older episodes do NOT carry beats/cliffhanger detail
    assert block.index("- E1 — syn") < block.index("Cliffhanger:")


def test_continuity_block_empty_when_nothing() -> None:
    assert build_continuity_block([], None) == ""


def test_continuity_block_budget_trims_least_recent_first() -> None:
    big = "x" * 400
    prior = [_ep(f"2025-1-{i}", f"E{i}", synopsis=big) for i in range(1, 9)]  # 8 fat episodes
    block = build_continuity_block(prior, None, budget=600)
    assert len(block) <= 600
    assert "E8" in block  # most-recent kept
    assert "E1" not in block  # least-recent trimmed first


def test_script_user_content_byte_identical_when_no_continuity() -> None:
    beats = [Beat(order=1, summary="they fought")]
    grounding = [GroundingEntry(refs=["r"], title="Page", path="page", text="lore")]
    base = build_script_user_content("syn", "000.x.2025-1-1", beats, grounding)
    assert build_script_user_content("syn", "000.x.2025-1-1", beats, grounding, "") == base
    assert build_script_user_content("syn", "000.x.2025-1-1", beats, grounding, "", "") == base
    # with continuity, the block lands ABOVE the session beats
    withc = build_script_user_content(
        "syn", "000.x.2025-1-1", beats, grounding, "", "PREVIOUSLY: stuff"
    )
    assert "PREVIOUSLY: stuff" in withc
    assert withc.index("PREVIOUSLY: stuff") < withc.index("Things that happened this session")
    assert CONTINUITY_BUDGET == 6_000


# ── linguist I/O ─────────────────────────────────────────────────────────────
def test_parse_filename() -> None:
    sid, arc, date = parse_filename("000.through-a-song-darkly.2025-10-20.txt")
    assert sid == "000.through-a-song-darkly.2025-10-20"
    assert arc == "through-a-song-darkly"
    assert date == "2025-10-20"


def test_parse_canonical_transcript() -> None:
    text = "000001\tBenny: tests.  \n000002\tGamemaster: Are you recording?  \njunk line\n"
    turns = parse_canonical_transcript(text)
    assert turns == [(1, "Benny", "tests."), (2, "Gamemaster", "Are you recording?")]


def test_new_sessions_skips_known(tmp_path: Path) -> None:
    (tmp_path / "000.arc.2025-1-1.txt").write_text("x")
    (tmp_path / "000.arc.2025-2-2.txt").write_text("x")
    found = new_sessions({"2025-1-1"}, transcript_dir=tmp_path)
    assert set(found) == {"2025-2-2"}
