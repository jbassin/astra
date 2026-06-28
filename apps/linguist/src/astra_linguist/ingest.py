"""The ingest transform — scribe `script.json` → `formatted_transcript` (P1, B/C/D).

Ported from `pipeline/ingest.ts`: per line, apply `defs.yaml` corrections (+trim),
resolve the speaker, format the start as `HH:MM:SS`, carry `second`, and compute
`duration`. The serialized output is a downstream byte contract, so `to_json`
matches `JSON.stringify(transcript, null, 2)` (2-space, no trailing newline,
non-ASCII unescaped, faerrin field order).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from astra_lexicon import Replacer

from .models import FormattedLine, RawLine, Transcript
from .roster import SpeakerResolver


def format_line(line: RawLine, replace: Replacer, resolver: SpeakerResolver) -> FormattedLine:
    """One raw line → a formatted line (corrections, speaker, timestamps, duration)."""
    return FormattedLine(
        start=datetime.fromtimestamp(line.start, tz=UTC).strftime("%H:%M:%S"),
        second=line.start,
        text=replace(line.text),
        user=resolver.resolve(line.user),
        duration=round(line.end - line.start, 3),
    )


def format_transcript(
    date: str,
    audio: str,
    raw: list[RawLine],
    replace: Replacer,
    resolver: SpeakerResolver,
) -> Transcript:
    """A session's raw lines → the formatted `Transcript`."""
    return Transcript(
        date=date,
        audio=audio,
        script=[format_line(line, replace, resolver) for line in raw],
    )


def to_json(transcript: Transcript) -> str:
    """Serialize byte-identically to faerrin's `JSON.stringify(x, null, 2)`."""
    return json.dumps(transcript.model_dump(), indent=2, ensure_ascii=False)
