"""astra_sessions.tools: the shared RLM tool bodies — hermetic."""

from __future__ import annotations

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from astra_sessions.tools import MAX_RESULTS, TRANSCRIPT_LINE, SessionToolsMixin

TOOLS = SessionToolsMixin()


def test_transcript_line_splits_at_the_first_colon() -> None:
    m = TRANSCRIPT_LINE.match("000012\tGamemaster: Roll: initiative")
    assert m is not None
    assert m.groups() == ("000012", "Gamemaster", "Roll: initiative")
    m = TRANSCRIPT_LINE.match("000013\t: no speaker")
    assert m is not None and m.groups() == ("000013", "", "no speaker")
    assert TRANSCRIPT_LINE.match("no tab: here") is None


def test_search_pages_is_case_insensitive_and_lazy() -> None:
    read: list[str] = []

    def pages() -> Iterator[tuple[str, str]]:
        for i in range(MAX_RESULTS + 5):
            read.append(f"P{i}")
            yield f"P{i}", "intro\nThe Auger hunts"

    hits = TOOLS._search_pages(pages(), "auger", False)
    assert len(hits) == MAX_RESULTS
    assert hits[0] == {"path": "P0", "line": 2, "text": "The Auger hunts"}
    assert len(read) == MAX_RESULTS  # stopped at the cap, never read the rest


def test_search_pages_regex_and_errors() -> None:
    assert TOOLS._search_pages([("A", "x1\ny22")], r"\d{2}", True) == [
        {"path": "A", "line": 2, "text": "y22"}
    ]
    with pytest.raises(ValueError):
        TOOLS._search_pages([], "", False)
    with pytest.raises(ValueError):
        TOOLS._search_pages([], "(", True)


def test_search_transcripts_matches_spoken_text_only() -> None:
    texts = {
        "2025-8-28": "000001\tBenny: the Auger  \n000002\tAuger: hello\njunk Auger\n",
        "2025-10-20": "000007\t Gamemaster :\tan auger\n",
    }
    hits = TOOLS._search_transcripts(["2025-8-28", "2025-10-20"], texts.__getitem__, "auger", False)
    assert hits == [
        {"date": "2025-8-28", "line": 1, "speaker": "Benny", "text": "the Auger"},
        {"date": "2025-10-20", "line": 7, "speaker": "Gamemaster", "text": "an auger"},
    ]


def _resolution(page: str | None) -> Any:
    entity = SimpleNamespace(canonical="Galzu", kind="npc", page=page)
    return SimpleNamespace(
        status="resolved",
        entity=entity,
        confidence=0.91234,
        candidates=[(SimpleNamespace(canonical=f"C{i}"), 0.5) for i in range(7)],
    )


def test_resolve_name_shape_and_page_check() -> None:
    asked: list[str] = []

    def exists(page: str) -> bool:
        asked.append(page)
        return True

    out = TOOLS._resolve_name("galzoo", lambda _n: _resolution("People/Galzu"), exists)
    assert out == {
        "status": "resolved",
        "canonical": "Galzu",
        "kind": "npc",
        "page": "People/Galzu",
        "page_exists": True,
        "confidence": 0.912,
        "candidates": ["C0", "C1", "C2", "C3", "C4"],
    }
    assert asked == ["People/Galzu"]
    # No page: page_exists is False and the check is never asked.
    out = TOOLS._resolve_name("galzoo", lambda _n: _resolution(None), exists)
    assert out["page"] == "" and out["page_exists"] is False and asked == ["People/Galzu"]


def test_resolve_name_unknown_and_empty() -> None:
    unknown: Any = SimpleNamespace(status="unknown", entity=None, confidence=0, candidates=[])
    out = TOOLS._resolve_name("zzz", lambda _n: unknown, lambda _p: True)
    assert out["canonical"] == "" and out["kind"] == "" and out["page_exists"] is False
    with pytest.raises(ValueError):
        TOOLS._resolve_name("  ", lambda _n: unknown, lambda _p: True)
