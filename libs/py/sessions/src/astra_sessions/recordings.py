"""Craig recording file names, ported faithfully from faerrin `file_data.py`.

A session zip stem is `<guild>_<channel>_<date>_<id>` (4 `_`-fields); the date is the 3rd
and becomes the session's partition key. Real drops look like
`craig_44d2A3G4oZ6r_2026-8-10_23-31-14.aac.zip`.

Player track stems are `<idx>-<discordid>` where the id may contain underscores; the LAST
`_`-segment is the index, everything before it is the user:
    "1-miked6187" -> user "miked6187", index "0"
    "5-tanner_kn" -> user "tanner",    index "kn"
Kept identical so per-user output names match the historical pipeline.
"""

from __future__ import annotations

from pathlib import Path


def track_user(stem: str) -> str:
    """The recording user-id from a track stem (`""` if not a `<idx>-<id>` stem)."""
    halves = stem.split("-")
    if len(halves) != 2:
        return ""
    parts = halves[1].split("_")
    if len(parts) == 1:
        return parts[0]
    return "_".join(parts[:-1])


def track_index(stem: str) -> str:
    """The track index from a track stem (`"0"` when there's no `_`-suffix)."""
    halves = stem.split("-")
    if len(halves) != 2:
        return ""
    parts = halves[1].split("_")
    return "0" if len(parts) == 1 else parts[-1]


def recording_date(zip_stem: str) -> str:
    """The session date from a 4-field `<guild>_<channel>_<date>_<id>` zip stem (`""` if
    the stem has another shape)."""
    fields = zip_stem.split("_")
    return fields[2] if len(fields) == 4 else ""


def recording_key(zip_path: Path | str) -> str:
    """The session partition key for a Craig zip: its stem's date field (`""` if none)."""
    return recording_date(Path(zip_path).stem)
