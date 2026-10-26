"""Craig-drop detection — the pure core of the Dagster sensor (testable).

The sensor turns the disk-as-ledger (faerrin's `db.processed`) into Dagster
partition state: a dropped zip whose session/date isn't yet a partition becomes a
new partition + run request. The matching itself is pure so it unit-tests without
Dagster.
"""

from __future__ import annotations

import zipfile
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from astra_sessions import format_date, recording_key

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


# ── recordings per session: the facts the session_tracks checks gate on ──


@dataclass(frozen=True)
class Recording:
    """One real (non-stub) Craig zip in the incoming dir.

    ``key`` is the session it belongs to: the date field of a dated name, or for an undated
    name the UTC date of ``Start time:`` in its ``info.txt`` (``""`` if unreadable). Two
    names of one recording (the hard-link recovery of an undated zip) share a
    ``recording_id``, so they count once.
    """

    path: Path
    recording_id: str
    key: str
    dated: bool


def read_info(zip_path: Path | str) -> tuple[str, str]:
    """``(recording id, session key)`` from a Craig zip's ``info.txt``; ``""`` for each part
    that is missing or unreadable. The key is the UTC date of ``Start time:``, the same date
    Craig writes into a dated name."""
    try:
        with zipfile.ZipFile(zip_path) as archive:
            text = archive.read("info.txt").decode("utf-8", errors="replace")
    except (OSError, KeyError, zipfile.BadZipFile):
        return "", ""
    recording_id = key = ""
    for line in text.splitlines():
        if line.startswith("Recording ") and not recording_id:
            recording_id = line.removeprefix("Recording ").strip()
        elif line.startswith("Start time:") and not key:
            try:
                start = datetime.fromisoformat(line.removeprefix("Start time:").strip())
            except ValueError:
                continue
            key = format_date(start.astimezone(UTC).date() if start.tzinfo else start.date())
    return recording_id, key


def read_recording(zip_path: Path | str) -> Recording:
    """The `Recording` for a zip. A dated name ``craig_<id>_<date>_<time>`` carries its id
    and date, so only an undated zip is opened."""
    path = Path(zip_path)
    key = recording_key(path)
    if key:
        return Recording(path=path, recording_id=path.stem.split("_")[1], key=key, dated=True)
    recording_id, info_key = read_info(path)
    return Recording(path=path, recording_id=recording_id or path.name, key=info_key, dated=False)


def real_recordings(zip_paths: Iterable[Path | str]) -> list[Recording]:
    """Every zip at or over the stub floor, in file-name order."""
    return [read_recording(p) for p in sorted(str(p) for p in zip_paths) if is_session_zip(p)]


def session_recordings(zip_paths: Iterable[Path | str], key: str) -> list[Recording]:
    """The real recordings that belong to session ``key``, dated or not."""
    return [r for r in real_recordings(zip_paths) if r.key == key]


def stray_recordings(recordings: Iterable[Recording]) -> list[Recording]:
    """The undated recordings that are not the recording `pick_recording` chooses for their
    session (a dated name of the same recording counts as it)."""
    recordings = list(recordings)
    by_key: dict[str, list[Recording]] = {}
    for rec in recordings:
        by_key.setdefault(rec.key, []).append(rec)
    strays: list[Recording] = []
    for recs in by_key.values():
        picked = pick_recording(recs)
        strays += [
            r
            for r in recs
            if not r.dated and (picked is None or r.recording_id != picked.recording_id)
        ]
    return strays


def pick_recording(recordings: Iterable[Recording]) -> Recording | None:
    """The recording a session uses when nothing names one: the first dated name in name
    order, else the first undated one. ``new_sessions`` and an untagged ``session_tracks``
    both use it."""
    ordered = sorted(recordings, key=lambda r: (not r.dated, r.path.name))
    return ordered[0] if ordered else None


def new_sessions(zip_paths: Iterable[Path | str], existing_keys: set[str]) -> dict[str, str]:
    """Map of new session/date key → zip path for zips not yet partitioned.

    A dated name carries its key; an undated one takes the UTC date of its ``info.txt``
    ``Start time:``. A stub under MIN_ZIP_BYTES is skipped, as is an undated zip with no
    readable start date (the sensor logs it). When two recordings map to one key,
    `pick_recording` chooses, and the ``single_recording`` or ``no_undated_recording``
    check blocks the session.
    """
    by_key: dict[str, list[Recording]] = {}
    for rec in real_recordings(zip_paths):
        if rec.key and rec.key not in existing_keys:
            by_key.setdefault(rec.key, []).append(rec)
    out: dict[str, str] = {}
    for key, recs in sorted(by_key.items()):
        picked = pick_recording(recs)
        if picked is not None:
            out[key] = str(picked.path)
    return out


def undatable_recordings(recordings: Iterable[Recording]) -> list[Recording]:
    """The undated recordings with no readable ``info.txt`` start date: no session can
    claim them."""
    return [r for r in recordings if not r.dated and not r.key]


def extra_recordings(recordings: Iterable[Recording], in_use: Recording) -> list[Recording]:
    """The recordings of ``in_use``'s session that are a different recording (another
    recording id), so the session's transcript leaves them out."""
    return [r for r in recordings if r.key == in_use.key and r.recording_id != in_use.recording_id]
