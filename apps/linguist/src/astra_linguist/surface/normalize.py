"""Tokenization + diacritic folding (port of `normalize.ts`).

Folding is for MATCHING ONLY — canonical/original text keeps its glyphs (Færrin,
Anaïs). NFKD decomposes accented glyphs into base + combining mark (stripped); a
ligature pass then expands the atomic codepoints NFKD leaves intact.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

_LIGATURES = {"æ": "ae", "œ": "oe", "ø": "o", "ß": "ss", "þ": "th", "ð": "d", "đ": "d", "ł": "l"}

# A word run: a letter/digit, then letters/digits with internal ' ’ or - (no underscore).
_TOKEN_RE = re.compile(r"[^\W_](?:[^\W_]|['’-])*")


def fold_for_match(s: str) -> str:
    """Fold to a diacritic-free, lowercased, ligature-expanded form for matching."""
    stripped = "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    ).lower()
    return "".join(_LIGATURES.get(c, c) for c in stripped)


@dataclass(frozen=True)
class Tok:
    """A token (or n-gram): verbatim span, matching fold, source offset."""

    span: str
    fold: str
    start: int


def tokenize(text: str) -> list[Tok]:
    """Split a line into unigram tokens, preserving source offsets."""
    return [
        Tok(span=m.group(), fold=fold_for_match(m.group()), start=m.start())
        for m in _TOKEN_RE.finditer(text)
    ]


def ngrams(toks: list[Tok], max_n: int = 3) -> list[Tok]:
    """Expand a unigram stream into 1..max_n-grams (spans joined by single spaces)."""
    out: list[Tok] = []
    for n in range(1, max_n + 1):
        for i in range(len(toks) - n + 1):
            window = toks[i : i + n]
            span = " ".join(t.span for t in window)
            out.append(Tok(span=span, fold=fold_for_match(span), start=window[0].start))
    return out
