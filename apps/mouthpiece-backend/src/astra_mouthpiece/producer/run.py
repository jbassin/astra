"""One producer run over one session (0034 §4, D34-5..D34-9).

``run_producer(date)`` loads the session's digest + cleaned turns (``inputs.py``, shared
with ``session_script``), builds the read-only tools (each wrapped for telemetry), builds
two distinct metered LMs (main + sub), runs ``HardenedRLM(ProduceBrief)`` inside the
``mouthpiece.producer.run`` span, repairs the brief's citations, and writes the artifacts
into ``<run_dir>`` — on failure too:

``brief.json`` + ``brief.md`` (only with a brief), ``trajectory.json``, ``warnings.json``,
``summary.json``.

Outcome (D34-8): **ok** — the agent SUBMITted a valid brief; **incomplete** — the cap forced
the extract fallback and it produced a valid brief; **failed** — an exception, or no valid
brief. Nothing here writes outside ``run_dir``.
"""

from __future__ import annotations

import contextlib
import json
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import dspy
from astra_akasha_backend.corpus import CONTENT_DIR
from astra_config import load_config
from astra_config.models import MouthpieceProducerConfig
from astra_linguist.chronicle import (
    EPISODES_DIR,
    SEASONS_PATH,
    TRANSCRIPT_DIR,
    ShowInfo,
    show_for_date,
)
from astra_llm.rlm import (
    HardenedRLM,
    MeteringMixin,
    RunParent,
    combined_cost,
    make_interpreter,
    sandbox_version,
)
from astra_ontology import Resolution
from astra_ontology_entity import resolve
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from ..inputs import cleaned_turns_for, episodes_root, read_digest
from ..models import SessionDigest
from ..roster import build_roster_block
from .brief import CitationReport, ProducerBrief, check_citations, render_brief
from .instructions import ProduceBrief
from .telemetry import ProducerLM, instrument_tool, instruments, log, tracer
from .tools import ProducerTools

RunStatus = Literal["ok", "incomplete", "failed"]
#: ``lm_factory(model, role)`` → a metered dspy LM (``MeteringMixin`` subclass).
LmFactory = Callable[[str, str], Any]
InterpreterFactory = Callable[[], Any]

ARTIFACTS_ROOT = Path(load_config().mouthpiece_producer.artifacts_path)


def budget_note(step: int, max_iterations: int) -> str:
    left = max_iterations - step
    return (
        f"[Budget] Step {step} of {max_iterations} used. Finish your notes and call "
        f"SUBMIT(brief=...) within the next {left} step{'' if left == 1 else 's'}."
    )


def new_run_id(now: datetime | None = None) -> str:
    """A UTC ``YYYYMMDDTHHMMSSZ`` run id."""
    return (now or datetime.now(UTC)).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def render_transcript(turns: list[tuple[int, str, str]]) -> str:
    """The agent's transcript input: ``<line_id>\\t<speaker>: <text>`` per turn."""
    return "\n".join(f"{i}\t{speaker}: {text}" for i, speaker, text in turns)


