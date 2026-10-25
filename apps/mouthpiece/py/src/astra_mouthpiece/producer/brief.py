"""The producer's output: the ``ProducerBrief`` schema, the post-run citation
check, and the markdown block Pass A reads.

The agent SUBMITs a dict; dspy validates it against ``ProducerBrief`` inside the loop and
feeds a ``[Type Error]`` back on failure. ``check_citations`` then drops or repairs every
citation that does not resolve (never fatal), so a hallucinated reference never reaches
Pass A. Line ids are kept for inspection but never rendered (Pass A sees the transcript
without ids).
"""

from __future__ import annotations

from collections.abc import Iterable

from pydantic import BaseModel, Field


class Moment(BaseModel):
    title: str = Field(description="A short name for the moment.")
    line_ids: list[int] = Field(description="Line ids in the transcript input where it happens.")
    anchor: str = Field(description="A quote or paraphrase of <= 20 words that locates it.")
    why_it_matters: str = Field(description="Why this moment is worth talking about.")
    feel: str = Field(description="How it felt at the table: the emotional read.")


class LoreNote(BaseModel):
    name: str = Field(description="The proper noun.")
    note: str = Field(description="1-3 sentences, only what the wiki says.")
    page: str | None = Field(description="The wiki page path it came from; null if none.")


class Callback(BaseModel):
    date: str = Field(description="The earlier session date (from list_episodes).")
    note: str = Field(description="What from that session connects to tonight.")


class ProducerBrief(BaseModel):
    moments: list[Moment] = Field(min_length=1, max_length=12)
    lore: list[LoreNote] = Field(default_factory=list)
    callbacks: list[Callback] = Field(default_factory=list)
    open_threads: list[str] = Field(default_factory=list)
    newcomer_questions: list[str] = Field(default_factory=list)


class CitationReport(BaseModel):
    """What ``check_citations`` changed. ``drop_rate`` = bad citations / all citations."""

    total: int
    bad: int
    warnings: list[str]

    @property
    def drop_rate(self) -> float:
        return self.bad / self.total if self.total else 0.0


def check_citations(
    brief: ProducerBrief,
    *,
    line_ids: Iterable[int],
    pages: Iterable[str],
    dates: Iterable[str],
) -> tuple[ProducerBrief, CitationReport]:
    """Repair ``brief`` against the real transcript line ids, wiki pages and permitted dates.

    Bad line ids are removed (the moment keeps its anchor); an unknown page becomes
    ``None``; a callback to an unavailable date is dropped. Returns the repaired copy and a
    report of every change.
    """
    ids, page_set, date_set = set(line_ids), set(pages), set(dates)
    warnings: list[str] = []
    total = bad = 0

    moments = []
    for m in brief.moments:
        good = [i for i in m.line_ids if i in ids]
        total += len(m.line_ids)
        missing = [i for i in m.line_ids if i not in ids]
        if missing:
            bad += len(missing)
            warnings.append(f"moment {m.title!r}: dropped unknown line ids {missing}")
        moments.append(m.model_copy(update={"line_ids": good}))

    lore = []
    for note in brief.lore:
        if note.page is not None:
            total += 1
            if note.page not in page_set:
                bad += 1
                warnings.append(f"lore {note.name!r}: unknown page {note.page!r} cleared")
                lore.append(note.model_copy(update={"page": None}))
                continue
        lore.append(note)

    callbacks = []
    for cb in brief.callbacks:
        total += 1
        if cb.date not in date_set:
            bad += 1
            warnings.append(f"callback {cb.date!r} dropped: not an earlier session of this show")
            continue
        callbacks.append(cb)

    repaired = brief.model_copy(update={"moments": moments, "lore": lore, "callbacks": callbacks})
    return repaired, CitationReport(total=total, bad=bad, warnings=warnings)


BRIEF_HEADING = (
    "PRODUCER NOTES (for grounding and callbacks — do not read these out; do not reveal "
    "undiscovered plot):"
)


def newcomer_rule(newcomer: str) -> str:
    """The seat guard (0034 experiment finding): with the notes in view, the newcomer stopped
    asking and recited lore. She has not read them."""
    return (
        f"Only the two regular hosts have read these notes. {newcomer} has NOT: she knows only "
        "the last couple of episodes, so she still asks about anything older or unexplained, "
        "and the others answer her from these notes. Never have her recite lore from them."
    )


def render_brief(brief: ProducerBrief, *, newcomer: str = "The newcomer") -> str:
    """The Pass A block: sections in schema order, line ids omitted, empty sections skipped.
    ``newcomer`` is the newcomer host's name (``hosts.c``), used in the seat guard."""
    parts = [BRIEF_HEADING, newcomer_rule(newcomer)]
    parts.append(
        "\nMoments worth talking about:\n"
        + "\n".join(
            f'- {m.title} (around: "{m.anchor}") — {m.why_it_matters} Feel: {m.feel}'
            for m in brief.moments
        )
    )
    if brief.lore:
        parts.append(
            "\nLore (from the wiki):\n"
            + "\n".join(
                f"- {n.name}: {n.note}" + ("" if n.page else " (no wiki page)") for n in brief.lore
            )
        )
    if brief.callbacks:
        parts.append(
            "\nCallbacks to earlier episodes:\n"
            + "\n".join(f"- {cb.date}: {cb.note}" for cb in brief.callbacks)
        )
    if brief.open_threads:
        parts.append(
            "\nOpen threads to speculate about:\n" + "\n".join(f"- {t}" for t in brief.open_threads)
        )
    if brief.newcomer_questions:
        parts.append(
            f"\nQuestions {newcomer} should ask on air (she asks; the others answer):\n"
            + "\n".join(f"- {q}" for q in brief.newcomer_questions)
        )
    return "\n".join(parts)
