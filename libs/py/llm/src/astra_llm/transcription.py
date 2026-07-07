"""Audio transcription through litellm — the one LLM seam for speech-to-text.

scribe (0005) routes its Groq `whisper-large-v3` calls here so **all** model
access goes through `libs/py/llm` (standing principle #3). The `transcription_fn`
seam (defaults to `litellm.transcription`) lets tests inject a recorded response,
so unit tests need neither network nor a Groq key.

    from astra_llm import transcribe
    segments = transcribe("chunk.flac", model="groq/whisper-large-v3")
    # → [Segment(start, end, text, no_speech_prob, avg_logprob), ...]
    #   (verbose_json, segments only — F1 drops words; the two probs are Whisper's own
    #   hallucination signal, carried through for a post-ASR confidence gate)
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pydantic import BaseModel

#: Inject in tests; defaults to `litellm.transcription` (lazy-imported below).
TranscriptionFn = Callable[..., Any]

GROQ_WHISPER = "groq/whisper-large-v3"

#: A segment whose ENTIRE text is repetitions of "you" / "thank you" — the canonical
#: Whisper silence-hallucination family (non-speech audio energy — breathing, hum —
#: transcribes as these; measured at 15-18% of lines on real astra sessions). The
#: confidence heuristic (no_speech_prob/avg_logprob) rarely catches them: there IS
#: audio energy and Whisper is confidently wrong. Deliberately narrow — "Okay."/
#: "Yeah."/"Yes." are real speech and must not match. Shared by scribe (source gate)
#: and mouthpiece (belt-and-suspenders on historical transcripts).
HALLUCINATION_TEXT_RE = re.compile(r"^(?:(?:thank\s+)?you\b[\s.,!?]*)+$", re.IGNORECASE)


class Segment(BaseModel):
    """One transcribed segment — line-level only (word timestamps dropped, F1)."""

    start: float
    end: float
    text: str
    #: Whisper's own hallucination signal (OpenAI verbose_json shape). Missing on some
    #: provider responses → None, never raised on.
    no_speech_prob: float | None = None
    avg_logprob: float | None = None


def _default_transcription(**kwargs: Any) -> Any:
    # Lazy so `import astra_llm` and stubbed unit tests don't pay litellm's import cost.
    import litellm

    return litellm.transcription(**kwargs)


def _segments_of(response: Any) -> list[dict[str, Any]]:
    """Pull the segment list out of a litellm/OpenAI verbose_json response shape."""
    segments = getattr(response, "segments", None)
    if segments is None and isinstance(response, dict):
        segments = response.get("segments")
    return list(segments or [])


def transcribe(
    audio_path: Path | str,
    *,
    model: str = GROQ_WHISPER,
    api_key: str | None = None,
    transcription_fn: TranscriptionFn | None = None,
) -> list[Segment]:
    """Transcribe one audio file to line-level segments (verbose_json, segments only)."""
    fn = transcription_fn or _default_transcription
    with Path(audio_path).open("rb") as handle:
        response = fn(
            model=model,
            file=handle,
            response_format="verbose_json",
            **({"api_key": api_key} if api_key else {}),
        )
    out: list[Segment] = []
    for seg in _segments_of(response):
        start = seg["start"] if isinstance(seg, dict) else seg.start
        end = seg["end"] if isinstance(seg, dict) else seg.end
        text = seg["text"] if isinstance(seg, dict) else seg.text
        if isinstance(seg, dict):
            no_speech_prob = seg.get("no_speech_prob")
            avg_logprob = seg.get("avg_logprob")
        else:
            no_speech_prob = getattr(seg, "no_speech_prob", None)
            avg_logprob = getattr(seg, "avg_logprob", None)
        out.append(
            Segment(
                start=float(start),
                end=float(end),
                text=str(text),
                no_speech_prob=float(no_speech_prob) if no_speech_prob is not None else None,
                avg_logprob=float(avg_logprob) if avg_logprob is not None else None,
            )
        )
    return out
