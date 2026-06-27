"""Chronicle domain tests (NLSpec 0019, slice S1) — hermetic.

Covers the show taxonomy (`show_index`), date→show resolution against the real
committed transcript filenames, and the artifact-model shapes.
"""

from __future__ import annotations

from astra_linguist.chronicle import (
    Chronicle,
    EpisodeEntry,
    EpisodeSummary,
    Season,
    ShowChronicle,
    show_for_date,
    show_index,
)


# ── show taxonomy ───────────────────────────────────────────────────────────
def test_show_index_has_all_campaigns() -> None:
    shows = show_index()
    assert len(shows) == 7
    main = shows["through-a-song-darkly"]
    assert main.is_main is True
    assert main.name == "Through a Song, Darkly"
    assert main.order == 0  # the main show is first in being.campaigns
    # every other show is a non-main side story
    assert all(not s.is_main for slug, s in shows.items() if slug != "through-a-song-darkly")


# ── date → show resolution (real transcript filenames) ──────────────────────
def test_show_for_date_resolves_known_sessions() -> None:
    assert show_for_date("2025-10-20").slug == "through-a-song-darkly"
    assert show_for_date("2026-2-10").slug == "interred-in-iomenei"
    assert show_for_date("2025-6-9").slug == "a-hunt-of-metal-and-vine"
    assert show_for_date("2025-9-11").slug == "fae-and-forest"


def test_show_for_date_unknown_returns_none() -> None:
    assert show_for_date("1999-1-1") is None


# ── artifact-model shapes round-trip ────────────────────────────────────────
def test_episode_entry_round_trips() -> None:
    entry = EpisodeEntry(
        date="2025-10-20",
        show="through-a-song-darkly",
        summary=EpisodeSummary(
            title="The Voidsong Stirs",
            synopsis="The party descends into the reserve.",
            key_beats=["They enter", "They fight", "They flee"],
            characters_present=["Gin Soaked Rag"],
            locations=["Opaline Reserve"],
            factions=["Iconoclasm"],
            items=["A humming shard"],
            cliffhanger="A door opens onto nothing.",
        ),
    )
    assert EpisodeEntry.model_validate_json(entry.model_dump_json()) == entry


def test_chronicle_round_trips() -> None:
    chron = Chronicle(
        shows=[
            ShowChronicle(
                show="through-a-song-darkly",
                name="Through a Song, Darkly",
                is_main=True,
                seasons=[
                    Season(
                        number=1,
                        title="The Descent",
                        arc_summary="The party forms and goes under.",
                        episode_dates=["2025-8-11", "2025-8-28"],
                    )
                ],
            )
        ]
    )
    assert Chronicle.model_validate_json(chron.model_dump_json()) == chron
