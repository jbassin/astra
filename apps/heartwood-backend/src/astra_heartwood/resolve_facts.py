"""Resolution (spec §8) — pure code mapping each NounFact to a ResolvedFact.

Calls the Phase-1 telemetry-wired seam ``astra_ontology_entity.resolve`` (which emits the
``astra.heartwood.resolve`` span/metric and caches the registry) and attaches the
status/entity/confidence. ``ambiguous``/``unknown`` carry the top-K candidate canonicals
for the human; a genuinely new entity surfaces as ``unknown`` — Phase 2 only flags it.
"""

from __future__ import annotations

from astra_ontology_entity import resolve

from .models import NounFact, ResolvedFact


def resolve_fact(fact: NounFact) -> ResolvedFact:
    """Resolve one noun-fact's subject against the registry."""
    res = resolve(fact.subject, kind_hint=fact.kind_hint)
    return ResolvedFact(
        subject=fact.subject,
        kind_hint=fact.kind_hint,
        claim=fact.claim,
        status=res.status,
        entity=res.entity,
        confidence=res.confidence,
        candidates=[(ref.canonical, score) for ref, score in res.candidates],
    )
