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

from typing import Protocol, TypeVar

from astra_llm import LiteLLMClient
from pydantic import BaseModel

from .chronicle import (
    EpisodeEntry,
    EpisodeSummary,
    ShowInfo,
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
