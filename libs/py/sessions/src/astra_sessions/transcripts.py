"""Canonical transcript file names: `<prefix>.<slug>.<date>.txt`.

linguist writes one per session (e.g. `000.through-a-song-darkly.2025-10-20.txt`) into the
transcript dir (config `data.linguist-transcripts`). The date segment is the session key;
the slug between the numeric prefix and the date is the campaign (the show).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

_NAME = re.compile(r"^(?P<stem>.+)\.(?P<date>\d{4}-\d{1,2}-\d{1,2})\.txt$")

#: One transcript line, `NNNNNN<TAB>Speaker: text`: line number, speaker (up to the first
#: ':'), spoken text (after one optional space or tab). The agents' search tools use this;
#: mouthpiece's `linguist_io` keeps its own stricter parser (non-empty speaker, space only),
#: which gives the same result on every real transcript line (checked 2026-10-24).
TRANSCRIPT_LINE = re.compile(r"^(\d+)\t([^:]*):[ \t]?(.*)$")


@dataclass(frozen=True)
class TranscriptName:
    """A parsed transcript file name: ``stem`` (`<prefix>.<slug>`) and ``date``."""

    stem: str
    date: str

    @property
    def session_id(self) -> str:
        """The file stem including the date (`000.through-a-song-darkly.2025-10-20`)."""
        return f"{self.stem}.{self.date}"

    @property
    def slug(self) -> str:
        """The campaign slug between the arc number and the date (the whole stem when it
        has no prefix)."""
        return self.stem.split(".", 1)[1] if "." in self.stem else self.stem


def parse_transcript_name(path: Path | str) -> TranscriptName:
    """Parse a transcript file name; raises ``ValueError`` if it is not
    `<stem>.<YYYY-M-D>.txt`."""
    name = Path(path).name
    m = _NAME.match(name)
    if m is None:
        raise ValueError(f"not a linguist transcript filename: {name}")
    return TranscriptName(stem=m.group("stem"), date=m.group("date"))


def transcript_dates(transcript_dir: Path) -> set[str]:
    """The session date of every transcript file in ``transcript_dir`` (other `.txt` files
    are ignored)."""
    dates: set[str] = set()
    for path in transcript_dir.glob("*.txt"):
        try:
            dates.add(parse_transcript_name(path).date)
        except ValueError:
            continue
    return dates


def find_transcript(date: str, transcript_dir: Path) -> Path | None:
    """The transcript file for session ``date`` (the first by name if several), or None."""
    matches = sorted(transcript_dir.glob(f"*.{date}.txt"))
    return matches[0] if matches else None
