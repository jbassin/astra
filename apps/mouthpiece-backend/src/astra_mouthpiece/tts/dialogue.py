"""Dialogue chunking — ported verbatim from caster `tts/dialogue.ts`.

ElevenLabs Text-to-Dialogue caps chars/request per model (~2,000 on v3, 10,000 on
v4), so a full episode is split into chunks. The provider's `dialogue_budget` sets the
size; the default here is the conservative v3 budget.
"""

from __future__ import annotations

from collections.abc import Callable

from ..models import ScriptTurn

DEFAULT_DIALOGUE_BUDGET = 1800


def chunk_turns(
    turns: list[ScriptTurn],
    budget: int = DEFAULT_DIALOGUE_BUDGET,
    length_of: Callable[[ScriptTurn], int] | None = None,
) -> list[list[ScriptTurn]]:
    """Group consecutive turns into chunks under `budget` chars, preserving order.
    A single over-budget turn becomes its own chunk (turns are never split)."""
    measure = length_of if length_of is not None else (lambda t: len(t.text))
    chunks: list[list[ScriptTurn]] = []
    current: list[ScriptTurn] = []
    used = 0
    for turn in turns:
        length = measure(turn)
        if current and used + length > budget:
            chunks.append(current)
            current = []
            used = 0
        current.append(turn)
        used += length
    if current:
        chunks.append(current)
    return chunks
