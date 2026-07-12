"""The proposer orchestration (spec §10) — group → emit, zero LLM calls (0020 FO-1).

``build_session_proposals(date)`` is the pure, Dagster-free core (the asset and the host ``main``
both call it); it returns None for a session with no committed facts. Per proposal: a create gets
a fresh frontmatter skeleton with an empty body (``assemble.skeleton_vellum``); a rewrite gets the
live corpus page copied byte-for-byte (``assemble.rewrite_vellum`` — verbatim, no synthesis). The
human writes every body in the review surface's editor (FO-2). Skips come only from the grouping
stage's non-prose gate (P3.10). Read-only: ``write_change_set`` emits
``proposals/<date>/{manifest.kdl,<id>.vellum}``; no corpus writes.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from astra_observe import get_meter, get_tracer

from ..pipeline import _atomic_write
from .assemble import rewrite_vellum, skeleton_vellum
from .corpus import PROPOSALS_DIR, read_page_text
from .group import build_proposals, load_facts
from .models import PageProposal, ProposalManifest

_tracer = get_tracer("astra.heartwood")
_meter = get_meter("astra.heartwood")
_pages_proposed = _meter.create_counter(
    "astra.heartwood.pages_proposed", description="pages proposed, by op/kind"
)


@dataclass
class ChangeSet:
    """One session's proposal change-set: the committed manifest + each proposal's body text.

    Bodies are carried out-of-band (NOT in the manifest schema — they are sibling ``.vellum``
    files, P3.8); ``write_change_set`` writes both. Keyed by ``PageProposal.id``.
    """

    manifest: ProposalManifest
    bodies: dict[str, str]


def _emit_body(proposal: PageProposal, *, date: str) -> str:
    """A proposal's starting ``.vellum`` text: a skeleton (create) or the live page (rewrite)."""
    if proposal.op == "create":
        return skeleton_vellum(date)
    existing = read_page_text(proposal.target_path)
    assert existing is not None, f"rewrite target vanished mid-run: {proposal.target_path}"
    return rewrite_vellum(existing)


def build_session_proposals(date: str) -> ChangeSet | None:
    """One session's proposal change-set, or None if it has no committed facts."""
    facts = load_facts(date)
    if facts is None or not facts.facts:
        return None

    manifest = build_proposals(facts)
    bodies: dict[str, str] = {}
    with _tracer.start_as_current_span("astra.heartwood.propose") as span:
        span.set_attribute("date", date)
        for proposal in manifest.proposals:
            bodies[proposal.id] = _emit_body(proposal, date=date)
            _pages_proposed.add(1, {"op": proposal.op, "kind": proposal.kind or ""})
        span.set_attribute("pages_total", len(manifest.proposals))
        span.set_attribute("creates", sum(1 for p in manifest.proposals if p.op == "create"))
        span.set_attribute("rewrites", sum(1 for p in manifest.proposals if p.op == "rewrite"))
        span.set_attribute("unplaced", len(manifest.unplaced))
    return ChangeSet(manifest=manifest, bodies=bodies)


def write_change_set(out_dir: Path, change_set: ChangeSet) -> None:
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
    from astra_observe import init_telemetry, shutdown

    init_telemetry("astra.heartwood")
    try:
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
    finally:
        shutdown()  # console_script exit → flush the run's spans/metrics/logs


if __name__ == "__main__":
    main()
