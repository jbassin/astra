"""astra-lexicon — the canonical-names matching substrate.

Shared by linguist (ASR transcription correction) and heartwood (entity
resolution): diacritic folding + tokenization, a fuzzy-similarity ensemble, and a
canonical Lexicon (membership + nearest-canonical lookup). Consumer-agnostic — the
defs/registry source is always supplied by the caller.

    from astra_lexicon import Lexicon, build_lexicon, ensemble_sim, fold_for_match
"""

from __future__ import annotations

from .corrections import (
    DEFS_PATH,
    AddResult,
    Replacer,
    add_correction,
    build_replacer,
    escape_regex,
    load_corrections,
    load_defs,
    to_fragment,
)
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
    "DEFS_PATH",
    "WEIGHTS",
    "AddResult",
    "Hypothesis",
    "LexEntry",
    "Lexicon",
    "Replacer",
    "Tok",
    "add_correction",
    "build_lexicon",
    "build_lexicon_from",
    "build_replacer",
    "dice_sim",
    "edit_sim",
    "ensemble_sim",
    "escape_regex",
    "fold_for_match",
    "jaro_sim",
    "load_canonical_forms",
    "load_corrections",
    "load_defs",
    "ngrams",
    "phonetic_codes",
    "phonetic_sim",
    "to_fragment",
    "tokenize",
]
