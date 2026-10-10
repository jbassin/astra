"""The agent's telemetry seams (0033 D33-10): the run-span parent, metrics, tool spans.

Every span the run emits is parented **explicitly** to the ``heartwood.agent.run``
span's context, held in a ``RunParent``. Implicit (contextvar) parenting is not enough:
dspy's ``llm_query_batched`` runs sub-LM calls on a raw ``ThreadPoolExecutor`` that
drops contextvars (dspy 3.2.1 ``predict/rlm.py:266-267``), so the current span is
invisible there.

``RunParent`` and ``LmMeter`` return themselves from ``__deepcopy__``: ``dspy.LM.copy()``
deep-copies the LM (``clients/base_lm.py:203``), and a copy must keep reporting into the
same accumulator and the same run span (an OTel span holds a lock and cannot be copied).

Metric instruments are created lazily on first use (after ``init_telemetry``), the repo
convention from the telemetry-coverage pass.
"""

from __future__ import annotations

import functools
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import cache
from typing import Any

from astra_observe import get_logger, get_meter, get_tracer
from opentelemetry import context as otel_context
from opentelemetry.trace import Status, StatusCode

#: The service + instrumentation scope (shared with ontology-entity's resolve spans).
SCOPE = "astra.heartwood"

log = get_logger("astra.heartwood.agent")


class RunParent:
    """A mutable holder for the run span's OTel context (``None`` = no explicit parent)."""

    def __init__(self, ctx: otel_context.Context | None = None) -> None:
        self.ctx = ctx

    def __deepcopy__(self, memo: dict[int, Any]) -> RunParent:
        return self


def tracer() -> Any:
    return get_tracer(SCOPE)


@cache
def instruments() -> dict[str, Any]:
    """The run's metric instruments, created on first use (after ``init_telemetry``)."""
    meter = get_meter(SCOPE)
    return {
        "runs": meter.create_counter(
            "astra.heartwood.agent.runs", description="heartwood agent runs by status"
        ),
        "pages": meter.create_counter(
            "astra.heartwood.agent.pages", description="pages changed by ok runs, by op"
        ),
        "tool_calls": meter.create_counter(
            "astra.heartwood.tool.calls", description="agent tool calls by tool and outcome"
        ),
        "llm_tokens": meter.create_counter(
            "astra.heartwood.llm.tokens", description="LM tokens by model, role, kind"
        ),
        "llm_cost": meter.create_counter(
            "astra.heartwood.llm.cost_usd", description="provider-reported LM cost (USD)"
        ),
    }


# ── LM accounting ───────────────────────────────────────────────────────────
@dataclass
class LmMeter:
    """Thread-safe per-role LM accumulator. ``cost_known`` turns false on the first call
    whose cost is ``None`` — the run's cost is then *unknown*, never 0 (D33-8)."""

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


# ── tool spans ─────────────────────────────────────────────────────────────
def tool_outcome(result: Any) -> str:
    """``rejected`` for a ``write_page`` validation rejection, else ``ok``."""
    return "rejected" if isinstance(result, str) and result.startswith("rejected:") else "ok"


def instrument_tool(fn: Callable[..., Any], parent: RunParent) -> Callable[..., Any]:
    """Wrap a tool so each call emits a ``heartwood.tool.<name>`` span (child of the run
    span), one INFO log line, and ``astra.heartwood.tool.calls{tool,outcome}``.

    ``functools.wraps`` keeps ``__name__`` / ``__doc__`` and sets ``__wrapped__``, which
    ``inspect.signature`` and ``typing.get_type_hints`` follow — so ``dspy.Tool`` (the
    agent's tool docs) and ``PythonInterpreter._extract_parameters`` (the sandbox stub)
    see the original signature. Exceptions are recorded and re-raised unchanged (the
    sandbox bridge turns them into catchable errors).
    """
    name = getattr(fn, "__name__", type(fn).__name__)

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        with tracer().start_as_current_span(f"heartwood.tool.{name}", context=parent.ctx) as span:
            span.set_attribute("heartwood.tool", name)
            try:
                result = fn(*args, **kwargs)
            except Exception as exc:
                span.set_attribute("heartwood.tool.outcome", "raised")
                span.set_status(Status(StatusCode.ERROR, str(exc)[:500]))
                instruments()["tool_calls"].add(1, {"tool": name, "outcome": "raised"})
                log.info("tool %s raised %s: %s", name, type(exc).__name__, str(exc)[:300])
                raise
            outcome = tool_outcome(result)
            span.set_attribute("heartwood.tool.outcome", outcome)
            instruments()["tool_calls"].add(1, {"tool": name, "outcome": outcome})
            log.info("tool %s %s%s", name, outcome, _arg_hint(args, kwargs))
            return result

    return wrapper


def _arg_hint(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    """A short, log-safe hint of the call's first string argument (a path or pattern)."""
    for value in (*args, *kwargs.values()):
        if isinstance(value, str):
            return f" ({value[:80]!r})"
    return ""
