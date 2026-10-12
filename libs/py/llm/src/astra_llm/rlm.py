"""Shared ``dspy.RLM`` machinery (lifted from heartwood 0033 by 0034 D34-1).

Not imported by ``astra_llm/__init__`` — it pulls in dspy's RLM and OpenTelemetry, and
``import astra_llm`` should stay light. Import ``astra_llm.rlm`` explicitly.

**``LmMeter`` / ``RunParent``** — a thread-safe per-role cost/token accumulator and a
mutable holder for the run span's context. Both return themselves from ``__deepcopy__``:
``dspy.LM.copy()`` deep-copies the LM (dspy 3.2.1 ``clients/base_lm.py:203``) and a copy
must keep reporting into the same accumulator and the same run span. Spans are parented
**explicitly** through ``RunParent``: ``llm_query_batched`` runs sub-LM calls on a raw
``ThreadPoolExecutor`` that drops contextvars (``predict/rlm.py:266-267``).

**``MeteringMixin``** — meters ``dspy.LM.forward``: one span per call, the ``LmMeter``,
and the tokens/cost counters. The hook is ``forward``: it sees the raw provider response,
the same object ``BaseLM._process_lm_response`` turns into ``history[-1]["usage"]`` /
``["cost"]`` (``base_lm.py:109-110``); litellm fills ``response_cost`` from OpenRouter's
reported cost. The tracer, instruments, span name and attribute prefix are overridable
hooks, so a caller (heartwood) can bind them to its own module-level functions.

**``HardenedRLM``** — a ``dspy.RLM`` that absorbs one malformed main-LM reply
(``AdapterParseError`` costs an iteration, not the run), mirrors the REPL history onto
``self`` each step, flags ``hit_cap`` when the iteration cap forces the extract fallback,
and appends a caller-supplied budget note near the cap.

**Sandbox helpers** — make dspy's ``PythonInterpreter`` (Deno + Pyodide) launchable on this
host: ``~/.deno/bin`` on PATH, ``DENO_NO_PACKAGE_JSON`` (the repo's package.json otherwise
makes ``npm:pyodide`` unresolvable), and ``DENO_DIR`` at the *real* cache path (``$HOME``
is a symlink and Deno's read grant on it does not cover the resolved path).
"""

from __future__ import annotations

import functools
import json
import math
import os
import re
import shutil
import subprocess
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from fractions import Fraction
from functools import cache
from pathlib import Path
from typing import Any

import dspy
from astra_observe import get_logger, get_meter, get_tracer
from dspy.primitives.prediction import Prediction
from dspy.primitives.repl_types import REPLHistory, REPLVariable
from dspy.utils.exceptions import AdapterParseError
from opentelemetry import context as otel_context
from opentelemetry.trace import Status, StatusCode

log = get_logger("astra.llm.rlm")

#: The history entry a malformed reply becomes.
PARSE_ERROR_OUTPUT = (
    "[Error] could not parse your reply; answer with reasoning + a python code block"
)
#: How much of the unparseable reply is echoed back (enough to see what went wrong).
PARSE_ERROR_ECHO_CHARS = 300
#: From this fraction of ``max_iterations`` on, every step's output carries the budget note
#: (a ``Fraction`` so the threshold is exact: ``0.8 * 15`` is 12.000000000000002 in floats).
BUDGET_WARN_FRACTION = Fraction(4, 5)

#: ``budget_note(step, max_iterations) -> str`` — the text appended after 1-based ``step``.
BudgetNote = Callable[[int, int], str]


def budget_warn_from(max_iterations: int) -> int:
    """The first 0-based iteration index whose output gets the budget note."""
    return math.ceil(BUDGET_WARN_FRACTION * max_iterations)


def default_budget_note(step: int, max_iterations: int) -> str:
    left = max_iterations - step
    return (
        f"[Budget] Step {step} of {max_iterations} used. Wrap up and call SUBMIT within the "
        f"next {left} step{'' if left == 1 else 's'}."
    )


