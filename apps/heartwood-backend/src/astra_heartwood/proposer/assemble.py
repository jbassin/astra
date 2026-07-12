"""Assemble a ``.vellum`` starting body per proposal (spec §9, FO-12).

Facts-only (0020 rework — the machine no longer writes prose, FO-1): a ``create`` gets a fresh
frontmatter skeleton with an empty body; a ``rewrite`` gets the live corpus page copied
byte-for-byte, unchanged (verbatim passthrough — the human writes into it in the review surface's
editor). Pure text, no synthesis of any kind.
"""

from __future__ import annotations


def skeleton_vellum(date: str) -> str:
    """A create's starting ``.vellum`` text: fresh session-dated frontmatter, empty body (FO-2)."""
    return f"---\ndate: {date}\ntags: []\n---\n\n"


def rewrite_vellum(existing_text: str) -> str:
    """A rewrite's starting ``.vellum`` text: the live corpus page, byte-identical (FO-2/FO-12)."""
    return existing_text
