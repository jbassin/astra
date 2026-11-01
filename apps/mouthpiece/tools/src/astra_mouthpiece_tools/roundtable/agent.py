"""The dossier agent: one ``HardenedRLM(MapMysteries)`` run over a whole campaign.

It reuses the producer's read-only tools (``ProducerTools``) bound to a cutoff after the
latest session, so every session of the show is readable and nothing else is. Inputs are
immutable values only (0033 gotcha). The run mirrors ``producer.run.run_producer``: same
metered LMs, sandbox, telemetry seams and artifact set. The dossier is used as submitted
(the stakeholder chose speculation over an evidence gate).

Artifacts in ``run_dir``: ``overview.md``, ``astra.md``, ``dossier.json`` + ``dossier.md``,
``trajectory.json``, ``summary.json``.
"""

from __future__ import annotations

import contextlib
import time
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

import dspy
from astra_akasha_backend.corpus import CONTENT_DIR
from astra_config import load_config
from astra_config.models import MouthpieceProducerConfig
from astra_linguist.chronicle import (
    EPISODES_DIR,
    SEASONS_PATH,
    TRANSCRIPT_DIR,
    Chronicle,
)
from astra_llm.rlm import (
    HardenedRLM,
    MeteringMixin,
    RunParent,
    combined_cost,
    make_interpreter,
    sandbox_version,
)
from astra_mouthpiece.inputs import episodes_root
from astra_mouthpiece.producer.run import (
    ARTIFACTS_ROOT,
    _write_json,
    budget_note,
    default_lm_factory,
    determine_status,
    new_run_id,
    wiki_head,
)
from astra_mouthpiece.producer.telemetry import instrument_tool, instruments, log, tracer
from astra_mouthpiece.producer.tools import ProducerTools
from astra_mouthpiece.roster import build_roster_block
from astra_sessions import format_date, to_date
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from .astra import build_astra_block
from .dossier import Dossier, render_dossier

#: A campaign-wide survey reads far more than one session's brief: triple the producer's caps.
ITERATION_FACTOR = 3


