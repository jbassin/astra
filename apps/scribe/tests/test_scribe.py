"""scribe unit + parity tests (NLSpec 0005 gates B–G) — hermetic.

No ffmpeg, no network, no Groq key: ffmpeg/Groq calls are injected stubs, the
SoundStack parity runs on a committed real-transcript sample, and the VAD/chunk/
re-offset math is exercised on synthetic timing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from astra_scribe.audio import chunk_args, merge_args, parse_silences, silencedetect_args
from astra_scribe.naming import session_date, track_index, track_user
from astra_scribe.roster import Roster
from astra_scribe.sensor import new_sessions
from astra_scribe.sound_stack import SoundStack
from astra_scribe.transcribe import TrackTranscriber
from astra_scribe.vad import chunk_spans, voiced_spans

FIXTURE = Path(__file__).parent / "fixtures" / "sample-script.json"


# ── Craig filename parsing (gate D) ────────────────────────────────────────
def test_track_and_session_naming() -> None:
    assert track_user("1-miked6187") == "miked6187"
    assert track_index("1-miked6187") == "0"
    assert track_user("5-tanner_kn") == "tanner"
    assert track_index("5-tanner_kn") == "kn"
    assert track_user("not-a-track-stem") == ""  # 3 dash-fields → not a track
    assert session_date("guild_channel_2025-4-17_abc") == "2025-4-17"
    assert session_date("malformed") == ""


def test_roster_filter() -> None:
    roster = Roster({"miked6187", "tanner"})
    assert roster.is_player("1-miked6187")
    assert roster.is_player("5-tanner_kn")
    assert not roster.is_player("2-craigbot")  # not a player → dropped
    assert roster.user_of("1-miked6187") == "miked6187"


# ── SoundStack time-merge (gate B) ─────────────────────────────────────────
def test_soundstack_parity_round_trip() -> None:
    """Group a real (start-sorted) transcript by user → SoundStack → reproduces it."""
    script: list[dict[str, Any]] = json.loads(FIXTURE.read_text())
    by_user: dict[str, list[dict[str, Any]]] = {}
    for seg in script:
        by_user.setdefault(seg["user"], []).append(
            {"start": seg["start"], "end": seg["end"], "text": seg["text"]}
        )

    stack = SoundStack()
    for user, segs in by_user.items():
        stack.add(user, segs)
    merged = stack.drain()

    assert merged == script  # same global order + user tags as faerrin produced


def test_soundstack_orders_by_start() -> None:
    stack = SoundStack()
    stack.add("a", [{"start": 0.0, "text": "x"}, {"start": 5.0, "text": "z"}])
    stack.add("b", [{"start": 2.0, "text": "y"}])
    assert [s["text"] for s in stack.drain()] == ["x", "y", "z"]


# ── VAD / chunk / re-offset (gate C) ───────────────────────────────────────
def test_voiced_spans_inverts_silence() -> None:
    # 0–10s track, silent 3–4 and 7–8 → three voiced runs (roll merges nothing here).
    spans = voiced_spans([(3.0, 4.0), (7.0, 8.0)], 10.0, pre_roll=0.0, post_roll=0.0, merge_gap=0.0)
    assert spans == [(0.0, 3.0), (4.0, 7.0), (8.0, 10.0)]


def test_voiced_spans_merges_small_gaps() -> None:
    spans = voiced_spans([(3.0, 3.5)], 10.0, pre_roll=0.0, post_roll=0.0, merge_gap=1.0)
    assert spans == [(0.0, 10.0)]  # the 0.5s gap is bridged


def test_chunk_spans_splits_long_runs() -> None:
    assert chunk_spans([(0.0, 50.0)], max_sec=20.0) == [(0.0, 20.0), (20.0, 40.0), (40.0, 50.0)]


def test_voiced_spans_edge_cases() -> None:
    # Entirely voiced (no silences) → one span covering the track.
    assert voiced_spans([], 30.0, pre_roll=0.0, post_roll=0.0) == [(0.0, 30.0)]
    # Entirely silent (one silence spanning the track) → no voiced spans.
    assert voiced_spans([(0.0, 30.0)], 30.0, pre_roll=0.0, post_roll=0.0) == []
    # Zero-duration probe → nothing to transcribe.
    assert voiced_spans([], 0.0) == []
    assert chunk_spans([], max_sec=20.0) == []


def test_reoffset_maps_segments_to_session_time() -> None:
    """A chunk starting at 40s → its 0-relative Groq segments land at 40s+ (no dup/drop)."""

    def fake_run(args: list[str]) -> Any:
        # Stand in for ffmpeg: a chunk extraction must leave the output flac on disk
        # (transcribe() opens it), so create it; probe/silencedetect just return text.
        out = args[-1]
        if out.endswith(".flac"):
            Path(out).write_bytes(b"")

        class R:
            stdout = "100.0"  # probe_duration
            stderr = "silence_start: 40\nsilence_end: 45\n"  # silent 40–45

        return R()

    def fake_transcribe(**_kwargs: Any) -> Any:
        class Resp:
            segments = [{"start": 0.0, "end": 1.0, "text": "hi"}]

        return Resp()

    tx = TrackTranscriber(
        transcription_fn=fake_transcribe,
        run=fake_run,
        max_chunk_sec=20.0,
        pre_roll=0.0,
        post_roll=0.0,
        merge_gap=0.0,
    )
    segs = tx.transcribe_track("x.aac", "/tmp/scribe-test-work")
    # Voiced runs: (0,40) and (45,100) → chunked at 20s → 5 chunks → 5 segments,
    # each offset to its chunk start.
    starts = sorted(s["start"] for s in segs)
    assert starts == [0.0, 20.0, 45.0, 65.0, 85.0]
    assert all(s["text"] == "hi" for s in segs)


def test_subminimum_chunks_are_skipped_not_sent_to_groq() -> None:
    """A sub-100ms voiced sliver is dropped, so Groq never sees a too-short clip."""
    calls: list[str] = []

    def fake_run(args: list[str]) -> Any:
        out = args[-1]
        if out.endswith(".flac"):
            Path(out).write_bytes(b"")

        class R:
            stdout = "10.0"  # probe_duration
            # voiced runs: (0,5) [transcribed] and (9.95,10.0) = 0.05s [too short]
            stderr = "silence_start: 5\nsilence_end: 9.95\n"

        return R()

    def fake_transcribe(**_kwargs: Any) -> Any:
        calls.append(str(_kwargs.get("file")))

        class Resp:
            segments = [{"start": 0.0, "end": 1.0, "text": "hi"}]

        return Resp()

    tx = TrackTranscriber(
        transcription_fn=fake_transcribe,
        run=fake_run,
        max_chunk_sec=20.0,
        pre_roll=0.0,
        post_roll=0.0,
        merge_gap=0.0,
    )
    segs = tx.transcribe_track("x.aac", "/tmp/scribe-test-work-short")
    # Only the (0,5) chunk reaches Groq; the 0.05s sliver is dropped before the call.
    assert len(calls) == 1
    assert [s["start"] for s in segs] == [0.0]


# ── ffmpeg arg-builders (gate F) ───────────────────────────────────────────
def test_ffmpeg_arg_builders_are_pure() -> None:
    assert merge_args(["a.aac", "b.aac"], "out.mp3")[-3:] == ["mp3", "-y", "out.mp3"]
    assert "amix=inputs=2:duration=longest:normalize=0" in merge_args(["a", "b"], "o")
    assert "16000" in chunk_args("in.aac", 1.0, 3.0, "o.flac")
    assert "silencedetect=noise=-30dB:d=0.5" in silencedetect_args("in.aac")


def test_parse_silences() -> None:
    log = "silence_start: 3.0\nsilence_end: 4.0 | silence_duration: 1.0\nsilence_start: 7.5\n"
    assert parse_silences(log) == [(3.0, 4.0)]  # the unmatched trailing start is dropped


# ── sensor partition logic (gate G) ────────────────────────────────────────
def test_new_sessions_skips_known_and_unparseable() -> None:
    zips = ["g_c_2025-1-1_a.zip", "g_c_2025-2-2_b.zip", "bad.zip"]
    found = new_sessions(zips, existing_keys={"2025-1-1"})
    assert found == {"2025-2-2": "g_c_2025-2-2_b.zip"}
