"""Chronicle domain — the Show → Season → Episode campaign timeline.

GLM-5.2 (via `astra_llm`) summarizes each recorded session into an `EpisodeSummary`
and groups a show's episodes into seasons. This module holds the data models + the
date→show resolution shared by the chronicle assets; generation lives in
`chronicle_assets`. A **show** is a campaign (its `being.kdl` slug); a **season** is a
GLM-derived arc *within one show*; an **episode** is one recorded session.

The artifacts (under config `data.linguist-timeline` in the astra-data repo, committed by the
linguist-commit timer) are:

- `timeline/episodes/<date>.json` — one `EpisodeEntry` per session.
- `timeline/seasons.json` — a `Chronicle` (shows → seasons → episode dates), with
  shows ordered main-first then by first-session date.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from astra_config import load_config
from astra_ontology import load_being
from astra_ontology.models import Being
from astra_ontology.sessions import SessionOverrides
from astra_ontology_being import BEING_KDL_PATH, session_overrides
from astra_sessions import date_key, find_transcript, parse_transcript_name
from pydantic import BaseModel, Field

_DATA = load_config().data
TRANSCRIPT_DIR = Path(_DATA.linguist_transcripts)
TIMELINE_DIR = Path(_DATA.linguist_timeline)
EPISODES_DIR = TIMELINE_DIR / "episodes"
SEASONS_PATH = TIMELINE_DIR / "seasons.json"


# ── GLM outputs ────────────────────────────────────────────────────────────
class EpisodeSummary(BaseModel):
    """The Rich per-episode summary GLM-5.2 produces from a session transcript."""

    title: str = Field(description="An evocative episode title (<= ~80 chars).")
    synopsis: str = Field(description="A 2-3 sentence synopsis of the session.")
    key_beats: list[str] = Field(
        description="The ordered key story beats — an in-episode mini-timeline."
    )
    characters_present: list[str] = Field(
        description="Named player characters and notable NPCs that appear."
    )
    locations: list[str] = Field(description="Notable locations visited or featured.")
    factions: list[str] = Field(description="Organizations / factions involved.")
    items: list[str] = Field(description="Notable items, artifacts, or macguffins.")
    cliffhanger: str = Field(description="The hook / where the session left off (may be empty).")


class Season(BaseModel):
    """One narrative arc within a show (the committed shape; episodes filled in)."""

    number: int
    title: str
    arc_summary: str
    episode_dates: list[str]


class SeasonBoundary(BaseModel):
    """A GLM-proposed season start — kept tiny so the grouping call never truncates."""

    title: str = Field(description="A short evocative season title.")
    arc_summary: str = Field(description="A 1-2 sentence summary of this season's arc.")
    start_date: str = Field(description="The exact `date=` of the FIRST episode of this season.")


class SeasonPlan(BaseModel):
    """GLM's season assignment for one show, as ordered boundaries (the call output)."""

    seasons: list[SeasonBoundary]


# ── committed artifacts ────────────────────────────────────────────────────
class EpisodeEntry(BaseModel):
    """A session's committed chronicle record: summary + the metadata we stamp."""

    date: str
    show: str  # campaign slug, e.g. "through-a-song-darkly"
    summary: EpisodeSummary


class ShowChronicle(BaseModel):
    """One show's full chronicle: its identity + ordered seasons."""

    show: str  # campaign slug
    name: str  # display name from being.kdl
    is_main: bool
    seasons: list[Season]


class Chronicle(BaseModel):
    """The whole timeline: every show, ordered main-first then by first session."""

    shows: list[ShowChronicle]
    # Fingerprint of the episode inputs this was built from — lets the aggregate
    # asset skip the GLM grouping calls when nothing has changed. Not content;
    # the frontend ignores it.
    inputs_hash: str | None = None


def load_episode_entries(episodes_dir: Path = EPISODES_DIR) -> list[EpisodeEntry]:
    """Load every committed per-episode entry from `timeline/episodes/`."""
    return [
        EpisodeEntry.model_validate_json(path.read_text(encoding="utf-8"))
        for path in sorted(episodes_dir.glob("*.json"))
    ]


def load_episode_summary(date: str, episodes_dir: Path = EPISODES_DIR) -> EpisodeEntry | None:
    """Load one committed episode entry by date — `None` if its file is absent.

    The recap context + the mouthpiece ordering gate (0021 Change B) both tolerate a
    missing episode, so absence is a clean `None`, not an error.
    """
    path = Path(episodes_dir) / f"{date}.json"
    if not path.is_file():
        return None
    return EpisodeEntry.model_validate_json(path.read_text(encoding="utf-8"))


