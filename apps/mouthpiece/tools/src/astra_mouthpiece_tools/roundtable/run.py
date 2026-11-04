"""The roundtable's subagent run dir: ``prepare`` lays out the dossier subagent's inputs,
``validate_dossier`` checks the ``dossier.json`` it writes back.

``prepare`` writes, into a fresh ``<artifacts-path>/roundtable-<latest>/<run-id>/``:
``overview.md``, ``astra.md``, ``sessions.md`` (every Astra campaign's transcript dates),
``dossier.schema.json``, the brief with this run's paths filled in, and ``summary.json``.
For a follow-up it also writes ``previous.txt``: the last roundtable's published transcript,
one numbered line per turn, which the subagent reads to fill the dossier's ``previous``.
Nothing here calls an LLM; the dossier agent loop in ``agent.py`` is the paid alternative.
"""

from __future__ import annotations

import json
from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path

from astra_mouthpiece.models import Script
from astra_mouthpiece.producer.run import ARTIFACTS_ROOT, new_run_id
from pydantic import ValidationError

from ..tierlist.cast import validation_problems
from ..tierlist.run import Inputs, astra_slugs, campaign_names, fill_brief, sessions_block
from .agent import build_overview, campaign_tools, episode_labeller
from .astra import build_astra_block
from .dossier import Dossier, LastRoundtable, Mystery, render_dossier

BRIEF = Path(__file__).with_name("brief.md")
SCHEMA = "dossier.schema.json"
DOSSIER = "dossier.json"
DOSSIER_MD = "dossier.md"
PREVIOUS = "previous.txt"

_NO_PREVIOUS = (
    "This is a first roundtable: there is no `previous.txt`. Leave `previous` out of the dossier."
)


def dossier_schema() -> str:
    return json.dumps(Dossier.model_json_schema(), indent=2)


def previous_transcript(script: Script) -> str:
    """The published script as ``NNNNNN<TAB>Speaker: text`` lines, numbered from 1."""
    names = {"A": script.hosts.a.name, "B": script.hosts.b.name}
    if script.hosts.c is not None:
        names["C"] = script.hosts.c.name
    return "\n".join(
        f"{n:06d}\t{names.get(t.speaker, t.speaker)}: {t.text}"
        for n, t in enumerate(script.turns, start=1)
    )


def load_previous(episodes_dir: Path, episode_id: str) -> Script:
    path = episodes_dir / episode_id / "script.json"
    if not path.is_file():
        raise FileNotFoundError(f"no published script at {path}")
    return Script.model_validate_json(path.read_text(encoding="utf-8"))


def prepare_run(
    show: str,
    *,
    latest: str | None = None,
    previous: Script | None = None,
    run_dir: Path | None = None,
    inputs: Inputs | None = None,
) -> Path:
    """Lay out a fresh run dir for the dossier subagent; returns it."""
    src = inputs or Inputs()
    tools, latest = campaign_tools(
        show,
        latest,
        content_dir=src.content_dir,
        transcript_dir=src.transcript_dir,
        episodes_dir=src.episodes_dir,
        seasons_path=src.seasons_path,
    )
    out = run_dir if run_dir is not None else ARTIFACTS_ROOT / f"roundtable-{latest}" / new_run_id()
    out.mkdir(parents=True, exist_ok=True)
    texts = {
        "overview.md": build_overview(tools, show, src.seasons_path),
        "astra.md": build_astra_block(show, src.being_path, src.content_dir),
        "sessions.md": sessions_block(
            astra_slugs(src.being_path), campaign_names(src.being_path), src.transcript_dir
        ),
        SCHEMA: dossier_schema(),
    }
    if previous is not None:
        texts[PREVIOUS] = previous_transcript(previous)
    for name, text in texts.items():
        (out / name).write_text(text + "\n", encoding="utf-8")
    if previous is not None:
        hosts = [previous.hosts.a.name, previous.hosts.b.name]
        if previous.hosts.c is not None:
            hosts.append(previous.hosts.c.name)
        previous_note = (
            f'This is a follow-up. The last roundtable, "{previous.title}" '
            f"(`{previous.session_id}`), is in `{out / PREVIOUS}`: {len(previous.turns)} "
            f"numbered turns by {', '.join(hosts)}. Fill `previous` from it (see step 6)."
        )
    else:
        previous_note = _NO_PREVIOUS
    brief = fill_brief(
        {
            "SHOW": show,
            "LATEST": latest,
            "RUN_DIR": str(out),
            "TRANSCRIPTS": str(src.transcript_dir),
            "CONTENT": str(src.content_dir),
            "TIMELINE": str(src.timeline_dir),
            "BEING_KDL": str(src.being_path),
            "PREVIOUS": previous_note,
            "SCHEMA": texts[SCHEMA],
        },
        BRIEF,
    )
    (out / BRIEF.name).write_text(brief, encoding="utf-8")
    summary: dict[str, object] = {
        "show": show,
        "latest": latest,
        "run_id": out.name,
        "model": "Claude Code subagent",
        "cost_usd": None,
        "sessions": len(tools.dates),
    }
    if previous is not None:
        summary["previous"] = {
            "id": previous.session_id,
            "title": previous.title,
            "turns": len(previous.turns),
            "hosts": hosts,
        }
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return out


