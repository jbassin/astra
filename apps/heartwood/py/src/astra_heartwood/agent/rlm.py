"""heartwood's bindings of the shared RLM machinery (0033 D33-9, D33-10; lifted 0034 D34-1).

The logic lives in ``astra_llm.rlm``: ``MeteringMixin`` (per-call metering of
``dspy.LM.forward``) and ``HardenedRLM`` (absorbs one malformed main-LM reply, mirrors the
REPL history, flags ``hit_cap``, budget note near the cap). This module binds them to
heartwood's names: the ``heartwood.llm.call`` span, ``heartwood.llm.*`` attributes, the
``astra.heartwood.llm.*`` metrics and heartwood's budget-note text.

The tracer/instruments hooks call this module's ``tracer`` / ``instruments`` at call time,
so tests can monkeypatch them here.
"""

from __future__ import annotations

from typing import Any

import dspy
from astra_llm.rlm import (
    BUDGET_WARN_FRACTION,
    PARSE_ERROR_ECHO_CHARS,
    PARSE_ERROR_OUTPUT,
    HardenedRLM,
    budget_warn_from,
)
from astra_llm.rlm import MeteringMixin as _MeteringMixin

from .telemetry import SCOPE, instruments, tracer

__all__ = [
    "BUDGET_WARN_FRACTION",
    "PARSE_ERROR_ECHO_CHARS",
    "PARSE_ERROR_OUTPUT",
    "HeartwoodRLM",
    "MeteredLM",
    "MeteringMixin",
    "budget_note",
    "budget_warn_from",
]


def budget_note(step: int, max_iterations: int) -> str:
    """The note appended after 1-based ``step``; the model reads it on its next turn."""
    left = max_iterations - step
    return (
        f"[Budget] Step {step} of {max_iterations} used. Finish your remaining writes and "
        f"fix unresolved links now; call SUBMIT(changelog=...) within the next {left} "
        f"step{'' if left == 1 else 's'}."
    )


class MeteringMixin(_MeteringMixin):
    """Meters ``forward`` as ``heartwood.llm.call`` (child of the run span)."""

    scope = SCOPE
    span_name = "heartwood.llm.call"
    attr_prefix = "heartwood.llm"

    def _tracer(self) -> Any:
        return tracer()

    def _instruments(self) -> dict[str, Any]:
        return instruments()


class MeteredLM(MeteringMixin, dspy.LM):
    """The production LM: a litellm-routed ``dspy.LM`` with per-call metering."""


class HeartwoodRLM(HardenedRLM):
    """``HardenedRLM`` with heartwood's budget note (D33-9)."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("budget_note", budget_note)
        super().__init__(*args, **kwargs)
