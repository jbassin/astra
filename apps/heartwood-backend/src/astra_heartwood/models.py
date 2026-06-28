"""The heartwood per-session facts artifact schemas (spec §5).

Grown slice-by-slice in Phase 2: ``DroppedSpan`` (the filter audit trail, S2);
``NounFact`` / ``ResolvedFact`` / ``SessionFacts`` follow (extraction + resolution).
``EntityKind`` / ``ResolveStatus`` / ``EntityRef`` are imported from ``astra_ontology``
(single source — never redeclared here).
"""

from __future__ import annotations

from typing import Literal

from astra_ontology import EntityKind, EntityRef, ResolveStatus
from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DroppedSpan(_Base):
    """One span the filter excluded — the human-reviewable audit trail.

    Carries a short verbatim ``sample`` (not a transcript line-range citation — Phase 2
    has no provenance, P2.6) so a reviewer can sanity-check that nothing setting-relevant
    was wrongly dropped.
    """

    category: Literal["ooc", "combat", "play_by_play"]
    sample: str
    reason: str


class NounFact(_Base):
    """One durable, atomic assertion about one setting noun (Stage-2 LLM output, P2.8).

    ``claim`` is a plain factual statement, NOT polished wiki prose — house-voice writing
    is Phase 3. ``subject`` is the noun as it appears (pre-resolution; resolution attaches
    the registry entity downstream).
    """

    subject: str
    kind_hint: EntityKind | None = None
    claim: str


class ResolvedFact(_Base):
    """A NounFact plus its registry resolution (spec §5/§8).

    ``status="resolved"`` ⇒ ``entity`` is set (its ``page`` ⇒ update-candidate; ``page``
    None ⇒ new-page candidate; ``being`` set ⇒ a PC — still a valid target, P2.1).
    ``ambiguous``/``unknown`` ⇒ ``entity`` is None and ``candidates`` carries the top-K
    (canonical, score) for the human. A genuinely new entity surfaces as ``unknown`` —
    Phase 2 only flags it (discovery/registry-add is Phase 3/4).
    """

    subject: str
    kind_hint: EntityKind | None = None
    claim: str
    status: ResolveStatus
    entity: EntityRef | None = None
    confidence: float
    candidates: list[tuple[str, float]] = []


# Why a candidate fact is not durable setting-wiki material.
DropCategory = Literal["event", "ability", "possession", "mechanical", "nonsensical"]
# The refinement verdict's category — `setting` is the keep case; the rest are drops.
RefineCategory = Literal["setting", "event", "ability", "possession", "mechanical", "nonsensical"]


class RefinedOutFact(_Base):
    """A draft fact the refinement pass dropped as non-wiki material (Stage 2.5 audit).

    Parallel to ``DroppedSpan`` for the filter: events, game mechanics, item possession,
    economic/stat values, and nonsensical/unsupported claims are removed here so only
    standing narrative setting facts remain. ``category`` records which.
    """

    subject: str
    claim: str
    category: DropCategory
    reason: str


class SessionFacts(_Base):
    """The committed per-session artifact (one ``facts/<date>.json``)."""

    date: str
    show: str  # campaign slug
    world: str  # "faerrin" (the only world ingested in Phase 2, P2.3)
    facts: list[ResolvedFact] = []
    refined_out: list[RefinedOutFact] = []  # facts dropped as events (Stage 2.5 audit)
    dropped: list[DroppedSpan] = []  # spans dropped by the filter (Stage 1 audit)