# ── run-span parent + LM accounting ────────────────────────────────────────
class RunParent:
    """A mutable holder for the run span's OTel context (``None`` = no explicit parent)."""

    def __init__(self, ctx: otel_context.Context | None = None) -> None:
        self.ctx = ctx

    def __deepcopy__(self, memo: dict[int, Any]) -> RunParent:
        return self


@dataclass
class LmMeter:
    """Thread-safe per-role LM accumulator. ``cost_known`` turns false on the first call
    whose cost is ``None`` — the total is then *unknown*, never 0."""

    role: str
    calls: int = 0
    errors: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    cost_known: bool = True
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def __deepcopy__(self, memo: dict[int, Any]) -> LmMeter:
        return self

    def add(self, *, prompt: int, completion: int, cost: float | None) -> None:
        with self._lock:
            self.calls += 1
            self.prompt_tokens += prompt
            self.completion_tokens += completion
            if cost is None:
                self.cost_known = False
            else:
                self.cost_usd += cost

    def add_error(self) -> None:
        with self._lock:
            self.errors += 1

    @property
    def cost(self) -> float | None:
        """Total cost in USD, or ``None`` when any call's cost was unknown."""
        with self._lock:
            return self.cost_usd if self.cost_known else None

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "calls": self.calls,
                "errors": self.errors,
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "cost_usd": self.cost_usd if self.cost_known else None,
            }


def combined_cost(snapshots: list[dict[str, Any]]) -> float | None:
    """Sum of ``LmMeter.snapshot()`` costs; ``None`` if any is unknown."""
    total = 0.0
    for snap in snapshots:
        cost = snap["cost_usd"]
        if cost is None:
            return None
        total += cost
    return total


@cache
def llm_instruments(scope: str) -> dict[str, Any]:
    """``{"llm_tokens", "llm_cost"}`` counters named ``<scope>.llm.{tokens,cost_usd}``,
    created on first use (after ``init_telemetry``)."""
    meter = get_meter(scope)
    return {
        "llm_tokens": meter.create_counter(
            f"{scope}.llm.tokens", description="LM tokens by model, role, kind"
        ),
        "llm_cost": meter.create_counter(
            f"{scope}.llm.cost_usd", description="provider-reported LM cost (USD)"
        ),
    }


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


