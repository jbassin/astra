"""Craig-drop detection — the pure core of the Dagster sensor (testable).

The sensor turns the disk-as-ledger (faerrin's `db.processed`) into Dagster
partition state: a dropped zip whose session/date isn't yet a partition becomes a
new partition + run request. The matching itself is pure so it unit-tests without
Dagster (gate G).
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from .ingest import session_id


def new_sessions(zip_paths: Iterable[Path | str], existing_keys: set[str]) -> dict[str, str]:
    """Map of new session/date key → zip path for zips not yet partitioned.

    A zip whose stem has no date field is skipped; the first zip wins if two map
    to the same date key.
    """
    out: dict[str, str] = {}
    for zip_path in sorted(str(p) for p in zip_paths):
        key = session_id(zip_path)
        if key and key not in existing_keys and key not in out:
            out[key] = zip_path
    return out
