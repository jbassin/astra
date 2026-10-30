"""One agent run over one session.

``run_session(date)`` creates the staging workspace, builds the tools (each wrapped for
telemetry), builds two distinct metered LMs (main + sub), runs ``HeartwoodRLM`` over the
target transcript inside the ``heartwood.agent.run`` span, decides the outcome, and
writes the run artifacts — on failure too:

``<run>/ops.jsonl`` (the journal, written as it goes), ``trajectory.json``,
``changeset.json``, ``diff.patch``, ``summary.json``. Before the change-set and diff are
written, every page the run created, updated or moved gains the run's campaign in its
``campaigns`` frontmatter (``campaigns.stamp_campaign``).

Outcome: **ok** — the agent called ``SUBMIT``; **incomplete** — the iteration
cap forced the extract fallback; **failed** — an exception escaped the main loop.
Nothing here publishes: ``publish-sync`` is a separate step.

Sandbox environment: dspy launches bare ``deno`` with ``os.environ`` (dspy 3.2.1
``primitives/python_interpreter.py:142,329``), so ``prepare_sandbox_env`` puts
``~/.deno/bin`` on PATH, disables Deno's package.json auto-discovery (the repo root's
``package.json`` + ``node_modules`` otherwise make ``npm:pyodide`` unresolvable), and
points ``DENO_DIR`` at the *real* path of the Deno cache (``$HOME`` is a symlink here,
and Deno's ``--allow-read`` grant on the symlinked path does not cover the resolved
one).
"""

from __future__ import annotations

import contextlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import dspy
from astra_akasha_backend.corpus import CONTENT_DIR
from astra_config import load_config
from astra_config.models import HeartwoodConfig
from astra_linguist.chronicle import TRANSCRIPT_DIR

# Sandbox helpers live in astra_llm.rlm; re-exported for callers and the
# `heartwood-sandbox-warm` recipe, which imports them from here.
from astra_llm.rlm import deno_available as deno_available
from astra_llm.rlm import make_interpreter as make_interpreter
from astra_llm.rlm import prepare_sandbox_env as prepare_sandbox_env
from astra_llm.rlm import sandbox_version as sandbox_version
from astra_ontology import Resolution
from astra_ontology.models import Being
from astra_ontology_entity import resolve
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from .campaigns import campaign_context, stamp_campaign
from .instructions import MaintainWiki
from .rlm import HeartwoodRLM, MeteringMixin
from .sessions import faerrin_session
from .telemetry import RunParent, instrument_tool, instruments, log, tracer
from .tools import HeartwoodTools
from .validate import Validator, node_validator
from .workspace import ARTIFACTS_ROOT, ChangeSet, Workspace

RunStatus = Literal["ok", "incomplete", "failed"]
#: ``lm_factory(model, role)`` → a metered dspy LM (``MeteringMixin`` subclass).
LmFactory = Callable[[str, str], Any]
#: ``interpreter_factory()`` → a dspy ``CodeInterpreter`` (``PythonInterpreter`` by default).
InterpreterFactory = Callable[[], Any]


def default_lm_factory(cfg: HeartwoodConfig) -> LmFactory:
    """The production factory: OpenRouter key into env, then a ``MeteredLM`` per role
    via ``astra_llm.make_dspy_lm`` (``cache=False`` — reruns must be real calls)."""
    from astra_llm import ensure_openrouter_env, make_dspy_lm

    from .rlm import MeteredLM

    ensure_openrouter_env()

    def factory(model: str, role: str) -> Any:
        return make_dspy_lm(
            model, max_tokens=cfg.max_tokens, lm_class=MeteredLM, cache=False, role=role
        )

    return factory


# ── outcome ────────────────────────────────────────────────────────────────
def determine_status(*, error: BaseException | None, hit_cap: bool) -> RunStatus:
    """The run's outcome. ``hit_cap`` wins over an error: an exception from the forced extract after
    the cap still leaves the run *incomplete* (the loop itself ended at the cap)."""
    if hit_cap:
        return "incomplete"
    if error is not None:
        return "failed"
    return "ok"


EXIT_CODES: dict[str, int] = {"ok": 0, "incomplete": 2, "failed": 1}


