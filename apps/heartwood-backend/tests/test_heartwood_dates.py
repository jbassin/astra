"""``iso_date`` — bare session dates → the corpus's full ISO timestamps (0033 D33-5)."""

from __future__ import annotations

from astra_heartwood.agent.dates import iso_date


def test_iso_date_zero_pads() -> None:
    assert iso_date("2025-8-28") == "2025-08-28T00:00:00-04:00"
    assert iso_date("2026-1-5") == "2026-01-05T00:00:00-04:00"


def test_iso_date_sorts_chronologically() -> None:
    assert iso_date("2025-8-28") < iso_date("2025-10-20")
