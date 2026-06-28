"""astra-lexicon — the canonical-names matching substrate.

Shared by linguist (ASR transcription correction) and heartwood (entity
resolution): diacritic folding + tokenization, a fuzzy-similarity ensemble, and a
canonical Lexicon (membership + nearest-canonical lookup). Consumer-agnostic — the
defs/registry source is always supplied by the caller.

    from astra_lexicon import Lexicon, build_lexicon, ensemble_sim, fold_for_match
"""

from __future__ import annotations

from .lexicon import (
    Hypothesis,
    LexEntry,
    Lexicon,
    build_lexicon,
    build_lexicon_from,
    load_canonical_forms,
)
from .normalize import Tok, fold_for_match, ngrams, tokenize
from .phonetics import (
    WEIGHTS,
    dice_sim,
    edit_sim,
    ensemble_sim,
    jaro_sim,
    phonetic_codes,
    phonetic_sim,
)

__all__ = [
    "WEIGHTS",
    "Hypothesis",
    "LexEntry",
    "Lexicon",
    "Tok",
    "build_lexicon",
    "build_lexicon_from",
    "dice_sim",
    "edit_sim",
    "ensemble_sim",
    "fold_for_match",
    "jaro_sim",
    "load_canonical_forms",
    "ngrams",
    "phonetic_codes",
    "phonetic_sim",
    "tokenize",
]
