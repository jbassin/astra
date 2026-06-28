"""Assemble a ``.vellum`` body per proposal (spec §9, P3.9-revised).

A ``create`` gets minimal new frontmatter (``date``/``tags: []``, mirroring the corpus). A
``rewrite`` is **preserve-and-append** (the rewrite-hardening pass — the acceptance run showed a
full-body replace systematically flattens POV and drops the human's prose): the existing file's
frontmatter AND body are kept verbatim and the drafted passage is appended after them, so the diff
is purely additive and the human keeps the pen (§12). Pure text.
"""

from __future__ import annotations

from .corpus import split_frontmatter


def assemble_vellum(passage: str, *, existing_text: str | None = None, date: str = "") -> str:
    """Build the full ``.vellum`` file text for one proposal.

    ``existing_text`` (the rewrite target's full file) → its frontmatter + body are preserved and
    ``passage`` is appended; None (a create) → fresh minimal frontmatter + the passage as the body.
    """
    prose = passage.strip()
    if existing_text is not None:
        frontmatter, existing_body = split_frontmatter(existing_text)
        kept = (existing_body if frontmatter else existing_text).strip()
        combined = f"{kept}\n\n{prose}" if prose else kept
        if frontmatter:
            return f"{frontmatter.rstrip()}\n\n{combined}\n"
        return f"---\ndate: {date}\ntags: []\n---\n\n{combined}\n"
    return f"---\ndate: {date}\ntags: []\n---\n\n{prose}\n"
