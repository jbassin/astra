"""Chronicle GLM-logic tests (NLSpec 0019, slice S2) — hermetic, stubbed LLM.

No key, no network: a fake structured client returns a canned `EpisodeSummary`, so we
test the prompt assembly, model pass-through, and show resolution / entry assembly.
"""

from __future__ import annotations

from astra_linguist.chronicle import EpisodeSummary
from astra_linguist.chronicle_llm import (
    build_episode_entry,
    episode_user_content,
    summarize_episode,
)
from astra_linguist.models import FormattedLine, Speaker, Transcript

_CANNED = EpisodeSummary(
    title="The Reserve Below",
    synopsis="The party breaches the Opaline Reserve and meets the Voidsong.",
    key_beats=["Descend", "Negotiate", "Betrayal", "Flee"],
    characters_present=["Gin Soaked Rag", "Knife-That-Teaches"],
    locations=["Opaline Reserve"],
    factions=["Iconoclasm"],
    items=["A humming shard"],
    cliffhanger="The shard begins to sing back.",
)


class _FakeClient:
    """Records the structured call and returns a canned summary."""

    def __init__(self, summary: EpisodeSummary) -> None:
        self.summary = summary
        self.calls: list[dict[str, object]] = []

    def call_structured(self, output_model, **kwargs):  # type: ignore[no-untyped-def]
        assert output_model is EpisodeSummary
        self.calls.append(kwargs)
        return self.summary


def _transcript(date: str = "2025-10-20") -> Transcript:
    line = FormattedLine(
        start="00:00:04",
        second=4.25,
        text="We breach the reserve.",
        user=Speaker(name="Josh", color="--textJosh"),
        duration=3.4,
    )
    other = FormattedLine(
        start="00:00:08",
        second=8.0,
        text="Argyle draws his blade.",
        user=Speaker(name="Jorge", color="--textJorge"),
        duration=2.0,
    )
    return Transcript(date=date, audio=f"/audio/{date}.mp3", script=[line, other])


def test_episode_user_content_formats_speaker_lines() -> None:
    content = episode_user_content(_transcript())
    assert content == "Josh: We breach the reserve.\nJorge: Argyle draws his blade."


def test_summarize_episode_passes_model_and_returns_summary() -> None:
    client = _FakeClient(_CANNED)
    out = summarize_episode(_transcript(), client=client, model="openrouter/z-ai/glm-5.2")
    assert out is _CANNED
    assert client.calls[0]["model"] == "openrouter/z-ai/glm-5.2"
    assert client.calls[0]["tool_name"] == "record_episode"


def test_build_episode_entry_resolves_show() -> None:
    client = _FakeClient(_CANNED)
    entry = build_episode_entry("2025-10-20", _transcript("2025-10-20"), client=client, model="m")
    assert entry.show == "through-a-song-darkly"
    assert entry.date == "2025-10-20"
    assert entry.summary is _CANNED


def test_build_episode_entry_unknown_date_is_unmatched() -> None:
    client = _FakeClient(_CANNED)
    entry = build_episode_entry("1999-1-1", _transcript("1999-1-1"), client=client, model="m")
    assert entry.show == "unmatched"
