"""Scribe-output detection — the pure core of the linguist Dagster sensor (testable).

scribe writes each session to `{date}/script.json` under `ingest_saved_dir`; a session
whose date isn't yet a linguist partition becomes a new partition + run request, so
`session_transcripts` materializes (applying `defs.yaml` corrections) right after scribe
emits it. The matching is pure so it unit-tests without Dagster (mirrors `astra_scribe`).
"""

from __future__ import annotations

from pathlib import Path


def new_sessions(saved_dir: Path | str, existing_keys: set[str]) -> list[str]:
    """Sorted session dates under `saved_dir` that have a `script.json` and aren't yet
    partitioned. A date dir without `script.json` (scribe mid-write) is skipped until it
    lands, so a half-emitted session never triggers ingest."""
    root = Path(saved_dir)
    if not root.is_dir():
        return []
    return [
        child.name
        for child in sorted(root.iterdir())
        if child.is_dir() and child.name not in existing_keys and (child / "script.json").is_file()
    ]
