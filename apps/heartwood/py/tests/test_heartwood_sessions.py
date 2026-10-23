"""The faerrin-world session filter + transcript access (0033 D33-6).

Reads the committed transcripts + being.kdl: faerrin sessions are kept and resolve to a
faerrin campaign slug; non-faerrin worlds (sedecium `observatory-slipped`, finnegan's-ring
`fey-in-the-mists`) and the mislabeled EXCLUDED_DATES session (2025-8-11) are dropped.
Absolute counts are NOT asserted (committed transcripts grow as sessions land).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_heartwood.agent.sessions import (
    faerrin_session,
    ingestible_dates,
    read_transcript,
    transcript_path,
)
from astra_linguist.chronicle import date_key
from astra_ontology import faerrin_campaign_slugs, load_being
from astra_ontology_being import BEING_KDL_PATH

KEPT = {
    "2026-6-8": "through-a-song-darkly",
    "2025-6-9": "a-hunt-of-metal-and-vine",
    "2026-2-10": "interred-in-iomenei",
}
WORLD_DROP = ["2026-4-6", "2026-4-27", "2026-4-20"]
EXCLUDED = "2025-8-11"


def test_faerrin_sessions_kept_with_slug() -> None:
    for date, slug in KEPT.items():
        assert faerrin_session(date) == slug


def test_non_faerrin_worlds_and_excluded_dropped() -> None:
    for date in [*WORLD_DROP, EXCLUDED, "1999-1-1"]:
        assert faerrin_session(date) is None


def test_ingestible_dates_are_faerrin_and_chronological() -> None:
    being = load_being(BEING_KDL_PATH)
    faerrin = faerrin_campaign_slugs(being)
    dates = ingestible_dates(being=being)
    assert set(KEPT) <= set(dates)
    assert not (set(WORLD_DROP) | {EXCLUDED}) & set(dates)
    assert all(faerrin_session(d, being=being) in faerrin for d in dates)
    # date_key order, not string order (a string sort puts 2025-10-20 first)
    assert dates == sorted(dates, key=date_key)
    assert dates.index("2025-8-28") < dates.index("2025-10-20")


def test_transcript_path_and_read(tmp_path: Path) -> None:
    (tmp_path / "000.some-show.2025-8-28.txt").write_text("000001\tAda: hello\n", encoding="utf-8")
    assert (
        transcript_path("2025-8-28", transcript_dir=tmp_path).name == "000.some-show.2025-8-28.txt"
    )
    assert read_transcript("2025-8-28", transcript_dir=tmp_path) == "000001\tAda: hello\n"


def test_missing_transcript_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        transcript_path("2025-8-28", transcript_dir=tmp_path)
    # the suffix match is exact: 2025-8-2 must not match 2025-8-28
    (tmp_path / "000.some-show.2025-8-28.txt").write_text("x", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        transcript_path("2025-8-2", transcript_dir=tmp_path)
