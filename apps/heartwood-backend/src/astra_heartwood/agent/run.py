"""One agent run over one session (0033 D33-7..D33-11, §6 S3).

``run_session(date)`` creates the staging workspace, builds the tools (each wrapped for
telemetry), builds two distinct metered LMs (main + sub), runs ``HeartwoodRLM`` over the
target transcript inside the ``heartwood.agent.run`` span, decides the outcome, and
writes the run artifacts — on failure too:

``<run>/ops.jsonl`` (the journal, written as it goes), ``trajectory.json``,
``changeset.json``, ``diff.patch``, ``summary.json``.

Outcome (D33-9): **ok** — the agent called ``SUBMIT``; **incomplete** — the iteration
cap forced the extract fallback; **failed** — an exception escaped the main loop.
Nothing here publishes: ``publish-sync`` is a separate step (§5, S4).

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
import os
import shutil
import subprocess
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
from astra_ontology import Resolution
from astra_ontology.models import Being
from astra_ontology_entity import resolve
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

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

DENO_BIN = Path.home() / ".deno" / "bin"


# ── sandbox ────────────────────────────────────────────────────────────────
def prepare_sandbox_env() -> None:
    """Make dspy's ``PythonInterpreter`` launchable from this process (module docstring).

    Idempotent; only fills in what is unset. Call before the first interpreter is built
    (``PythonInterpreter._get_deno_dir`` is ``lru_cache``d on first use).
    """
    if shutil.which("deno") is None and (DENO_BIN / "deno").is_file():
        os.environ["PATH"] = f"{DENO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
    os.environ.setdefault("DENO_NO_PACKAGE_JSON", "1")
    if "DENO_DIR" not in os.environ and shutil.which("deno") is not None:
        proc = subprocess.run(
            ["deno", "info", "--json"], capture_output=True, text=True, check=False
        )
        if proc.returncode == 0:
            deno_dir = json.loads(proc.stdout).get("denoDir")
            if deno_dir:
                os.environ["DENO_DIR"] = os.path.realpath(deno_dir)


def deno_available() -> bool:
    prepare_sandbox_env()
    return shutil.which("deno") is not None


def sandbox_version(interpreter: Any) -> str | None:
    """The Pyodide + Python version inside ``interpreter`` (best effort, else ``None``)."""
    try:
        out = interpreter.execute(
            "import pyodide, sys\nprint(pyodide.__version__, sys.version.split()[0])"
        )
    except Exception:
        return None
    return str(out).strip() or None


def make_interpreter() -> Any:
    from dspy.primitives.python_interpreter import PythonInterpreter

    prepare_sandbox_env()
    return PythonInterpreter()


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
    """D33-9. ``hit_cap`` wins over an error: an exception from the forced extract after
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
    """Stage, run the agent over session ``date``, and write the artifacts (D33-11).

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
                pred = rlm(target_date=date, campaign=impl.campaign, transcript=transcript)
        except BaseException as exc:  # recorded below; non-Exceptions re-raised after artifacts
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
        try:
            cs = ws.write_changeset()
            artifacts["changeset"] = ws.run_dir / "changeset.json"
        except Exception as exc:  # journal/staging drift — report, don't mask the run
            artifact_errors.append(f"changeset: {exc}")
        try:
            artifacts["diff"] = ws.diff_patch()
        except Exception as exc:
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
