"""The Phase-3 orchestration (spec §10) — group → draft → lint+revise → assemble → emit.

``build_session_proposals(date)`` is the pure, Dagster-free core (the asset and the host ``main``
both call it); it returns None for a session with no committed facts. Per page: draft prose
(``call_text``), tell-lint, one bounded revise if prose tells fire, assemble the ``.vellum`` body
(frontmatter preserved on rewrite). A rewrite whose facts are already stated → ``already-known``
skip (P3.15). Read-only: ``write_change_set`` emits ``proposals/<date>/{manifest.kdl,<id>.vellum}``;
no corpus writes.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from astra_observe import get_meter, get_tracer

from ..llm import TextClient, default_model, real_text_client
from ..pipeline import _atomic_write
from .assemble import assemble_vellum
from .corpus import PROPOSALS_DIR, load_page_paths, read_page_body, read_page_text
from .draft import Draft, draft_page, revise_draft
from .group import build_proposals, load_facts
from .lint import PROSE_TELL_TYPES, detect_page_type, voice_warnings
from .models import PageProposal, ProposalManifest, SkippedPage, VoiceWarning

_tracer = get_tracer("astra.heartwood")
_meter = get_meter("astra.heartwood")
_pages_drafted = _meter.create_counter(
    "astra.heartwood.pages_drafted", description="pages drafted, by op/kind"
)
_lints_fired = _meter.create_counter(
    "astra.heartwood.lints_fired", description="residual tell-lints surfaced, by type"
)
_revises_run = _meter.create_counter(
    "astra.heartwood.revises_run", description="bounded revise passes run"
)


@dataclass
class DraftedChangeSet:
    """The drafted change-set: the committed manifest + each proposal's assembled body text.

    Bodies are carried out-of-band (NOT in the manifest schema — they are sibling ``.vellum`` files,
    P3.8); ``write_change_set`` writes both. Keyed by ``PageProposal.id``.
    """

    manifest: ProposalManifest
    bodies: dict[str, str]


def _draft_lint_assemble(
    proposal: PageProposal,
    *,
    date: str,
    client: TextClient,
    model: str,
    known_pages: frozenset[str],
    batch_pages: frozenset[str],
    batch_names: frozenset[str],
) -> tuple[str, list[VoiceWarning], bool] | None:
    """Draft → lint → bounded revise → assemble one page.

    Returns ``(vellum_text, residual_lints, revised)``, or None when a rewrite is ``already-known``
    (P3.15 — the caller records the skip). ``revised`` is True iff a bounded revise pass ran.
    """
    existing_text = read_page_text(proposal.target_path) if proposal.op == "rewrite" else None
    existing_body = read_page_body(proposal.target_path) if proposal.op == "rewrite" else None
    draft: Draft = draft_page(proposal, existing_body, client=client, model=model)
    if proposal.op == "rewrite" and draft.already_known:
        return None

    # A create's type is the drafted body's; a rewrite keeps the existing page's type (lore/stub —
    # non-prose pages were already skipped at grouping).
    page_type = (
        proposal.page_type
        if proposal.op == "rewrite"
        else detect_page_type(draft.body, path=proposal.target_path)
    )

    def lint(text: str) -> list[VoiceWarning]:
        return voice_warnings(
            text,
            page_type=page_type,
            known_pages=known_pages,
            batch_pages=batch_pages,
            batch_names=batch_names,
        )

    body = draft.body
    warnings = lint(body)
    revised = False
    prose_tells = [w for w in warnings if w.type in PROSE_TELL_TYPES]
    if prose_tells:  # one bounded revise (P3.6) — keep whichever draft is cleaner
        revised = True
        revision = revise_draft(body, prose_tells, client=client, model=model)
        revision_warnings = lint(revision)
        revision_tells = [w for w in revision_warnings if w.type in PROSE_TELL_TYPES]
        if len(revision_tells) < len(prose_tells):
            body, warnings = revision, revision_warnings

    proposal.page_type = page_type
    proposal.conflicts = draft.conflicts
    proposal.lints = warnings
    return assemble_vellum(body, existing_text=existing_text, date=date), warnings, revised


def build_session_proposals(
    date: str,
    *,
    client: TextClient | None = None,
    model: str | None = None,
) -> DraftedChangeSet | None:
    """One session's drafted change-set, or None if it has no committed facts."""
    facts = load_facts(date)
    if facts is None or not facts.facts:
        return None
    client = client if client is not None else real_text_client()
    model = model if model is not None else default_model()

    manifest = build_proposals(facts)
    known_pages = frozenset(load_page_paths())
    batch_pages = frozenset(p.target_path for p in manifest.proposals)
    batch_names = frozenset(p.canonical for p in manifest.proposals)

    kept: list[PageProposal] = []
    bodies: dict[str, str] = {}
    revises = 0
    with _tracer.start_as_current_span("astra.heartwood.propose") as span:
        span.set_attribute("date", date)
        for proposal in manifest.proposals:
            result = _draft_lint_assemble(
                proposal,
                date=date,
                client=client,
                model=model,
                known_pages=known_pages,
                batch_pages=batch_pages,
                batch_names=batch_names,
            )
            if result is None:  # already-known rewrite → skip (P3.15)
                manifest.skipped.append(
                    SkippedPage(target_path=proposal.target_path, reason="already-known")
                )
                continue
            vellum_text, lints, revised = result
            bodies[proposal.id] = vellum_text
            kept.append(proposal)
            revises += int(revised)
            _pages_drafted.add(1, {"op": proposal.op, "kind": proposal.kind or ""})
            for warning in lints:
                _lints_fired.add(1, {"type": warning.type})
        _revises_run.add(revises)

        manifest.proposals = kept
        manifest.skipped = sorted(manifest.skipped, key=lambda s: s.target_path)
        span.set_attribute("pages_total", len(kept))
        span.set_attribute("creates", sum(1 for p in kept if p.op == "create"))
        span.set_attribute("rewrites", sum(1 for p in kept if p.op == "rewrite"))
        span.set_attribute("unplaced", len(manifest.unplaced))
        span.set_attribute("lints_fired", sum(len(p.lints) for p in kept))
        span.set_attribute("revises_run", revises)
    return DraftedChangeSet(manifest=manifest, bodies=bodies)


