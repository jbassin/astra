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
        chunks = chunk_spans(self._voiced(path, duration), self.max_chunk_sec)

        segments: list[dict[str, Any]] = []
        for i, (start, end) in enumerate(chunks):
            flac = work / f"chunk-{i:04d}.flac"
            self.run(audio.chunk_args(path, start, end, str(flac)))
            for seg in transcribe(
                flac,
                model=self.model,
                api_key=self.api_key,
                transcription_fn=self.transcription_fn,
            ):
                # Each chunk is a contiguous session slice → offset is just `start`.
                segments.append(
                    {
                        "start": round(seg.start + start, 3),
                        "end": round(seg.end + start, 3),
                        "text": seg.text,
                    }
                )
        return segments
