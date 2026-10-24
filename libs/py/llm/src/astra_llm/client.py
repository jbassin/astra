"""litellm-backed LLM client — re-establishes the `@faerrin/llm` contract in Python.

Five load-bearing behaviors:
1. **Truncation guard** — `finish_reason == "length"` (`max_tokens` hit) → raise,
   so a cut-off tool call or transcript fails loud instead of flowing downstream.
2. **Prompt caching** — the stable system prefix is sent as a
   `cache_control: ephemeral` block (providers that don't cache ignore it).
3. **Forced tool → typed output** — force one tool, parse its JSON args into a Pydantic
   model (`call_structured`).
4. **One meter** — every billed attempt, retried ones included, is priced (pricing.py),
   recorded through `meter.record_attempt` under the client's `caller`, added to the
   client's `Ledger`, and traced as its own `astra.llm.call` span.
5. **One retry policy** — `retry.RetryPolicy`: content failures share one per-call attempt
   budget and one per-client run budget; transport errors are litellm's (retry.py).

The `completion_fn` seam (defaults to `litellm.completion`) lets tests inject a stub —
no network in unit tests.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar, cast

from astra_observe import get_logger, get_tracer
from opentelemetry.trace import Status, StatusCode
from pydantic import BaseModel, ValidationError

from .meter import UNATTRIBUTED, Ledger, provider_of, record_attempt, record_duration
from .pricing import PRICING_USD_PER_1M, TokenCounts, cost_usd
from .retry import DEFAULT_RETRY_POLICY, RetryPolicy, RunBudget

_log = get_logger("astra.llm")

# Fallback when a caller passes no model (kept config-agnostic — this lib is a pure seam).
# The PIPELINE is authoritative via config.kdl: scribe passes `scribe.model` and the
# mouthpiece assets pass `llm.default-model`. Keep this in sync with config's default-model.
DEFAULT_MODEL = "openrouter/z-ai/glm-5.2"
DEFAULT_MAX_TOKENS = 16_000
#: Per-attempt request timeout (seconds). Bounds a single provider call so a stalled or
#: half-open connection can't hang a run forever — a runaway script generation once stalled
#: ~46 min with no client-side timeout. Generous enough for a full ~5k-word episode Pass A;
#: litellm applies it per attempt, so `num_retries` still rides transient blips.
REQUEST_TIMEOUT_S = 300

T = TypeVar("T", bound=BaseModel)


class Usage(BaseModel):
    """Normalized, provider-neutral token usage (disjoint buckets for pricing)."""

    input_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    output_tokens: int = 0


class ToolSpec(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass(slots=True)
class ToolCallRequest:
    system: str
    user_content: str
    tool: ToolSpec
    model: str = DEFAULT_MODEL
    max_tokens: int = DEFAULT_MAX_TOKENS


@dataclass(slots=True)
class TextRequest:
    user_content: str
    system: str | None = None
    model: str = DEFAULT_MODEL
    max_tokens: int = DEFAULT_MAX_TOKENS


@dataclass(slots=True)
class Result:
    text: str
    tool_input: Any
    usage: Usage
    finish_reason: str | None
    cost_usd: float


class LlmClient(Protocol):
    """Injectable seam — tests pass a stub implementing this (no live call)."""

    def call_tool(self, req: ToolCallRequest) -> dict[str, Any]: ...
    def call_text(self, req: TextRequest) -> str: ...


CompletionFn = Callable[..., Any]


def _cached_system(system: str) -> dict[str, Any]:
    """A system message whose stable prefix is an ephemeral cache block."""
    return {
        "role": "system",
        "content": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
    }


def _extract_usage(raw: Any) -> Usage:
    """Pull disjoint token buckets from a litellm usage object (defensive)."""
    if raw is None:
        return Usage()
    prompt = int(getattr(raw, "prompt_tokens", 0) or 0)
    output = int(getattr(raw, "completion_tokens", 0) or 0)
    cache_write = int(getattr(raw, "cache_creation_input_tokens", 0) or 0)
    cache_read = getattr(raw, "cache_read_input_tokens", None)
    if cache_read is None:
        details = getattr(raw, "prompt_tokens_details", None)
        cache_read = getattr(details, "cached_tokens", 0) if details is not None else 0
    cache_read = int(cache_read or 0)
    # litellm's anthropic transform counts the cache inside prompt_tokens: input tokens plus
    # cache creation plus cache read (verified in transformation.py under
    # litellm/llms/anthropic/chat), i.e. INCLUSIVE of cache. Recover the disjoint uncached
    # input so the pricing table isn't double-charged.
    uncached_input = max(0, prompt - cache_read - cache_write)
    return Usage(
        input_tokens=uncached_input,
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
        output_tokens=output,
    )


R = TypeVar("R")

#: The tracer scope and span name of one billed attempt.
_TRACER_SCOPE = "astra.llm"
_CALL_SPAN = "astra.llm.call"


class _ContentFailure(Exception):
    """A billed reply the caller cannot use, which a fresh attempt might fix (retry.py)."""

    def __init__(
        self, message: str, *, cause: BaseException | None = None, structured: str | None = None
    ) -> None:
        super().__init__(message)
        self.cause = cause
        #: The output model's name when the reply failed `call_structured` validation.
        self.structured = structured


class LiteLLMClient:
    """The shared client. `completion_fn` defaults to `litellm.completion`.

    ``caller`` names who makes the calls on every metric point (``meter.py``). ``retry`` is
    the retry policy (``retry.py``); the client's run budget lives as long as the client, so
    build one client per run (``LlmResource.client()`` does). ``ledger`` totals every billed
    attempt; ``snapshot()`` reads it.
    """

    def __init__(
        self,
        completion_fn: CompletionFn | None = None,
        *,
        caller: str = UNATTRIBUTED,
        retry: RetryPolicy = DEFAULT_RETRY_POLICY,
    ) -> None:
        self.caller = caller
        self.retry = retry
        self.ledger = Ledger()
        self._run_budget = RunBudget(retry)
        self._completion = completion_fn or _litellm_completion(retry.transport_retries)

    def snapshot(self) -> dict[str, Any]:
        """This client's billed attempts so far: calls, cost, tokens, ``priced``."""
        return self.ledger.snapshot()

    # --- pricing + meter -----------------------------------------------------------
    def _price(self, model: str, usage: Usage) -> float | None:
        """USD from the static table; ``None`` for a model with no row (unknown, not 0)."""
        if model not in PRICING_USD_PER_1M:
            return None
        return cost_usd(
            model,
            TokenCounts(
                input=usage.input_tokens,
                cache_read=usage.cache_read_tokens,
                cache_write=usage.cache_write_tokens,
                output=usage.output_tokens,
            ),
        )

    def _meter(self, span: Any, model: str, usage: Usage, cost: float | None, outcome: str) -> None:
        record_attempt(
            model=model,
            caller=self.caller,
            outcome=outcome,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=usage.cache_read_tokens,
            cache_write_tokens=usage.cache_write_tokens,
            cost=cost,
        )
        self.ledger.add(
            input_tokens=usage.input_tokens, output_tokens=usage.output_tokens, cost=cost
        )
        span.set_attribute("astra.llm.outcome", outcome)
        span.set_attribute("astra.llm.input_tokens", usage.input_tokens)
        span.set_attribute("astra.llm.output_tokens", usage.output_tokens)
        span.set_attribute("astra.llm.cost_known", cost is not None)
        if cost is not None:
            span.set_attribute("astra.llm.cost_usd", cost)

    # --- core call -----------------------------------------------------------------
    def _complete(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        tool: ToolSpec | None,
        accept: Callable[[Result], R],
    ) -> R:
        """Run one logical call: billed attempts until ``accept`` takes a reply.

        ``accept`` turns a reply into the caller's value. It raises ``_ContentFailure`` for
        a reply worth retrying and ``LlmError`` for one that is not. Retries draw on the
        per-call ``retry.attempts`` and the client's run budget (retry.py).
        """
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if tool is not None:
            kwargs["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                }
            ]
            kwargs["tool_choice"] = {"type": "function", "function": {"name": tool.name}}

        tracer = get_tracer(_TRACER_SCOPE)
        attempt = 0
        while True:
            attempt += 1
            with tracer.start_as_current_span(_CALL_SPAN) as span:
                span.set_attribute("astra.llm.model", model)
                span.set_attribute("astra.llm.provider", provider_of(model))
                span.set_attribute("astra.llm.caller", self.caller)
                span.set_attribute("astra.llm.attempt", attempt)
                started = time.perf_counter()
                try:
                    response = self._completion(**kwargs)
                except Exception:
                    # A transport error litellm gave up on (or a stub's): not a billed reply.
                    record_attempt(model=model, caller=self.caller, outcome="error")
                    span.set_attribute("astra.llm.outcome", "error")
                    raise
                finally:
                    record_duration(
                        model=model,
                        caller=self.caller,
                        duration_ms=(time.perf_counter() - started) * 1000.0,
                    )
                usage = _extract_usage(getattr(response, "usage", None))
                cost = self._price(model, usage)
                try:
                    value = accept(
                        _result_of(response, usage, cost, tool=tool, max_tokens=max_tokens)
                    )
                except _ContentFailure as failure:
                    retry = attempt < self.retry.attempts and self._run_budget.take()
                    self._meter(span, model, usage, cost, "retried" if retry else "failed")
                    if retry:
                        _log.warning(
                            "llm %s (%s): billed reply unusable, retrying (attempt %d/%d): %s",
                            model,
                            self.caller,
                            attempt,
                            self.retry.attempts,
                            str(failure).splitlines()[0],
                        )
                        continue
                    exhausted = _exhausted(failure, attempt, self.retry.attempts)
                    span.set_status(Status(StatusCode.ERROR, str(exhausted)[:500]))
                    raise exhausted from failure.cause
                except LlmError:
                    self._meter(span, model, usage, cost, "failed")
                    raise
                self._meter(span, model, usage, cost, "ok")
                return value

    # --- public API (mirrors @faerrin/llm) -----------------------------------------
    def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
        """Force `req.tool`, return its parsed JSON input (raises if not called)."""

        def accept(result: Result) -> dict[str, Any]:
            if result.tool_input is None:
                raise LlmError(
                    f"Model did not call the forced tool {req.tool.name!r} "
                    f"(finish_reason: {result.finish_reason})."
                )
            return result.tool_input

        return self._complete(
            model=req.model,
            messages=[_cached_system(req.system), {"role": "user", "content": req.user_content}],
            max_tokens=req.max_tokens,
            tool=req.tool,
            accept=accept,
        )

    def call_structured(
        self,
        output_model: type[T],
        *,
        system: str,
        user_content: str,
        model: str = DEFAULT_MODEL,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        tool_name: str = "record",
        tool_description: str = "Record the structured result.",
    ) -> T:
        """Forced-tool → validated Pydantic instance (the typed-output path).

        A reply that fails `output_model` validation is a content failure: it is retried
        from the same per-call attempt budget as a missing or malformed tool call
        (retry.py). When the budget is spent, a typed `LlmError` (chained to the last
        ValidationError) is raised. Each attempt is a real, billed completion.
        """
        tool = ToolSpec(
            name=tool_name,
            description=tool_description,
            input_schema=output_model.model_json_schema(),
        )

        def accept(result: Result) -> T:
            if result.tool_input is None:
                raise LlmError(
                    f"Model did not call the forced tool {tool_name!r} "
                    f"(finish_reason: {result.finish_reason})."
                )
            try:
                return output_model.model_validate(result.tool_input)
            except ValidationError as err:
                raise _ContentFailure(
                    f"reply failed {output_model.__name__} validation: {err}",
                    cause=err,
                    structured=output_model.__name__,
                ) from err

        return self._complete(
            model=model,
            messages=[_cached_system(system), {"role": "user", "content": user_content}],
            max_tokens=max_tokens,
            tool=tool,
            accept=accept,
        )

    def call_text(self, req: TextRequest) -> str:
        """Free-text completion (no tool). Truncation + empty-output both raise."""
        messages: list[dict[str, Any]] = []
        if req.system is not None:
            messages.append(_cached_system(req.system))
        messages.append({"role": "user", "content": req.user_content})

        def accept(result: Result) -> str:
            if result.finish_reason == "length":
                raise LlmError(
                    f"Free-text output hit max_tokens ({req.max_tokens}); the result is "
                    "truncated. Re-run with a higher max_tokens."
                )
            if result.text.strip() == "":
                raise LlmError(
                    f"Free-text call returned no text (finish_reason: {result.finish_reason})."
                )
            return result.text

        return self._complete(
            model=req.model, messages=messages, max_tokens=req.max_tokens, tool=None, accept=accept
        )