def recent_prior_entries(
    date: str, show: str, *, limit: int = 3, episodes_dir: Path = EPISODES_DIR
) -> list[EpisodeEntry]:
    """The ≤`limit` most-recent committed episodes of `show` strictly before `date`.

    Same-show only (`EpisodeEntry.show`), ordered ascending by `date_key` (oldest→newest)
    so the caller renders them in chronological "previously, on…" order. Tolerates a
    missing dir (→ `[]`). Used to build mouthpiece's recap continuity (0021 Change B).
    """
    here = date_key(date)
    prior = [
        entry
        for entry in load_episode_entries(episodes_dir)
        if entry.show == show and date_key(entry.date) < here
    ]
    prior.sort(key=lambda entry: date_key(entry.date))
    return prior[-limit:] if limit >= 0 else prior


def season_for(date: str, show: str, *, seasons_path: Path = SEASONS_PATH) -> Season | None:
    """Best-effort: the season of `show` whose `episode_dates` contains `date`.

    Reads the committed `seasons.json` (`Chronicle`). Returns `None` when the file is
    absent, the show isn't present, or `date` isn't placed in a season yet — the
    `campaign_timeline` aggregate runs after the summary, so it can lag a freshly-added
    episode by a sensor tick and a grouping call. Never
    raises: callers treat season framing as optional and never gate on it (0021 Change B).
    """
    path = Path(seasons_path)
    if not path.is_file():
        return None
    chronicle = Chronicle.model_validate_json(path.read_text(encoding="utf-8"))
    for show_chronicle in chronicle.shows:
        if show_chronicle.show == show:
            return next(
                (s for s in show_chronicle.seasons if date in s.episode_dates),
                None,
            )
    return None


def chronicle_inputs_hash(entries: list[EpisodeEntry]) -> str:
    """A stable fingerprint of the episode inputs (changes iff a summary changes)."""
    payload = json.dumps(
        sorted(
            (
                {
                    "date": e.date,
                    "show": e.show,
                    "title": e.summary.title,
                    "synopsis": e.summary.synopsis,
                    "beats": e.summary.key_beats,
                }
                for e in entries
            ),
            key=lambda row: (row["show"], date_key(row["date"])),
        ),
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def timeline_is_current(episodes_dir: Path, seasons_path: Path) -> bool:
    """True when `seasons.json` was built from exactly the episodes now in `episodes_dir`
    (its `inputs_hash` matches), or there are no episodes yet: grouping would change nothing.

    An unreadable `seasons.json` counts as stale."""
    entries = load_episode_entries(episodes_dir)
    if not entries:
        return True
    try:
        existing = Chronicle.model_validate_json(seasons_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return existing.inputs_hash == chronicle_inputs_hash(entries)


# ── show resolution (date → show) ──────────────────────────────────────────
class ShowInfo(BaseModel):
    """A campaign as a chronicle show: slug, display name, main flag, list order."""

    slug: str
    name: str
    is_main: bool
    order: int  # position in being.campaigns (the canonical campaign order)


def show_index(being: Being | None = None) -> dict[str, ShowInfo]:
    """Map every campaign slug → `ShowInfo` (the show taxonomy from `being.kdl`)."""
    being = being or load_being(BEING_KDL_PATH)
    return {
        c.slug: ShowInfo(slug=c.slug, name=c.name, is_main=c.main, order=i)
        for i, c in enumerate(being.campaigns)
    }


def show_for_date(
    date: str,
    *,
    transcript_dir: Path = TRANSCRIPT_DIR,
    shows: dict[str, ShowInfo] | None = None,
    overrides: SessionOverrides | None = None,
) -> ShowInfo | None:
    """Resolve a session date to its show via the committed transcript filename.

    Transcripts are named `<prefix>.<slug>.<date>.txt` (e.g.
    `000.through-a-song-darkly.2025-10-20.txt`), so the show slug is the segment
    between the numeric prefix and the date. A `sessions.kdl` `campaign=` wins over the
    filename slug (the GM's word over linguist's name match). Returns ``None`` if no
    transcript for that date exists, its slug is unknown, or `sessions.kdl` marks the date
    `skip=#true` (a session the substring campaign match mislabeled, say). ``overrides``
    defaults to ontology-being's `sessions.kdl`.
    """
    overrides = overrides if overrides is not None else session_overrides()
    if overrides.skipped(date):
        return None
    shows = shows if shows is not None else show_index()
    path = find_transcript(date, transcript_dir)
    if path is None:
        return None
    try:
        slug = parse_transcript_name(path).slug
    except ValueError:  # `date` is not a YYYY-M-D session key
        return None
    return shows.get(overrides.campaign(date) or slug)
