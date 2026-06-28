"""Stage B — page-type detection + the machine tell-lint (spec §8, ported from faerrin).

S1 lands ``detect_page_type`` (the grouping non-prose skip + the lint suppression gate both
need it); the tell-lint warnings (``encyclopedia_opener``/``it_is_template``/``intensifier``/
``broken_wikilink``/``empty``) and the bounded revise loop land in S2/S4.
"""

from __future__ import annotations

from .corpus import split_frontmatter
from .models import PageType

#: Page types that are NOT prose — their bodies carry structured constructs (``@deity`` stat
#: blocks, ``@timeline`` entries, ``<pre>`` flavor) that a full-body ``call_text`` rewrite would
#: destroy. Phase 3 only rewrites ``lore``/``stub`` pages (P3.10); these are skipped-with-note.
NON_PROSE_TYPES: frozenset[PageType] = frozenset({"deity-statblock", "timeline", "flavor-pre"})


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
