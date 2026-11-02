"""The tier list's evidence file: the ``CastFile`` schema, its cross-checks, and the markdown
block Pass A reads.

A Claude Code subagent writes ``cast.json`` from ``brief.md`` (no in-repo LLM loop). Two
boards: ``villains``, ranked by how dangerous they are, and ``npcs``, ranked by how much the
hosts love them. One character may sit on both. The file holds evidence and the case each
way, never a ranking: the hosts decide the tiers on air.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Mapping

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from ..roundtable.dossier import SettingNote

QUOTE_WORDS = (5, 40)


class Moment(BaseModel):
    show: str = Field(description="The being.kdl campaign slug the moment comes from.")
    date: str | None = Field(
        default=None, description="Session date YYYY-M-D of a transcript moment."
    )
    line: int | None = Field(default=None, description="Transcript line number of the quote.")
    page: str | None = Field(default=None, description="Wiki page path of a wiki moment.")
    quote: str = Field(description="Words copied verbatim from the source, 5-40 words.")
    shows: str = Field(description="One sentence: what this moment shows about the character.")

    @field_validator("quote")
    @classmethod
    def _quote_length(cls, quote: str) -> str:
        lo, hi = QUOTE_WORDS
        if not lo <= len(quote.split()) <= hi:
            raise ValueError(f"a quote is {lo} to {hi} words")
        return quote

    @model_validator(mode="after")
    def _has_source(self) -> Moment:
        if self.date is None and self.page is None:
            raise ValueError("a moment needs a session `date` (with `line`) or a wiki `page`")
        return self


class CastEntry(BaseModel):
    name: str = Field(description="The character's name as the wiki spells it.")
    page: str | None = Field(default=None, description="Wiki page path, e.g. 'People/Galzu'.")
    campaigns: list[str] = Field(
        min_length=1, description="being.kdl campaign slugs the character is known from."
    )
    role: str = Field(description="One sentence: who they are in the story.")
    background: str = Field(
        description=(
            "3 to 6 sentences of established fact: what they did, what the party saw and was "
            "told, and the context a listener needs. Facts, not theory."
        )
    )
    moments: list[Moment] = Field(min_length=2)
    case_for_higher: str = Field(description="The best argument for a high tier on this board.")
    case_for_lower: str = Field(description="The best argument for a low tier on this board.")
    open_questions: list[str] = Field(
        default_factory=list, description="What is still unknown about them."
    )
    ties: list[str] = Field(
        default_factory=list, description="Names of other entries in this file they are tied to."
    )


class CastFile(BaseModel):
    setting: list[SettingNote] = Field(default_factory=list, max_length=15)
    villains: list[CastEntry] = Field(
        min_length=6, max_length=14, description="The villain board: ranked by how dangerous."
    )
    npcs: list[CastEntry] = Field(
        min_length=12,
        max_length=25,
        description="The NPC board: every notable NPC, ranked by how much the hosts love them.",
    )


def validation_problems(err: ValidationError) -> list[str]:
    """Each error as ``<location>: <message>``, never echoing the input (it holds names)."""
    out = []
    for e in err.errors(include_input=False, include_url=False):
        loc = ".".join(str(p) for p in e["loc"]) or "(file)"
        out.append(f"{loc}: {e['msg']}")
    return out


def cross_problems(cast: CastFile, campaign_slugs: Collection[str]) -> list[str]:
    """What the schema cannot see: unknown campaign slugs, ties to names not in the file, and
    a name listed twice on one board. Locations only, never content."""
    out: list[str] = []
    names = {e.name for e in [*cast.villains, *cast.npcs]}
    for board, entries in (("villains", cast.villains), ("npcs", cast.npcs)):
        seen: set[str] = set()
        for i, e in enumerate(entries):
            at = f"{board}.{i}"
            if e.name in seen:
                out.append(f"{at}.name: listed twice on this board")
            seen.add(e.name)
            out += [
                f"{at}.campaigns.{j}: not a being.kdl campaign slug"
                for j, slug in enumerate(e.campaigns)
                if slug not in campaign_slugs
            ]
            out += [
                f"{at}.moments.{j}.show: not a being.kdl campaign slug"
                for j, m in enumerate(e.moments)
                if m.show not in campaign_slugs
            ]
            out += [
                f"{at}.ties.{j}: not the name of another entry in the file"
                for j, tie in enumerate(e.ties)
                if tie not in names or tie == e.name
            ]
    return out


def _entry(
    head: str,
    e: CastEntry,
    *,
    campaign_names: Mapping[str, str],
    episode_label: Callable[[str, str], str],
    note: str = "",
) -> str:
    wiki = f" (wiki: {e.page})" if e.page else ""
    known = ", ".join(campaign_names.get(c, c) for c in e.campaigns)
    lines = [
        f"{head}: {e.name}{wiki}{note}",
        f"Known from: {known}",
        f"Role: {e.role}",
        f"What we know: {e.background}",
        "Moments:",
    ]
    for m in e.moments:
        where = f"wiki page {m.page}" if m.page else episode_label(m.show, m.date or "")
        lines.append(f'- {where}: "{m.quote}" — {m.shows}')
    lines.append(f"Case for a higher tier: {e.case_for_higher}")
    lines.append(f"Case for a lower tier: {e.case_for_lower}")
    if e.open_questions:
        lines.append("Still unknown: " + " ".join(e.open_questions))
    if e.ties:
        lines.append("Tied to: " + ", ".join(e.ties))
    return "\n".join(lines)


def render_cast(
    cast: CastFile,
    *,
    campaign_names: Mapping[str, str],
    episode_label: Callable[[str, str], str],
) -> str:
    """The Pass A evidence block. ``campaign_names`` maps a slug to its campaign's name;
    ``episode_label(show, date)`` names a session the way the hosts would."""
    parts: list[str] = []
    if cast.setting:
        lines = ["THE WIDER SETTING (background the placements lean on):"]
        for n in cast.setting:
            src = f" (wiki: {', '.join(n.pages)})" if n.pages else ""
            lines.append(f"- {n.topic}{src}: {n.note}")
        parts.append("\n".join(lines))

    def entry(head: str, e: CastEntry, note: str = "") -> str:
        return _entry(
            head, e, campaign_names=campaign_names, episode_label=episode_label, note=note
        )

    parts.append("BOARD ONE: THE VILLAINS, ranked S to D by how dangerous they are.")
    parts += [entry(f"VILLAIN {i}", e) for i, e in enumerate(cast.villains, start=1)]
    villains = {e.name for e in cast.villains}
    parts.append("BOARD TWO: THE NPCS, ranked S to D by how much the hosts love them.")
    parts += [
        entry(f"NPC {i}", e, " (also on the villain board)" if e.name in villains else "")
        for i, e in enumerate(cast.npcs, start=1)
    ]
    return "\n\n".join(parts)