def _result_of(
    response: Any, usage: Usage, cost: float | None, *, tool: ToolSpec | None, max_tokens: int
) -> Result:
    """One reply as a `Result`. Raises `LlmError` for a truncated forced tool call and
    `_ContentFailure` for a missing or malformed one."""
    choice = response.choices[0]
    finish_reason = getattr(choice, "finish_reason", None)
    message = choice.message

    # Truncation guard: a forced tool truncated mid-JSON is unrecoverable.
    if tool is not None and finish_reason == "length":
        raise LlmError(
            f"Tool-call output hit max_tokens ({max_tokens}); the result is truncated. "
            "Re-run with a higher max_tokens."
        )

    text = message.content or ""
    if isinstance(text, list):  # some providers return content blocks
        text = "".join(b.get("text", "") for b in text if isinstance(b, dict))

    tool_input: Any = None
    if tool is not None:
        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            # GLM/OpenRouter occasionally returns finish_reason=stop with no tool call at all
            # on a forced tool — a transient; retry the completion.
            raise _ContentFailure(f"did not call the forced tool (finish_reason: {finish_reason})")
        try:
            tool_input = json.loads(tool_calls[0].function.arguments)
        except json.JSONDecodeError as err:
            # A transient malformed tool JSON (a model glitch on large structured outputs).
            raise _ContentFailure(f"tool-call arguments were not valid JSON: {err}") from err

    return Result(
        text=cast(str, text),
        tool_input=tool_input,
        usage=usage,
        finish_reason=finish_reason,
        # An unpriced model reports 0.0 here, as before; the meter records it as unknown.
        cost_usd=cost if cost is not None else 0.0,
    )


