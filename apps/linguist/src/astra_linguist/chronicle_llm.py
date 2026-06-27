"""Chronicle GLM logic (NLSpec 0019) — the GLM-5.2 calls behind the chronicle assets.

Pure, injectable, Dagster-free so it tests with a stub client (no key, no network):

- `summarize_episode` — one session transcript → a Rich `EpisodeSummary`.
- `build_episode_entry` — resolve the session's show + summarize → the committed
  `EpisodeEntry`.

Season grouping (the aggregate side) lives alongside this in `chronicle_llm` too, added
in slice S3. All GLM calls go through `astra_llm.LiteLLMClient.call_structured` on the
config-single-source `llm.default-model` (GLM-5.2) — never a provider SDK, never the
dspy judge (wrong task; see the 0019 scope doc).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Protocol, TypeVar

from astra_llm import LiteLLMClient
from pydantic import BaseModel

from .chronicle import (
    Chronicle,
    EpisodeEntry,
    EpisodeSummary,
    Season,
    SeasonStructure,
    ShowChronicle,
    ShowInfo,
    date_key,
    show_for_date,
    show_index,
)
from .models import Transcript

_T = TypeVar("_T", bound=BaseModel)


class _StructuredClient(Protocol):
    """The slice of `LiteLLMClient` the chronicle uses (lets tests inject a stub)."""

    def call_structured(
        self,
        output_model: type[_T],
        *,
        system: str,
        user_content: str,
        model: str,
        max_tokens: int = ...,
        tool_name: str = ...,
        tool_description: str = ...,
    ) -> _T: ...


# Output budget for the structured episode record (the input transcript is large, but
# the Rich summary itself is small — beats/lists, not prose).
EPISODE_MAX_TOKENS = 4000

EPISODE_SYSTEM = (
    "You are a chronicler for a long-running tabletop RPG (Pathfinder 2e) actual-play "
    "show. You are given the full transcript of ONE recorded session (an episode). The "
    "early portion is out-of-character table chatter before play begins; focus on the "
    "in-fiction events of the session itself.\n\n"
    "Produce a Rich, faithful episode summary via the record tool. Be concrete and "
    "specific to THIS session — name the characters, places, and factions that actually "
    "appear. The key beats must be an ordered in-episode mini-timeline of what happened "
    "(roughly 4-10 beats). The cliffhanger is where the session left off; use an empty "
    "string if it ended on no particular hook. Do not invent events that are not in the "
    "transcript, and do not reference future sessions."
)


def episode_user_content(transcript: Transcript) -> str:
    """Render a transcript as plain ``Speaker: text`` lines for the GLM prompt."""
    return "\n".join(f"{line.user.name}: {line.text}" for line in transcript.script)


def _real_client() -> LiteLLMClient:
    """Build the real client, resolving the OpenRouter key into the env first."""
    from astra_llm import ensure_openrouter_env

    ensure_openrouter_env()
    return LiteLLMClient()


def _chronicle_model() -> str:
    """The config-single-source model (GLM-5.2 via `llm.default-model`)."""
    from astra_ontology_config import load as load_config

    return load_config().llm.default_model


def summarize_episode(
    transcript: Transcript,
    *,
    client: _StructuredClient | None = None,
    model: str | None = None,
) -> EpisodeSummary:
    """Summarize one session transcript into a Rich `EpisodeSummary` via GLM-5.2."""
    client = client if client is not None else _real_client()
    model = model if model is not None else _chronicle_model()
    return client.call_structured(
        EpisodeSummary,
        system=EPISODE_SYSTEM,
        user_content=episode_user_content(transcript),
        model=model,
        max_tokens=EPISODE_MAX_TOKENS,
        tool_name="record_episode",
        tool_description="Record the structured episode summary.",
    )


def build_episode_entry(
    date: str,
    transcript: Transcript,
    *,
    client: _StructuredClient | None = None,
    model: str | None = None,
    shows: dict[str, ShowInfo] | None = None,
) -> EpisodeEntry:
    """Resolve the session's show and summarize it into a committed `EpisodeEntry`."""
    shows = shows if shows is not None else show_index()
    show = show_for_date(date, shows=shows)
    summary = summarize_episode(transcript, client=client, model=model)
    return EpisodeEntry(
        date=date,
        show=show.slug if show is not None else "unmatched",
        summary=summary,
    )


# ── season grouping (the aggregate side) ────────────────────────────────────
SEASON_MAX_TOKENS = 4000

SEASON_SYSTEM = (
    "You are a chronicler organizing one tabletop RPG actual-play show into seasons. "
    "You are given the show's episodes in air-date order, each with a title, synopsis, "
    "and key beats. Group consecutive episodes into seasons — narrative arcs. Seasons "
    "MUST be contiguous (no interleaving), cover every episode exactly once, and stay in "
    "the given order. Give each season a short evocative title and a 1-2 sentence arc "
    "summary. Reference episodes by the exact `date=` values provided. A short show may be "
    "a single season; only split when there is a clear arc shift."
)


