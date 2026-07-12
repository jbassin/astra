"""Stage B — page-type detection (spec §8, ported from faerrin ``page-type.ts``).

``detect_page_type`` (S1) gates which existing pages may be rewritten: Phase 3 only rewrites
``lore``/``stub`` pages (P3.10) — the rest carry structured constructs (``@deity`` stat blocks,
``@timeline`` entries, ``<pre>`` flavor) that a body overwrite would destroy, so they're
skipped-with-note. Renamed from ``lint.py`` when the drafting/tell-lint machinery it used to
gate was retired (0020 facts-only rework) — this module now only classifies.
"""

from __future__ import annotations

from .corpus import split_frontmatter
from .models import PageType

#: Page types that are NOT prose — their bodies carry structured constructs (``@deity`` stat
#: blocks, ``@timeline`` entries, ``<pre>`` flavor) that a full-body rewrite would destroy.
#: Phase 3 only rewrites ``lore``/``stub`` pages (P3.10); these are skipped-with-note.
NON_PROSE_TYPES: frozenset[PageType] = frozenset({"deity-statblock", "timeline", "flavor-pre"})

#: Page types that face the literary prose bar (a stub graduates to prose on its first paragraph).
PROSE_PAGE_TYPES: frozenset[PageType] = frozenset({"lore", "stub"})


def detect_page_type(text: str, *, path: str | None = None) -> PageType:
    """Classify a ``.vellum`` body (ported from faerrin ``page-type.ts``, P3.10).

    ``text`` may include frontmatter (it is stripped here). ``path`` lets the lone ``Timeline``
    page classify even when its body wouldn't. Order matters: structural markers win over length.
    """
    body = split_frontmatter(text)[1]
    stripped = body.strip()
    if path and path.split("/")[-1] == "Timeline":
        return "timeline"
    if "@timeline" in body or ":::timeline" in body:
        return "timeline"
    if "<pre" in body:
        return "flavor-pre"
    if "@deity" in body or ":::deity" in body:
        return "deity-statblock"
    if sum(1 for line in body.splitlines() if " :: " in line) >= 2:
        return "deity-statblock"
    if not stripped:
        return "stub"
    if len(stripped) < 40:
        return "stub"
    return "lore"
