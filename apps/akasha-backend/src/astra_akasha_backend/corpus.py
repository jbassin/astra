"""The corpus loader — akasha's read path (NLSpec 0007 gate G / M8).

Walks the SSOT vellum corpus under ``content/`` and returns each page with its
extracted metadata (frontmatter + crossref targets, via ``astra-vellum-lang``,
metadata-only — D2). This is the single read path: the Dagster snapshot asset
builds on it, and **mouthpiece-backend imports ``load_corpus`` for grounding**
(replacing caster's ``loadWiki("../content/wiki")`` filesystem read).
"""

from __future__ import annotations

from pathlib import Path

from astra_vellum_lang import Metadata, extract_metadata
from pydantic import BaseModel

# The corpus lives at the app root: apps/akasha-backend/content/.
# parents: [0] package, [1] src, [2] akasha-backend (app root).
CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"


class Page(BaseModel):
    """One corpus page: its path-key, the raw vellum source, and its metadata."""

    #: Path-key relative to the corpus root, POSIX-style, **without** extension —
    #: e.g. ``Divinity/Outer Gods/Iridescent Host``. The crossref resolver keys on
    #: this (matching is by page path; the *slug* form is 0011's job).
    path: str
    #: The raw ``.vellum`` source (vellum is authored/stored verbatim).
    source: str
    #: Extracted frontmatter + crossref targets (metadata-only).
    metadata: Metadata

    @property
    def date(self) -> str | None:
        """The baked faerrin git-modified date (converter put it in frontmatter)."""
        value = self.metadata.frontmatter.extra.get("date")
        return str(value) if value is not None else None


def load_corpus(content_dir: Path | str = CONTENT_DIR) -> list[Page]:
    """Load every ``.vellum`` page under ``content_dir``, sorted by path-key."""
    root = Path(content_dir)
    pages: list[Page] = []
    for file in sorted(root.rglob("*.vellum")):
        source = file.read_text(encoding="utf-8")
        path = file.relative_to(root).with_suffix("").as_posix()
        pages.append(Page(path=path, source=source, metadata=extract_metadata(source)))
    return pages
