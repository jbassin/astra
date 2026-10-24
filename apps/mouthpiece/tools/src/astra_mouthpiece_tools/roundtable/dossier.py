"""The roundtable's evidence file: the ``Dossier`` schema and the markdown block Pass A reads.

The agent SUBMITs a dict; dspy validates it against ``Dossier`` inside the loop. Clues
anchor each mystery in what happened at the table; hypotheses start from them and may go
past them (a prediction episode needs speculation), so nothing here is gated on evidence.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["long shot", "plausible", "strong"]


class Clue(BaseModel):
    id: str = Field(description="Unique within its mystery, e.g. 'c1'.")
    date: str | None = Field(
        default=None, description="Session date of a transcript clue (from list_episodes)."
    )
    line: int | None = Field(default=None, description="Transcript line number of the quote.")
    page: str | None = Field(default=None, description="Wiki page path of a wiki clue.")
    quote: str = Field(description="Words copied from the source, 5-40 words.")
    shows: str = Field(description="One sentence: what this clue suggests.")


class Hypothesis(BaseModel):
    claim: str = Field(description="The prediction, stated plainly.")
    supported_by: list[str] = Field(description="Clue ids it starts from.")
    complicated_by: list[str] = Field(
        default_factory=list, description="Clue ids that cut against it."
    )
    leap: str = Field(
        default="", description="The speculative step beyond the clues, if any, in one sentence."
    )
    confidence: Confidence
    would_confirm: str = Field(description="What in-world event would settle it.")


class Mystery(BaseModel):
    question: str = Field(description="The open question, as the players would ask it.")
    why_it_matters: str = Field(description="Why it matters to the party or the big story.")
    clues: list[Clue] = Field(min_length=2)
    hypotheses: list[Hypothesis] = Field(min_length=1, max_length=5)


class Dossier(BaseModel):
    mysteries: list[Mystery] = Field(min_length=3, max_length=16)


def render_dossier(dossier: Dossier, *, episode_label: Callable[[str], str]) -> str:
    """The Pass A evidence block. ``episode_label(date)`` names a session the way the hosts
    would (season + episode title)."""
    parts: list[str] = []
    for n, m in enumerate(dossier.mysteries, start=1):
        lines = [f"MYSTERY {n}: {m.question}", f"Why it matters: {m.why_it_matters}", "Clues:"]
        for c in m.clues:
            where = f"wiki page {c.page}" if c.page else episode_label(c.date or "")
            lines.append(f'- [{c.id}] {where}: "{c.quote}" — {c.shows}')
        lines.append("Theories:")
        for h in m.hypotheses:
            against = (
                f" Cuts against it: {', '.join(h.complicated_by)}." if h.complicated_by else ""
            )
            leap = f" The leap: {h.leap}" if h.leap else ""
            lines.append(
                f"- ({h.confidence}) {h.claim} Starts from: {', '.join(h.supported_by)}."
                f"{against}{leap} Would be settled by: {h.would_confirm}"
            )
        parts.append("\n".join(lines))
    return "\n\n".join(parts)
