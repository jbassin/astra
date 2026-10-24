"""The linguist→mouthpiece input seam — read linguist's per-session outputs.

linguist writes a **canonical** line-numbered transcript (`<stem>.<date>.txt`,
`NNNNNN\\tSpeaker: text`) and a mouthpiece **context** per date partition. The
clean+enrich stage (0024) reads the canonical transcript.
Both dirs come from config (`data.linguist-transcripts`, `linguist.script-path`);
parsing is pure + unit-tested.
"""

from __future__ import annotations

import re
from pathlib import Path

from astra_config import load_config
from astra_linguist.chronicle import TRANSCRIPT_DIR
from astra_sessions import parse_transcript_name

CONTEXT_DIR = Path(load_config().linguist.script_path)

# "NNNNNN\tSpeaker: text" — speaker is up to the first ": ".
_LINE_RE = re.compile(r"^(?P<line>\d+)\t(?P<speaker>.+?): ?(?P<text>.*)$")


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
            d = parse_transcript_name(path).date
        except ValueError:
            continue
        if d == date:
            return path
    return None