def _exhausted(failure: _ContentFailure, attempts: int, per_call: int) -> LlmError:
    """The final, non-retryable error once a call's retries are spent."""
    why = "" if attempts >= per_call else " (the client's run retry budget is spent)"
    if failure.structured is not None:
        return LlmError(
            f"Structured output for {failure.structured} failed validation after "
            f"{attempts} attempts{why}: {failure.cause}"
        )
    return LlmError(f"Forced tool call failed after {attempts} attempts{why}: {failure}")


class LlmError(RuntimeError):
    """Raised for truncated / empty / un-called-tool responses and spent retries (fail loud).

    ``retryable`` says whether rerunning the whole step could help. The client raises it
    ``False`` (a content failure that already used its retries); a Dagster asset turns that
    into a failure its ``RetryPolicy`` skips (``astra_pipeline_resources.llm_failures_final``).
    """

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


def _litellm_completion(transport_retries: int) -> CompletionFn:
    """`litellm.completion` with the policy's transport retries (``num_retries``)."""

    def complete(**kwargs: Any) -> Any:
        kwargs.setdefault("num_retries", transport_retries)
        return _default_completion(**kwargs)

    return complete


def _default_completion(**kwargs: Any) -> Any:
    # Imported lazily so `import astra_llm` (and the unit tests with a stub) don't pay
    # litellm's import cost or require it for offline use.
    import litellm

    # The pipeline runs unattended, so survive transient provider blips — a provider 529
    # "Overloaded" (→ litellm InternalServerError), 429s, timeouts — with litellm's built-in
    # exponential backoff instead of failing a whole mouthpiece run. Only the real path
    # retries; a stubbed `completion_fn` never reaches here. `LiteLLMClient` passes its
    # policy's `transport_retries`; this default is the same policy's (retry.py).
    kwargs.setdefault("num_retries", DEFAULT_RETRY_POLICY.transport_retries)
    # Bound each attempt so a stalled/half-open connection can't block a run indefinitely
    # (litellm applies `timeout` per attempt as the HTTP read timeout; with num_retries it
    # fails fast and retries instead of hanging on one socket). Callers can override.
    kwargs.setdefault("timeout", REQUEST_TIMEOUT_S)
    return litellm.completion(**kwargs)
