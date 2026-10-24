"""Scribe-output detection — the file check of the linguist Dagster sensor (testable).

scribe writes each session to `{date}/script.json` under `ingest_saved_dir`. The sensor
launches linguist for a session once scribe's `session_transcript` is materialized
(`astra_pipeline_resources.partitions.ready_sessions`); this check keeps a session whose
`script.json` is missing (deleted for a re-run, or scribe mid-write) from launching.
"""

from __future__ import annotations

from pathlib import Path


def has_script(saved_dir: Path | str, date: str) -> bool:
    """True when `saved_dir/<date>/script.json` exists."""
    return (Path(saved_dir) / date / "script.json").is_file()
