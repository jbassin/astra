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

#: Craig drops a ~900 B stub zip when a recording is started and aborted at once; a
#: real session is hundreds of MB. Anything under this floor is not a session and must
#: never claim a date partition — on 2026-9-7 a 917 B stub sorted ahead of the real
#: 940 MB zip, bound the partition, and the session was silently never processed.
MIN_ZIP_BYTES = 1 << 20  # 1 MiB


def is_session_zip(zip_path: Path | str) -> bool:
    """True for a zip large enough to be a real Craig recording (>= MIN_ZIP_BYTES)."""
    try:
        return Path(zip_path).stat().st_size >= MIN_ZIP_BYTES
    except OSError:
        return False


def new_sessions(zip_paths: Iterable[Path | str], existing_keys: set[str]) -> dict[str, str]:
    """Map of new session/date key → zip path for zips not yet partitioned.

    A zip whose stem has no date field is skipped, as is a stub under MIN_ZIP_BYTES;
    the first remaining zip wins if two map to the same date key.
    """
    out: dict[str, str] = {}
    for zip_path in sorted(str(p) for p in zip_paths):
        key = session_id(zip_path)
        if key and key not in existing_keys and key not in out and is_session_zip(zip_path):
            out[key] = zip_path
    return out
