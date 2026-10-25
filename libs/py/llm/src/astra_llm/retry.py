"""The one LLM retry policy. ``LiteLLMClient`` owns it; callers do not loop.

Two kinds of failure, retried at two levels:

1. **Transport errors** (429, 5xx such as a 529 "Overloaded", timeouts, dropped
   connections). litellm retries these inside one attempt, ``transport_retries`` times with
   its own exponential backoff. They are mostly unbilled. If litellm gives up, its
   exception propagates unchanged, and a Dagster ``RetryPolicy`` on the asset may rerun the
   step (a provider outage can outlast litellm's backoff).
2. **Content failures** of a reply that was billed: a forced tool not called, tool
   arguments that are not valid JSON, or a reply that fails the ``call_structured`` output
   model. The client retries these at once (no backoff: the provider is not overloaded,
   the model glitched). One logical call gets at most ``attempts`` billed attempts in
   total, shared by every content failure kind. Each client also has a run budget:
   ``run_retries`` retried attempts over its whole life, so a prompt that always fails
   cannot burn ``attempts`` on every call of a long run.

A truncated reply (``max_tokens`` hit) and an empty free-text reply are not retried: the
same request would fail the same way.

When content retries run out, the client raises ``LlmError`` with ``retryable=False``.
Pipeline assets wrap their LLM work in ``astra_pipeline_resources.llm_failures_final()``,
which turns that error into ``dg.Failure(allow_retries=False)``. So the Dagster retry only
ever reruns a step for a transport failure, never to re-roll a deterministic content
failure, and the worst case is one asset attempt's ``attempts`` per call, not
Dagster tries x attempts.

The run is the client: ``LlmResource.client()`` hands each asset execution a fresh one, so
every Dagster attempt starts with a full run budget.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    #: Billed attempts per logical call (``call_tool``, ``call_structured``, ``call_text``).
    attempts: int = 3
    #: Retried billed attempts per client over its life (``None``: no run cap).
    run_retries: int | None = 10
    #: litellm ``num_retries`` for transport errors (exponential backoff inside litellm).
    transport_retries: int = 5

    def __post_init__(self) -> None:
        if self.attempts < 1:
            raise ValueError("RetryPolicy.attempts must be at least 1")
        if self.run_retries is not None and self.run_retries < 0:
            raise ValueError("RetryPolicy.run_retries must be >= 0 or None")
        if self.transport_retries < 0:
            raise ValueError("RetryPolicy.transport_retries must be >= 0")


DEFAULT_RETRY_POLICY = RetryPolicy()


class RunBudget:
    """The thread-safe count of one client's retried attempts against ``run_retries``."""

    def __init__(self, policy: RetryPolicy) -> None:
        self._limit = policy.run_retries
        self._used = 0
        self._lock = threading.Lock()

    @property
    def used(self) -> int:
        with self._lock:
            return self._used

    def take(self) -> bool:
        """Spend one retry; ``False`` (nothing spent) when the run budget is gone."""
        with self._lock:
            if self._limit is not None and self._used >= self._limit:
                return False
            self._used += 1
            return True
