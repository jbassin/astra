"""The linguist→mouthpiece input seam — read linguist's per-session outputs.

linguist writes a **canonical** line-numbered transcript (`<stem>.<date>.txt`,
`NNNNNN\\tSpeaker: text`) and a mouthpiece **context** per date partition. The
clean+enrich stage (0024) reads the canonical transcript.
Locating linguist's output dirs via the package keeps the contract explicit
without re-deriving paths; parsing is pure + unit-tested.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path

import astra_linguist
from astra_linguist.chronicle import load_episode_summary, show_for_date

# linguist's assets.py writes under its app root: APP_ROOT/{transcripts,script}.
_LINGUIST_ROOT = Path(astra_linguist.__file__).resolve().parents[2]
TRANSCRIPT_DIR = _LINGUIST_ROOT / "transcripts"
CONTEXT_DIR = _LINGUIST_ROOT / "script"

# "<stem>.<date>.txt", e.g. "000.through-a-song-darkly.2025-10-20.txt".
_FILENAME_RE = re.compile(r"^(?P<stem>.+)\.(?P<date>\d{4}-\d{1,2}-\d{1,2})\.txt$")
# "NNNNNN\tSpeaker: text" — speaker is up to the first ": ".
_LINE_RE = re.compile(r"^(?P<line>\d+)\t(?P<speaker>.+?): ?(?P<text>.*)$")


def parse_filename(path: Path | str) -> tuple[str, str, str]:
    """Return (session_id, arc, date) from a linguist transcript filename.

    session_id = the file stem incl. date (e.g. `000.through-a-song-darkly.2025-10-20`);
    arc = the slug between the arc number and the date.
    """
    name = Path(path).name
    m = _FILENAME_RE.match(name)
    if m is None:
        raise ValueError(f"not a linguist transcript filename: {name}")
    stem, date = m.group("stem"), m.group("date")
    session_id = f"{stem}.{date}"
    arc = stem.split(".", 1)[1] if "." in stem else stem
    return session_id, arc, date


def parse_canonical_transcript(text: str) -> list[tuple[int, str, str]]:
    """Parse a canonical transcript into `(line, speaker, text)` turns (pure)."""
    turns: list[tuple[int, str, str]] = []
    for line in text.splitlines():
        m = _LINE_RE.match(line)
        if m is None:
            continue
        turns.append((int(m.group("line")), m.group("speaker"), m.group("text").rstrip()))
    return turns


def transcript_for(date: str, transcript_dir: Path | str = TRANSCRIPT_DIR) -> Path | None:
    """The canonical transcript file whose `<date>` matches this partition (or None)."""
    root = Path(transcript_dir)
    if not root.is_dir():
        return None
    for path in sorted(root.glob("*.txt")):
        try:
            _, _, d = parse_filename(path)
        except ValueError:
            continue
        if d == date:
            return path
    return None


def new_sessions(
    existing: Iterable[str], transcript_dir: Path | str = TRANSCRIPT_DIR
) -> dict[str, str]:
    """date → transcript path, for each linguist transcript not yet partitioned."""
    root = Path(transcript_dir)
    if not root.is_dir():
        return {}
    seen = set(existing)
    found: dict[str, str] = {}
    for path in sorted(root.glob("*.txt")):
        try:
            _, _, date = parse_filename(path)
        except ValueError:
            continue
        if date not in seen and date not in found:
            found[date] = str(path)
    return found


def chronicle_gate_open(date: str) -> bool:
    """May this session run yet? (0021 Change B ordering gate.)

    `True` once chronicle has written this session's `episodes/<date>.json` (the hard
    gate) OR will never write one — `show_for_date(date) is None` carves out excluded
    (`EXCLUDED_DATES`) / unmatched sessions, which must proceed ungated or mouthpiece
    stalls on them forever. The caller only asks this for transcript-present sessions, so
    `None` here means excluded/unknown-slug, not "no transcript".
    """
    return load_episode_summary(date) is not None or show_for_date(date) is None
