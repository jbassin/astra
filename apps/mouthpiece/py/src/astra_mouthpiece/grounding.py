"""Grounding — resolve a digest's flat `wiki_refs` to corpus pages (the akasha seam).

A NEW code path, not a port (M5/D): faerrin's `groundDigest` matched a
`content/wiki` `WikiCorpus`; astra matches the **akasha vellum corpus**
(`astra_akasha_backend.corpus.load_corpus`). The matching logic is pure over
`GroundingPage`s (title/basename, case-insensitive, first-appearance order); the
akasha coupling lives only in `pages_from_corpus`, so `ground_digest` unit-tests
without akasha materialized.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from .models import GroundingEntry, SessionDigest


class GroundingPage(BaseModel):
    """A corpus page reduced to what grounding needs: a key, a title, body text."""

    path: str
    title: str
    text: str


def _norm(s: str) -> str:
    return s.strip().lower()


def _strip_frontmatter(source: str) -> str:
    """Drop a leading YAML frontmatter block (``---\\n…\\n---``) from vellum source."""
    if not source.startswith("---"):
        return source
    end = source.find("\n---", 3)
    if end == -1:
        return source
    rest = source[end + 4 :]
    return rest.lstrip("\n")


def folder_index_name(path: str) -> str | None:
    """Port of faerrin `folderIndexName` (content/scripts/lib/folder-index.ts): a
    folder-index page (`.../Foo/index`) inherits its title + an implicit alias from
    the PARENT directory name. Returns the parent dir name, or None for non-index
    pages and the root `index` (no parent folder).

    NB akasha path-keys carry no extension, so the sentinel is `index` (faerrin's
    `index.md`).
    """
    parts = path.split("/")
    if parts[-1] != "index":
        return None
    if len(parts) < 2:
        return None  # root index — no parent folder
    return parts[-2]


def _effective_name(path: str) -> str:
    """The page's matchable name: the parent folder for a folder-index page
    (`Geography/Quiet Below/index` → `Quiet Below`), else the last path segment."""
    return folder_index_name(path) or path.rsplit("/", 1)[-1]


def pages_from_corpus(corpus_pages: list[Any]) -> list[GroundingPage]:
    """Adapt `astra_akasha_backend.corpus.Page`s → `GroundingPage`s.

    Title = frontmatter title if present, else the EFFECTIVE name (folder-note
    aware — `…/Foo/index` titles as `Foo`, not `index`). Text = the vellum source
    with its frontmatter stripped (faerrin's grounding text excluded frontmatter).
    """
    out: list[GroundingPage] = []
    for p in corpus_pages:
        title = p.metadata.frontmatter.title or _effective_name(p.path)
        out.append(GroundingPage(path=p.path, title=str(title), text=_strip_frontmatter(p.source)))
    return out


def ground_digest(digest: SessionDigest, pages: list[GroundingPage]) -> list[GroundingEntry]:
    """Resolve the digest's flat `wiki_refs` to pages (deduped, refs aggregated,
    first-seen order).

    Matching is case-insensitive against page title then the EFFECTIVE name (the
    folder-note's parent folder for an `…/index` page — its implicit alias). Both
    lookups use the effective name, so 45 folder-index pages don't collapse onto
    "index". Unmatched refs (NPCs, ad-hoc nouns the corpus doesn't document) are dropped.
    """
    by_title: dict[str, GroundingPage] = {}
    by_basename: dict[str, GroundingPage] = {}
    for page in pages:
        t = _norm(page.title)
        by_title.setdefault(t, page)
        b = _norm(_effective_name(page.path))
        by_basename.setdefault(b, page)

    by_path: dict[str, GroundingEntry] = {}
    order: list[str] = []
    for ref in digest.wiki_refs:
        key = _norm(ref)
        page = by_title.get(key) or by_basename.get(key)
        if page is None:
            continue
        existing = by_path.get(page.path)
        if existing is not None:
            if ref not in existing.refs:
                existing.refs.append(ref)
        else:
            by_path[page.path] = GroundingEntry(
                refs=[ref], title=page.title, path=page.path, text=page.text
            )
            order.append(page.path)

    return [by_path[p] for p in order]