def write_change_set(out_dir: Path, change_set: DraftedChangeSet) -> None:
    """Emit ``manifest.kdl`` + one ``<id>.vellum`` per proposal (atomic, idempotent)."""
    from .manifest import serialize_manifest

    out_dir.mkdir(parents=True, exist_ok=True)
    # Clear any stale artifact from a prior run so a vanished proposal leaves no orphan file.
    for old in [*out_dir.glob("*.vellum"), out_dir / "manifest.kdl"]:
        old.unlink(missing_ok=True)
    _atomic_write(out_dir / "manifest.kdl", serialize_manifest(change_set.manifest))
    for proposal in change_set.manifest.proposals:
        _atomic_write(out_dir / proposal.body_file, change_set.bodies[proposal.id])


def main() -> None:
    """Host entry-point (``astra-heartwood-propose <date>``) for the acceptance run."""
    from astra_observe import init_telemetry

    init_telemetry("astra.heartwood")
    if len(sys.argv) != 2:
        print("usage: astra-heartwood-propose <date>", file=sys.stderr)
        raise SystemExit(2)
    date = sys.argv[1]
    change_set = build_session_proposals(date)
    if change_set is None:
        print(f"{date}: skipped (no facts/{date}.json)")
        return
    write_change_set(PROPOSALS_DIR / date, change_set)
    m = change_set.manifest
    creates = sum(1 for p in m.proposals if p.op == "create")
    rewrites = sum(1 for p in m.proposals if p.op == "rewrite")
    print(
        f"{date} [{m.show}]: {len(m.proposals)} pages ({creates} create / {rewrites} rewrite), "
        f"{len(m.unplaced)} unplaced, {len(m.skipped)} skipped → proposals/{date}/"
    )


if __name__ == "__main__":
    main()