def _mystery_problems(i: int, m: Mystery, dates: Collection[str], n_mysteries: int) -> list[str]:
    out: list[str] = []
    ids = [c.id for c in m.clues]
    if len(set(ids)) != len(ids):
        out.append(f"mysteries.{i}.clues: clue ids repeat")
    for j, c in enumerate(m.clues):
        loc = f"mysteries.{i}.clues.{j}"
        if c.page is None and (c.date is None or c.line is None):
            out.append(f"{loc}: needs a page, or a date and a line")
        if c.date is not None and c.date not in dates:
            out.append(f"{loc}.date: not a session of this show through the latest date")
        if not 5 <= len(c.quote.split()) <= 40:
            out.append(f"{loc}.quote: must be 5 to 40 words")
    for j, h in enumerate(m.hypotheses):
        loc = f"mysteries.{i}.hypotheses.{j}"
        if not h.supported_by:
            out.append(f"{loc}.supported_by: is empty")
        out += [
            f"{loc}.{field}: names a missing clue id"
            for field in ("supported_by", "complicated_by")
            if any(ref not in ids for ref in getattr(h, field))
        ]
    out += [
        f"mysteries.{i}.connections.{j}.to: not another mystery's number"
        for j, conn in enumerate(m.connections)
        if not 1 <= conn.to <= n_mysteries or conn.to == i + 1
    ]
    return out


def _previous_problems(
    prev: LastRoundtable, hosts: Collection[str], previous_turns: int, n_mysteries: int
) -> list[str]:
    out: list[str] = []
    for j, p in enumerate(prev.predictions):
        if hosts and p.host not in hosts:
            out.append(f"previous.predictions.{j}.host: not a host of the last roundtable")
        if p.mystery is not None and not 1 <= p.mystery <= n_mysteries:
            out.append(f"previous.predictions.{j}.mystery: not a mystery's number")
    for j, cb in enumerate(prev.callbacks):
        if hosts and cb.host not in hosts:
            out.append(f"previous.callbacks.{j}.host: not a host of the last roundtable")
        if not 1 <= cb.line <= previous_turns:
            out.append(f"previous.callbacks.{j}.line: not a line of previous.txt")
    return out


def cross_problems(
    dossier: Dossier,
    *,
    dates: Collection[str],
    hosts: Collection[str] = (),
    previous_turns: int | None = None,
) -> list[str]:
    """What the schema cannot check: clue sources, clue ids, mystery numbers, host names and
    transcript lines. Each problem names its location, never the content."""
    n = len(dossier.mysteries)
    out: list[str] = []
    for i, m in enumerate(dossier.mysteries):
        out += _mystery_problems(i, m, dates, n)
    prev = dossier.previous
    if prev is not None and previous_turns is None:
        out.append("previous: this run has no previous.txt (prepare without --previous)")
    elif prev is None and previous_turns is not None:
        out.append("previous: missing, but this run is a follow-up")
    elif prev is not None and previous_turns is not None:
        out += _previous_problems(prev, hosts, previous_turns, n)
    return out


def counts(dossier: Dossier) -> str:
    clues = sum(len(m.clues) for m in dossier.mysteries)
    hyps = sum(len(m.hypotheses) for m in dossier.mysteries)
    text = (
        f"{len(dossier.mysteries)} mysteries, {clues} clues, {hyps} theories, "
        f"{len(dossier.setting)} setting notes"
    )
    if dossier.previous is not None:
        by_status: dict[str, int] = {}
        for p in dossier.previous.predictions:
            by_status[p.status] = by_status.get(p.status, 0) + 1
        statuses = ", ".join(f"{v} {k}" for k, v in by_status.items())
        text += (
            f"; last roundtable: {len(dossier.previous.predictions)} predictions ({statuses}), "
            f"{len(dossier.previous.callbacks)} callbacks"
        )
    return text


@dataclass
class Validation:
    dossier: Dossier | None
    problems: list[str]


def validate_dossier(run_dir: Path, inputs: Inputs | None = None) -> Validation:
    """Load and check ``run_dir/dossier.json``; problems name locations, never content."""
    path = run_dir / DOSSIER
    if not path.is_file():
        return Validation(None, [f"no {DOSSIER} in {run_dir}"])
    try:
        dossier = Dossier.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as err:
        return Validation(None, validation_problems(err))
    src = inputs or Inputs()
    summary = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
    tools, _ = campaign_tools(
        summary["show"],
        summary["latest"],
        content_dir=src.content_dir,
        transcript_dir=src.transcript_dir,
        episodes_dir=src.episodes_dir,
        seasons_path=src.seasons_path,
    )
    prev = summary.get("previous")
    problems = cross_problems(
        dossier,
        dates=tools.dates,
        hosts=prev["hosts"] if prev else (),
        previous_turns=prev["turns"] if prev else None,
    )
    return Validation(dossier, problems)


def write_dossier_md(run_dir: Path, dossier: Dossier, inputs: Inputs | None = None) -> Path:
    """Render the Pass A block to ``dossier.md`` and record the counts in ``summary.json``."""
    src = inputs or Inputs()
    summary_path = run_dir / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    show = summary["show"]
    tools, _ = campaign_tools(
        show,
        summary["latest"],
        content_dir=src.content_dir,
        transcript_dir=src.transcript_dir,
        episodes_dir=src.episodes_dir,
        seasons_path=src.seasons_path,
    )
    block = render_dossier(
        dossier,
        episode_label=episode_labeller(tools, show, src.seasons_path),
        previous_title=(summary.get("previous") or {}).get("title", ""),
    )
    out = run_dir / DOSSIER_MD
    out.write_text(block + "\n", encoding="utf-8")
    summary.update(
        status="ok",
        mysteries=len(dossier.mysteries),
        setting_notes=len(dossier.setting),
        clues=sum(len(m.clues) for m in dossier.mysteries),
        hypotheses=sum(len(m.hypotheses) for m in dossier.mysteries),
    )
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return out
