"""astra-lexicon unit tests — the matcher + lexicon behaviors lifted from linguist.

Hermetic, no app deps: folding, the fuzzy-similarity ensemble, and canonical
membership/nearest lookup. These are the substrate both linguist (ASR correction)
and heartwood (entity resolution) build on.
"""

from __future__ import annotations

from astra_lexicon import (
    Lexicon,
    build_lexicon_from,
    ensemble_sim,
    fold_for_match,
    ngrams,
    tokenize,
)


# ── normalize + phonetics ──────────────────────────────────────────────────
def test_fold_and_tokenize() -> None:
    assert fold_for_match("Færrin") == "faerrin"  # ligature expanded
    assert fold_for_match("Anaïs") == "anais"  # diacritic stripped
    toks = tokenize("Ki-Rin met P'ter.")
    assert [t.span for t in toks] == ["Ki-Rin", "met", "P'ter"]  # punctuation excluded
    assert {t.span for t in ngrams(toks, 2)} >= {"Ki-Rin", "met P'ter", "Ki-Rin met"}


def test_ensemble_sim_ranks_phonetic_near_misses() -> None:
    assert ensemble_sim("calaria", "calaria") == 1.0
    near = ensemble_sim("galaria", "calaria")  # one-letter phonetic garble
    far = ensemble_sim("galaria", "anouk")
    assert near > 0.78 > far


# ── lexicon ────────────────────────────────────────────────────────────────
def test_lexicon_membership_and_nearest() -> None:
    lex = build_lexicon_from(["Calaria", "Hildebrandt Corporation", "Anouk"])
    assert isinstance(lex, Lexicon)
    assert lex.has("calaria")
    assert lex.is_token("hildebrandt")  # word within a multi-word canonical
    assert not lex.has("hildebrandt")  # not a whole canonical on its own
    top = lex.nearest("galaria", k=1, floor=0.5)
    assert top and top[0].canonical == "Calaria"


def test_build_lexicon_from_dedups_by_fold() -> None:
    # Two forms folding to the same key collapse to one entry (order-stable).
    lex = build_lexicon_from(["Anouk", "anouk", "Calaria"])
    assert [e.canonical for e in lex.entries] == ["Anouk", "Calaria"]
