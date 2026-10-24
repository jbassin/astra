"""Session date keys: the non-zero-padded ``YYYY-M-D`` string (``2025-8-28``).

A plain string sort is wrong for these (it puts ``2025-10-20`` before ``2025-8-28``), so
anything that orders sessions sorts on ``date_key`` (strict) or ``date_sort_key`` (lenient).
"""

from __future__ import annotations

from datetime import date as Date


def date_key(date: str) -> tuple[int, int, int]:
    """Sort key for the non-zero-padded `YYYY-M-D` session dates (string sort is wrong).

    Raises ``ValueError`` unless ``date`` is three ``-``-separated integers.
    """
    year, month, day = (int(part) for part in date.split("-"))
    return (year, month, day)


def date_sort_key(date: str) -> int:
    """Numeric key ``YYYYMMDD`` for a "YYYY-M-D" (unpadded) date that never raises: a
    missing or non-digit part counts as 0 (ported from the frontend's `dateSortKey`)."""
    parts = ([*date.split("-"), "0", "0", "0"])[:3]
    y, m, d = (int(p) if p.isdigit() else 0 for p in parts)
    return y * 10000 + m * 100 + d


def to_date(date: str) -> Date:
    """The calendar date of a session key (raises ``ValueError`` on a malformed key)."""
    return Date(*date_key(date))


def format_date(day: Date) -> str:
    """A calendar date as a session key: ``YYYY-M-D`` with no zero padding."""
    return f"{day.year}-{day.month}-{day.day}"


def iso_date(session_date: str) -> str:
    """A bare session date (``2025-8-28``) → a full ISO timestamp like the corpus uses."""
    y, m, d = (int(x) for x in session_date.split("-"))
    return f"{y:04d}-{m:02d}-{d:02d}T00:00:00-04:00"
