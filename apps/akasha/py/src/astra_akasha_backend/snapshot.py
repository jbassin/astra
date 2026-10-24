"""The build-time snapshot (NLSpec 0007 §7 / gate F, decisions D/F4).

The snapshot = the validated vellum corpus (the ``.vellum`` files themselves) +
this **metadata JSON**: per page ``{frontmatter, date, crossrefs}`` plus the
resolved page→page ``edges`` and the ``unresolved`` report. akasha-frontend
(0011) builds slugs/backlinks/graph from it via the lifted ``slug.ts``/``site.ts``;
mouthpiece-backend reads the corpus for grounding.

The JSON is **committed** (the ``being.canonical.json`` pattern): ``uv run
akasha-snapshot`` regenerates it on the host and CI diffs a fresh build against the
committed copy.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import astra_observe
from astra_config import find_repo_root, load_config
from astra_observe import get_tracer

from .corpus import CONTENT_DIR, Page, load_corpus
from .crossref import Edge, resolve_corpus

_tracer = get_tracer("astra.akasha-backend")

# Code paths (the repo checkout this package runs from), not data. The repo root comes
# from a marker walk-up, so it holds however deep this app sits under `apps/`.
REPO_ROOT = find_repo_root(Path(__file__))
#: The committed snapshot JSON (config `data.akasha-snapshot`).
SNAPSHOT_PATH = Path(load_config().data.akasha_snapshot) / "akasha-snapshot.json"
#: The TS structural validator (F3) — `validate_corpus` shells out to it.
VALIDATOR = REPO_ROOT / "libs/ts/vellum-lang/scripts/validate-corpus.ts"
#: tsx's Node loader (``node --import <it> file.ts``), from vellum-lang's own install: the
#: deploy checkout installs only that package's node deps, so the root has no tsx there.
#: The path is the ``"."`` export of tsx's package.json.
TSX_LOADER = REPO_ROOT / "libs/ts/vellum-lang/node_modules/tsx/dist/loader.mjs"


def build_snapshot(pages: list[Page], edges: list[Edge]) -> dict[str, Any]:
    """Assemble the snapshot dict from loaded pages + resolved edges (deterministic)."""
    return {
        "pages": [
            {
                "path": page.path,
                "date": page.date,
                "frontmatter": page.metadata.frontmatter.model_dump(),
                "crossrefs": [ref.model_dump() for ref in page.metadata.crossrefs],
            }
            for page in pages
        ],
        "edges": [edge.model_dump() for edge in edges],
        "unresolved": [
            {"source": edge.source, "target": edge.target}
            for edge in edges
            if edge.resolved is None
        ],
    }


def canonical_json(snapshot: dict[str, Any]) -> str:
    """Canonical serialization (sorted keys, 2-space, trailing newline) — diff-stable."""
    return json.dumps(snapshot, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def build_from_corpus(content_dir: Path | str = CONTENT_DIR) -> dict[str, Any]:
    """Load the corpus, resolve crossrefs, and build the snapshot dict."""
    with _tracer.start_as_current_span("akasha.build_snapshot") as span:
        pages = load_corpus(content_dir)
        edges = resolve_corpus(pages)
        snapshot = build_snapshot(pages, edges)
        span.set_attribute("akasha.pages", len(snapshot["pages"]))
        span.set_attribute("akasha.edges", len(snapshot["edges"]))
        span.set_attribute("akasha.unresolved", len(snapshot["unresolved"]))
        return snapshot


def validate_corpus(content_dir: Path | str = CONTENT_DIR) -> None:
    """Run the TS structural validator (F3); raise on any error chip/collision.

    Runs host-side via ``node`` (0022 S11 — off bun; the dagster image ships
    neither bun nor node, so this only runs on the host, matching the pipeline
    live-run gotchas). Node 24 must be on the host's PATH.
    """
    subprocess.run(
        [
            "node",
            "--import",
            str(TSX_LOADER),
            str(VALIDATOR),
            "--dir",
            str(content_dir),
        ],
        check=True,
    )


def write_snapshot(
    content_dir: Path | str = CONTENT_DIR, out: Path = SNAPSHOT_PATH
) -> dict[str, Any]:
    """Build + write the committed snapshot JSON; return the snapshot dict."""
    snapshot = build_from_corpus(content_dir)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(canonical_json(snapshot), encoding="utf-8")
    return snapshot


def main() -> None:
    """``akasha-snapshot`` entry point — regenerate the committed snapshot."""
    with astra_observe.run("astra.akasha-backend"):
        snapshot = write_snapshot()
        pages = snapshot["pages"]
        edges = snapshot["edges"]
        unresolved = snapshot["unresolved"]
        print(  # noqa: T201 -- command-line output
            f"snapshot: {len(pages)} pages, {len(edges)} crossref edges, "
            f"{len(unresolved)} unresolved → {SNAPSHOT_PATH}"
        )