@dataclass
class RunResult:
    status: RunStatus
    run_dir: Path
    summary: dict[str, Any]
    changeset: ChangeSet | None = None
    changelog: str = ""
    error: str | None = None
    artifacts: dict[str, Path] = field(default_factory=dict)

    @property
    def exit_code(self) -> int:
        return EXIT_CODES[self.status]


def _combined_cost(meters: list[dict[str, Any]]) -> float | None:
    costs = [m["cost_usd"] for m in meters]
    if any(c is None for c in costs):
        return None
    return round(sum(costs), 6)


def _write_json(path: Path, data: Any) -> Path:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def _stamp(ws: Workspace, campaign: str, errors: list[str]) -> None:
    """Add the run's campaign to every page it touched; a failure joins ``errors``."""
    try:
        stamp_campaign(ws, campaign)
    except (RuntimeError, OSError, ValueError) as exc:  # journal/staging drift, a bad page
        errors.append(f"campaigns: {exc}")


# ── the run ────────────────────────────────────────────────────────────────
def run_session(
    date: str,
    *,
    dry_run: bool = True,
    config: HeartwoodConfig | None = None,
    lm_factory: LmFactory | None = None,
    interpreter_factory: InterpreterFactory | None = None,
    validator: Validator = node_validator,
    content_dir: Path = CONTENT_DIR,
    artifacts_root: Path = ARTIFACTS_ROOT,
    transcript_dir: Path = TRANSCRIPT_DIR,
    being: Being | None = None,
    resolver: Callable[[str], Resolution] = resolve,
    run_id: str | None = None,
) -> RunResult:
    """Stage, run the agent over session ``date``, and write the artifacts.

    Never publishes. Raises only for setup errors before the run starts (e.g. ``date``
    is not an ingestible faerrin session); every error inside the run becomes a
    ``failed`` result with artifacts. ``dry_run`` is recorded in ``summary.json``.
    """
    cfg = config if config is not None else load_config().heartwood
    if faerrin_session(date, being=being, transcript_dir=transcript_dir) is None:
        raise ValueError(f"{date} is not an ingestible faerrin-world session")
    started = time.monotonic()
    ws = Workspace.create(
        date, content_dir=content_dir, artifacts_root=artifacts_root, run_id=run_id
    )
    impl = HeartwoodTools(
        ws,
        target_date=date,
        validator=validator,
        transcript_dir=transcript_dir,
        being=being,
        resolver=resolver,
    )
    transcript = impl.read_transcript(date)
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

    # A caller-supplied interpreter is left running by RLM (rlm.py:401-403); we own it.
    interpreter = (interpreter_factory or make_interpreter)()
    rlm = HeartwoodRLM(
        MaintainWiki,
        max_iterations=cfg.max_iterations,
        max_llm_calls=cfg.max_llm_calls,
        max_output_chars=cfg.max_output_chars,
        tools=tools,
        sub_lm=sub_lm,
        interpreter=interpreter,
    )
    log.info(
        "heartwood run %s/%s starting (%s, dry_run=%s)", date, ws.run_dir.name, cfg.model, dry_run
    )

    pred: Any = None
    error: BaseException | None = None
    pyodide: str | None = None
    with tracer().start_as_current_span("heartwood.agent.run") as span:
        parent.ctx = trace.set_span_in_context(span)
        span.set_attribute("heartwood.date", date)
        span.set_attribute("heartwood.campaign", impl.campaign)
        span.set_attribute("heartwood.model", cfg.model)
        span.set_attribute("heartwood.sub_model", cfg.sub_model)
        span.set_attribute("heartwood.run_id", ws.run_dir.name)
        span.set_attribute("heartwood.dry_run", dry_run)

        try:
            # Start the sandbox up front: once inside the loop, dspy turns interpreter
            # errors (incl. "Deno not found") into "[Error]" REPL output (rlm.py:536-539),
            # which would burn every iteration instead of failing the run.
            start = getattr(interpreter, "start", None)
            if callable(start):
                start()
            with dspy.context(lm=main_lm):
                pred = rlm(
                    target_date=date,
                    campaign=impl.campaign,
                    campaign_context=campaign_context(impl.campaign, being),
                    transcript=transcript,
                )
        except BaseException as exc:  # noqa: BLE001 -- recorded below; non-Exceptions re-raised after artifacts
            error = exc
            span.record_exception(exc)
        finally:
            pyodide = sandbox_version(interpreter)
            with contextlib.suppress(Exception):
                interpreter.shutdown()

        status = determine_status(error=error, hit_cap=rlm.hit_cap)
        changelog = str(getattr(pred, "changelog", "") or "") if pred is not None else ""
        trajectory = (
            list(pred.trajectory)
            if pred is not None and getattr(pred, "trajectory", None)
            else rlm.trajectory()
        )

        artifacts: dict[str, Path] = {"ops": ws.journal_path}
        artifacts["trajectory"] = _write_json(
            ws.run_dir / "trajectory.json",
            {
                "status": status,
                "parse_errors": rlm.parse_errors,
                "final_reasoning": str(getattr(pred, "final_reasoning", "") or ""),
                "entries": trajectory,
            },
        )
        cs: ChangeSet | None = None
        artifact_errors: list[str] = []
        _stamp(ws, impl.campaign, artifact_errors)
        try:
            cs = ws.write_changeset()
            artifacts["changeset"] = ws.run_dir / "changeset.json"
        except Exception as exc:  # noqa: BLE001 -- journal/staging drift: report it, don't mask the run
            artifact_errors.append(f"changeset: {exc}")
        try:
            artifacts["diff"] = ws.diff_patch()
        except Exception as exc:  # noqa: BLE001 -- reported with the run, like the changeset above
            artifact_errors.append(f"diff: {exc}")

        main_m, sub_m = main_lm.meter.snapshot(), sub_lm.meter.snapshot()
        cost = _combined_cost([main_m, sub_m])
        counts = {
            "created": len(cs.created) if cs else None,
            "updated": len(cs.updated) if cs else None,
            "moved": len(cs.moved) if cs else None,
            "deleted": len(cs.deleted) if cs else None,
        }
        tokens = sum(m["prompt_tokens"] + m["completion_tokens"] for m in (main_m, sub_m))
        err_text = f"{type(error).__name__}: {error}" if error is not None else None
        summary = {
            "status": status,
            "date": date,
            "campaign": impl.campaign,
            "run_id": ws.run_dir.name,
            "dry_run": dry_run,
            "model": cfg.model,
            "sub_model": cfg.sub_model,
            "iterations": rlm.iterations,
            "max_iterations": cfg.max_iterations,
            "hit_cap": rlm.hit_cap,
            "parse_errors": rlm.parse_errors,
            "main": main_m,
            "sub": sub_m,
            "tokens": tokens,
            "cost_usd": cost,
            "counts": counts,
            "duration_s": round(time.monotonic() - started, 3),
            "pyodide": pyodide,
            "error": err_text,
            "artifact_errors": artifact_errors,
            "changelog": changelog,
        }
        artifacts["summary"] = _write_json(ws.run_dir / "summary.json", summary)

        span.set_attribute("heartwood.status", status)
        span.set_attribute("heartwood.iterations", rlm.iterations)
        span.set_attribute("heartwood.main_calls", main_m["calls"])
        span.set_attribute("heartwood.sub_calls", sub_m["calls"])
        span.set_attribute("heartwood.tokens", tokens)
        span.set_attribute("heartwood.cost_usd", cost if cost is not None else "unknown")
        for op, n in counts.items():
            span.set_attribute(f"heartwood.pages_{op}", n if n is not None else -1)
        if status != "ok":
            span.set_status(Status(StatusCode.ERROR, err_text or status))

    m = instruments()
    m["runs"].add(1, {"status": status})
    if status == "ok":
        for op, n in counts.items():
            if n:
                m["pages"].add(n, {"op": op})
    log.info(
        "heartwood run %s/%s %s: %d iterations, %d+%d LM calls, cost %s, pages %s",
        date,
        ws.run_dir.name,
        status,
        rlm.iterations,
        main_m["calls"],
        sub_m["calls"],
        f"${cost:.4f}" if cost is not None else "unknown",
        counts,
    )
    if error is not None and not isinstance(error, Exception):
        raise error
    return RunResult(
        status=status,
        run_dir=ws.run_dir,
        summary=summary,
        changeset=cs,
        changelog=changelog,
        error=err_text,
        artifacts=artifacts,
    )
