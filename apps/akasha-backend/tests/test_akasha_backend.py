"""akasha-backend tests (NLSpec 0007 gates D/F/G) — pure Python, no bun.

The TS structural validator (gate B) runs in the `corpus-validate` CI job + the
Dagster asset; these tests exercise the Python runtime side without shelling out.
"""

from __future__ import annotations

import json

from astra_akasha_backend.corpus import CONTENT_DIR, load_corpus
from astra_akasha_backend.crossref import resolve_corpus, resolve_target
from astra_akasha_backend.snapshot import SNAPSHOT_PATH, build_snapshot, canonical_json


def test_load_corpus_reads_every_page() -> None:
    """Gate G: the loader (the mouthpiece read path) loads the whole corpus."""
    pages = load_corpus()
    assert len(pages) == 141
    # A known deity page parses to fields-bearing metadata + a baked date.
    host = next(p for p in pages if p.path == "Divinity/Outer Gods/Iridescent Host")
    assert host.date is not None
    assert "Host" in host.metadata.frontmatter.aliases


def test_crossref_resolution_page_to_page() -> None:
    """Gate D: crossrefs resolve to page paths; dangling targets stay unresolved."""
    pages = load_corpus()
    by_path = {p.path: p.path for p in pages}
    by_stem: dict[str, list[str]] = {}
    for p in pages:
        by_stem.setdefault(p.path.rsplit("/", 1)[-1], []).append(p.path)

    # A bare name resolves by stem.
    assert resolve_target("Othello", by_path, by_stem) == "Othello"
    # A folder link resolves to its index page (Quartz convention).
    assert (
        resolve_target("Org/Iridescent Church", by_path, by_stem) == "Org/Iridescent Church/index"
    )
    # A genuine red-link (no such page) stays unresolved — reported, not fatal (E4).
    assert resolve_target("Iconoclasm", by_path, by_stem) is None

    edges = resolve_corpus(pages)
    assert edges, "the corpus has crossref edges"
    resolved = [e for e in edges if e.resolved is not None]
    assert len(resolved) / len(edges) > 0.7  # most refs are akasha→akasha


def test_snapshot_is_deterministic_and_committed() -> None:
    """Gate F / M6: a fresh build matches the committed snapshot (the parity gate)."""
    pages = load_corpus()
    edges = resolve_corpus(pages)
    fresh = canonical_json(build_snapshot(pages, edges))
    committed = SNAPSHOT_PATH.read_text(encoding="utf-8")
    assert fresh == committed, "run `uv run akasha-snapshot` to refresh the committed snapshot"
    # Structural sanity on the committed artifact.
    snap = json.loads(committed)
    assert len(snap["pages"]) == 141
    assert all("frontmatter" in page for page in snap["pages"])
    assert isinstance(snap["unresolved"], list)


def test_corpus_dir_is_the_app_content() -> None:
    """The loader points at apps/akasha-backend/content (E2), not a stray dir."""
    assert CONTENT_DIR.name == "content"
    assert CONTENT_DIR.parent.name == "akasha-backend"
