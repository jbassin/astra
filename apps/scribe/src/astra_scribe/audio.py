"""ffmpeg wrappers — the merge, silence detection, and chunk transcode.

The arg-builders are PURE (no I/O), so they unit-test without ffmpeg on PATH
(faerrin's `mergeArgs` testability, carried over). `run_ffmpeg` is the thin
subprocess seam injected in tests. ffmpeg is a runtime dep (present locally + in
the Dagster image).
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

_BASE = ["ffmpeg", "-hide_banner", "-loglevel", "error"]


def merge_args(inputs: list[str], out_path: str) -> list[str]:
    """ffmpeg argv for the per-speaker amix → one mp3 (ported from `audio.ts`).

    `normalize=0` preserves per-track levels (summing, like pydub's overlay);
    `-f mp3` is explicit so an atomic `.tmp` output path still picks the muxer.
    """
    return [
        *_BASE,
        *[arg for f in inputs for arg in ("-i", f)],
        "-filter_complex",
        f"amix=inputs={len(inputs)}:duration=longest:normalize=0",
        "-f",
        "mp3",
        "-y",
        out_path,
    ]


def silencedetect_args(
    input_path: str, *, noise_db: int = 30, min_silence: float = 0.5
) -> list[str]:
    """ffmpeg argv that logs silence_start/silence_end to stderr (VAD source)."""
    return [
        *_BASE,
        "-i",
        input_path,
        "-af",
        f"silencedetect=noise=-{noise_db}dB:d={min_silence}",
        "-f",
        "null",
        "-",
    ]


def chunk_args(input_path: str, start: float, end: float, out_path: str) -> list[str]:
    """ffmpeg argv to cut [start,end] → 16 kHz mono flac (a Groq-accepted chunk, N3)."""
    return [
        *_BASE,
        "-ss",
        f"{start:.3f}",
        "-i",
        input_path,
        "-t",
        f"{max(0.0, end - start):.3f}",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "flac",
        "-y",
        out_path,
    ]


_SILENCE_RE = re.compile(r"silence_(start|end):\s*(-?\d+(?:\.\d+)?)")


def parse_silences(stderr: str) -> list[tuple[float, float]]:
    """Parse silencedetect stderr into `[(silence_start, silence_end), ...]`.

    A trailing `silence_start` with no matching `end` (silence to EOF) is dropped
    here; the caller clamps voiced spans to the known track duration.
    """
    starts: list[float] = []
    spans: list[tuple[float, float]] = []
    for kind, value in _SILENCE_RE.findall(stderr):
        if kind == "start":
            starts.append(float(value))
        elif starts:
            spans.append((starts.pop(), float(value)))
    return spans


def probe_duration_args(input_path: str) -> list[str]:
    """ffprobe argv that prints a track's duration in seconds."""
    return [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        input_path,
    ]


def run_ffmpeg(args: list[str], cwd: Path | str | None = None) -> subprocess.CompletedProcess[str]:
    """Run an ffmpeg/ffprobe argv, capturing stderr (silencedetect logs there)."""
    return subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
    )
