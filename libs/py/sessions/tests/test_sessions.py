"""astra_sessions: date keys, recording and transcript names, atomic writes — hermetic.

The names below are copied from real files under the data root (Craig zips, linguist
transcripts, mouthpiece episode dirs), so a change that would re-key a Dagster partition
or rename an output fails here.
"""

from __future__ import annotations

from datetime import date as Date
from pathlib import Path

import pytest
from astra_sessions import (
    TranscriptName,
    atomic_write_text,
    date_key,
    date_sort_key,
    find_transcript,
    format_date,
    iso_date,
    parse_transcript_name,
    recording_date,
    recording_key,
    temp_sibling,
    to_date,
    track_index,
    track_user,
    transcript_dates,
)


# ── dates ──────────────────────────────────────────────────────────────────
def test_date_key_orders_non_zero_padded_dates() -> None:
    dates = ["2025-10-20", "2025-8-11", "2025-8-28", "2026-1-6"]
    assert sorted(dates, key=date_key) == ["2025-8-11", "2025-8-28", "2025-10-20", "2026-1-6"]
    assert date_key("2026-10-5") == (2026, 10, 5)


@pytest.mark.parametrize("bad", ["", "2025-8", "2025-8-28-1", "txt", "2026-6-8-recap-of-2026-5-7"])
def test_date_key_rejects_malformed_keys(bad: str) -> None:
    with pytest.raises(ValueError):
        date_key(bad)


def test_date_sort_key_is_lenient() -> None:
    assert date_sort_key("2026-5-7") < date_sort_key("2026-5-11")
    assert date_sort_key("2025-8-28") == 20250828
    # A recap id's leading date wins; missing and non-digit parts count as 0.
    assert date_sort_key("2026-10-12-recap-of-2026-8-24") == 20261012
    assert date_sort_key("2026-5") == 20260500
    assert date_sort_key("2026-x-3") == 20260003
    assert date_sort_key("") == 0


def test_iso_date_zero_pads() -> None:
    assert iso_date("2025-8-28") == "2025-08-28T00:00:00-04:00"
    assert iso_date("2026-1-5") == "2026-01-05T00:00:00-04:00"
    assert iso_date("2025-8-28") < iso_date("2025-10-20")


def test_to_date_and_format_date_round_trip() -> None:
    assert to_date("2026-1-5") == Date(2026, 1, 5)
    assert format_date(Date(2026, 1, 5)) == "2026-1-5"
    assert format_date(to_date("2025-12-31")) == "2025-12-31"
    with pytest.raises(ValueError):
        to_date("2026-2-30")


# ── recordings ─────────────────────────────────────────────────────────────
def test_track_names() -> None:
    assert track_user("1-miked6187") == "miked6187"
    assert track_index("1-miked6187") == "0"
    assert track_user("5-tanner_kn") == "tanner"
    assert track_index("5-tanner_kn") == "kn"
    assert track_user("not-a-track-stem") == ""  # 3 dash-fields → not a track
    assert track_index("not-a-track-stem") == ""


def test_recording_date_and_key() -> None:
    assert recording_date("guild_channel_2025-4-17_abc") == "2025-4-17"
    assert recording_date("malformed") == ""
    assert recording_key("/in/craig_44d2A3G4oZ6r_2026-8-10_23-31-14.aac.zip") == "2026-8-10"
    assert recording_key(Path("craig_CiVawTcyASz4_2026-10-12_23-40-39.aac.zip")) == "2026-10-12"
    assert recording_key("craig_with_extra_field_2026-1-1_1-2-3.aac.zip") == ""


# ── transcripts ────────────────────────────────────────────────────────────
def test_parse_transcript_name() -> None:
    name = parse_transcript_name("000.through-a-song-darkly.2025-10-20.txt")
    assert name == TranscriptName(stem="000.through-a-song-darkly", date="2025-10-20")
    assert name.session_id == "000.through-a-song-darkly.2025-10-20"
    assert name.slug == "through-a-song-darkly"
    assert parse_transcript_name(Path("/t/slug-only.2026-1-6.txt")).slug == "slug-only"


@pytest.mark.parametrize("bad", ["notes.txt", "000.slug.2025-10-20.json", "000.slug.txt"])
def test_parse_transcript_name_rejects_other_files(bad: str) -> None:
    with pytest.raises(ValueError, match="not a linguist transcript filename"):
        parse_transcript_name(bad)


def test_transcript_dates_and_find(tmp_path: Path) -> None:
    for name in (
        "000.through-a-song-darkly.2025-10-20.txt",
        "001.the-blue-remains.2025-8-11.txt",
        "README.txt",
        "000.through-a-song-darkly.2025-10-20.json",
    ):
        (tmp_path / name).write_text("x", encoding="utf-8")
    assert transcript_dates(tmp_path) == {"2025-10-20", "2025-8-11"}
    found = find_transcript("2025-8-11", tmp_path)
    assert found == tmp_path / "001.the-blue-remains.2025-8-11.txt"
    assert find_transcript("2025-8-1", tmp_path) is None


# ── atomic writes ──────────────────────────────────────────────────────────
def test_temp_sibling_appends_tmp() -> None:
    assert temp_sibling(Path("/e/2026-10-5/script.json")) == Path("/e/2026-10-5/script.json.tmp")
    assert temp_sibling(Path("/e/.last-rendered")) == Path("/e/.last-rendered.tmp")
    assert temp_sibling(Path("audio.mp3")) == Path("audio.mp3.tmp")


def test_atomic_write_text(tmp_path: Path) -> None:
    target = tmp_path / "2026-10-5.request.json"
    atomic_write_text(target, "first é")
    atomic_write_text(target, "second")
    assert target.read_text(encoding="utf-8") == "second"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["2026-10-5.request.json"]
