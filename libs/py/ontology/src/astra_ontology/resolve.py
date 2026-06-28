"""Entity resolution (heartwood Phase 1, Deliverable D).

`Resolver(entities).resolve(messy_name)` → a typed `Resolution`: the seam the
Phase-2/3 proposer calls to map a transcript mention to a registry entity (or learn
it's a likely new one). Exact fold-match wins outright; otherwise the fuzzy-similarity
ensemble (via astra-lexicon) ranks canonicals ∪ aliases, with a floor + a gap rule
separating a confident hit from genuine ambiguity. Pure — telemetry is wired at the
runtime seam (`astra_ontology_entity.resolve`), not here.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from astra_lexicon import build_lexicon_from, fold_for_match

from .entity import Entity, EntityKind

#: Resolution thresholds — the single source (move to config.kdl only if tuning needs
#: it). Distinct from the *seed-dedup* threshold (entity.py): query recall (loose) and
#: seed precision (strict, exact-fold) are different jobs.
RESOLVE_FLOOR = 0.6  # a candidate below this is not a real match
RESOLVE_GAP = 0.08  # #1 must beat #2 by this to win outright; else it's ambiguous
RESOLVE_K = 5  # how many ranked candidates to surface for context

ResolveStatus = Literal["resolved", "ambiguous", "unknown"]


@dataclass(frozen=True)
class EntityRef:
    """A thin, immutable view of an Entity (no alias/source noise)."""

    canonical: str
    kind: EntityKind | None
    page: str | None
    being: str | None


@dataclass(frozen=True)
class Resolution:
    status: ResolveStatus
    entity: EntityRef | None  # set iff resolved
    candidates: list[tuple[EntityRef, float]]  # ranked (entity, score)
    confidence: float  # the winning/top score (1.0 for exact)


def _ref(e: Entity) -> EntityRef:
    return EntityRef(canonical=e.canonical, kind=e.kind, page=e.page, being=e.being)


class Resolver:
    """A built index over a registry: exact fold-match + nearest-canonical lookup."""

    def __init__(self, entities: Iterable[Entity]) -> None:
        self._entities = list(entities)
        # fold(form) → entity, for every canonical + alias. Canonical wins a collision
        # (added first), so an exact hit prefers the entity that *owns* the name.
        self._by_fold: dict[str, Entity] = {}
        forms: list[str] = []
        for e in self._entities:
            cf = fold_for_match(e.canonical)
            if cf:
                self._by_fold.setdefault(cf, e)
                forms.append(e.canonical)
        for e in self._entities:
            for a in e.aliases:
                af = fold_for_match(a)
                if af:
                    self._by_fold.setdefault(af, e)
                    forms.append(a)
        self._lex = build_lexicon_from(forms)

    def resolve(self, name: str, *, kind_hint: EntityKind | None = None) -> Resolution:
        fold = fold_for_match(name)
        if not fold:
            return Resolution("unknown", None, [], 0.0)

        # 1. exact fold-match on a canonical or alias.
        exact = self._by_fold.get(fold)
        if exact is not None:
            ref = _ref(exact)
            return Resolution("resolved", ref, [(ref, 1.0)], 1.0)

        # 2. fuzzy nearest over canonicals ∪ aliases; map each form back to its entity,
        #    one candidate per entity (highest-scoring form wins — nearest is desc-sorted).
        seen: set[int] = set()
        candidates: list[tuple[EntityRef, float]] = []
        for h in self._lex.nearest(fold, k=RESOLVE_K * 3, floor=0.0):
            e = self._by_fold.get(fold_for_match(h.canonical))
            if e is None or id(e) in seen:
                continue
            seen.add(id(e))
            candidates.append((_ref(e), h.score))
        candidates = candidates[:RESOLVE_K]
        if not candidates:
            return Resolution("unknown", None, [], 0.0)

        top_score = candidates[0][1]
        above = [(r, s) for r, s in candidates if s >= RESOLVE_FLOOR]
        if not above:
            # likely a new entity — return top-k for context.
            return Resolution("unknown", None, candidates, top_score)
        if len(above) == 1:
            return Resolution("resolved", above[0][0], candidates, above[0][1])

        # ≥2 above floor: a kind hint can break the tie toward one matching candidate.
        if kind_hint is not None:
            matching = [(r, s) for r, s in above if r.kind == kind_hint]
            if len(matching) == 1:
                return Resolution("resolved", matching[0][0], candidates, matching[0][1])

        if above[0][1] - above[1][1] >= RESOLVE_GAP:
            return Resolution("resolved", above[0][0], candidates, above[0][1])
        return Resolution("ambiguous", None, candidates, above[0][1])
