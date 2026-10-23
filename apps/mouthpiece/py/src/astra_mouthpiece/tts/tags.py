"""ElevenLabs v3 "audio tags" — ported verbatim from caster `tts/tags.ts`.

Bracketed delivery cues placed inline, e.g. "[warm] Hey. [laughs] Big week." Only
v3 interprets them; every other backend would read the brackets aloud, so non-v3
paths strip them.
"""

from __future__ import annotations

import re

#: Inline v3 audio tag, e.g. "[laughs]" or "[French accent]".
_TAG = re.compile(r"\[[^\][]*\]")
_PUNCT_AFTER = re.compile(r"\s+([,.!?;:])")
_MULTI_WS = re.compile(r"\s{2,}")


def strip_audio_tags(text: str) -> str:
    """Remove inline v3 audio tags and tidy the whitespace they leave behind."""
    out = _TAG.sub(" ", text)
    out = _PUNCT_AFTER.sub(r"\1", out)  # don't strand punctuation after a removed tag
    out = _MULTI_WS.sub(" ", out)
    return out.strip()


def render_delivery(text: str, emotion: str | None, v3: bool) -> str:
    """The text to actually send to a backend for one turn. v3 keeps inline tags
    (legacy `emotion` promoted to a leading tag); everything else strips to prose."""
    if not v3:
        return strip_audio_tags(text)
    return f"[{emotion}] {text}" if emotion else text
