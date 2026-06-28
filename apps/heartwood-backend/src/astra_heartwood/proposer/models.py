"""The Phase-3 proposal change-set schemas (spec §5).

A ``ProposalManifest`` is the committed head of one session's change-set (→ ``manifest.kdl``);
each ``PageProposal``'s prose lives in a sibling ``<id>.vellum`` file. ``EntityKind`` /
``ResolveStatus`` are imported from ``astra_ontology`` (single source — never redeclared).
All models forbid extras (a KDL→Pydantic round-trip test gates the schema, mirroring Phase 2).
"""

from __future__ import annotations

from typing import Literal

from astra_ontology import EntityKind, ResolveStatus
from pydantic import BaseModel, ConfigDict

#: The page-type a body presents as — gates which tell-lints apply (§8) and which existing
#: pages may be rewritten (only ``lore``/``stub``; the rest are non-prose, P3.10).
PageType = Literal["lore", "stub", "deity-statblock", "timeline", "flavor-pre"]

#: The machine tell-lint warning kinds (ported from faerrin ``voice-warnings.ts``, §8).
WarningType = Literal[
    "encyclopedia_opener", "it_is_template", "intensifier", "broken_wikilink", "empty"
]

#: A new page vs a merged rewrite of an existing one.
ProposalOp = Literal["create", "rewrite"]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VoiceWarning(_Base):
    """One residual tell-lint hit, surfaced to the human (warnings never hard-block — faerrin)."""

    type: WarningType
    message: str  # human-readable, ported from faerrin voice-warnings.ts
    # the offending token/phrase, when applicable (intensifier, broken target):
    hit: str | None = None


class PageProposal(_Base):
    """One proposed page — a new page or a merged rewrite of an existing one (§5)."""

    id: str  # stable slug, e.g. "org-iconoclasm-index"; also the body filename stem
    op: ProposalOp
    target_path: str  # akasha page path, no ext (e.g. "Org/Iconoclasm/index"), §6 placement
    canonical: str  # the resolved/registry canonical name (or the raw subject if unknown)
    kind: EntityKind | None = None
    status: ResolveStatus  # resolved | unknown (ambiguous never reaches a proposal → unplaced)
    page_type: PageType  # for lint suppression (§8); provisional on a create until drafted
    body_file: str  # sibling rel path "<id>.vellum"
    # the NEW cited claims this page asserts (grounding set; novelty-gated in S3/S4):
    fact_claims: list[str]
    # cited claims that CONTRADICT the existing body — flagged, not merged (P3.17):
    conflicts: list[str] = []
    lints: list[VoiceWarning] = []  # residual warnings after the revise pass (empty = clean)
    # why this path (esp. low-confidence/folder-less placement, §6):
    placement_note: str | None = None


class UnplacedFact(_Base):
    """An ambiguous fact we refuse to auto-place (P3.14) — surfaced with candidates."""

    subject: str
    claim: str
    candidates: list[tuple[str, float]] = []


class SkippedPage(_Base):
    """A resolved page we did NOT rewrite — auditable, never silent (P3.10/P3.15)."""

    target_path: str
    # all facts already stated | deity/timeline/flavor-pre:
    reason: Literal["already-known", "non-prose-page"]


class RegistryAddition(_Base):
    """A proposed new entity (applied on approval in Phase 4 — not written here)."""

    canonical: str
    kind: EntityKind | None = None
    suggested_path: str


class ProposalManifest(_Base):
    """The committed change-set head (→ ``manifest.kdl``)."""

    date: str
    show: str
    world: str  # "faerrin"
    proposals: list[PageProposal] = []
    unplaced: list[UnplacedFact] = []
    skipped: list[SkippedPage] = []  # rewrites declined as redundant/non-prose (P3.10/P3.15)
    registry_additions: list[RegistryAddition] = []


__all__ = [
    "EntityKind",
    "PageProposal",
    "PageType",
    "ProposalManifest",
    "ProposalOp",
    "RegistryAddition",
    "ResolveStatus",
    "SkippedPage",
    "UnplacedFact",
    "VoiceWarning",
    "WarningType",
]
