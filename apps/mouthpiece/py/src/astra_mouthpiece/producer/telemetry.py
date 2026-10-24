"""The producer's telemetry seams (0034 D34-9), on the shared ``astra_llm.rlm`` pieces.

Spans: ``mouthpiece.producer.run`` (run.py), ``mouthpiece.producer.llm.call`` (``ProducerLM``),
``mouthpiece.producer.tool.<name>`` (``instrument_tool``), and
``mouthpiece.experiment.arm`` (``astra_mouthpiece_tools.producer.experiment``). Every span
is parented explicitly through a ``RunParent`` (sub-LM calls run on threads that drop
contextvars). Instruments are created lazily on first use.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import cache
from typing import Any

import dspy
from astra_llm.rlm import MeteringMixin, RunParent
from astra_llm.rlm import instrument_tool as _instrument_tool
from astra_observe import get_logger, get_meter, get_tracer

SCOPE = "astra.mouthpiece.producer"

log = get_logger("astra.mouthpiece.producer")


def tracer() -> Any:
    return get_tracer(SCOPE)


@cache
def instruments() -> dict[str, Any]:
    """Run + tool counters. LM tokens and cost go to the one LLM meter (``astra_llm.meter``)
    with ``caller="mouthpiece.producer"``."""
    meter = get_meter(SCOPE)
    return {
        "runs": meter.create_counter(
            "astra.mouthpiece.producer.runs", description="producer runs by status"
        ),
        "tool_calls": meter.create_counter(
            "astra.mouthpiece.producer.tool.calls", description="producer tool calls"
        ),
    }


class ProducerMetering(MeteringMixin):
    """Meters ``forward`` as ``mouthpiece.producer.llm.call``."""

    scope = SCOPE
    caller = "mouthpiece.producer"
    span_name = "mouthpiece.producer.llm.call"
    attr_prefix = "mouthpiece.producer.llm"

    def _tracer(self) -> Any:
        return tracer()


class ProducerLM(ProducerMetering, dspy.LM):
    """The production LM: a litellm-routed ``dspy.LM`` with per-call metering."""


def instrument_tool(fn: Callable[..., Any], parent: RunParent) -> Callable[..., Any]:
    return _instrument_tool(
        fn,
        parent,
        prefix="mouthpiece.producer",
        tracer=lambda: tracer(),  # noqa: PLW0108 -- late lookup, so tests can patch tracer
        calls=lambda: instruments()["tool_calls"],
        logger=log,
    )
