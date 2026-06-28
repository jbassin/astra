"""Fuzzy-similarity ensemble (P6, port of `phonetics.ts`, H3).

A weighted blend of edit distance, Jaro-Winkler, double-metaphone-code distance,
and Dice bigram overlap — no single metric handles both orthographic chaos and
sounds-right-spelled-wrong, but the blend does. Inputs are expected pre-folded
(see `normalize.fold_for_match`). Python: rapidfuzz (OSA + Jaro-Winkler, matching
faerrin's restricted-transposition lib) + `metaphone` + a hand Dice.
"""

from __future__ import annotations

from metaphone import doublemetaphone
from rapidfuzz.distance import OSA, JaroWinkler

# Ensemble weights (sum to 1) — phonetic + prefix dominate for proper nouns.
WEIGHTS = {"edit": 0.3, "jaro": 0.3, "phonetic": 0.3, "dice": 0.1}


def phonetic_codes(fold: str) -> tuple[str, str]:
    """Double-Metaphone (primary, secondary) codes for a folded string."""
    return doublemetaphone(fold)


def edit_sim(a: str, b: str) -> float:
    """Damerau (OSA) similarity in [0,1]; transposition-aware."""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    return OSA.normalized_similarity(a, b)


def jaro_sim(a: str, b: str) -> float:
    """Jaro-Winkler similarity (inputs already folded → compare as-is)."""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    return JaroWinkler.similarity(a, b)


def _bigrams(s: str) -> list[str]:
    return [s[i : i + 2] for i in range(len(s) - 1)]


def dice_sim(a: str, b: str) -> float:
    """Sørensen-Dice bigram overlap in [0,1]."""
    if a == b:
        return 1.0
    if len(a) < 2 or len(b) < 2:
        return 0.0
    bigrams_a = _bigrams(a)
    counts: dict[str, int] = {}
    for bg in bigrams_a:
        counts[bg] = counts.get(bg, 0) + 1
    overlap = 0
    for bg in _bigrams(b):
        if counts.get(bg, 0) > 0:
            counts[bg] -= 1
            overlap += 1
    return 2.0 * overlap / (len(bigrams_a) + len(_bigrams(b)))


def phonetic_sim(a_fold: str, b_fold: str) -> float:
    """Best code-edit-similarity across the primary/secondary metaphone pairs."""
    a_codes = phonetic_codes(a_fold)
    b_codes = phonetic_codes(b_fold)
    best = 0.0
    for x in a_codes:
        for y in b_codes:
            if not x and not y:
                continue
            best = max(best, edit_sim(x, y))
    return best


def ensemble_sim(a_fold: str, b_fold: str) -> float:
    """Weighted blend of all four signals, in [0,1]."""
    if a_fold == b_fold:
        return 1.0
    return (
        WEIGHTS["edit"] * edit_sim(a_fold, b_fold)
        + WEIGHTS["jaro"] * jaro_sim(a_fold, b_fold)
        + WEIGHTS["phonetic"] * phonetic_sim(a_fold, b_fold)
        + WEIGHTS["dice"] * dice_sim(a_fold, b_fold)
    )
