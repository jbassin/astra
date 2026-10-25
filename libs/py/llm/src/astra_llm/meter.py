"""The one LLM meter: every billed LLM attempt, from every path, is recorded here.

Both paths report through ``record_attempt``: ``LiteLLMClient`` (priced from the static
table in ``pricing.py``) and the dspy ``MeteringMixin`` in ``astra_llm.rlm`` (priced from
litellm's provider-reported ``response_cost``). One metric family results:

- ``astra.llm.attempts``: one per provider attempt. ``outcome`` is ``ok`` (the reply was
  used), ``retried`` (billed, discarded, and retried), ``failed`` (billed, discarded, and the
  retry budget was spent) or ``error`` (the provider call raised).
- ``astra.llm.tokens``: tokens per attempt, by ``kind`` (``input``, ``output``,
  ``cache_read``, ``cache_write``). The cache kinds are added only when non-zero; an
  ``error`` attempt adds no tokens and no cost.
- ``astra.llm.cost_usd`` (unit USD): cost per attempt. An unknown cost (a model with no
  price row, or no provider-reported cost) is never added as 0: it is left out, and the
  attempt's ``cost_known`` span attribute is false.
- ``astra.llm.request_duration_ms``: one provider round trip (``LiteLLMClient`` only).

Every point carries ``model``, ``provider`` (the litellm prefix: ``openrouter``, ``groq``)
and ``caller`` (who made the call: ``mouthpiece.session_script``, ``heartwood``). The dspy
path adds ``role`` (``main`` or ``sub``).

Instruments are fetched at call time, never at import: an instrument made before
``init_telemetry`` is a permanent no-op. The OTel SDK hands back the same instrument for
the same name, so fetching per call costs a dict lookup.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any

from astra_observe import get_meter

SCOPE = "astra.llm"
ATTEMPTS_METRIC = "astra.llm.attempts"
TOKENS_METRIC = "astra.llm.tokens"
COST_METRIC = "astra.llm.cost_usd"
DURATION_METRIC = "astra.llm.request_duration_ms"

#: The ``caller`` of a client or LM built without one.
UNATTRIBUTED = "unattributed"

#: The attempt outcomes ``record_attempt`` accepts.
OUTCOMES = ("ok", "retried", "failed", "error")


def provider_of(model: str) -> str:
    """The provider of a litellm model id: its prefix (``openrouter/z-ai/glm-5.3`` →
    ``openrouter``); a bare ``claude-*`` id is ``anthropic``, any other bare id ``unknown``."""
    head, sep, _ = model.partition("/")
    if sep:
        return head
    return "anthropic" if model.startswith("claude") else "unknown"


def base_attributes(model: str, caller: str, role: str | None = None) -> dict[str, str]:
    attrs = {"model": model, "provider": provider_of(model), "caller": caller}
    if role is not None:
        attrs["role"] = role
    return attrs


def record_attempt(
    *,
    model: str,
    caller: str,
    outcome: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    cost: float | None = None,
    role: str | None = None,
) -> None:
    """Record one billed attempt (module docstring). ``cost`` ``None`` means unknown."""
    if outcome not in OUTCOMES:
        raise ValueError(f"unknown LLM attempt outcome {outcome!r}")
    meter = get_meter(SCOPE)
    attrs = {**base_attributes(model, caller, role), "outcome": outcome}
    meter.create_counter(ATTEMPTS_METRIC, description="billed LLM attempts by outcome").add(
        1, attrs
    )
    if outcome == "error":  # the provider call raised: no reply, no tokens, no cost
        return
    tokens = meter.create_counter(TOKENS_METRIC, description="LLM tokens by kind")
    tokens.add(input_tokens, {**attrs, "kind": "input"})
    tokens.add(output_tokens, {**attrs, "kind": "output"})
    if cache_read_tokens:
        tokens.add(cache_read_tokens, {**attrs, "kind": "cache_read"})
    if cache_write_tokens:
        tokens.add(cache_write_tokens, {**attrs, "kind": "cache_write"})
    if cost is not None:
        meter.create_counter(COST_METRIC, unit="USD", description="LLM cost (USD)").add(cost, attrs)


def record_duration(*, model: str, caller: str, duration_ms: float) -> None:
    """Record one provider round trip's wall time."""
    get_meter(SCOPE).create_histogram(DURATION_METRIC, unit="ms").record(
        duration_ms, base_attributes(model, caller)
    )


@dataclass
class Ledger:
    """A thread-safe running total of one client's billed attempts (its run's cost).

    ``priced`` turns false on the first attempt whose cost is unknown; ``cost_usd`` then
    covers only the priced attempts.
    """

    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    priced: bool = True
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def add(self, *, input_tokens: int, output_tokens: int, cost: float | None) -> None:
        with self._lock:
            self.calls += 1
            self.input_tokens += input_tokens
            self.output_tokens += output_tokens
            if cost is None:
                self.priced = False
            else:
                self.cost_usd += cost

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "calls": self.calls,
                "cost_usd": round(self.cost_usd, 6),
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens,
                "priced": self.priced,
            }
