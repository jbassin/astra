"""Per-session pieces a Dagster partition materializes — pure, injectable helpers.

Kept free of Dagster + config so they unit-test with injected deps: extract the
player tracks from a Craig zip (`extract_session_tracks`), merge them to
`audio.mp3` (ffmpeg amix), and transcribe + time-merge them to `script.json`
(`[{start,end,text,user}]`, no word timestamps). The asset layer (assets.py)
supplies real paths, the roster, and a `TrackTranscriber`, and owns the
fan-out/fan-in orchestration + telemetry spans.
"""

from __future__ import annotations

import os
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from . import audio
from .ingest import extract_tracks, player_tracks, verify_zip
from .roster import Roster
from .sound_stack import SoundStack
from .transcribe import FfmpegRunner, TrackTranscriber

#: Injectable seams (default to the real implementations); tests stub them.
type Verifier = Callable[[Path | str], None]
type Extractor = Callable[[Path | str, Path | str], list[Path]]


def extract_session_tracks(
    zip_path: Path | str,
    dest: Path | str,
    roster: Roster,
    *,
    verify: Verifier = verify_zip,
    extract: Extractor = extract_tracks,
) -> list[Path]:
    """Verify → extract → roster-filter → atomically publish player tracks to `dest`.

    One-time ingest shared by the audio + transcript tails: the surviving player
    tracks are persisted (flat, stems preserved — the stem encodes the discord
    user-id `build_transcript` needs) into `dest`. `dest` is published atomically
    — populated under a `.partial` sibling then `os.replace`d into place — so a
    downstream asset reading `dest` never sees a half-populated tracks dir.
    Returns the persisted track paths (in `dest`, sorted).
    """
    dest = Path(dest)
    verify(zip_path)
    partial = dest.with_name(dest.name + ".partial")
    if partial.exists():
        shutil.rmtree(partial)
    scratch = partial / "_extract"
    extracted = extract(zip_path, scratch)
    for track in player_tracks(extracted, roster):
        os.replace(track, partial / track.name)  # move up out of the scratch tree
    shutil.rmtree(scratch, ignore_errors=True)
    if dest.exists():
        shutil.rmtree(dest)
    os.replace(partial, dest)  # atomic publish (dest does not exist → plain rename)
    return sorted(dest.glob("*.aac"))


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
