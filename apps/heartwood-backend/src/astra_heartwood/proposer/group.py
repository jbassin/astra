"""Grouping — resolved facts → target-page proposals (pure code, spec §6).

Buckets each ``ResolvedFact`` by destination (resolved+page → rewrite; resolved-no-page /
unknown → create; ambiguous → unplaced), collapses many facts into one ``PageProposal``,
places new pages by kind (flagging folder-less / link-less cases rather than mis-placing —
faerrin "wrong-page" is worse than a flagged path), and assigns each proposal a stable,
collision-free id-slug. No LLM: the novelty/conflict gating (P3.15/P3.17) is the draft stage's
job (S3/S4); here a non-prose existing page is skipped-with-note (P3.10) and the rest pass through.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

from ..models import SessionFacts
from .corpus import FACTS_DIR, read_page_text
from .lint import NON_PROSE_TYPES, detect_page_type
from .models import (
    EntityKind,
    PageProposal,
    PageType,
    ProposalManifest,
    RegistryAddition,
    SkippedPage,
    UnplacedFact,
)

#: A pseudo-folder marking a path the human must resolve (kind=item/None has no corpus home).
NEEDS_PLACEMENT = "needs-placement"


def slugify(path: str) -> str:
    """``target_path`` → a stable filesystem-safe id stem (§6).

    Lowercase, ``/`` and spaces → ``-``, other punctuation stripped, Unicode NFKD-folded to
    ASCII where possible. Never crashes on ``Anaïs``/``Færrin`` (lossy but safe); empty result
    falls back to ``page`` (the caller's collision suffix still guarantees uniqueness).
    """
    folded = unicodedata.normalize("NFKD", path).encode("ascii", "ignore").decode("ascii")
    folded = folded.lower().replace("/", "-").replace(" ", "-")
    folded = re.sub(r"[^a-z0-9-]+", "", folded)
    folded = re.sub(r"-+", "-", folded).strip("-")
    return folded or "page"


def place(kind: EntityKind | None, canonical: str) -> tuple[str, str | None]:
    """A new page's ``(target_path, placement_note)`` from its kind (§6).

    Folder-mapped kinds place cleanly; ``person`` (no structured org link in the fact rows),
    ``item`` (no corpus folder), and an unknown kind get a flagged best-effort path + a note.
    Never invents a folder (the scope wrongly showed ``Bestiary/`` for an item — that is creature).
    """
    if kind == "deity":
        return f"Divinity/{canonical}", None
    if kind == "place":
        return f"Geography/{canonical}/index", None
    if kind == "phenomenon":
        return f"Phenomena/{canonical}", None
    if kind == "creature":
        return f"Bestiary/{canonical}", None
    if kind == "org":
        return f"Org/{canonical}/index", None
    if kind == "person":
        return (
            f"Org/Unsorted/People/{canonical}",
            "person→org link not in the fact rows; under Org/Unsorted — human to place (§6)",
        )
    if kind == "item":
        return (
            f"{NEEDS_PLACEMENT}/{canonical}",
            "kind=item has no corpus folder; human to place (§6)",
        )
    return f"{NEEDS_PLACEMENT}/{canonical}", "kind is unknown; human to classify + place (§6)"


@dataclass
class _Bucket:
    """Facts accumulating toward one destination page."""

    canonical: str
    op: str  # "rewrite" | "create"
    unknown: bool = False  # an unresolved subject (→ a RegistryAddition)
    kind: EntityKind | None = None  # set for resolved; computed from hints for unknown
    target_path: str | None = None  # set for rewrites (the existing page)
    claims: list[str] = field(default_factory=list)
    kind_hints: list[EntityKind] = field(default_factory=list)

    def add(self, claim: str, kind_hint: EntityKind | None) -> None:
        if claim not in self.claims:  # order-stable dedup
            self.claims.append(claim)
        if kind_hint is not None:
            self.kind_hints.append(kind_hint)

    def resolved_kind(self) -> EntityKind | None:
        """The page's kind: the registry kind for resolved buckets, else the majority hint (§6)."""
        if self.kind is not None:
            return self.kind
        if self.kind_hints:
            return Counter(self.kind_hints).most_common(1)[0][0]
        return None


def _provisional_page_type(n_claims: int) -> PageType:
    """A new page's provisional type before drafting (P3.11: thin entity → stub)."""
    return "stub" if n_claims <= 1 else "lore"


def build_proposals(facts: SessionFacts) -> ProposalManifest:
    """Group one session's resolved facts into a reviewable change-set (spec §6)."""
    rewrites: dict[str, _Bucket] = {}
    creates: dict[str, _Bucket] = {}
    unplaced: list[UnplacedFact] = []

    for f in facts.facts:
        if f.status == "ambiguous":
            unplaced.append(
                UnplacedFact(
                    subject=f.subject,
                    claim=f.claim,
                    candidates=[(c, s) for c, s in f.candidates],
                )
            )
        elif f.status == "resolved" and f.entity is not None and f.entity.page:
            b = rewrites.setdefault(
                f.entity.page,
                _Bucket(
                    canonical=f.entity.canonical,
                    op="rewrite",
                    kind=f.entity.kind,
                    target_path=f.entity.page,
                ),
            )
            b.add(f.claim, f.kind_hint)
        elif f.status == "resolved" and f.entity is not None:
            b = creates.setdefault(
                f.entity.canonical,
                _Bucket(canonical=f.entity.canonical, op="create", kind=f.entity.kind),
            )
            b.add(f.claim, f.kind_hint)
        else:  # unknown subject → a new page + a proposed registry addition
            b = creates.setdefault(
                f.subject, _Bucket(canonical=f.subject, op="create", unknown=True)
            )
            b.add(f.claim, f.kind_hint)

    proposals: list[PageProposal] = []
    skipped: list[SkippedPage] = []
    registry_additions: list[RegistryAddition] = []

    # ── rewrites: skip non-prose pages; degrade a stale page pointer to a create (§16) ──
    for target_path, b in rewrites.items():
        text = read_page_text(target_path)
        if text is None:  # registry page path points at a missing file
            proposals.append(
                _create_proposal(
                    b,
                    note=f"registry page '{target_path}' has no content file; treated as new (§16)",
                )
            )
            continue
        page_type = detect_page_type(text, path=target_path)
        if page_type in NON_PROSE_TYPES:
            skipped.append(SkippedPage(target_path=target_path, reason="non-prose-page"))
            continue
        proposals.append(
            PageProposal(
                id="",  # assigned below
                op="rewrite",
                target_path=target_path,
                canonical=b.canonical,
                kind=b.resolved_kind(),
                status="resolved",
                page_type=page_type,
                body_file="",  # assigned below
                fact_claims=list(b.claims),
            )
        )

    # ── creates: known-no-page + unknown subjects ──
    for b in creates.values():
        proposal = _create_proposal(b)
        proposals.append(proposal)
        if b.unknown:
            registry_additions.append(
                RegistryAddition(
                    canonical=b.canonical, kind=proposal.kind, suggested_path=proposal.target_path
                )
            )

    _assign_ids(proposals)

    return ProposalManifest(
        date=facts.date,
        show=facts.show,
        world=facts.world,
        proposals=sorted(proposals, key=lambda p: p.target_path),
        unplaced=sorted(unplaced, key=lambda u: (u.subject, u.claim)),
        skipped=sorted(skipped, key=lambda s: s.target_path),
        registry_additions=sorted(registry_additions, key=lambda r: r.canonical),
    )


def _create_proposal(b: _Bucket, *, note: str | None = None) -> PageProposal:
    kind = b.resolved_kind()
    target_path, placement_note = place(kind, b.canonical)
    return PageProposal(
        id="",
        op="create",
        target_path=target_path,
        canonical=b.canonical,
        kind=kind,
        status="unknown" if b.unknown else "resolved",
        page_type=_provisional_page_type(len(b.claims)),
        body_file="",
        fact_claims=list(b.claims),
        placement_note=note or placement_note,
    )


def _assign_ids(proposals: list[PageProposal]) -> None:
    """Assign each proposal a unique id-slug (= body filename stem); two distinct
    ``target_path``s never collapse to one id (collision suffix guarantees it, §6)."""
    by_id: dict[str, str] = {}
    for p in sorted(proposals, key=lambda x: x.target_path):
        base = slugify(p.target_path)
        slug, n = base, 2
        while slug in by_id and by_id[slug] != p.target_path:
            slug, n = f"{base}-{n}", n + 1
        by_id[slug] = p.target_path
        p.id = slug
        p.body_file = f"{slug}.vellum"


def load_facts(date: str) -> SessionFacts | None:
    """Read the committed Phase-2 ``facts/<date>.json``, or None if absent."""
    path = FACTS_DIR / f"{date}.json"
    if not path.is_file():
        return None
    return SessionFacts.model_validate_json(path.read_text(encoding="utf-8"))
