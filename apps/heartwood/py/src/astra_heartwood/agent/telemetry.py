"""The agent's telemetry seams: the run-span parent, metrics, tool spans.

Every span the run emits is parented **explicitly** to the ``heartwood.agent.run``
span's context, held in a ``RunParent``. Implicit (contextvar) parenting is not enough:
dspy's ``llm_query_batched`` runs sub-LM calls on a raw ``ThreadPoolExecutor`` that
drops contextvars (dspy 3.2.1 ``predict/rlm.py:266-267``), so the current span is
invisible there.

``RunParent`` and ``LmMeter`` (now in ``astra_llm.rlm``) return themselves from
``__deepcopy__``: a copied LM keeps reporting into the same accumulator and run span.

Metric instruments are created lazily on first use (after ``init_telemetry``), the repo
convention from the telemetry-coverage pass. LM tokens and cost are not here: every LM call
reports to the one LLM meter (``astra_llm.meter``) with ``caller="heartwood"``.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import cache
from typing import Any

from astra_llm.rlm import LmMeter, RunParent
from astra_llm.rlm import instrument_tool as _instrument_tool
from astra_observe import get_logger, get_meter, get_tracer

#: The service + instrumentation scope (shared with ontology-entity's resolve spans).
SCOPE = "astra.heartwood"

log = get_logger("astra.heartwood.agent")

#: ``LmMeter`` / ``RunParent`` live in ``astra_llm.rlm``; re-exported here.
__all__ = [
    "SCOPE",
    "LmMeter",
    "RunParent",
    "instrument_tool",
    "instruments",
    "log",
    "tool_outcome",
    "tracer",
]


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
    }


# ── tool spans ─────────────────────────────────────────────────────────────
def tool_outcome(result: Any) -> str:
    """``rejected`` for a ``write_page`` validation rejection, else ``ok``."""
    return "rejected" if isinstance(result, str) and result.startswith("rejected:") else "ok"


def instrument_tool(fn: Callable[..., Any], parent: RunParent) -> Callable[..., Any]:
    """Wrap a tool so each call emits a ``heartwood.tool.<name>`` span (child of the run
    span), one INFO log line, and ``astra.heartwood.tool.calls{tool,outcome}`` — the shared
    ``astra_llm.rlm.instrument_tool`` bound to this module's (patchable) ``tracer`` and
    ``instruments``."""
    return _instrument_tool(
        fn,
        parent,
        prefix="heartwood",
        tracer=lambda: tracer(),  # noqa: PLW0108 -- late lookup, so tests can patch tracer
        calls=lambda: instruments()["tool_calls"],
        logger=log,
        outcome=tool_outcome,
    )
