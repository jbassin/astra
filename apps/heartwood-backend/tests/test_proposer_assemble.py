"""Phase-3 S4 — .vellum assembly (spec §9). Frontmatter preserved on rewrite, fresh on create."""

from __future__ import annotations

from astra_heartwood.proposer.assemble import assemble_vellum

EXISTING = "---\ntags:\n  - Research\ndate: 2026-06-06T22:12:21-04:00\n---\n\nOld body prose.\n"


def test_rewrite_preserves_frontmatter_verbatim() -> None:
    out = assemble_vellum("New woven body.", existing_text=EXISTING, date="2025-8-28")
    # The exact frontmatter block survives; the body is swapped.
    assert out.startswith("---\ntags:\n  - Research\ndate: 2026-06-06T22:12:21-04:00\n---\n")
    assert "New woven body." in out
    assert "Old body prose." not in out


def test_create_emits_minimal_frontmatter_dated_to_session() -> None:
    out = assemble_vellum("A fresh stub.", date="2025-8-28")
    assert out == "---\ndate: 2025-8-28\ntags: []\n---\n\nA fresh stub.\n"


def test_rewrite_without_frontmatter_degrades_to_fresh() -> None:
    out = assemble_vellum("Body.", existing_text="Just prose, no frontmatter.", date="2025-8-28")
    assert out.startswith("---\ndate: 2025-8-28\n")
