"""Phase-3 S1 — page-type detection (spec §8, ported from faerrin ``page-type.ts``).

Unit-level coverage for the module's surviving surface after the 0020 facts-only rework
retired the tell-lint machinery it used to gate (``lint.py`` → ``page_type.py``); the real-corpus
fixture case (``detect_page_type`` over actual akasha pages) stays in ``test_proposer_group.py``
alongside the non-prose skip it feeds.
"""

from __future__ import annotations

from astra_heartwood.proposer.page_type import (
    NON_PROSE_TYPES,
    PROSE_PAGE_TYPES,
    detect_page_type,
)


def test_non_prose_and_prose_types_partition_cleanly() -> None:
    assert {"deity-statblock", "timeline", "flavor-pre"} == NON_PROSE_TYPES
    assert {"lore", "stub"} == PROSE_PAGE_TYPES
    assert not (NON_PROSE_TYPES & PROSE_PAGE_TYPES)


def test_timeline_markers() -> None:
    assert detect_page_type("@timeline\nsome entry") == "timeline"
    assert detect_page_type(":::timeline\nsome entry") == "timeline"
    # the lone Timeline page classifies by path even when its body wouldn't:
    assert detect_page_type("Short.", path="Timeline") == "timeline"


def test_flavor_pre_marker() -> None:
    assert detect_page_type("<pre>\nsome ascii art\n</pre>") == "flavor-pre"


def test_deity_statblock_markers() -> None:
    assert detect_page_type("@deity\nEdicts :: fight well") == "deity-statblock"
    assert detect_page_type(":::deity\nEdicts :: fight well") == "deity-statblock"
    # two " :: " lines is a deity-statblock even without an explicit marker:
    assert detect_page_type("Edicts :: fight well\nAnathema :: flee") == "deity-statblock"


def test_stub_on_empty_or_short_body() -> None:
    assert detect_page_type("---\nx: 1\n---\n") == "stub"  # empty after frontmatter
    assert detect_page_type("Short.") == "stub"  # < 40 chars


def test_lore_on_long_prose_body() -> None:
    assert detect_page_type("A" * 80) == "lore"


def test_structural_markers_win_over_length() -> None:
    # a one-liner @timeline entry is still "timeline", not "stub" (order matters, §8).
    assert detect_page_type("@timeline x") == "timeline"
