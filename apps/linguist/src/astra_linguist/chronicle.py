"""Chronicle domain — the Show → Season → Episode campaign timeline (NLSpec 0019).

GLM-5.2 (via `astra_llm`) summarizes each recorded session into an `EpisodeSummary`
and groups a show's episodes into seasons. This module holds the data models + the
date→show resolution shared by the chronicle assets; generation lives in
`chronicle_assets`. A **show** is a campaign (its `being.kdl` slug); a **season** is a
GLM-derived arc *within one show*; an **episode** is one recorded session.

The committed artifacts (under `apps/linguist/timeline/`, auto-committed by the
linguist-commit timer) are:

- `timeline/episodes/<date>.json` — one `EpisodeEntry` per session.
- `timeline/seasons.json` — a `Chronicle` (shows → seasons → episode dates), with
  shows ordered main-first then by first-session date.
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology import load_being
from astra_ontology.models import Being
from astra_ontology_being import BEING_KDL_PATH
from pydantic import BaseModel, Field

APP_ROOT = Path(__file__).resolve().parents[2]
TRANSCRIPT_DIR = APP_ROOT / "transcripts"
TIMELINE_DIR = APP_ROOT / "timeline"
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
    """One GLM-derived narrative arc within a show."""

    number: int
    title: str
    arc_summary: str
    episode_dates: list[str]


class SeasonStructure(BaseModel):
    """GLM's season assignment for a single show (the grouping-call output)."""

    seasons: list[Season]


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
) -> ShowInfo | None:
    """Resolve a session date to its show via the committed transcript filename.

    Transcripts are named `<prefix>.<slug>.<date>.txt` (e.g.
    `000.through-a-song-darkly.2025-10-20.txt`), so the show slug is the segment
    between the numeric prefix and the date. Returns ``None`` if no transcript for
    that date exists or its slug is unknown.
    """
    shows = shows if shows is not None else show_index()
    matches = sorted(transcript_dir.glob(f"*.{date}.txt"))
    if not matches:
        return None
    suffix = f".{date}.txt"
    stem = matches[0].name[: -len(suffix)]  # "<prefix>.<slug>"
    slug = stem.split(".", 1)[1] if "." in stem else stem
    return shows.get(slug)