class MeteringMixin:
    """Meters ``forward``. Mix in *before* the LM class:
    ``class MeteredLM(MeteringMixin, dspy.LM)``. The constructor takes ``role``
    ("main" | "sub") plus the LM's own arguments.

    Subclasses set ``scope`` (instrumentation scope + metric prefix), ``span_name`` and
    ``attr_prefix``, or override ``_tracer`` / ``_instruments`` outright.
    """

    scope: str = "astra.llm"
    span_name: str = "llm.call"
    attr_prefix: str = "llm"

    model: str
    meter: LmMeter
    parent: RunParent

    def __init__(self, *args: Any, role: str = "main", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.meter = LmMeter(role=role)
        self.parent = RunParent()

    @property
    def role(self) -> str:
        return self.meter.role

    def _tracer(self) -> Any:
        return get_tracer(self.scope)

    def _instruments(self) -> dict[str, Any]:
        return llm_instruments(self.scope)

    def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
        attrs = {"model": self.model, "role": self.role}
        p = self.attr_prefix
        with self._tracer().start_as_current_span(self.span_name, context=self.parent.ctx) as span:
            span.set_attribute(f"{p}.model", self.model)
            span.set_attribute(f"{p}.role", self.role)
            try:
                response = super().forward(prompt=prompt, messages=messages, **kwargs)  # ty: ignore[unresolved-attribute]  (mixin: the LM base supplies forward)
            except Exception as exc:
                self.meter.add_error()
                span.set_status(Status(StatusCode.ERROR, str(exc)[:500]))
                raise
            # Same reads as BaseLM._process_lm_response (base_lm.py:109-110).
            usage = dict(getattr(response, "usage", None) or {})
            cost = (getattr(response, "_hidden_params", None) or {}).get("response_cost")
            prompt_tokens = _int(usage.get("prompt_tokens"))
            completion_tokens = _int(usage.get("completion_tokens"))
            cost = float(cost) if isinstance(cost, int | float) else None
            self.meter.add(prompt=prompt_tokens, completion=completion_tokens, cost=cost)

            span.set_attribute(f"{p}.prompt_tokens", prompt_tokens)
            span.set_attribute(f"{p}.completion_tokens", completion_tokens)
            span.set_attribute(f"{p}.cost_known", cost is not None)
            if cost is not None:
                span.set_attribute(f"{p}.cost_usd", cost)
            m = self._instruments()
            m["llm_tokens"].add(prompt_tokens, {**attrs, "kind": "prompt"})
            m["llm_tokens"].add(completion_tokens, {**attrs, "kind": "completion"})
            if cost is not None:
                m["llm_cost"].add(cost, attrs)
            return response


class MeteredLM(MeteringMixin, dspy.LM):
    """A litellm-routed ``dspy.LM`` with per-call metering under the default scope."""


# ── the hardened RLM ───────────────────────────────────────────────────────
class HardenedRLM(dspy.RLM):  # ty: ignore[invalid-base]  (@experimental-wrapped class)
    """``dspy.RLM`` hardened for a long unattended run.

    Run state readable after ``__call__`` returns *or raises*: ``repl_history``,
    ``iterations`` (started), ``parse_errors`` (malformed replies absorbed), ``hit_cap``
    (the iteration cap forced the extract fallback — the run is *incomplete*).
    ``budget_note`` is the text appended near the cap (``default_budget_note`` if unset).
    """

    def __init__(self, *args: Any, budget_note: BudgetNote | None = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._budget_note: BudgetNote = budget_note or default_budget_note
        self._reset_run_state()

    def _reset_run_state(self) -> None:
        self.repl_history = REPLHistory(max_output_chars=self.max_output_chars)
        self.iterations = 0
        self.parse_errors = 0
        self.hit_cap = False

    def forward(self, **input_args: Any) -> Prediction:
        self._reset_run_state()
        return super().forward(**input_args)

    def _execute_iteration(
        self,
        repl: Any,
        variables: list[REPLVariable],
        history: REPLHistory,
        iteration: int,
        input_args: dict[str, Any],
        output_field_names: list[str],
    ) -> Prediction | REPLHistory:
        # RLM.forward (rlm.py:597-603) calls this once per iteration with the history so
        # far; the only adapter call inside is `self.generate_action(...)` (rlm.py:552) —
        # code execution, tools and llm_query (a raw `lm(prompt)`, rlm.py:244) never
        # parse — so an AdapterParseError here is the malformed main-LM reply. dspy
        # would let it escape forward() and kill the run.
        self.repl_history = history
        self.iterations = iteration + 1
        try:
            result = super()._execute_iteration(
                repl, variables, history, iteration, input_args, output_field_names
            )
        except AdapterParseError as exc:
            self.parse_errors += 1
            reply = (exc.lm_response or "").strip()
            log.info("rlm iteration %d: unparseable reply absorbed", iteration + 1)
            output = PARSE_ERROR_OUTPUT
            if reply:
                output += f"\nYour reply began: {reply[:PARSE_ERROR_ECHO_CHARS]!r}"
            # Same entry shape every other iteration appends (rlm.py:500/527).
            result = history.append(reasoning="", code="", output=output)
        if isinstance(result, REPLHistory):
            result = self._with_budget_note(result, iteration)
            self.repl_history = result
        return result

    def _with_budget_note(self, history: REPLHistory, iteration: int) -> REPLHistory:
        """Append the budget note to the newest entry's output once ``iteration`` reaches
        ``budget_warn_from``; skipped on the last step (the extract fallback follows it).

        The note rides the REPL output because that is what the model reads back each turn
        (``generate_action``'s ``iteration`` field shows only "N/M"). Entries are frozen
        pydantic models (repl_types.py:109/137), so the last entry is rebuilt.
        ``REPLEntry.format_output`` truncates long output in the middle, keeping its tail,
        so a note at the end stays visible.
        """
        step = iteration + 1
        if iteration < budget_warn_from(self.max_iterations) or step >= self.max_iterations:
            return history
        if not history.entries:
            return history
        last = history.entries[-1]
        note = self._budget_note(step, self.max_iterations)
        output = f"{last.output}\n\n{note}" if last.output else note
        return REPLHistory(
            entries=[*history.entries[:-1], last.model_copy(update={"output": output})],
            max_output_chars=history.max_output_chars,
        )

    def _extract_fallback(
        self,
        variables: list[REPLVariable],
        history: REPLHistory,
        output_field_names: list[str],
    ) -> Prediction:
        # Reached only when the loop ran out of iterations (rlm.py:605-606).
        self.hit_cap = True
        self.repl_history = history
        return super()._extract_fallback(variables, history, output_field_names)

    def trajectory(self) -> list[dict[str, Any]]:
        """The REPL history so far, as dicts (the same shape as ``Prediction.trajectory``)."""
        return [entry.model_dump() for entry in self.repl_history]


# ── tool spans ─────────────────────────────────────────────────────────────
def instrument_tool(
    fn: Callable[..., Any],
    parent: RunParent,
    *,
    prefix: str,
    tracer: Callable[[], Any],
    calls: Callable[[], Any],
    logger: Any = log,
    outcome: Callable[[Any], str] = lambda _result: "ok",
) -> Callable[..., Any]:
    """Wrap a tool so each call emits a ``<prefix>.tool.<name>`` span (child of the run
    span), one INFO log line, and a ``calls()`` counter add ``{tool, outcome}``.

    ``tracer`` and ``calls`` are zero-arg callables resolved on every call, so a caller
    can pass ``lambda: tracer()`` and keep its own module-level function patchable.
    ``functools.wraps`` keeps ``__name__`` / ``__doc__`` and sets ``__wrapped__``, which
    ``dspy.Tool`` and ``PythonInterpreter._extract_parameters`` follow to the original
    signature. Exceptions are recorded and re-raised unchanged.
    """
    name = getattr(fn, "__name__", type(fn).__name__)

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        with tracer().start_as_current_span(f"{prefix}.tool.{name}", context=parent.ctx) as span:
            span.set_attribute(f"{prefix}.tool", name)
            try:
                result = fn(*args, **kwargs)
            except Exception as exc:
                span.set_attribute(f"{prefix}.tool.outcome", "raised")
                span.set_status(Status(StatusCode.ERROR, str(exc)[:500]))
                calls().add(1, {"tool": name, "outcome": "raised"})
                logger.info("tool %s raised %s: %s", name, type(exc).__name__, str(exc)[:300])
                raise
            result_outcome = outcome(result)
            span.set_attribute(f"{prefix}.tool.outcome", result_outcome)
            calls().add(1, {"tool": name, "outcome": result_outcome})
            logger.info("tool %s %s%s", name, result_outcome, _arg_hint(args, kwargs))
            return result

    return wrapper


def _arg_hint(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    """A short, log-safe hint of the call's first string argument (a path or pattern)."""
    for value in (*args, *kwargs.values()):
        if isinstance(value, str):
            return f" ({value[:80]!r})"
    return ""


def text_matcher(pattern: str, regex: bool) -> Callable[[str], bool]:
    """A case-insensitive line predicate for agent search tools: literal substring, or a
    regex when ``regex``. Raises ``ValueError`` on an empty pattern or invalid regex (the
    sandbox bridge turns it into a catchable error)."""
    if not isinstance(pattern, str) or not pattern:
        raise ValueError("pattern must be a non-empty string")
    if regex:
        try:
            rx = re.compile(pattern, re.I)
        except re.error as exc:
            raise ValueError(f"invalid regex {pattern!r}: {exc}") from exc
        return lambda line: rx.search(line) is not None
    needle = pattern.casefold()
    return lambda line: needle in line.casefold()


# ── sandbox ────────────────────────────────────────────────────────────────
DENO_BIN = Path.home() / ".deno" / "bin"


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