def season_user_content(info: ShowInfo | None, episodes: list[EpisodeEntry]) -> str:
    """Render a show's ordered episodes as a compact prompt for season grouping."""
    name = info.name if info is not None else "(unknown show)"
    lines = [f"Show: {name}", "", "Episodes (in air-date order):"]
    for i, entry in enumerate(episodes, 1):
        beats = "; ".join(entry.summary.key_beats)
        lines.append(
            f"{i}. date={entry.date} | {entry.summary.title} — "
            f"{entry.summary.synopsis} Beats: {beats}"
        )
    return "\n".join(lines)


def group_show_seasons(
    info: ShowInfo | None,
    episodes: list[EpisodeEntry],
    *,
    client: _StructuredClient | None = None,
    model: str | None = None,
) -> SeasonStructure:
    """One GLM call: assign a show's ordered episodes to contiguous seasons."""
    client = client if client is not None else _real_client()
    model = model if model is not None else _chronicle_model()
    return client.call_structured(
        SeasonStructure,
        system=SEASON_SYSTEM,
        user_content=season_user_content(info, episodes),
        model=model,
        max_tokens=SEASON_MAX_TOKENS,
        tool_name="record_seasons",
        tool_description="Record the season grouping for this show.",
    )


def _reconcile_seasons(structure: SeasonStructure, episodes: list[EpisodeEntry]) -> list[Season]:
    """Force GLM's grouping into a clean, total, in-order partition of the episodes.

    GLM may drop, duplicate, or invent dates; we keep its season titles/summaries but
    enforce that every real episode date lands in exactly one season, chronologically.
    Any episodes GLM left unassigned are appended to the last season (or seed one).
    """
    real = {e.date for e in episodes}
    order = {e.date: i for i, e in enumerate(episodes)}
    used: set[str] = set()
    seasons: list[Season] = []
    for proposed in structure.seasons:
        kept = sorted(
            (d for d in proposed.episode_dates if d in real and d not in used),
            key=lambda d: order[d],
        )
        if not kept:
            continue
        used.update(kept)
        seasons.append(
            Season(
                number=len(seasons) + 1,
                title=proposed.title,
                arc_summary=proposed.arc_summary,
                episode_dates=kept,
            )
        )
    leftover = sorted((e.date for e in episodes if e.date not in used), key=lambda d: order[d])
    if leftover:
        if seasons:
            last = seasons[-1]
            last.episode_dates = sorted(last.episode_dates + leftover, key=lambda d: order[d])
        else:
            seasons.append(
                Season(number=1, title="Season 1", arc_summary="", episode_dates=leftover)
            )
    return seasons


def _seasons_for_show(
    info: ShowInfo | None,
    episodes: list[EpisodeEntry],
    *,
    client: _StructuredClient | None,
    model: str | None,
) -> list[Season]:
    """Seasons for one show: a trivial single season for <=1 episode, else GLM-grouped."""
    if not episodes:
        return []
    if len(episodes) == 1:
        only = episodes[0]
        return [
            Season(
                number=1,
                title="Season 1",
                arc_summary=only.summary.synopsis,
                episode_dates=[only.date],
            )
        ]
    structure = group_show_seasons(info, episodes, client=client, model=model)
    return _reconcile_seasons(structure, episodes)


def build_chronicle(
    entries: list[EpisodeEntry],
    *,
    client: _StructuredClient | None = None,
    model: str | None = None,
    shows: dict[str, ShowInfo] | None = None,
) -> Chronicle:
    """Group every episode into shows → seasons (GLM per show), ordered main-first.

    Episodes are ordered by date within a show; shows are ordered main-show-first then
    by their first-session date. Unknown shows sort last under their slug.
    """
    shows = shows if shows is not None else show_index()
    by_show: dict[str, list[EpisodeEntry]] = defaultdict(list)
    for entry in entries:
        by_show[entry.show].append(entry)

    show_chronicles: list[ShowChronicle] = []
    for slug, eps in by_show.items():
        info = shows.get(slug)
        ordered = sorted(eps, key=lambda e: date_key(e.date))
        show_chronicles.append(
            ShowChronicle(
                show=slug,
                name=info.name if info is not None else slug,
                is_main=info.is_main if info is not None else False,
                seasons=_seasons_for_show(info, ordered, client=client, model=model),
            )
        )

    def _show_sort_key(sc: ShowChronicle) -> tuple[int, tuple[int, int, int]]:
        first = min(
            (date_key(d) for s in sc.seasons for d in s.episode_dates),
            default=(9999, 99, 99),
        )
        return (0 if sc.is_main else 1, first)

    show_chronicles.sort(key=_show_sort_key)
    return Chronicle(shows=show_chronicles)
