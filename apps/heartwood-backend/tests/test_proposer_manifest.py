"""Phase-3 S1 — the KDL manifest round-trips (spec §5/§9).

``ProposalManifest`` → ``manifest.kdl`` text → re-parse → equal, exercising every node kind
(rewrite page, flagged create, unplaced, the non-prose skip reason, registry-add) plus non-ASCII
and the empty manifest. Mirrors Phase-2's JSON round-trip gate. The ``lint``/``conflict`` child
nodes and the LLM-only ``already-known`` skip reason died with drafting (0020 facts-only rework).
"""

from __future__ import annotations

from astra_heartwood.proposer.manifest import parse_manifest, serialize_manifest
from astra_heartwood.proposer.models import (
    PageProposal,
    ProposalManifest,
    RegistryAddition,
    SkippedPage,
    UnplacedFact,
)


def _full_manifest() -> ProposalManifest:
    return ProposalManifest(
        date="2025-8-28",
        show="through-a-song-darkly",
        world="faerrin",
        proposals=[
            PageProposal(
                id="org-iconoclasm-index",
                op="rewrite",
                target_path="Org/Iconoclasm/index",
                canonical="Iconoclasm",
                kind="org",
                status="resolved",
                page_type="lore",
                body_file="org-iconoclasm-index.vellum",
                fact_claims=[
                    "Iconoclasm provides free food and housing.",
                    'It runs out of the "Sin and Tonic".',
                ],
            ),
            PageProposal(
                id="needs-placement-sentience-distributor",
                op="create",
                target_path="needs-placement/Sentience Distributor",
                canonical="Sentience Distributor",
                kind="item",
                status="unknown",
                page_type="stub",
                body_file="needs-placement-sentience-distributor.vellum",
                fact_claims=["An arcane enchanted item that spreads a signal."],
                placement_note="kind=item has no corpus folder; human to place (§6)",
            ),
            PageProposal(
                id="divinity-anais",
                op="create",
                target_path="Divinity/Anaïs",  # non-ASCII path survives the round-trip
                canonical="Anaïs",
                kind="deity",
                status="resolved",
                page_type="stub",
                body_file="divinity-anais.vellum",
                fact_claims=["A little-known deity of thresholds."],
            ),
        ],
        unplaced=[
            UnplacedFact(
                subject="Argyle",
                claim="Argyle is mentioned in passing.",
                candidates=[("Argyle", 0.71), ("Anouk", 0.6447368421052632)],
            )
        ],
        skipped=[
            SkippedPage(target_path="Divinity/Outer Gods/Eternal Pulse", reason="non-prose-page"),
            SkippedPage(target_path="Divinity/Outer Gods/The Compelled", reason="non-prose-page"),
        ],
        registry_additions=[
            RegistryAddition(
                canonical="Sentience Distributor",
                kind="item",
                suggested_path="needs-placement/Sentience Distributor",
            ),
            RegistryAddition(
                canonical="goblinoid", kind=None, suggested_path="needs-placement/goblinoid"
            ),
        ],
    )


def test_manifest_round_trips() -> None:
    m = _full_manifest()
    assert parse_manifest(serialize_manifest(m)) == m


def test_empty_manifest_round_trips() -> None:
    m = ProposalManifest(date="2026-6-8", show="x", world="faerrin")
    assert parse_manifest(serialize_manifest(m)) == m


def test_float_score_precision_preserved() -> None:
    m = ProposalManifest(
        date="d",
        show="s",
        world="faerrin",
        unplaced=[UnplacedFact(subject="x", claim="c", candidates=[("a", 0.619717868338558)])],
    )
    rt = parse_manifest(serialize_manifest(m))
    assert rt.unplaced[0].candidates[0][1] == 0.619717868338558
