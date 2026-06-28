"""Phase-3 S4/hardening — .vellum assembly (spec §9, P3.9-revised).

A rewrite is preserve-and-append: the existing frontmatter AND body are kept verbatim and the
drafted passage is appended after them (no full-body replace → no POV flip / content loss). A
create gets fresh session-dated frontmatter.
"""

from __future__ import annotations

from astra_heartwood.proposer.assemble import assemble_vellum

EXISTING = "---\ntags:\n  - Research\ndate: 2026-06-06T22:12:21-04:00\n---\n\nOld body prose.\n"


def test_rewrite_preserves_existing_body_and_appends() -> None:
    out = assemble_vellum("New appended passage.", existing_text=EXISTING, date="2025-8-28")
    # The exact frontmatter block AND the existing body survive; the new passage follows them.
    assert out.startswith("---\ntags:\n  - Research\ndate: 2026-06-06T22:12:21-04:00\n---\n")
    assert "Old body prose." in out
    assert out.index("Old body prose.") < out.index("New appended passage.")


def test_create_emits_minimal_frontmatter_dated_to_session() -> None:
    out = assemble_vellum("A fresh stub.", date="2025-8-28")
    assert out == "---\ndate: 2025-8-28\ntags: []\n---\n\nA fresh stub.\n"


def test_rewrite_without_frontmatter_keeps_and_appends() -> None:
    out = assemble_vellum("Body.", existing_text="Just prose, no frontmatter.", date="2025-8-28")
    assert out.startswith("---\ndate: 2025-8-28\n")
    assert "Just prose, no frontmatter." in out and "Body." in out
