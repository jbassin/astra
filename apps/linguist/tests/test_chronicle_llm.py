"""Chronicle GLM-logic tests (NLSpec 0019, slice S2) — hermetic, stubbed LLM.

No key, no network: a fake structured client returns a canned `EpisodeSummary`, so we
test the prompt assembly, model pass-through, and show resolution / entry assembly.
"""

from __future__ import annotations

from astra_linguist.chronicle import (
    EpisodeEntry,
    EpisodeSummary,
    Season,
    SeasonStructure,
)
from astra_linguist.chronicle_llm import (
    _reconcile_seasons,
    build_chronicle,
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


# ── season grouping (S3) ────────────────────────────────────────────────────
def _entry(date: str, show: str, title: str = "T") -> EpisodeEntry:
    return EpisodeEntry(
        date=date,
        show=show,
        summary=EpisodeSummary(
            title=title,
            synopsis=f"synopsis for {title}",
            key_beats=["beat"],
            characters_present=[],
            locations=[],
            factions=[],
            items=[],
            cliffhanger="",
        ),
    )


class _SeasonClient:
    """Returns queued SeasonStructures, one per show grouped (counts the calls)."""

    def __init__(self, *structures: SeasonStructure) -> None:
        self.structures = list(structures)
        self.calls = 0

    def call_structured(self, output_model, **kwargs):  # type: ignore[no-untyped-def]
        assert output_model is SeasonStructure
        out = self.structures[self.calls]
        self.calls += 1
        return out


def test_build_chronicle_orders_shows_and_groups_seasons() -> None:
    # Main show, 3 episodes given OUT of date order; one 1-episode side show.
    entries = [
        _entry("2025-10-20", "through-a-song-darkly", "Three"),
        _entry("2025-8-11", "through-a-song-darkly", "One"),
        _entry("2025-8-28", "through-a-song-darkly", "Two"),
        _entry("2026-2-10", "interred-in-iomenei", "Solo"),
    ]
    main_structure = SeasonStructure(
        seasons=[
            Season(
                number=1, title="Origins", arc_summary="a", episode_dates=["2025-8-11", "2025-8-28"]
            ),
            Season(number=2, title="Descent", arc_summary="b", episode_dates=["2025-10-20"]),
        ]
    )
    client = _SeasonClient(main_structure)
    chron = build_chronicle(entries, client=client, model="m")

    # main show first; one GLM call (the 1-episode show short-circuits, no call)
    assert [s.show for s in chron.shows] == ["through-a-song-darkly", "interred-in-iomenei"]
    assert client.calls == 1
    main = chron.shows[0]
    assert [s.title for s in main.seasons] == ["Origins", "Descent"]
    assert main.seasons[0].episode_dates == ["2025-8-11", "2025-8-28"]  # date-ordered
    solo = chron.shows[1]
    assert len(solo.seasons) == 1 and solo.seasons[0].episode_dates == ["2026-2-10"]


def test_reconcile_seasons_forces_total_ordered_partition() -> None:
    episodes = [_entry("2025-8-11", "x"), _entry("2025-8-28", "x"), _entry("2025-10-20", "x")]
    # GLM dropped 2025-10-20 and invented a bogus date.
    structure = SeasonStructure(
        seasons=[
            Season(number=1, title="A", arc_summary="", episode_dates=["2025-8-11", "9999-1-1"]),
            Season(number=2, title="B", arc_summary="", episode_dates=["2025-8-28"]),
        ]
    )
    seasons = _reconcile_seasons(structure, episodes)
    assert [s.number for s in seasons] == [1, 2]
    assert seasons[0].episode_dates == ["2025-8-11"]  # invented date dropped
    assert seasons[1].episode_dates == ["2025-8-28", "2025-10-20"]  # leftover appended, ordered
