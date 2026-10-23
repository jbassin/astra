"""Time-merge — `SoundStack`, ported verbatim from faerrin `wretch/python`.

Per-user segment arrays → one stream ordered by globally-earliest `start`
(pop-from-front), each emitted segment tagged with its `user`. Pure; the parity
test asserts it reproduces faerrin's ordering on a real `script.json` sample.
"""

from __future__ import annotations

from typing import Any

_SENTINEL_START = 9_999_999_999


class SoundStack:
    """Accumulates per-user segment lists, then drains them in global time order."""

    def __init__(self) -> None:
        self.sounds: dict[str, list[list[dict[str, Any]]]] = {}

    def add(self, user: str, segments: list[dict[str, Any]]) -> None:
        self.sounds.setdefault(user, []).append(segments)

    def next(self) -> dict[str, Any] | None:
        lowest_user = ""
        lowest_idx = -1
        lowest_start = _SENTINEL_START

        for user, stacks in self.sounds.items():
            for idx, segments in enumerate(stacks):
                if not segments:
                    continue
                start = segments[0].get("start", _SENTINEL_START)
                if start < lowest_start:
                    lowest_user, lowest_idx, lowest_start = user, idx, start

        if lowest_user == "":
            return None

        result = self.sounds[lowest_user][lowest_idx].pop(0)
        result["user"] = lowest_user
        return result

    def drain(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        while (segment := self.next()) is not None:
            out.append(segment)
        return out