class MapMysteries(dspy.Signature):
    """You are the research producer for a special episode of a podcast about a Pathfinder
    2e tabletop campaign. This episode is not a recap. It is a PREDICTION ROUNDTABLE: three
    hosts talk through the campaign's biggest open mysteries and make their best guesses
    about what is really going on. You do not write dialogue. You build the file the hosts
    will reason from. The game master knows every answer and will listen, curious which
    breadcrumbs the hosts picked up. So every theory starts from something that really
    happened at the table, and then it is allowed to leap: predictions need speculation.

    `campaign_overview` lists every season and session of `show` (dates, titles,
    synopses, cliffhangers) through `latest_date`. `roster` maps players to their
    characters, with each character's background. `astra` lists the GM's other games
    set in the same meta-setting, the Astra (earlier campaigns and one-shots, mostly
    with the same players). The tools read every session transcript of `show`, every
    chronicle entry, earlier podcast scripts, and the whole wiki, which covers those
    other games too: a page's front matter `campaigns: [<tag>]` says which game it is
    known from. Their gods, cosmic powers, organizations and history belong to this
    campaign's world, and the deepest mysteries often run through them.

    Work in this order:

    1. Candidates. List the unresolved questions, and favour two kinds above all others:
       - the BIG story: who is really behind the forces moving against the world and the
         party, what the cosmic powers want, where the main journey is heading;
       - questions CLOSE TO THE PARTY: the player characters' own pasts, bodies, bargains
         and patrons, the people who matter to them, what was done to them and why.
       Skip small local puzzles that do not touch either. Prefer mysteries with
       breadcrumbs scattered across several sessions. Look for where this campaign's
       threads meet the wider Astra: a power, place or name the party met that the
       earlier games' pages also describe.
    2. Still open? For each candidate, search the LATER sessions (`search_transcripts`,
       `read_episode`) to make sure it was not already answered on screen. Drop anything
       resolved. Keep 10 to 16 mysteries, biggest and most personal first. Err on the side
       of more: the writer will pick the strongest for the episode, so surface options.
    3. Clues. For each mystery, gather 3 to 8 clues: words copied from a tool result,
       either a transcript line (give `date` and `line`, the number at the start of that
       line) or a wiki page (give `page`), 5 to 40 words, with your reading of it in
       `shows`. Copy, do not paraphrase. The best clues are what the players were shown:
       the Gamemaster's narration and descriptions, what NPCs said (the Gamemaster voices
       them), and the wiki. A player character's own theorizing at the table is worth
       including as what the table already suspects. Wiki pages from the earlier
       games are good clues when they bear on this campaign's mystery.
    4. Background and connections. For each mystery write `background`: 3 to 6
       sentences of what is established (who and what is involved, what the party has
       seen and been told, the world context a listener needs), so the hosts can explain
       the mystery before they theorize. In `connections`, note each other mystery in
       the file it ties to (by its 1-based number) and how.
    5. Hypotheses. For each mystery write 2 to 6 competing explanations, from safe to
       bold. Each starts from clue ids in that mystery (`supported_by`; clues that cut
       against it go in `complicated_by`). Combine clues, and then go further: if the
       theory steps beyond what the clues show, say what that step is in `leap`. Use
       only lore from the GM's own world, the Astra (this campaign and the games in
       `astra`); the world is homebrew, and published Pathfinder setting lore does not
       apply. Grade honestly: "strong" when several clues point the
       same way, "long shot" for a fun leap the clues merely allow. In `would_confirm`,
       say what in-world event would settle it.
    6. The wider setting. In `setting`, write 6 to 12 notes on the cosmology, powers,
       organizations and history the theories lean on (for example the gods and what
       they want, how the worlds of the Astra relate, what the earlier campaigns
       revealed), each naming its wiki pages and the mysteries it bears on. This is
       the writer's background reading, so make it accurate and specific.

    Leave out rules mechanics and dice. Use `llm_query` sparingly (for example to skim a
    long transcript for one topic); prefer the search tools, and read the lines around a
    search hit before quoting it. When the file is complete, call SUBMIT(dossier={...})
    with a dict matching the output schema. Do not wait for the step limit."""

    show: str = dspy.InputField(desc="the campaign slug")
    latest_date: str = dspy.InputField(desc="the most recent session, YYYY-M-D")
    campaign_overview: str = dspy.InputField(desc="every season and session, in order")
    roster: str = dspy.InputField(desc="players and their characters")
    astra: str = dspy.InputField(desc="the GM's other games in the same meta-setting")
    dossier: Dossier = dspy.OutputField(desc="the evidence file")


# ── inputs ──
def cutoff_after(latest: str) -> str:
    """A ``YYYY-M-D`` date strictly after ``latest`` (the tools serve dates before it)."""
    return format_date(to_date(latest) + timedelta(days=1))


