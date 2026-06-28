"""Read-only access to the akasha corpus + the committed Phase-2 facts (spec §2).

A single seam for the four things the proposer reads from outside its own package: the
existing page bodies (``apps/akasha-backend/content/<path>.vellum``, for rewrites + page-type
detection), the known page-path set (``akasha-snapshot.json``, for crossref validation), and
this app's own ``facts/<date>.json`` (the Phase-2 artifact). Nothing here writes.
"""

from __future__ import annotations

import json
from pathlib import Path

#: ``apps/heartwood-backend`` (this file is ``src/astra_heartwood/proposer/corpus.py``).
HEARTWOOD_ROOT = Path(__file__).resolve().parents[3]
APPS_DIR = HEARTWOOD_ROOT.parent
AKASHA_CONTENT = APPS_DIR / "akasha-backend" / "content"
AKASHA_SNAPSHOT = APPS_DIR / "akasha-backend" / "snapshot" / "akasha-snapshot.json"
FACTS_DIR = HEARTWOOD_ROOT / "facts"
PROPOSALS_DIR = HEARTWOOD_ROOT / "proposals"


def split_frontmatter(text: str) -> tuple[str, str]:
    """Split a ``.vellum`` file into ``(frontmatter_block, body)``.

    ``frontmatter_block`` is the leading ``---\\n…\\n---`` fence verbatim (empty string when
    absent); ``body`` is everything after it. Lossless: ``frontmatter_block + body`` round-trips
    (a rewrite target's frontmatter is preserved verbatim, P3.9/faerrin ``replacePageBody``).
    """
    if not text.startswith("---"):
        return "", text
    lines = text.splitlines(keepends=True)
    # The opening fence is line 0 (``---`` possibly with a trailing newline).
    if lines[0].rstrip("\n") != "---":
        return "", text
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") == "---":
            return "".join(lines[: i + 1]), "".join(lines[i + 1 :])
    return "", text  # unterminated fence → treat as no frontmatter


def read_page_text(target_path: str) -> str | None:
    """The full ``.vellum`` file (frontmatter + body) for a page path, or None if absent."""
    path = AKASHA_CONTENT / f"{target_path}.vellum"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def read_page_body(target_path: str) -> str | None:
    """A page's prose body (frontmatter stripped), or None if the file is absent."""
    text = read_page_text(target_path)
    if text is None:
        return None
    return split_frontmatter(text)[1]


def load_page_paths(snapshot: Path | None = None) -> set[str]:
    """The set of known akasha page paths (``pages[].path``) — for crossref validation (§8)."""
    src = snapshot if snapshot is not None else AKASHA_SNAPSHOT
    data = json.loads(src.read_text(encoding="utf-8"))
    return {str(p["path"]) for p in data.get("pages", []) if p.get("path")}
