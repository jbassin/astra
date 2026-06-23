"""Per-track Groq transcription (Decision G) — VAD-trim → chunk → re-offset.

Replaces faerrin's whisperx + forced-align step. Per track: detect silence
(ffmpeg) → voiced spans → chunks → cut+transcode each chunk to 16 kHz mono flac →
Groq `whisper-large-v3` `verbose_json` (segments only, via `libs/py/llm`) →
re-offset each chunk's segments back to the session timeline. Word timestamps are
dropped (F1). The ffmpeg + Groq calls are injected, so the orchestration
unit-tests with stubs (no ffmpeg/network).
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from astra_llm import GROQ_WHISPER, TranscriptionFn, transcribe

from . import audio
from .vad import chunk_spans, voiced_spans

#: Seam: run an ffmpeg/ffprobe argv (defaults to the real subprocess runner).
FfmpegRunner = Callable[[list[str]], "subprocess.CompletedProcess[str]"]


@dataclass(slots=True)
class TrackTranscriber:
    """Transcribes one Craig track to session-aligned `[{start,end,text}]` segments."""

    api_key: str | None = None
    model: str = GROQ_WHISPER
    max_chunk_sec: float = 1200.0
    # Groq rejects audio shorter than 0.01s ("Audio file is too short"); a sub-100ms
    # voiced blip (a mic pop, a breath) carries no transcribable speech anyway. Drop
    # such chunks so one near-silent Craig track can't fail the whole session.
    min_chunk_sec: float = 0.1
    # VAD tuning (Risk 3 — finalize against a real session at the live run).
    pre_roll: float = 0.2
    post_roll: float = 0.2
    merge_gap: float = 1.0
    transcription_fn: TranscriptionFn | None = None
    run: FfmpegRunner = field(default=audio.run_ffmpeg)

    def _duration(self, path: str) -> float:
        out = self.run(audio.probe_duration_args(path)).stdout.strip()
        return float(out) if out else 0.0

    def _voiced(self, path: str, duration: float) -> list[tuple[float, float]]:
        stderr = self.run(audio.silencedetect_args(path)).stderr
        return voiced_spans(
            audio.parse_silences(stderr),
            duration,
            pre_roll=self.pre_roll,
            post_roll=self.post_roll,
            merge_gap=self.merge_gap,
        )

    def transcribe_track(self, aac_path: Path | str, work_dir: Path | str) -> list[dict[str, Any]]:
        """Voiced spans → chunks → Groq → segments re-offset to the session timeline."""
        path = str(aac_path)
        work = Path(work_dir)
        work.mkdir(parents=True, exist_ok=True)
        duration = self._duration(path)
        chunks = [
            (start, end)
            for start, end in chunk_spans(self._voiced(path, duration), self.max_chunk_sec)
            if end - start >= self.min_chunk_sec
        ]

        segments: list[dict[str, Any]] = []
        for i, (start, end) in enumerate(chunks):
            flac = work / f"chunk-{i:04d}.flac"
            self.run(audio.chunk_args(path, start, end, str(flac)))
            # The cut flac can be far shorter than its span — `chunk_args` uses `-ss`
            # input-seek (snaps to a keyframe, overshoots near EOF) and ffprobe's container
            # duration can overstate the real audio stream — so re-check the ACTUAL flac,
            # not the span. Groq 400s on audio < 0.01s; skip a too-short (speechless) cut.
            if self._duration(str(flac)) < self.min_chunk_sec:
                continue
            try:
                chunk_segments = list(
                    transcribe(
                        flac,
                        model=self.model,
                        api_key=self.api_key,
                        transcription_fn=self.transcription_fn,
                    )
                )
            except Exception as exc:  # noqa: BLE001 — backstop on Groq's own length floor
                # Belt-and-suspenders beyond the duration probe: if Groq still rejects the
                # clip as too short (a silence-padded AAC whose probed duration overstates
                # the decodable audio), skip it rather than fail the whole session. Any
                # other error is real — re-raise it.
                if "too short" in str(exc).lower():
                    continue
                raise
            for seg in chunk_segments:
                # Each chunk is a contiguous session slice → offset is just `start`.
                segments.append(
                    {
                        "start": round(seg.start + start, 3),
                        "end": round(seg.end + start, 3),
                        "text": seg.text,
                    }
                )
        return segments
