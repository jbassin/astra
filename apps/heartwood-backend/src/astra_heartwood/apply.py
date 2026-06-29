"""``astra-heartwood-apply`` — the host-side write-back (Phase 4, P4.1/P4.8).

Reads a session's committed change-set (``manifest.kdl``) + the human's decisions
(``review.kdl``) and writes the APPROVED proposals into the akasha corpus: a ``create``
writes a new ``content/<path>.vellum`` (refusing to clobber), a ``rewrite`` overwrites
the existing file (the proposal body is the full preserve-and-append page, P4.6).
Approved ``registry-add``s are applied to ``entity.kdl`` (non-clobbering). Each written
page is stamped ``committed-at`` in ``review.kdl`` → idempotent re-runs.

This module does NOT regenerate the snapshot, commit, or redeploy — the ``just
heartwood-apply`` recipe wraps it with validate → ``akasha-snapshot`` → git → akasha
redeploy (the only host-privileged steps, kept off the public review surface, P4.1).
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from astra_lexicon import fold_for_match
from astra_ontology import Entity, parse_entities, serialize_entities
from astra_ontology_entity import ENTITY_KDL_PATH
from pydantic import BaseModel

from .proposer.corpus import AKASHA_CONTENT, PROPOSALS_DIR, split_frontmatter
from .proposer.manifest import parse_manifest
from .proposer.models import ProposalManifest
from .review import ReviewState, empty_review_state, parse_review_state, serialize_review_state


class ApplyResult(BaseModel):
    date: str
    created: list[str] = []  # target paths of new pages written
    rewritten: list[str] = []  # target paths overwritten
    registry_added: list[str] = []  # canonicals added/updated in entity.kdl
    already_committed: list[str] = []  # skipped (committed-at set) — idempotence
    refused: list[str] = []  # a create whose target already exists (don't clobber)
    dry_run: bool = False


def _iso_date(session_date: str) -> str:
    """A bare session date (``2025-8-28``) → a full ISO timestamp like the corpus (E4)."""
    y, m, d = (int(x) for x in session_date.split("-"))
    return f"{y:04d}-{m:02d}-{d:02d}T00:00:00-04:00"


def _normalize_create_date(text: str, session_date: str) -> str:
    """Rewrite a create page's bare ``date:`` to ISO (the corpus expects a full timestamp)."""
    fm, body = split_frontmatter(text)
    if not fm:
        return text
    fm = re.sub(r"(?m)^date:.*$", f"date: {_iso_date(session_date)}", fm)
    return fm + body


def _load_manifest(date: str) -> ProposalManifest:
    return parse_manifest((PROPOSALS_DIR / date / "manifest.kdl").read_text(encoding="utf-8"))


def _load_review(date: str) -> ReviewState:
    path = PROPOSALS_DIR / date / "review.kdl"
    if not path.is_file():
        return empty_review_state(date)
    return parse_review_state(path.read_text(encoding="utf-8"))


def apply_change_set(date: str, *, dry_run: bool = False) -> ApplyResult:
    manifest = _load_manifest(date)
    review = _load_review(date)
    now = datetime.now().astimezone().isoformat()
    decisions = {d.id: d for d in review.decisions}
    result = ApplyResult(date=date, dry_run=dry_run)

    # canonical → the final corpus page path for an approved+written create (for the
    # registry `page` link), keyed by fold so a registry-add finds its documenting page.
    page_for_canonical: dict[str, str] = {}

    for p in manifest.proposals:
        d = decisions.get(p.id)
        if d is None or d.state != "approved":
            continue
        if d.committed_at is not None:
            result.already_committed.append(p.target_path)
            continue
        target = (d.target_path or p.target_path).strip()
        if not target or target.startswith("needs-placement/"):
            # An approved page must be placed first (the surface blocks this) — skip safely.
            result.refused.append(target or p.id)
            continue
        dest = AKASHA_CONTENT / f"{target}.vellum"
        body = (PROPOSALS_DIR / date / p.body_file).read_text(encoding="utf-8")

        if p.op == "create":
            if dest.exists():  # don't clobber a page resolution missed (Phase-5 dedup)
                result.refused.append(target)
                continue
            body = _normalize_create_date(body, date)
            if not dry_run:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(body, encoding="utf-8")
            result.created.append(target)
        else:  # rewrite — overwrite with the full preserve-and-append body
            if not dry_run:
                dest.write_text(body, encoding="utf-8")
            result.rewritten.append(target)

        page_for_canonical[fold_for_match(p.canonical)] = target
        d.committed_at = now

    _apply_registry(manifest, review, page_for_canonical, result, dry_run=dry_run)

    if not dry_run and (result.created or result.rewritten):
        review.updated_at = now
        (PROPOSALS_DIR / date / "review.kdl").write_text(
            serialize_review_state(review), encoding="utf-8"
        )
    return result


def _apply_registry(
    manifest: ProposalManifest,
    review: ReviewState,
    page_for_canonical: dict[str, str],
    result: ApplyResult,
    *,
    dry_run: bool,
) -> None:
    approved = {r.canonical for r in review.registry_decisions if r.state == "approved"}
    adds = [a for a in manifest.registry_additions if a.canonical in approved]
    if not adds:
        return
    entities = parse_entities(ENTITY_KDL_PATH)
    by_fold = {fold_for_match(e.canonical): e for e in entities}

    for a in adds:
        key = fold_for_match(a.canonical)
        # Prefer the page we actually wrote for this entity; else its suggested path if
        # that's a real corpus folder (never a needs-placement marker).
        page = page_for_canonical.get(key)
        if page is None and not a.suggested_path.startswith("needs-placement/"):
            page = a.suggested_path
        prior = by_fold.get(key)
        if prior is not None:
            # Update in place: fill a missing kind/page, mark curated so re-seed keeps it.
            prior.kind = prior.kind or a.kind
            prior.page = prior.page or page
            if "manual" not in prior.sources:
                prior.sources.append("manual")
        else:
            entities.append(
                Entity(canonical=a.canonical, kind=a.kind, page=page, sources=["manual"])
            )
        result.registry_added.append(a.canonical)

    if not dry_run:
        Path(ENTITY_KDL_PATH).write_text(serialize_entities(entities), encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Apply an approved heartwood change-set to akasha."
    )
    parser.add_argument("date", help="session date, e.g. 2025-8-28")
    parser.add_argument("--dry-run", action="store_true", help="print the plan; write nothing")
    args = parser.parse_args()

    r = apply_change_set(args.date, dry_run=args.dry_run)
    tag = "DRY-RUN " if r.dry_run else ""
    print(f"{tag}heartwood-apply {r.date}:")
    print(f"  created:   {len(r.created)}  {r.created}")
    print(f"  rewritten: {len(r.rewritten)}  {r.rewritten}")
    print(f"  registry:  {len(r.registry_added)}  {r.registry_added}")
    if r.already_committed:
        print(f"  skipped (already committed): {len(r.already_committed)}")
    if r.refused:
        print(f"  REFUSED (unplaced or would clobber): {r.refused}")


if __name__ == "__main__":
    main()