def season_titles(show: str, seasons_path: Path = SEASONS_PATH) -> dict[str, str]:
    """date → 'Season N, "Title"' for every placed session of ``show``."""
    if not seasons_path.is_file():
        return {}
    chronicle = Chronicle.model_validate_json(seasons_path.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for sc in chronicle.shows:
        if sc.show == show:
            for s in sc.seasons:
                for d in s.episode_dates:
                    out[d] = f'Season {s.number}, "{s.title}"'
    return out


def build_overview(tools: ProducerTools, show: str, seasons_path: Path = SEASONS_PATH) -> str:
    """Seasons (title + arc) then every session: date, title, synopsis, cliffhanger."""
    lines: list[str] = []
    if seasons_path.is_file():
        chronicle = Chronicle.model_validate_json(seasons_path.read_text(encoding="utf-8"))
        for sc in chronicle.shows:
            if sc.show == show:
                lines.append("SEASONS")
                lines += [f"- Season {s.number}, {s.title}: {s.arc_summary}" for s in sc.seasons]
                lines.append("")
    seasons = season_titles(show, seasons_path)
    lines.append("SESSIONS")
    for ep in tools.list_episodes():
        entry = tools.episodes.get(ep["date"])
        hook = (
            f" Left off: {entry.summary.cliffhanger}" if entry and entry.summary.cliffhanger else ""
        )
        where = seasons.get(ep["date"], "unplaced")
        lines.append(f"- {ep['date']} ({where}) {ep['title']}: {ep['synopsis']}{hook}")
    return "\n".join(lines)


def episode_labeller(tools: ProducerTools, show: str, seasons_path: Path = SEASONS_PATH) -> Any:
    seasons = season_titles(show, seasons_path)

    def label(date: str) -> str:
        entry = tools.episodes.get(date)
        title = f', episode "{entry.summary.title}"' if entry else ""
        return f"{seasons.get(date, 'session')}{title} ({date})"

    return label


# ── the run ──
@dataclass
class DossierResult:
    status: str
    run_dir: Path
    summary: dict[str, Any]
    dossier: Dossier | None
    block: str


def run_dossier(
    show: str,
    *,
    latest: str | None = None,
    config: MouthpieceProducerConfig | None = None,
    lm_factory: Any = None,
    interpreter_factory: Any = None,
    run_dir: Path | None = None,
    content_dir: Path = CONTENT_DIR,
    transcript_dir: Path = TRANSCRIPT_DIR,
    episodes_dir: Path = EPISODES_DIR,
    seasons_path: Path = SEASONS_PATH,
    scripts_root: Path | None = None,
    shows: Any = None,
) -> DossierResult:
    """Survey ``show`` through ``latest`` (default: its newest transcript) and write the
    dossier into ``run_dir``. Every error inside the run becomes ``failed``."""
    base = config if config is not None else load_config().mouthpiece_producer
    cfg = base.model_copy(
        update={
            "max_iterations": base.max_iterations * ITERATION_FACTOR,
            "max_llm_calls": base.max_llm_calls * ITERATION_FACTOR,
        }
    )
    started = time.monotonic()
    probe = ProducerTools(
        target_date="9999-12-31",
        show=show,
        content_dir=content_dir,
        transcript_dir=transcript_dir,
        episodes_dir=episodes_dir,
        seasons_path=seasons_path,
        scripts_root=scripts_root if scripts_root is not None else episodes_root(),
        shows=shows,
    )
    if not probe.dates:
        raise ValueError(f"show {show!r} has no sessions")
    latest = latest or probe.dates[-1]
    tools_impl = ProducerTools(
        target_date=cutoff_after(latest),
        show=show,
        content_dir=content_dir,
        transcript_dir=transcript_dir,
        episodes_dir=episodes_dir,
        seasons_path=seasons_path,
        scripts_root=scripts_root if scripts_root is not None else episodes_root(),
        shows=shows,
    )
    out = run_dir if run_dir is not None else ARTIFACTS_ROOT / f"roundtable-{latest}" / new_run_id()
    out.mkdir(parents=True, exist_ok=True)
    overview = build_overview(tools_impl, show, seasons_path)
    (out / "overview.md").write_text(overview + "\n", encoding="utf-8")
    astra = build_astra_block(show, content_dir=content_dir)
    (out / "astra.md").write_text(astra + "\n", encoding="utf-8")
    head_start = wiki_head()

    parent = RunParent()
    tools = [instrument_tool(fn, parent) for fn in tools_impl.tools()]
    factory = lm_factory if lm_factory is not None else default_lm_factory(cfg)
    main_lm, sub_lm = factory(cfg.model, "main"), factory(cfg.sub_model, "sub")
    for lm in (main_lm, sub_lm):
        if not isinstance(lm, MeteringMixin):
            raise TypeError(f"lm_factory must return metered LMs (got {type(lm).__name__})")
        lm.parent = parent
    interpreter = (interpreter_factory or make_interpreter)()
    rlm = HardenedRLM(
        MapMysteries,
        max_iterations=cfg.max_iterations,
        max_llm_calls=cfg.max_llm_calls,
        max_output_chars=cfg.max_output_chars,
        tools=tools,
        sub_lm=sub_lm,
        interpreter=interpreter,
        budget_note=lambda step, cap: budget_note(step, cap).replace("brief", "dossier"),
    )
    log.info("roundtable dossier %s through %s starting (%s)", show, latest, cfg.model)

    pred: Any = None
    error: BaseException | None = None
    dossier: Dossier | None = None
    block = ""
    with tracer().start_as_current_span("mouthpiece.roundtable.dossier") as span:
        parent.ctx = trace.set_span_in_context(span)
        span.set_attribute("mouthpiece.roundtable.show", show)
        span.set_attribute("mouthpiece.roundtable.latest", latest)
        span.set_attribute("mouthpiece.roundtable.model", cfg.model)
        try:
            start = getattr(interpreter, "start", None)
            if callable(start):
                start()
            with dspy.context(lm=main_lm):
                pred = rlm(
                    show=show,
                    latest_date=latest,
                    campaign_overview=overview,
                    roster=build_roster_block(show),
                    astra=astra,
                )
        except BaseException as exc:  # noqa: BLE001 -- recorded below; non-Exceptions re-raised after artifacts
            error = exc
            span.record_exception(exc)
        finally:
            pyodide = sandbox_version(interpreter)
            with contextlib.suppress(Exception):
                interpreter.shutdown()

        raw = getattr(pred, "dossier", None) if pred is not None else None
        try:
            if isinstance(raw, Dossier):
                dossier = raw
            elif raw is not None:
                dossier = Dossier.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 -- the extract fallback produced something unusable
            if error is None:
                error = exc
        if dossier is not None:
            _write_json(out / "dossier.json", dossier.model_dump())
            block = render_dossier(
                dossier, episode_label=episode_labeller(tools_impl, show, seasons_path)
            )
            (out / "dossier.md").write_text(block + "\n", encoding="utf-8")

        status = determine_status(error=error, hit_cap=rlm.hit_cap, has_brief=dossier is not None)
        trajectory = (
            list(pred.trajectory)
            if pred is not None and getattr(pred, "trajectory", None)
            else rlm.trajectory()
        )
        _write_json(
            out / "trajectory.json",
            {
                "status": status,
                "parse_errors": rlm.parse_errors,
                "final_reasoning": str(getattr(pred, "final_reasoning", "") or ""),
                "entries": trajectory,
            },
        )
        main_m, sub_m = main_lm.meter.snapshot(), sub_lm.meter.snapshot()
        cost = combined_cost([main_m, sub_m])
        err_text = f"{type(error).__name__}: {error}" if error is not None else None
        summary: dict[str, Any] = {
            "show": show,
            "latest": latest,
            "run_id": out.name,
            "status": status,
            "model": cfg.model,
            "sub_model": cfg.sub_model,
            "max_iterations": cfg.max_iterations,
            "iterations": rlm.iterations,
            "parse_errors": rlm.parse_errors,
            "hit_cap": rlm.hit_cap,
            "lm": {"main": main_m, "sub": sub_m},
            "cost_usd": cost,
            "seconds": round(time.monotonic() - started, 1),
            "wiki_head": {"start": head_start, "end": wiki_head()},
            "pyodide": pyodide,
            "sessions": len(tools_impl.dates),
            "mysteries": len(dossier.mysteries) if dossier else 0,
            "error": err_text,
        }
        _write_json(out / "summary.json", summary)
        span.set_attribute("mouthpiece.roundtable.status", status)
        span.set_attribute("mouthpiece.roundtable.iterations", rlm.iterations)
        if cost is not None:
            span.set_attribute("mouthpiece.roundtable.cost_usd", cost)
        if status == "failed":
            span.set_status(Status(StatusCode.ERROR, (err_text or "no dossier")[:500]))
        instruments()["runs"].add(1, {"status": status, "kind": "roundtable"})
    if error is not None and not isinstance(error, Exception):
        raise error
    return DossierResult(
        status=status,
        run_dir=out,
        summary=summary,
        dossier=dossier,
        block=block,
    )
