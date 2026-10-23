"""Pronunciation lexicon — ported verbatim from caster `tts/pronunciation.ts`.

Maps an invented proper noun (Faerrin/Pathfinder names TTS mangles) → its IPA,
injected inline as `/…/`, which ElevenLabs v3 honors. Only meaningful on the v3
path (M6) — non-v3 voices would read the slashes aloud.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

#: term → IPA.
Lexicon = dict[str, str]


def load_lexicon(path: Path | str) -> Lexicon:
    """Load the term→IPA lexicon from JSON. Missing/garbage → empty (a no-op)."""
    p = Path(path)
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        term: ipa
        for term, ipa in data.items()
        if isinstance(ipa, str) and term.strip() != "" and ipa.strip() != ""
    }


_TAG_SPAN = re.compile(r"(\[[^\]]*\])")


def apply_pronunciations(text: str, lexicon: Lexicon) -> str:
    """Wrap known terms in inline IPA (`/ipa/`) for v3. Each term once (first
    whole-word occurrence); never rewrites text inside existing `[audio tags]`."""
    terms = list(lexicon.keys())
    if not terms:
        return text

    # Split on [..] tag spans; with a capturing group, tag spans land on odd
    # indices and are left untouched.
    parts = _TAG_SPAN.split(text)
    applied: set[str] = set()
    for i in range(len(parts)):
        if i % 2 == 1:  # a [tag] span
            continue
        segment = parts[i]
        for term in terms:
            if term in applied:
                continue
            pattern = re.compile(rf"\b{re.escape(term)}\b")
            if pattern.search(segment):
                segment = pattern.sub(f"/{lexicon[term]}/", segment, count=1)
                applied.add(term)
        parts[i] = segment
    return "".join(parts)
