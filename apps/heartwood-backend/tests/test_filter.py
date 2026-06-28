"""Stage-1 filter pass (Phase-2 spec §6, S2) — exercised with a stub client (no network).

Covers: window segmentation; keep/drop assembly into kept-context + dropped-span audit;
keep-when-in-doubt on a missing verdict; and the drop/in_world contradiction guard.
"""

from __future__ import annotations

from typing import Literal, TypeVar

from astra_heartwood.filter import (
    WindowVerdict,
    _FilterVerdicts,
    filter_session,
    segment,
)
from astra_linguist.models import FormattedLine, Speaker, Transcript
from pydantic import BaseModel

_M = TypeVar("_M", bound=BaseModel)

_Decision = Literal["keep", "drop"]
_Category = Literal["in_world", "ooc", "combat", "play_by_play"]


def _line(name: str, text: str, i: int) -> FormattedLine:
    speaker = Speaker(name=name, color="--x")
    return FormattedLine(start="00:00:00", second=float(i), text=text, user=speaker, duration=1.0)


def _transcript(turns: list[tuple[str, str]]) -> Transcript:
    script = [_line(n, t, i) for i, (n, t) in enumerate(turns)]
    return Transcript(date="2099-1-1", audio="/audio/2099-1-1.mp3", script=script)


def _v(window_id: int, decision: _Decision, category: _Category) -> WindowVerdict:
    return WindowVerdict(window_id=window_id, decision=decision, category=category, reason="r")


class _Stub:
    """A stub structured client returning a canned set of window verdicts."""

    def __init__(self, verdicts: list[WindowVerdict]) -> None:
        self._payload = _FilterVerdicts(verdicts=verdicts).model_dump()
        self.calls = 0
        self.last_user_content = ""

    def call_structured(  # noqa: PLR0913
        self,
        output_model: type[_M],
        *,
        system: str,
        user_content: str,
        model: str,
        max_tokens: int = 0,
        tool_name: str = "record",
        tool_description: str = "record",
    ) -> _M:
        self.calls += 1
        self.last_user_content = user_content
        return output_model.model_validate(self._payload)


def test_segment_windows() -> None:
    t = _transcript([("A", "1"), ("B", "2"), ("A", "3"), ("B", "4"), ("A", "5")])
    windows = segment(t, size=2)
    assert [w.window_id for w in windows] == [1, 2, 3]
    assert [len(w.lines) for w in windows] == [2, 2, 1]


def test_filter_keeps_and_drops() -> None:
    t = _transcript(
        [
            ("A", "lore"),
            ("B", "more lore"),
            ("A", "snack break"),
            ("B", "brb"),
            ("A", "I hit it"),
            ("B", "miss"),
        ]
    )
    stub = _Stub([_v(1, "keep", "in_world"), _v(2, "drop", "ooc"), _v(3, "drop", "combat")])
    result = filter_session(t, client=stub, model="stub", window_turns=2)
    assert stub.calls == 1
    assert result.windows_total == 3
    assert result.windows_kept == 1
    assert result.windows_dropped == 2
    assert result.kept_text == "A: lore\nB: more lore"
    assert [d.category for d in result.dropped] == ["ooc", "combat"]
    assert all(d.sample for d in result.dropped)  # audit samples present


def test_missing_verdict_is_kept() -> None:
    t = _transcript([("A", "x"), ("B", "y"), ("A", "z"), ("B", "w"), ("A", "v"), ("B", "u")])
    # only W1 classified (drop); W2, W3 have no verdict → keep-when-in-doubt
    stub = _Stub([_v(1, "drop", "ooc")])
    result = filter_session(t, client=stub, model="stub", window_turns=2)
    assert result.windows_dropped == 1
    assert result.windows_kept == 2
    assert "z" in result.kept_text
    assert "v" in result.kept_text


def test_drop_in_world_contradiction_is_kept() -> None:
    t = _transcript([("A", "a place exists"), ("B", "it is cold")])
    stub = _Stub([_v(1, "drop", "in_world")])  # contradictory → must keep, not drop
    result = filter_session(t, client=stub, model="stub", window_turns=2)
    assert result.dropped == []
    assert result.windows_kept == 1
