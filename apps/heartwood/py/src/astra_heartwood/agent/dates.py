"""Session-date helpers shared by the agent's write and publish steps (0033 D33-1, D33-5)."""

from __future__ import annotations


def iso_date(session_date: str) -> str:
    """A bare session date (``2025-8-28``) → a full ISO timestamp like the corpus uses."""
    y, m, d = (int(x) for x in session_date.split("-"))
    return f"{y:04d}-{m:02d}-{d:02d}T00:00:00-04:00"
