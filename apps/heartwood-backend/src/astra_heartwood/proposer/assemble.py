"""Assemble a ``.vellum`` body per proposal (spec §9).

A ``create`` gets minimal new frontmatter (``date``/``tags: []``, mirroring the corpus); a
``rewrite`` PRESERVES the existing file's ``---`` frontmatter verbatim (faerrin ``replacePageBody``
— the merge is a full-body replace, the diff is git/render against the content file). Pure text.
"""

from __future__ import annotations

from .corpus import split_frontmatter


def assemble_vellum(body: str, *, existing_text: str | None = None, date: str = "") -> str:
    """Build the full ``.vellum`` file text for one proposal.

    ``existing_text`` (the rewrite target's full file) → its frontmatter is kept verbatim and the
    body swapped; None (a create) → fresh minimal frontmatter dated to the session.
    """
    prose = body.strip()
    if existing_text is not None:
        frontmatter, _ = split_frontmatter(existing_text)
        if frontmatter:
            return f"{frontmatter.rstrip()}\n\n{prose}\n"
    return f"---\ndate: {date}\ntags: []\n---\n\n{prose}\n"
