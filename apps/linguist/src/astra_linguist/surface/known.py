"""Mode-1 known-entity correction filter (port of `known.ts`, gate G).

Per line, flag OOV unigrams whose nearest canonical clears the floor, and
multi-word n-grams that closely match a multi-word canonical ("Dame Key" → "Dame
Quay"). Each candidate carries up to 5 canonical hypotheses for the Phase-2 judge.
Pure — no LLM. This is the surfacer's pre-flag stage.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import Transcript
from . import config
from .english import is_oov
from .lexicon import Hypothesis, Lexicon
from .normalize import Tok, tokenize
from .phonetics import ensemble_sim


@dataclass(frozen=True)
class KnownCandidate:
    line_ref: int
    span: str
    speaker: str
    line_text: str
    hypotheses: list[Hypothesis]


# Function words that bound multi-word canonicals + determiners that can front a
# name in speech. A span differing from a canonical only by these edge words is the
# same name with a swapped/added article — not a mistranscription of the name.
_EDGE_STOPWORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "of",
        "and",
        "to",
        "in",
        "on",
        "at",
        "for",
        "with",
        "by",
        "other",
        "another",
        "these",
        "those",
        "this",
        "that",
        "some",
        "any",
        "such",
        "many",
        "few",
        "several",
        "more",
        "most",
        "every",
        "each",
        "both",
        "all",
    }
)


def _is_namelike(span: str) -> bool:
    """Capitalized first letter — the signal of a proper-noun garble."""
    return bool(span) and span[0].isupper()


def _possessive_base(fold: str) -> str | None:
    """Folded base of a possessive ('anouk's' → 'anouk'), or None."""
    return fold[:-2] if re.search(r"['’]s$", fold) else None


def _strip_edge_stopwords(fold: str) -> str:
    words = fold.split(" ")
    while words and words[0] in _EDGE_STOPWORDS:
        words.pop(0)
    while words and words[-1] in _EDGE_STOPWORDS:
        words.pop()
    return " ".join(words)


def _differs_only_by_edge_words(a: str, b: str) -> bool:
    core = _strip_edge_stopwords(a)
    return core != "" and core == _strip_edge_stopwords(b)


def _padded_canonical(window: list[Tok], lex: Lexicon) -> bool:
    """True if a proper contiguous sub-span is itself an exact canonical."""
    n = len(window)
    for a in range(n):
        for b in range(a + 1, n + 1):
            if b - a == n:
                continue
            fold = " ".join(t.fold for t in window[a:b])
            if lex.has(fold):
                return True
    return False


def find_known(transcript: Transcript, lex: Lexicon) -> list[KnownCandidate]:
    """Flag OOV unigrams + multi-word n-grams near a canonical, best per line+canonical."""
    multiword = [e for e in lex.entries if " " in e.fold]
    best: dict[str, KnownCandidate] = {}

    def push(candidate: KnownCandidate) -> None:
        key = f"{candidate.line_ref} {candidate.hypotheses[0].canonical}"
        prior = best.get(key)
        if prior is None or candidate.hypotheses[0].score > prior.hypotheses[0].score:
            best[key] = candidate

    for line_ref, line in enumerate(transcript.script):
        toks = tokenize(line.text)

        for i, tok in enumerate(toks):
            if len(tok.fold) < config.MIN_TOKEN_LEN:
                continue
            if not is_oov(tok.fold) or lex.has(tok.fold) or lex.is_token(tok.fold):
                continue
            base = _possessive_base(tok.fold)
            if base is not None and lex.has(base):
                continue
            hyps = lex.nearest(tok.fold, 5, config.KNOWN_FLOOR_UNIGRAM)
            if not hyps:
                continue
            namelike = i > 0 and _is_namelike(tok.span)
            if not namelike and hyps[0].score < config.STRONG_SCORE:
                continue
            push(KnownCandidate(line_ref, tok.span, line.user.name, line.text, hyps))

        for n in range(2, config.MAX_NGRAM + 1):
            for i in range(len(toks) - n + 1):
                window = toks[i : i + n]
                if not any(i + k > 0 and _is_namelike(t.span) for k, t in enumerate(window)):
                    continue
                fold = " ".join(t.fold for t in window)
                if lex.has(fold) or _padded_canonical(window, lex):
                    continue
                span = " ".join(t.span for t in window)
                top: Hypothesis | None = None
                for entry in multiword:
                    if _differs_only_by_edge_words(fold, entry.fold):
                        continue
                    score = ensemble_sim(fold, entry.fold)
                    if score >= config.KNOWN_FLOOR_MULTI and (top is None or score > top.score):
                        top = Hypothesis(canonical=entry.canonical, score=score)
                if top is not None:
                    push(KnownCandidate(line_ref, span, line.user.name, line.text, [top]))

    return sorted(best.values(), key=lambda c: c.line_ref)
