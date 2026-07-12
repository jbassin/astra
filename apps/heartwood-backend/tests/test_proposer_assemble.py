"""0020 facts-only rework (spec §9, FO-12) — ``.vellum`` starting-body assembly.

A ``create`` gets a fresh frontmatter skeleton with an empty body; a ``rewrite`` gets the live
corpus page copied byte-for-byte (verbatim — no synthesis of any kind, the human writes into it).
"""

from __future__ import annotations

from astra_heartwood.proposer.assemble import rewrite_vellum, skeleton_vellum

EXISTING = "---\ntags:\n  - Research\ndate: 2026-06-06T22:12:21-04:00\n---\n\nOld body prose.\n"


def test_skeleton_vellum_is_frontmatter_only_dated_to_session() -> None:
    assert skeleton_vellum("2025-8-28") == "---\ndate: 2025-8-28\ntags: []\n---\n\n"


def test_rewrite_vellum_is_byte_identical_to_the_source() -> None:
    assert rewrite_vellum(EXISTING) == EXISTING


def test_rewrite_vellum_passthrough_survives_frontmatterless_text() -> None:
    # verbatim means verbatim — no frontmatter-synthesize branch, even for a page with none.
    plain = "Just prose, no frontmatter.\n"
    assert rewrite_vellum(plain) == plain
