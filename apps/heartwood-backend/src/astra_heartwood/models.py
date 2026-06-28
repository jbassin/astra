"""The heartwood per-session facts artifact schemas (spec §5).

Grown slice-by-slice in Phase 2: ``DroppedSpan`` (the filter audit trail, S2);
``NounFact`` / ``ResolvedFact`` / ``SessionFacts`` follow (extraction + resolution).
``EntityKind`` / ``ResolveStatus`` / ``EntityRef`` are imported from ``astra_ontology``
(single source — never redeclared here).
"""

from __future__ import annotations

from typing import Literal

from astra_ontology import EntityKind
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
