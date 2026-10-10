"""The ``dspy`` subclasses the heartwood run needs (0033 D33-9, D33-10).

**``MeteredLM``** — a ``dspy.LM`` that meters every call. The hook is ``forward``: it is
the narrowest override that sees the raw provider response, and that response is the
exact object ``BaseLM._process_lm_response`` turns into ``history[-1]["usage"]`` /
``["cost"]`` (dspy 3.2.1 ``clients/base_lm.py:109-110`` — ``dict(response.usage)`` and
``response._hidden_params["response_cost"]``, which litellm fills from OpenRouter's own
reported cost). Reading the response there, rather than ``self.history`` afterwards,
keeps accounting correct when dspy history is disabled or capped, and lets the span
wrap the call itself. ``MeteringMixin`` carries the logic so tests can meter a
``DummyLM`` through the identical code path.

**``HeartwoodRLM``** — a ``dspy.RLM`` that survives one malformed main-LM reply
(``AdapterParseError`` costs one iteration, not the run), mirrors the running REPL
history onto ``self`` each step (so a failed run still writes ``trajectory.json``), and
flags ``hit_cap`` when the iteration cap forces the extract fallback.

Both lean on dspy 3.2.1 internals; line numbers are cited where we depend on them.
"""

from __future__ import annotations

from typing import Any

import dspy
from dspy.primitives.prediction import Prediction
from dspy.primitives.repl_types import REPLHistory, REPLVariable
from dspy.utils.exceptions import AdapterParseError
from opentelemetry.trace import Status, StatusCode

from .telemetry import LmMeter, RunParent, instruments, log, tracer

#: The history entry a malformed reply becomes (D33-9).
PARSE_ERROR_OUTPUT = (
    "[Error] could not parse your reply — answer with reasoning + a python code block"
)
#: How much of the unparseable reply is echoed back (enough to see what went wrong).
PARSE_ERROR_ECHO_CHARS = 300


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


class MeteringMixin:
    """Meters ``forward``: one ``heartwood.llm.call`` span per call (child of the run
    span), the per-role ``LmMeter``, and the ``astra.heartwood.llm.*`` metrics.

    Mix in *before* the LM class: ``class MeteredLM(MeteringMixin, dspy.LM)``. The
    constructor takes ``role`` ("main" | "sub") plus the LM's own arguments.
    """

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

    def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
        attrs = {"model": self.model, "role": self.role}
        with tracer().start_as_current_span("heartwood.llm.call", context=self.parent.ctx) as span:
            span.set_attribute("heartwood.llm.model", self.model)
            span.set_attribute("heartwood.llm.role", self.role)
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

            span.set_attribute("heartwood.llm.prompt_tokens", prompt_tokens)
            span.set_attribute("heartwood.llm.completion_tokens", completion_tokens)
            span.set_attribute("heartwood.llm.cost_known", cost is not None)
            if cost is not None:
                span.set_attribute("heartwood.llm.cost_usd", cost)
            m = instruments()
            m["llm_tokens"].add(prompt_tokens, {**attrs, "kind": "prompt"})
            m["llm_tokens"].add(completion_tokens, {**attrs, "kind": "completion"})
            if cost is not None:
                m["llm_cost"].add(cost, attrs)
            return response


class MeteredLM(MeteringMixin, dspy.LM):
    """The production LM: a litellm-routed ``dspy.LM`` with per-call metering."""


class HeartwoodRLM(dspy.RLM):  # ty: ignore[invalid-base]  (@experimental-wrapped class)
    """``dspy.RLM`` hardened for a 40-turn unattended run (D33-9).

    Run state read by ``run.py`` after ``__call__`` returns *or raises*:
    ``repl_history`` (the latest REPL history), ``iterations`` (iterations started),
    ``parse_errors`` (malformed replies absorbed), ``hit_cap`` (the iteration cap
    forced the extract fallback — the run is *incomplete*).
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
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
            self.repl_history = result
        return result

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
