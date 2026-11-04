"""The tier list's run dir: ``prepare`` lays out the subagent's inputs, ``validate_cast``
checks the ``cast.json`` it writes back.

``prepare`` writes, into a fresh ``<artifacts-path>/tierlist-<latest>/<run-id>/``:
``overview.md`` (the roundtable's campaign overview), ``astra.md`` (the other Astra games),
``sessions.md`` (every Astra campaign's transcript dates), ``cast.schema.json``, the brief
with this run's paths filled in, and ``summary.json``. Nothing here calls an LLM.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from astra_akasha_backend.corpus import CONTENT_DIR
from astra_linguist.chronicle import (
    EPISODES_DIR,
    SEASONS_PATH,
    TIMELINE_DIR,
    TRANSCRIPT_DIR,
    load_episode_entries,
    show_for_date,
    show_index,
)
from astra_mouthpiece.producer.run import ARTIFACTS_ROOT, new_run_id
from astra_ontology_being import BEING_KDL_PATH, load_being
from astra_sessions import date_key, transcript_dates
from pydantic import ValidationError

from ..roundtable.agent import build_overview, campaign_tools, season_titles
from ..roundtable.astra import build_astra_block
from .cast import CastFile, cross_problems, render_cast, validation_problems

BRIEF = "brief.md"
SCHEMA = "cast.schema.json"
CAST = "cast.json"
CAST_MD = "cast.md"


def episode_id(show: str, latest: str) -> str:
    """The special's id: sorts right after its last session, with its own token."""
    return f"000.{show}.{latest}-special-tier-list"


def cast_schema() -> str:
    return json.dumps(CastFile.model_json_schema(), indent=2)


def campaign_names(being_path: Path | str = BEING_KDL_PATH) -> dict[str, str]:
    """Every being.kdl campaign slug → its name."""
    return {c.slug: c.name for c in load_being(being_path).campaigns}


def astra_slugs(being_path: Path | str = BEING_KDL_PATH) -> list[str]:
    """The campaigns set in the Astra, in being.kdl order."""
    being = load_being(being_path)
    return [c.slug for c in being.campaigns if c.world in set(being.astra_worlds)]


def sessions_block(slugs: list[str], names: Mapping[str, str], transcript_dir: Path) -> str:
    """Each Astra campaign's transcript dates, so the subagent knows which files are whose."""
    by_show: dict[str, list[str]] = {s: [] for s in slugs}
    shows = show_index()
    for d in transcript_dates(transcript_dir):
        info = show_for_date(d, transcript_dir=transcript_dir, shows=shows)
        if info is not None and info.slug in by_show:
            by_show[info.slug].append(d)
    lines = ["TRANSCRIPTS BY CAMPAIGN (session dates; files are *.<slug>.<date>.txt)"]
    for slug, dates in by_show.items():
        listed = ", ".join(sorted(dates, key=date_key)) if dates else "no transcripts"
        lines.append(f"- {names.get(slug, slug)} (`{slug}`): {listed}")
    return "\n".join(lines)


def fill_brief(values: Mapping[str, str], brief: Path | None = None) -> str:
    """``brief`` (default: the tier list's) with each ``{{KEY}}`` replaced by its value."""
    text = (brief or Path(__file__).with_name(BRIEF)).read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


@dataclass(frozen=True)
class Inputs:
    """Where ``prepare`` reads from; the defaults are the config paths."""

    content_dir: Path = CONTENT_DIR
    transcript_dir: Path = TRANSCRIPT_DIR
    timeline_dir: Path = TIMELINE_DIR
    episodes_dir: Path = EPISODES_DIR
    seasons_path: Path = SEASONS_PATH
    being_path: Path = BEING_KDL_PATH


def prepare_run(
    show: str,
    *,
    latest: str | None = None,
    run_dir: Path | None = None,
    inputs: Inputs | None = None,
) -> Path:
    """Lay out a fresh run dir for the cast-file subagent; returns it."""
    src = inputs or Inputs()
    tools, latest = campaign_tools(
        show,
        latest,
        content_dir=src.content_dir,
        transcript_dir=src.transcript_dir,
        episodes_dir=src.episodes_dir,
        seasons_path=src.seasons_path,
    )
    out = run_dir if run_dir is not None else ARTIFACTS_ROOT / f"tierlist-{latest}" / new_run_id()
    out.mkdir(parents=True, exist_ok=True)
    names = campaign_names(src.being_path)
    texts = {
        "overview.md": build_overview(tools, show, src.seasons_path),
        "astra.md": build_astra_block(show, src.being_path, src.content_dir),
        "sessions.md": sessions_block(astra_slugs(src.being_path), names, src.transcript_dir),
        SCHEMA: cast_schema(),
    }
    for name, text in texts.items():
        (out / name).write_text(text + "\n", encoding="utf-8")
    brief = fill_brief(
        {
            "SHOW": show,
            "LATEST": latest,
            "RUN_DIR": str(out),
            "TRANSCRIPTS": str(src.transcript_dir),
            "CONTENT": str(src.content_dir),
            "TIMELINE": str(src.timeline_dir),
            "BEING_KDL": str(src.being_path),
            "SCHEMA": texts[SCHEMA],
        }
    )
    (out / BRIEF).write_text(brief, encoding="utf-8")
    summary = {"show": show, "latest": latest, "run_id": out.name, "sessions": len(tools.dates)}
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return out


def cast_labeller(
    names: Mapping[str, str],
    episodes_dir: Path = EPISODES_DIR,
    seasons_path: Path = SEASONS_PATH,
) -> Callable[[str, str], str]:
    """``label(show, date)``: 'Campaign, Season N "Title", episode "Title" (date)', with the
    parts the chronicle does not know left out."""
    entries = (
        {(e.show, e.date): e for e in load_episode_entries(episodes_dir)}
        if episodes_dir.is_dir()
        else {}
    )
    seasons: dict[str, dict[str, str]] = {}

    def label(show: str, date: str) -> str:
        if show not in seasons:
            seasons[show] = season_titles(show, seasons_path)
        parts = [names.get(show, show)]
        if date in seasons[show]:
            parts.append(seasons[show][date])
        entry = entries.get((show, date))
        if entry is not None:
            parts.append(f'episode "{entry.summary.title}"')
        return f"{', '.join(parts)} ({date})"

    return label


@dataclass
class Validation:
    cast: CastFile | None
    problems: list[str]


def validate_cast(run_dir: Path, being_path: Path | str = BEING_KDL_PATH) -> Validation:
    """Load and check ``run_dir/cast.json``; problems name locations, never content."""
    path = run_dir / CAST
    if not path.is_file():
        return Validation(None, [f"no {CAST} in {run_dir}"])
    try:
        cast = CastFile.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as err:
        return Validation(None, validation_problems(err))
    return Validation(cast, cross_problems(cast, campaign_names(being_path)))


def write_cast_md(
    run_dir: Path,
    cast: CastFile,
    *,
    being_path: Path | str = BEING_KDL_PATH,
    episodes_dir: Path = EPISODES_DIR,
    seasons_path: Path = SEASONS_PATH,
) -> Path:
    names = campaign_names(being_path)
    block = render_cast(
        cast,
        campaign_names=names,
        episode_label=cast_labeller(names, episodes_dir, seasons_path),
    )
    out = run_dir / CAST_MD
    out.write_text(block + "\n", encoding="utf-8")
    return out
