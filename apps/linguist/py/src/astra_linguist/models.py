"""Transcript domain models — byte-match faerrin `lib/types.ts` (P1).

Field order matters: the serialized `data/{date}.json` is a downstream byte
contract, so the fields are declared in faerrin's object-key order
(start, second, text, user, duration; user: name, color).
"""

from __future__ import annotations

from pydantic import BaseModel


class RawLine(BaseModel):
    """A raw transcript line from scribe (`script.json`). `words` is ignored (F1)."""

    start: float
    end: float
    user: str
    text: str


class Speaker(BaseModel):
    """A resolved speaker: display name + the CSS color-variable NAME for it."""

    name: str
    color: str


class FormattedLine(BaseModel):
    """A transcript line after the ingest transform."""

    start: str
    second: float
    text: str
    user: Speaker
    duration: float


class Transcript(BaseModel):
    """A full session transcript, as stored in `data/{date}.json`."""

    date: str
    audio: str
    script: list[FormattedLine]
