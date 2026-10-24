"""Publish the committed ``snapshot/episodes-index.json`` from the live corpus.

mouthpiece-frontend reads ONE committed build artifact — ``snapshot/episodes-index.json``
(the akasha-snapshot pattern: deterministic, no live backend at build). This regenerates
that committed snapshot from astra's actual episodes corpus (``episodes_path`` — migrated
back-catalog ∪ live pipeline renders), so the frontend's catalog tracks the pipeline.

Run after the pipeline produces a new episode (or after a back-catalog migration); the
``just mouthpiece-publish`` recipe + the host-side timer hook automate it. Unlike the old
golden-fixture snapshot, the live snapshot has no in-git source to rebuild-and-compare,
so its gate (``test_episodes_snapshot``) validates shape/superset/no-dups, not byte-equality.

The publisher refuses (writes nothing) when the corpus dir is missing or the new catalog
has fewer episodes than the snapshot already on disk: either means a wrong path or a
half-mounted corpus, and linguist-commit would otherwise commit and deploy the shrunken
catalog. ``--allow-shrink`` publishes a deliberate removal.
"""

from __future__ import annotations

import sys
from pathlib import Path

from astra_config import load_config

from .episodes_index import INDEX_FILENAME, EpisodesIndex

#: The committed snapshot the frontend's build-content reads (config `data.mouthpiece-snapshot`).
SNAPSHOT_PATH = Path(load_config().data.mouthpiece_snapshot) / INDEX_FILENAME


class PublishRefusedError(RuntimeError):
    """The new catalog would replace the snapshot with a worse one; nothing was written."""


def publish_snapshot(
    snapshot_path: Path = SNAPSHOT_PATH,
    *,
    corpus_dir: Path | None = None,
    allow_shrink: bool = False,
) -> int:
    """Build the catalog over the live corpus and write the committed snapshot.
    Returns the episode count. Requires ffprobe on PATH (live mp3 durations).
    Raises PublishRefusedError on a missing corpus dir or a shrinking catalog."""
    from .assets import _out_root, build_episodes_index

    root = corpus_dir or _out_root()
    if not root.is_dir():
        raise PublishRefusedError(f"the episodes corpus {root} is missing")
    index = build_episodes_index(root)
    if snapshot_path.exists() and not allow_shrink:
        before = len(EpisodesIndex.model_validate_json(snapshot_path.read_text()).episodes)
        if len(index.episodes) < before:
            raise PublishRefusedError(
                f"the new catalog has {len(index.episodes)} episode(s), fewer than the "
                f"{before} in {snapshot_path} (pass --allow-shrink if that is intended)"
            )
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(
        index.model_dump_json(indent=2, by_alias=True) + "\n", encoding="utf-8"
    )
    return len(index.episodes)


def _err(msg: str) -> None:
    print(msg, file=sys.stderr)  # noqa: T201 -- command-line output


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    unknown = [a for a in args if a != "--allow-shrink"]
    if unknown:
        _err(f"usage: python -m astra_mouthpiece.publish [--allow-shrink] (got {unknown})")
        return 2
    try:
        n = publish_snapshot(allow_shrink="--allow-shrink" in args)
    except PublishRefusedError as exc:
        _err(f"mouthpiece-publish: refusing — {exc}; nothing written")
        return 1
    print(f"published snapshot with {n} episode(s) → {SNAPSHOT_PATH}")  # noqa: T201 -- command-line output
    return 0


if __name__ == "__main__":
    sys.exit(main())
