"""Pronunciation lexicon — ported verbatim from caster `tts/pronunciation.ts`.

Maps an invented proper noun (Faerrin/Pathfinder names TTS mangles) → its IPA,
injected inline as `/…/`, which ElevenLabs honors. Only meaningful on the dialogue
path — the mock would read the slashes aloud. The terms are the `ipa=` properties
of the canonical-names `defs.kdl` (`astra_lexicon.load_pronunciations`).
"""

from __future__ import annotations

import re

#: term → IPA.
Lexicon = dict[str, str]


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
