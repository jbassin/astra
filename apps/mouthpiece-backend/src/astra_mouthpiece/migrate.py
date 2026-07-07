"""Back-catalog migration — seed faerrin's historical episodes into astra's corpus.

The live Dagster pipeline writes new episodes under ``episodes_path/<date>/``, but the
historical back-catalog (everything faerrin rendered before astra went live) lives only
in faerrin's ``pkg/caster/out`` as a **flat** ``<id>.script.json`` / ``<id>.digest.json``
layout. astra owns its own corpus (the orator-M2 philosophy — migrate the data in, never
read the faerrin repo at runtime), so this one-time, idempotent migrator copies each
historical episode's **catalog metadata** (script + digest) into an id-keyed
``episodes_path/<id>/`` dir that :func:`episodes_index.discover_sessions` reads.

Audio is **decoupled**: the frontend serves ``/audio/<id>.mp3`` off the mounted volume
for every episode regardless of ``has_audio`` (audioVersion is only an optional cache-bust,
durationMs comes from the Player's ``loadedmetadata`` — D5), so the catalog needs no mp3.
Seeding the mp3s into the audio volume is the separate ``just mouthpiece-seed`` step.

**Live-precedence:** an id already present in astra's corpus (a real pipeline render, or a
prior migration) is skipped — historical fills the gaps before astra went live, and astra's
own renders win for any date both produced. Re-running is a no-op.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from .episodes_index import discover_sessions

SCRIPT_SUFFIX = ".script.json"
DIGEST_SUFFIX = ".digest.json"

#: faerrin's rendered-episode store (override with $MOUTHPIECE_AUDIO_SRC, the same
#: source the audio-volume seed uses — keeps the catalog + audio in lockstep).
DEFAULT_SOURCE = Path("/ruby/data/experiments/faerrin/pkg/caster/out")


def migrate_history(source: Path, episodes_root: Path) -> tuple[int, int]:
    """Copy each ``<id>.script.json`` (+ digest) from the flat ``source`` into
    ``episodes_root/<id>/`` unless that id is already in the corpus. Returns
    ``(copied, skipped)``. Idempotent; only the two small JSON files are copied."""
    if not source.is_dir():
        raise FileNotFoundError(f"historical episode source not found: {source}")
    episodes_root.mkdir(parents=True, exist_ok=True)

    existing = {s.id for s in discover_sessions(episodes_root)}
    copied = skipped = 0
    for script_path in sorted(source.glob(f"*{SCRIPT_SUFFIX}")):
        episode_id = script_path.name[: -len(SCRIPT_SUFFIX)]
        if episode_id in existing:
            skipped += 1
            continue
        dest = episodes_root / episode_id
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(script_path, dest / "script.json")
        digest_src = source / f"{episode_id}{DIGEST_SUFFIX}"
        if digest_src.is_file():
            shutil.copyfile(digest_src, dest / "digest.json")
        existing.add(episode_id)
        copied += 1
    return copied, skipped


def _episodes_root() -> Path:
    from astra_ontology_config import load

    return Path(load().mouthpiece.episodes_path)


def main() -> None:
    import os

    source = Path(os.environ.get("MOUTHPIECE_AUDIO_SRC") or DEFAULT_SOURCE)
    root = _episodes_root()
    # The back-catalog import is one-time and already in the corpus; faerrin was
    # decommissioned 2026-07-04, so its source dir is gone for good. From the recurring
    # publish path (the linguist-commit timer) an absent source now means "nothing to
    # migrate" — skip cleanly rather than fail the whole publish. (migrate_history itself
    # still raises on a missing source, so a *misconfigured* explicit path stays loud.)
    if not source.is_dir():
        print(
            f"no historical episode source at {source} — skipping back-catalog migration "
            f"(one-time import already done; live corpus in {root} is authoritative)"
        )
        return
    copied, skipped = migrate_history(source, root)
    print(f"migrated {copied} historical episode(s) into {root} ({skipped} already present)")


if __name__ == "__main__":
    sys.exit(main())
