"""Publish the committed ``snapshot/episodes-index.json`` from the live corpus.

mouthpiece-frontend reads ONE committed build artifact — ``snapshot/episodes-index.json``
(the akasha-snapshot pattern: deterministic, no live backend at build). This regenerates
that committed snapshot from astra's actual episodes corpus (``episodes_path`` — migrated
back-catalog ∪ live pipeline renders), so the frontend's catalog tracks the pipeline.

Run after the pipeline produces a new episode (or after a back-catalog migration); the
``just mouthpiece-publish`` recipe + the host-side timer hook automate it. Unlike the old
golden-fixture snapshot, the live snapshot has no in-git source to rebuild-and-compare,
so its gate (``test_episodes_snapshot``) validates shape/superset/no-dups, not byte-equality.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .episodes_index import INDEX_FILENAME

#: The committed snapshot the frontend's build-content reads (app-relative, stable).
SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "snapshot" / INDEX_FILENAME


def publish_snapshot(snapshot_path: Path = SNAPSHOT_PATH) -> int:
    """Build the catalog over the live corpus and write the committed snapshot.
    Returns the episode count. Requires ffprobe on PATH (live mp3 durations)."""
    from .assets import build_episodes_index

    index = build_episodes_index()
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(
        index.model_dump_json(indent=2, by_alias=True) + "\n", encoding="utf-8"
    )
    return len(index.episodes)


def main() -> None:
    n = publish_snapshot()
    print(f"published snapshot with {n} episode(s) → {SNAPSHOT_PATH}")


if __name__ == "__main__":
    sys.exit(main())
