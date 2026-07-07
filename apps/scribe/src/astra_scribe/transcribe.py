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
from astra_llm.transcription import HALLUCINATION_TEXT_RE
from astra_observe import get_meter, get_tracer

from . import audio
from .vad import chunk_spans, voiced_spans

_tracer = get_tracer("astra.scribe")
# Per-chunk outcome counter — surfaces the Groq ASR call rate (each "transcribed" chunk is
# one Groq call) and the skip rate, which the session/track totals alone don't show.
_chunks = get_meter("astra.scribe").create_counter(
    "astra.scribe.chunks", description="Audio chunks processed per track, by outcome"
)
# Per-segment outcome counter — surfaces the post-ASR hallucination-gate drop rate.
_segments = get_meter("astra.scribe").create_counter(
    "astra.scribe.segments", description="Transcribed segments per track, by outcome"
)

#: Seam: run an ffmpeg/ffprobe argv (defaults to the real subprocess runner).
FfmpegRunner = Callable[[list[str]], "subprocess.CompletedProcess[str]"]

# OpenAI whisper reference heuristic for a hallucinated segment (e.g. "you" / "Thank
# you." on silence/noise): Whisper itself signals low confidence on BOTH axes at once —
# high probability the audio had no speech at all, AND a low average token log-prob for
# the text it emitted anyway. Only drop when both trip (fail open on either alone, and
# on missing fields — some provider responses omit them).
NO_SPEECH_THRESHOLD = 0.6
AVG_LOGPROB_THRESHOLD = -1.0


@dataclass(slots=True)
class TrackTranscriber:
    """Transcribes one Craig track to session-aligned `[{start,end,text}]` segments."""

    api_key: str | None = None
    model: str = GROQ_WHISPER
    # 8-min chunks: with chunk_args' 16 kHz mono s16 flac (32 KB/s, lossless = raw ceiling),
    # any chunk is ≤ ~14.6 MiB — safely under Groq's ~25 MB direct-upload cap (1200s/s32 was
    # 413-ing "Request Entity Too Large"). Smaller chunks just mean a few more cheap calls.
    max_chunk_sec: float = 480.0
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
        # ffprobe prints "N/A" (not a number) for a degenerate/near-empty cut whose
        # header carries no duration — treat any unparseable value as 0.0 so such a clip
        # is skipped as too-short rather than crashing the session.
        out = self.run(audio.probe_duration_args(path)).stdout.strip()
        try:
            return float(out)
        except ValueError:
            return 0.0

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
        with _tracer.start_as_current_span("scribe.transcribe_track") as span:
            span.set_attribute("scribe.track", Path(aac_path).stem)
            path = str(aac_path)
            work = Path(work_dir)
            work.mkdir(parents=True, exist_ok=True)
            duration = self._duration(path)
            chunks = [
                (start, end)
                for start, end in chunk_spans(self._voiced(path, duration), self.max_chunk_sec)
                if end - start >= self.min_chunk_sec
            ]
            span.set_attribute("scribe.chunks", len(chunks))

            segments: list[dict[str, Any]] = []
            dropped_no_speech = 0
            dropped_hallucination_text = 0
            for i, (start, end) in enumerate(chunks):
                flac = work / f"chunk-{i:04d}.flac"
                self.run(audio.chunk_args(path, start, end, str(flac)))
                # The cut flac can be far shorter than its span — `chunk_args` uses `-ss`
                # input-seek (snaps to a keyframe, overshoots near EOF) and ffprobe's container
                # duration can overstate the real audio stream — so re-check the ACTUAL flac,
                # not the span. Groq 400s on audio < 0.01s; skip a too-short (speechless) cut.
                if self._duration(str(flac)) < self.min_chunk_sec:
                    _chunks.add(1, {"outcome": "skipped_short"})
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
                        _chunks.add(1, {"outcome": "skipped_groq"})
                        continue
                    raise
                _chunks.add(1, {"outcome": "transcribed"})
                for seg in chunk_segments:
                    # Post-ASR hallucination gate, two prongs:
                    # 1. Confidence (OpenAI whisper reference heuristic) — drop only when
                    #    BOTH signals trip. Missing fields ⇒ keep (fail open).
                    # 2. Text family — the "you"/"thank you" silence-hallucination family,
                    #    which the confidence prong measurably misses (live 2026-7-6 rerun:
                    #    1,041 family segments survived it — Whisper is confidently wrong
                    #    over real non-speech energy).
                    if (
                        seg.no_speech_prob is not None
                        and seg.no_speech_prob > NO_SPEECH_THRESHOLD
                        and seg.avg_logprob is not None
                        and seg.avg_logprob < AVG_LOGPROB_THRESHOLD
                    ):
                        dropped_no_speech += 1
                        _segments.add(1, {"outcome": "dropped_no_speech"})
                        continue
                    if HALLUCINATION_TEXT_RE.match(seg.text.strip()):
                        dropped_hallucination_text += 1
                        _segments.add(1, {"outcome": "dropped_hallucination_text"})
                        continue
                    _segments.add(1, {"outcome": "kept"})
                    # Each chunk is a contiguous session slice → offset is just `start`.
                    segments.append(
                        {
                            "start": round(seg.start + start, 3),
                            "end": round(seg.end + start, 3),
                            "text": seg.text,
                        }
                    )
            span.set_attribute("scribe.dropped_no_speech", dropped_no_speech)
            span.set_attribute("scribe.dropped_hallucination_text", dropped_hallucination_text)
            return segments
