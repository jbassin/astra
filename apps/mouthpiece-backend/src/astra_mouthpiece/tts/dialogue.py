"""Dialogue chunking — ported verbatim from caster `tts/dialogue.ts`.

ElevenLabs Text-to-Dialogue accepts ~2,000 chars/request, so a full episode is
split into chunks (budgeted below that for the request JSON + promoted tags).
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
