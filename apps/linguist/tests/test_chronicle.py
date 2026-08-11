"""Chronicle domain tests (NLSpec 0019, slice S1) — hermetic.

Covers the show taxonomy (`show_index`), date→show resolution against the real
committed transcript filenames, and the artifact-model shapes.
"""

from __future__ import annotations

from pathlib import Path

from astra_linguist.chronicle import (
    Chronicle,
    EpisodeEntry,
    EpisodeSummary,
    Season,
    ShowChronicle,
    chronicle_inputs_hash,
    date_key,
    load_episode_summary,
    recent_prior_entries,
    season_for,
    show_for_date,
    show_index,
)


def _entry(date: str, title: str = "T", show: str = "through-a-song-darkly") -> EpisodeEntry:
    return EpisodeEntry(
        date=date,
        show=show,
        summary=EpisodeSummary(
            title=title,
            synopsis="s",
            key_beats=["b"],
            characters_present=[],
            locations=[],
            factions=[],
            items=[],
            cliffhanger="",
        ),
    )


def _write_episodes(episodes_dir: Path, entries: list[EpisodeEntry]) -> None:
    episodes_dir.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        (episodes_dir / f"{entry.date}.json").write_text(entry.model_dump_json(), encoding="utf-8")


# ── show taxonomy ───────────────────────────────────────────────────────────
def test_show_index_has_all_campaigns() -> None:
    shows = show_index()
    assert len(shows) == 8
    song = shows["through-a-song-darkly"]
    assert song.name == "Through a Song, Darkly"
    assert song.order == 0  # first in being.campaigns
    # `main` currently sits on the Chuul Hunt one-shot (the weal-bot active campaign)
    assert [slug for slug, s in shows.items() if s.is_main] == ["chuul-hunt"]


# ── date → show resolution (real transcript filenames) ──────────────────────
def test_show_for_date_resolves_known_sessions() -> None:
    def slug_for(date: str) -> str | None:
        show = show_for_date(date)
        return show.slug if show is not None else None

    assert slug_for("2025-10-20") == "through-a-song-darkly"
    assert slug_for("2026-2-10") == "interred-in-iomenei"
    assert slug_for("2025-6-9") == "a-hunt-of-metal-and-vine"
    assert slug_for("2025-9-11") == "fae-and-forest"


def test_show_for_date_unknown_returns_none() -> None:
    assert show_for_date("1999-1-1") is None


def test_show_for_date_excluded_returns_none() -> None:
    # 2025-8-11 is a mislabeled session (different campaign) — excluded by hand.
    assert show_for_date("2025-8-11") is None


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


def test_date_key_orders_non_zero_padded_dates() -> None:
    dates = ["2025-10-20", "2025-8-11", "2025-8-28", "2026-1-6"]
    assert sorted(dates, key=date_key) == ["2025-8-11", "2025-8-28", "2025-10-20", "2026-1-6"]


def test_chronicle_inputs_hash_stable_and_order_independent() -> None:
    a = [_entry("2025-8-11", "One"), _entry("2025-8-28", "Two")]
    b = [_entry("2025-8-28", "Two"), _entry("2025-8-11", "One")]  # reordered
    assert chronicle_inputs_hash(a) == chronicle_inputs_hash(b)
    # a content change flips the hash
    assert chronicle_inputs_hash(a) != chronicle_inputs_hash(
        [_entry("2025-8-11", "CHANGED"), _entry("2025-8-28", "Two")]
    )


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


# ── 0021 Change B selectors: recap-context sources ──────────────────────────
def test_load_episode_summary_by_date_and_absent(tmp_path: Path) -> None:
    episodes = tmp_path / "episodes"
    _write_episodes(episodes, [_entry("2025-10-20", "Found It")])
    got = load_episode_summary("2025-10-20", episodes_dir=episodes)
    assert got is not None and got.summary.title == "Found It"
    assert load_episode_summary("2099-1-1", episodes_dir=episodes) is None  # absent → None


def test_recent_prior_entries_same_show_recency_and_limit(tmp_path: Path) -> None:
    episodes = tmp_path / "episodes"
    _write_episodes(
        episodes,
        [
            _entry("2025-8-28", "E1"),
            _entry("2025-10-20", "E2"),
            _entry("2025-10-27", "E3"),
            _entry("2025-11-4", "E4"),
            _entry("2026-1-6", "future"),  # AFTER the query date → excluded
            _entry("2025-10-21", "OtherShow", show="interred-in-iomenei"),  # other show → excluded
        ],
    )
    prior = recent_prior_entries("2025-11-11", "through-a-song-darkly", episodes_dir=episodes)
    # last 3 same-show episodes strictly before the date, oldest→newest
    assert [e.summary.title for e in prior] == ["E2", "E3", "E4"]
    # a show's first episode has no priors
    assert recent_prior_entries("2025-8-28", "through-a-song-darkly", episodes_dir=episodes) == []
    # missing dir tolerated
    assert recent_prior_entries("2025-11-11", "x", episodes_dir=tmp_path / "nope") == []


def test_season_for_hit_wrong_show_absent_and_unplaced(tmp_path: Path) -> None:
    seasons = tmp_path / "seasons.json"
    assert season_for("2025-8-28", "through-a-song-darkly", seasons_path=seasons) is None  # no file
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
                        episode_dates=["2025-8-28", "2025-10-20"],
                    )
                ],
            )
        ]
    )
    seasons.write_text(chron.model_dump_json(), encoding="utf-8")
    hit = season_for("2025-10-20", "through-a-song-darkly", seasons_path=seasons)
    assert hit is not None and hit.title == "The Descent"
    # wrong show / date not yet placed in a season → None
    assert season_for("2025-10-20", "interred-in-iomenei", seasons_path=seasons) is None
    assert season_for("2099-1-1", "through-a-song-darkly", seasons_path=seasons) is None
