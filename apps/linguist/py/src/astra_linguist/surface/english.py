"""Out-of-vocabulary gate (port of `english.ts`).

A token is a candidate only if it's neither a canonical (checked by the lexicon)
nor an ordinary English word. faerrin used a ~275k-word set; astra uses
`wordfreq` (a word that appears in the English corpus is "known"). This differs
slightly from the curated list, but the filter only **pre-flags** — the judge
decides — so the difference is tolerable (Risk 4). Inflection/possessive/plural
forms are stripped before the lookup.
"""

from __future__ import annotations

import re

from wordfreq import zipf_frequency

_PURE_NUMERIC = re.compile(r"^[\d.,:]+$")
# Trailing contraction / possessive suffixes (folded): can't, I'm, they're, herald's.
_CONTRACTION = re.compile(r"(?:n['’]t|['’](?:re|ve|ll|d|m|s|t))$")


def is_english(fold: str) -> bool:
    """True if the folded token appears in the English corpus."""
    return zipf_frequency(fold, "en") > 0


def is_oov(fold: str) -> bool:
    """True if the folded token is "unusual" — not numeric, not English (after
    stripping a trailing contraction, possessive, or plural)."""
    if not fold:
        return False
    if _PURE_NUMERIC.match(fold):
        return False
    if is_english(fold):
        return False
    base = _CONTRACTION.sub("", fold)
    if base != fold and (is_english(base) or len(base) <= 2):
        return False
    return not (fold.endswith("s") and len(fold) > 3 and is_english(fold[:-1]))
