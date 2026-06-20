"""Per-session orchestration — the pieces a Dagster partition materializes.

Kept free of Dagster + config so it unit-tests with injected deps: merge the
player tracks to `audio.mp3` (ffmpeg amix) and transcribe + time-merge them to
`script.json` (`[{start,end,text,user}]`, no word timestamps). The asset layer
(assets.py) just supplies real paths, the roster, and a `TrackTranscriber`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from astra_observe import get_tracer

from . import audio
from .ingest import extract_tracks, player_tracks, verify_zip
from .roster import Roster
from .sound_stack import SoundStack
from .transcribe import FfmpegRunner, TrackTranscriber

_tracer = get_tracer("astra.scribe")


def merge_audio(
    tracks: list[Path], out_path: Path | str, *, run: FfmpegRunner = audio.run_ffmpeg
) -> None:
    """ffmpeg amix the player tracks into one mp3 (padded to the longest).

    Writes to a `.tmp` then renames so the output only ever appears whole — a
    materialized partition = "done" (N7), so a crash mid-write must not leave a
    half-written `audio.mp3`. (ffmpeg can't infer the muxer from `.tmp`, which is
    why `merge_args` sets `-f mp3` explicitly.)
    """
    if not tracks:
        raise ValueError("merge_audio: no input tracks")
    out = Path(out_path)
    tmp = out.with_suffix(out.suffix + ".tmp")
    run(audio.merge_args([str(t) for t in tracks], str(tmp)))
    os.replace(tmp, out)


def build_transcript(
    tracks: list[Path],
    roster: Roster,
    transcriber: TrackTranscriber,
    work_dir: Path | str,
) -> list[dict[str, Any]]:
    """Transcribe each player track, then time-merge to one user-tagged stream."""
    stack = SoundStack()
    for track in tracks:
        segments = transcriber.transcribe_track(track, Path(work_dir) / track.stem)
        stack.add(roster.user_of(track.stem), segments)
    return stack.drain()


def process_session(
    zip_path: Path | str,
    *,
    out_dir: Path | str,
    work_dir: Path | str,
    roster: Roster,
    transcriber: TrackTranscriber,
    run: FfmpegRunner = audio.run_ffmpeg,
) -> dict[str, int]:
    """Full session: verify → extract → filter → audio.mp3 + script.json."""
    with _tracer.start_as_current_span("scribe.process_session") as span:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        verify_zip(zip_path)
        tracks = player_tracks(extract_tracks(zip_path, Path(work_dir) / "tracks"), roster)

        merge_audio(tracks, out / "audio.mp3", run=run)
        script = build_transcript(tracks, roster, transcriber, Path(work_dir) / "chunks")

        # Atomic appearance for the transcript too (N7).
        script_path = out / "script.json"
        tmp = script_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(script), encoding="utf-8")
        os.replace(tmp, script_path)

        span.set_attribute("scribe.tracks", len(tracks))
        span.set_attribute("scribe.segments", len(script))
        return {"tracks": len(tracks), "segments": len(script)}
