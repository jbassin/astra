"""The roundtable's evidence file: the ``Dossier`` schema and the markdown block Pass A reads.

The agent SUBMITs a dict; dspy validates it against ``Dossier`` inside the loop. Clues
anchor each mystery in what happened at the table; hypotheses start from them and may go
past them (a prediction episode needs speculation), so nothing here is gated on evidence.

Beyond the clues and theories, the file gives the writer material to think with: each
mystery's ``background`` (what is established, so the hosts can explain it), its
``connections`` to other mysteries, and the dossier-wide ``setting`` notes (cosmology,
powers and the earlier Astra campaigns) that several theories lean on. Those fields default
to empty, so a dossier written before them still loads.
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


class Connection(BaseModel):
    to: int = Field(description="The 1-based number of the other mystery in this dossier.")
    how: str = Field(description="One or two sentences: what ties the two together.")


class Mystery(BaseModel):
    question: str = Field(description="The open question, as the players would ask it.")
    why_it_matters: str = Field(description="Why it matters to the party or the big story.")
    background: str = Field(
        default="",
        description=(
            "3 to 6 sentences of what is established: who and what is involved, what the party "
            "has seen and been told, and the world context a listener needs. Facts, not theory."
        ),
    )
    clues: list[Clue] = Field(min_length=2)
    hypotheses: list[Hypothesis] = Field(min_length=1, max_length=6)
    connections: list[Connection] = Field(default_factory=list)


class SettingNote(BaseModel):
    topic: str = Field(description="A short name, e.g. 'The Thessians' or 'Configuration Space'.")
    pages: list[str] = Field(default_factory=list, description="Wiki page paths it draws on.")
    note: str = Field(
        description=(
            "2 to 5 sentences: what the wiki establishes about it and which mysteries it bears on."
        )
    )


class Dossier(BaseModel):
    setting: list[SettingNote] = Field(default_factory=list, max_length=15)
    mysteries: list[Mystery] = Field(min_length=3, max_length=18)


def render_dossier(dossier: Dossier, *, episode_label: Callable[[str], str]) -> str:
    """The Pass A evidence block. ``episode_label(date)`` names a session the way the hosts
    would (season + episode title)."""
    parts: list[str] = []
    if dossier.setting:
        lines = ["THE WIDER SETTING (background several theories lean on):"]
        for note in dossier.setting:
            src = f" (wiki: {', '.join(note.pages)})" if note.pages else ""
            lines.append(f"- {note.topic}{src}: {note.note}")
        parts.append("\n".join(lines))
    for n, m in enumerate(dossier.mysteries, start=1):
        lines = [f"MYSTERY {n}: {m.question}", f"Why it matters: {m.why_it_matters}"]
        if m.background:
            lines.append(f"What we know: {m.background}")
        lines.append("Clues:")
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
        if m.connections:
            lines.append("Connects to:")
            lines += [f"- Mystery {c.to}: {c.how}" for c in m.connections]
        parts.append("\n".join(lines))
    return "\n\n".join(parts)
