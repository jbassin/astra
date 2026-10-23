"""Craig zip ingest — integrity gate, extract, roster filter.

A Craig drop is a `.zip` named `<guild>_<channel>_<date>_<id>` holding per-speaker
`.aac` tracks named `<idx>-<discordid>`. Ingest verifies the archive (`unzip -t`,
FUSE-safe), extracts it, and keeps only tracks whose user-id is a known player
(the roster, from ontology-being).
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from zipfile import ZipFile

from .naming import session_date
from .roster import Roster


def session_id(zip_path: Path | str) -> str:
    """The session/date partition key for a Craig zip (its stem's date field)."""
    return session_date(Path(zip_path).stem)


def verify_zip(zip_path: Path | str) -> None:
    """Integrity gate — `unzip -t`; raises if the archive is incomplete/corrupt."""
    subprocess.run(
        ["unzip", "-t", str(zip_path)],
        capture_output=True,
        text=True,
        check=True,
    )


def extract_tracks(zip_path: Path | str, dest: Path | str) -> list[Path]:
    """Extract the archive; return its `.aac` track files, sorted."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    with ZipFile(zip_path, "r") as archive:
        archive.extractall(dest)
    return sorted(dest.rglob("*.aac"))


def player_tracks(tracks: list[Path], roster: Roster) -> list[Path]:
    """Keep only tracks whose parsed user-id is a known player (drop bots/guests)."""
    return [t for t in tracks if roster.is_player(t.stem)]
