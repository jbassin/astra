"""Page→page crossref resolution (NLSpec 0007 §6 / gate D, decision E4).

Resolves each ``[[target]]`` to an akasha **page path** (the Quartz "shortest"
rule, applied to paths — the *slug* form stays 0011's job, so URL semantics
remain byte-faithful via the lifted ``slug.ts``). ontology-being is META, not
setting, so v1 resolves akasha→akasha only; unresolved targets are reported,
never fatal. The edge list feeds akasha-frontend's backlink graph.
"""

from __future__ import annotations

from pydantic import BaseModel

from .corpus import Page


class Edge(BaseModel):
    """One resolved (or unresolved) crossref edge, source → target page."""

    source: str
    target: str
    #: The resolved page-path, or ``None`` when no akasha page matches.
    resolved: str | None = None
    heading: str | None = None
    alias: str | None = None


def _index(pages: list[Page]) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Build path→path and stem→[paths] indices for resolution."""
    by_path: dict[str, str] = {}
    by_stem: dict[str, list[str]] = {}
    for page in pages:
        by_path[page.path] = page.path
        by_stem.setdefault(page.path.rsplit("/", 1)[-1], []).append(page.path)
    return by_path, by_stem


def _shortest(paths: list[str]) -> str:
    """Quartz "shortest" tie-break: fewest path segments, then shortest string."""
    return min(paths, key=lambda p: (p.count("/"), len(p), p))


def resolve_target(
    target: str, by_path: dict[str, str], by_stem: dict[str, list[str]]
) -> str | None:
    """Resolve one crossref target to a page-path (or ``None``)."""
    t = target.strip().removesuffix(".md")
    if t in by_path:
        return t
    # A folder link resolves to that folder's index page (Quartz convention).
    if f"{t}/index" in by_path:
        return f"{t}/index"
    # Otherwise match by stem (basename), shortest path wins.
    candidates = by_stem.get(t.rsplit("/", 1)[-1])
    return _shortest(candidates) if candidates else None


def resolve_corpus(pages: list[Page]) -> list[Edge]:
    """Every crossref in the corpus as a resolved/unresolved edge, in page order."""
    by_path, by_stem = _index(pages)
    edges: list[Edge] = []
    for page in pages:
        for ref in page.metadata.crossrefs:
            edges.append(
                Edge(
                    source=page.path,
                    target=ref.target,
                    resolved=resolve_target(ref.target, by_path, by_stem),
                    heading=ref.heading,
                    alias=ref.alias,
                )
            )
    return edges