def wiki_head(content_dir: Path = CONTENT_DIR) -> dict[str, Any]:
    """The last commit touching the wiki tree + whether it has local changes (D34-5).

    Asks git from inside ``content_dir``, so it works whichever repo holds the wiki.
    """

    def git(*args: str) -> str:
        # The dagster-code image has no git; subprocess.run raises FileNotFoundError for a
        # missing binary whatever check= says (0035 D35-7) — degrade to "unknown".
        try:
            proc = subprocess.run(
                ["git", "-C", str(content_dir), *args],
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError:
            return ""
        return proc.stdout.strip() if proc.returncode == 0 else ""

    return {
        "sha": git("log", "-1", "--format=%h", "--", ".") or None,
        "dirty": bool(git("status", "--porcelain", "--", ".")),
    }


def default_lm_factory(cfg: MouthpieceProducerConfig) -> LmFactory:
    """OpenRouter key into env, then a ``ProducerLM`` per role (``cache=False``)."""
    from astra_llm import ensure_openrouter_env, make_dspy_lm

    ensure_openrouter_env()

    def factory(model: str, role: str) -> Any:
        return make_dspy_lm(
            model, max_tokens=cfg.max_tokens, lm_class=ProducerLM, cache=False, role=role
        )

    return factory


def determine_status(*, error: BaseException | None, hit_cap: bool, has_brief: bool) -> RunStatus:
    if not has_brief:
        return "failed"
    if hit_cap:
        return "incomplete"
    return "failed" if error is not None else "ok"


@dataclass
class ProducerInputs:
    """Everything the run reads about the target session."""

    date: str
    show: ShowInfo
    digest: SessionDigest
    cleaned_turns: list[tuple[int, str, str]]
    roster: str


def load_inputs(
    date: str,
    *,
    root: Path | None = None,
    transcript_dir: Path = TRANSCRIPT_DIR,
    shows: dict[str, ShowInfo] | None = None,
) -> ProducerInputs:
    """The target session's digest, cleaned turns, show and roster (read-only)."""
    show = show_for_date(date, transcript_dir=transcript_dir, shows=shows)
    if show is None:
        raise ValueError(f"{date} has no show (no transcript, unknown slug, or excluded)")
    key = date
    digest = read_digest(key, root=root)
    turns = cleaned_turns_for(key, digest, transcript_dir=transcript_dir)
    return ProducerInputs(
        date=date,
        show=show,
        digest=digest,
        cleaned_turns=turns,
        roster=build_roster_block(show.slug),
    )


@dataclass
class ProducerResult:
    status: RunStatus
    run_dir: Path
    summary: dict[str, Any]
    brief: ProducerBrief | None = None
    brief_block: str = ""
    citations: CitationReport | None = None
    error: str | None = None
    artifacts: dict[str, Path] = field(default_factory=dict)


def _write_json(path: Path, data: Any) -> Path:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def run_producer(
    date: str,
    *,
    config: MouthpieceProducerConfig | None = None,
    inputs: ProducerInputs | None = None,
    lm_factory: LmFactory | None = None,
    interpreter_factory: InterpreterFactory | None = None,
    run_dir: Path | None = None,
    content_dir: Path = CONTENT_DIR,
    transcript_dir: Path = TRANSCRIPT_DIR,
    episodes_dir: Path = EPISODES_DIR,
    seasons_path: Path = SEASONS_PATH,
    scripts_root: Path | None = None,
    shows: dict[str, ShowInfo] | None = None,
    resolver: Callable[[str], Resolution] = resolve,
) -> ProducerResult:
    """Run the producer over session ``date`` and write its artifacts into ``run_dir``.

    Raises only for setup errors before the run starts (no show, no digest); every error
    inside the run becomes a ``failed`` result with artifacts.
    """
    cfg = config if config is not None else load_config().mouthpiece_producer
    started = time.monotonic()
    inp = inputs or load_inputs(date, transcript_dir=transcript_dir, shows=shows)
    out = run_dir if run_dir is not None else ARTIFACTS_ROOT / date / new_run_id()
    out.mkdir(parents=True, exist_ok=True)
    head_start = wiki_head(content_dir)

    impl = ProducerTools(
        target_date=date,
        show=inp.show.slug,
        content_dir=content_dir,
        transcript_dir=transcript_dir,
        episodes_dir=episodes_dir,
        seasons_path=seasons_path,
        scripts_root=scripts_root if scripts_root is not None else episodes_root(),
        shows=shows,
        resolver=resolver,
    )
    parent = RunParent()
    tools = [instrument_tool(fn, parent) for fn in impl.tools()]

    factory = lm_factory if lm_factory is not None else default_lm_factory(cfg)
    main_lm = factory(cfg.model, "main")
    sub_lm = factory(cfg.sub_model, "sub")
    if main_lm is sub_lm:
        raise ValueError("lm_factory must return distinct main and sub LM instances")
    for lm in (main_lm, sub_lm):
        if not isinstance(lm, MeteringMixin):
            raise TypeError(f"lm_factory must return metered LMs (got {type(lm).__name__})")
        lm.parent = parent

    interpreter = (interpreter_factory or make_interpreter)()
    rlm = HardenedRLM(
        ProduceBrief,
        max_iterations=cfg.max_iterations,
        max_llm_calls=cfg.max_llm_calls,
        max_output_chars=cfg.max_output_chars,
        tools=tools,
        sub_lm=sub_lm,
        interpreter=interpreter,
        budget_note=budget_note,
    )
    log.info("producer run %s/%s starting (%s)", date, out.name, cfg.model)

    pred: Any = None
    error: BaseException | None = None
    pyodide: str | None = None
    brief: ProducerBrief | None = None
    report: CitationReport | None = None
    block = ""
    with tracer().start_as_current_span("mouthpiece.producer.run") as span:
        parent.ctx = trace.set_span_in_context(span)
        span.set_attribute("mouthpiece.producer.date", date)
        span.set_attribute("mouthpiece.producer.show", inp.show.slug)
        span.set_attribute("mouthpiece.producer.model", cfg.model)
        span.set_attribute("mouthpiece.producer.sub_model", cfg.sub_model)
        span.set_attribute("mouthpiece.producer.wiki_head", head_start["sha"] or "")
        try:
            # Start the sandbox up front: inside the loop dspy turns interpreter errors
            # into "[Error]" REPL output, which would burn every iteration.
            start = getattr(interpreter, "start", None)
            if callable(start):
                start()
            with dspy.context(lm=main_lm):
                pred = rlm(
                    target_date=date,
                    show=inp.show.slug,
                    synopsis=inp.digest.synopsis,
                    roster=inp.roster,
                    transcript=render_transcript(inp.cleaned_turns),
                )
        except BaseException as exc:  # recorded below; non-Exceptions re-raised after artifacts
            error = exc
            span.record_exception(exc)
        finally:
            pyodide = sandbox_version(interpreter)
            with contextlib.suppress(Exception):
                interpreter.shutdown()

        raw = getattr(pred, "brief", None) if pred is not None else None
        try:
            if isinstance(raw, ProducerBrief):
                brief = raw
            elif raw is not None:
                brief = ProducerBrief.model_validate(raw)
        except Exception as exc:  # the extract fallback produced something unusable
            if error is None:
                error = exc
        if brief is not None:
            brief, report = check_citations(
                brief,
                line_ids=(i for i, _s, _t in inp.cleaned_turns),
                pages=impl.pages,
                dates=impl.dates,
            )
            block = render_brief(brief)

        status = determine_status(error=error, hit_cap=rlm.hit_cap, has_brief=brief is not None)
        head_end = wiki_head(content_dir)
        artifacts: dict[str, Path] = {}
        if brief is not None:
            artifacts["brief"] = _write_json(out / "brief.json", brief.model_dump())
            (out / "brief.md").write_text(block + "\n", encoding="utf-8")
            artifacts["brief_md"] = out / "brief.md"
        trajectory = (
            list(pred.trajectory)
            if pred is not None and getattr(pred, "trajectory", None)
            else rlm.trajectory()
        )
        artifacts["trajectory"] = _write_json(
            out / "trajectory.json",
            {
                "status": status,
                "parse_errors": rlm.parse_errors,
                "final_reasoning": str(getattr(pred, "final_reasoning", "") or ""),
                "entries": trajectory,
            },
        )
        artifacts["warnings"] = _write_json(
            out / "warnings.json",
            {
                "citations_total": report.total if report else 0,
                "citations_bad": report.bad if report else 0,
                "drop_rate": round(report.drop_rate, 4) if report else None,
                "warnings": report.warnings if report else [],
            },
        )

        main_m, sub_m = main_lm.meter.snapshot(), sub_lm.meter.snapshot()
        cost = combined_cost([main_m, sub_m])
        err_text = f"{type(error).__name__}: {error}" if error is not None else None
        summary: dict[str, Any] = {
            "date": date,
            "show": inp.show.slug,
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
            "wiki_head": {"start": head_start, "end": head_end},
            "pyodide": pyodide,
            "cleaned_lines": len(inp.cleaned_turns),
            "permitted_sessions": len(impl.dates),
            "counts": (
                {
                    "moments": len(brief.moments),
                    "lore": len(brief.lore),
                    "lore_with_page": sum(1 for n in brief.lore if n.page),
                    "callbacks": len(brief.callbacks),
                    "open_threads": len(brief.open_threads),
                    "newcomer_questions": len(brief.newcomer_questions),
                }
                if brief is not None
                else None
            ),
            "error": err_text,
        }
        artifacts["summary"] = _write_json(out / "summary.json", summary)

        span.set_attribute("mouthpiece.producer.status", status)
        span.set_attribute("mouthpiece.producer.iterations", rlm.iterations)
        span.set_attribute("mouthpiece.producer.parse_errors", rlm.parse_errors)
        if cost is not None:
            span.set_attribute("mouthpiece.producer.cost_usd", cost)
        if status == "failed":
            span.set_status(Status(StatusCode.ERROR, (err_text or "no valid brief")[:500]))
        instruments()["runs"].add(1, {"status": status})
    log.info(
        "producer run %s/%s %s: %d iterations, cost %s",
        date,
        out.name,
        status,
        rlm.iterations,
        f"${cost:.4f}" if cost is not None else "unknown",
    )
    if error is not None and not isinstance(error, Exception):
        raise error
    return ProducerResult(
        status=status,
        run_dir=out,
        summary=summary,
        brief=brief,
        brief_block=block,
        citations=report,
        error=err_text,
        artifacts=artifacts,
    )
