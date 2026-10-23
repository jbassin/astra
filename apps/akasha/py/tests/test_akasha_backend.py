"""akasha-backend tests (NLSpec 0007 gates D/F/G) — pure Python, no bun.

The TS structural validator (gate B) runs in the `corpus-validate` CI job + the
Dagster asset; these tests exercise the Python runtime side without shelling out.

They run against the checked-in fixture (`fixtures/astra-data/akasha/`), a small slice of
the real wiki, so they never depend on the live corpus. After editing the fixture pages,
regenerate its snapshot:

    uv run python -c "from astra_akasha_backend.snapshot import write_snapshot as w; \
        w('fixtures/astra-data/akasha/content', \
          __import__('pathlib').Path('fixtures/astra-data/akasha/snapshot/akasha-snapshot.json'))"
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_akasha_backend.corpus import CONTENT_DIR, load_corpus
from astra_akasha_backend.crossref import resolve_corpus, resolve_target
from astra_akasha_backend.snapshot import build_snapshot, canonical_json
from astra_config import load_config


def _fixture_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "fixtures" / "astra-data").is_dir():
            return parent / "fixtures" / "astra-data" / "akasha"
    raise RuntimeError("fixtures/astra-data not found")


FIXTURE = _fixture_root()
FIXTURE_CONTENT = FIXTURE / "content"
FIXTURE_SNAPSHOT = FIXTURE / "snapshot" / "akasha-snapshot.json"


def test_load_corpus_reads_every_page() -> None:
    """Gate G: the loader (the mouthpiece read path) loads the whole corpus."""
    pages = load_corpus(FIXTURE_CONTENT)
    # A known deity page parses to fields-bearing metadata + a baked date.
    host = next(p for p in pages if p.path == "Divinity/Outer Gods/Iridescent Host")
    assert host.date is not None
    assert "Host" in host.metadata.frontmatter.aliases


def test_crossref_resolution_page_to_page() -> None:
    """Gate D: crossrefs resolve to page paths; dangling targets stay unresolved."""
    pages = load_corpus(FIXTURE_CONTENT)
    by_path = {p.path: p.path for p in pages}
    by_stem: dict[str, list[str]] = {}
    for p in pages:
        by_stem.setdefault(p.path.rsplit("/", 1)[-1], []).append(p.path)

    # A bare name resolves by stem.
    assert resolve_target("Timeline", by_path, by_stem) == "Timeline"
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
    pages = load_corpus(FIXTURE_CONTENT)
    edges = resolve_corpus(pages)
    fresh = canonical_json(build_snapshot(pages, edges))
    committed = FIXTURE_SNAPSHOT.read_text(encoding="utf-8")
    assert fresh == committed, "regenerate the fixture snapshot (see the module docstring)"
    # Structural sanity on the committed artifact.
    snap = json.loads(committed)
    assert all("frontmatter" in page for page in snap["pages"])
    assert isinstance(snap["unresolved"], list)


def test_corpus_dir_is_the_configured_content() -> None:
    """The loader defaults to config's `data.akasha-content` (E2), not a stray dir."""
    assert Path(load_config().data.akasha_content) == CONTENT_DIR
    assert CONTENT_DIR.is_absolute()
