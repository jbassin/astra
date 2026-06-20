"""The canonical lexicon (port of `lexicon.ts`).

Every known correct proper noun: `defs.yaml` keys (the corrections SSOT) ∪ wiki
page names. (Cross-subsystem note: the wiki-names union reads akasha-backend's
corpus; v1 builds from `defs.yaml` keys + an optional explicit `extra` list, and
takes the akasha union as a later wiring step.) Used to recognize already-correct
tokens and find the nearest canonical for an OOV token.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import yaml

from ..corrections import DEFS_PATH
from .normalize import fold_for_match
from .phonetics import ensemble_sim, phonetic_codes


@dataclass(frozen=True)
class LexEntry:
    canonical: str
    fold: str
    codes: tuple[str, str]


@dataclass(frozen=True)
class Hypothesis:
    canonical: str
    score: float


class Lexicon:
    """Canonical-form membership + nearest-canonical lookup."""

    def __init__(self, entries: list[LexEntry]) -> None:
        self.entries = entries
        self._folds = {e.fold for e in entries}
        self._tokens = {tok for e in entries for tok in e.fold.split(" ") if tok}

    def has(self, fold: str) -> bool:
        """True if a folded token exactly matches a whole canonical form."""
        return fold in self._folds

    def is_token(self, fold: str) -> bool:
        """True if a folded token is a word within any canonical (e.g. 'hildebrandt')."""
        return fold in self._tokens

    def nearest(self, fold: str, k: int = 5, floor: float = 0.5) -> list[Hypothesis]:
        """Top-k canonical hypotheses for an OOV fold, by ensemble_sim, above `floor`."""
        scored = [
            Hypothesis(canonical=e.canonical, score=ensemble_sim(fold, e.fold))
            for e in self.entries
        ]
        scored = [h for h in scored if h.score >= floor]
        scored.sort(key=lambda h: h.score, reverse=True)
        return scored[:k]


def build_lexicon_from(forms: Iterable[str]) -> Lexicon:
    """Build a lexicon from explicit canonical forms (hermetic; test-friendly)."""
    seen: set[str] = set()
    entries: list[LexEntry] = []
    for canonical in forms:
        fold = fold_for_match(canonical)
        if not fold or fold in seen:
            continue
        seen.add(fold)
        entries.append(LexEntry(canonical=canonical, fold=fold, codes=phonetic_codes(fold)))
    return Lexicon(entries)


def load_canonical_forms(
    defs_path: Path | str = DEFS_PATH, extra_names: Iterable[str] = ()
) -> list[str]:
    """Canonical forms: `defs.yaml` keys ∪ any extra (e.g. akasha page names)."""
    doc = yaml.safe_load(Path(defs_path).read_text(encoding="utf-8")) or {}
    keys = list(doc.keys())
    return list(dict.fromkeys([*keys, *extra_names]))  # de-dup, order-stable


def build_lexicon(defs_path: Path | str = DEFS_PATH, extra_names: Iterable[str] = ()) -> Lexicon:
    return build_lexicon_from(load_canonical_forms(defs_path, extra_names))
