"""litellm-backed LLM client — re-establishes the `@faerrin/llm` contract in Python.

Four load-bearing behaviors carried over (research §3.3):
1. **Truncation guard** — `finish_reason == "length"` (Anthropic `max_tokens`) → raise,
   so a cut-off tool call or transcript fails loud instead of flowing downstream.
2. **Prompt caching** — the stable system prefix is sent as an Anthropic
   `cache_control: ephemeral` block (≥4096-token prefixes cache on Opus 4.8).
3. **Forced tool → typed output** — force one tool, parse its JSON args into a Pydantic
   model (`call_structured`).
4. **Cost → OTel** — every call's usage is priced (pricing.py) and emitted as a metric +
   span attributes (retires `pricing.ts`).

The `completion_fn` seam (defaults to `litellm.completion`) lets tests inject a stub —
no network in unit tests.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

from astra_observe import get_meter
from opentelemetry import trace
from pydantic import BaseModel

from .pricing import TokenCounts, cost_usd

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

#: A *successful* response can still carry malformed JSON in a forced tool call (a transient
#: model glitch on large structured outputs). litellm's `num_retries` only covers API errors,
#: so we retry the whole completion this many times before giving up with a typed LlmError.
_TOOL_JSON_ATTEMPTS = 3
_ANTHROPIC_PREFIX = "anthropic/"

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


def _litellm_model(model: str) -> str:
    """Route a bare Anthropic model id through litellm's anthropic provider."""
    return model if "/" in model else f"{_ANTHROPIC_PREFIX}{model}"


def _cached_system(system: str) -> dict[str, Any]:
    """A system message whose stable prefix is an Anthropic ephemeral cache block."""
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
    # litellm's anthropic transform sets prompt_tokens = input_tokens + cache_creation +
    # cache_read (verified in litellm/llms/anthropic/chat/transformation.py), i.e. INCLUSIVE
    # of cache. Recover the disjoint uncached input so the pricing table isn't double-charged.
    uncached_input = max(0, prompt - cache_read - cache_write)
    return Usage(
        input_tokens=uncached_input,
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
        output_tokens=output,
    )


@dataclass(slots=True)
class _Instruments:
    cost: Any
    input: Any
    output: Any


class LiteLLMClient:
    """The shared client. `completion_fn` defaults to `litellm.completion`."""

    def __init__(self, completion_fn: CompletionFn | None = None) -> None:
        self._completion = completion_fn or _default_completion
        self._instruments: _Instruments | None = None

    # --- cost → OTel ---------------------------------------------------------------
    def _record_cost(self, model: str, usage: Usage, cost: float) -> None:
        # Lazily bind instruments so they attach to the provider installed by
        # init_telemetry() at first call (a meter grabbed at import is a permanent no-op).
        if self._instruments is None:
            meter = get_meter("astra.llm")
            self._instruments = _Instruments(
                cost=meter.create_counter("astra.llm.cost_usd", unit="USD"),
                input=meter.create_counter("astra.llm.input_tokens"),
                output=meter.create_counter("astra.llm.output_tokens"),
            )
        attrs = {"model": model}
        self._instruments.cost.add(cost, attrs)
        self._instruments.input.add(usage.input_tokens, attrs)
        self._instruments.output.add(usage.output_tokens, attrs)
        span = trace.get_current_span()
        span.set_attribute("astra.llm.model", model)
        span.set_attribute("astra.llm.cost_usd", cost)

    def _price(self, model: str, usage: Usage) -> float:
        cost = cost_usd(
            model,
            TokenCounts(
                input=usage.input_tokens,
                cache_read=usage.cache_read_tokens,
                cache_write=usage.cache_write_tokens,
                output=usage.output_tokens,
            ),
        )
        self._record_cost(model, usage, cost)
        return cost

    # --- core call -----------------------------------------------------------------
    def _complete(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        tool: ToolSpec | None,
    ) -> Result:
        kwargs: dict[str, Any] = {
            "model": _litellm_model(model),
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

        last_tool_err: str | None = None
        for _attempt in range(_TOOL_JSON_ATTEMPTS):
            response = self._completion(**kwargs)
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
            tool_calls = getattr(message, "tool_calls", None)
            if tool is not None:
                if not tool_calls:
                    # GLM/OpenRouter occasionally returns finish_reason=stop with no tool
                    # call at all on a forced tool — a transient; retry the completion.
                    last_tool_err = f"did not call the forced tool (finish_reason: {finish_reason})"
                    continue
                try:
                    tool_input = json.loads(tool_calls[0].function.arguments)
                except json.JSONDecodeError as err:
                    last_tool_err = f"tool-call arguments were not valid JSON: {err}"
                    continue  # transient malformed tool JSON — retry the whole completion

            usage = _extract_usage(getattr(response, "usage", None))
            cost = self._price(model, usage)
            return Result(
                text=text,
                tool_input=tool_input,
                usage=usage,
                finish_reason=finish_reason,
                cost_usd=cost,
            )

        raise LlmError(
            f"Forced tool call failed after {_TOOL_JSON_ATTEMPTS} attempts: {last_tool_err}"
        )

    # --- public API (mirrors @faerrin/llm) -----------------------------------------
    def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
        """Force `req.tool`, return its parsed JSON input (raises if not called)."""
        result = self._complete(
            model=req.model,
            messages=[_cached_system(req.system), {"role": "user", "content": req.user_content}],
            max_tokens=req.max_tokens,
            tool=req.tool,
        )
        if result.tool_input is None:
            raise LlmError(
                f"Model did not call the forced tool {req.tool.name!r} "
                f"(finish_reason: {result.finish_reason})."
            )
        return result.tool_input

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
        """Forced-tool → validated Pydantic instance (the typed-output path)."""
        tool = ToolSpec(
            name=tool_name,
            description=tool_description,
            input_schema=output_model.model_json_schema(),
        )
        raw = self.call_tool(
            ToolCallRequest(
                system=system,
                user_content=user_content,
                tool=tool,
                model=model,
                max_tokens=max_tokens,
            )
        )
        return output_model.model_validate(raw)

    def call_text(self, req: TextRequest) -> str:
        """Free-text completion (no tool). Truncation + empty-output both raise."""
        messages: list[dict[str, Any]] = []
        if req.system is not None:
            messages.append(_cached_system(req.system))
        messages.append({"role": "user", "content": req.user_content})

        result = self._complete(
            model=req.model, messages=messages, max_tokens=req.max_tokens, tool=None
        )
        if result.finish_reason == "length":
            raise LlmError(
                f"Free-text output hit max_tokens ({req.max_tokens}); the result is truncated. "
                "Re-run with a higher max_tokens."
            )
        if result.text.strip() == "":
            raise LlmError(
                f"Free-text call returned no text (finish_reason: {result.finish_reason})."
            )
        return result.text


class LlmError(RuntimeError):
    """Raised for truncated / empty / un-called-tool responses (fail loud)."""


def _default_completion(**kwargs: Any) -> Any:
    # Imported lazily so `import astra_llm` (and the unit tests with a stub) don't pay
    # litellm's import cost or require it for offline use.
    import litellm

    # The pipeline runs unattended, so survive transient provider blips — Anthropic 529
    # "Overloaded" (→ litellm InternalServerError), 429s, timeouts — with litellm's built-in
    # exponential backoff instead of failing a whole mouthpiece run. Only the real path
    # retries; a stubbed `completion_fn` never reaches here. Callers can override.
    kwargs.setdefault("num_retries", 5)
    # Bound each attempt so a stalled/half-open connection can't block a run indefinitely
    # (litellm applies `timeout` per attempt as the HTTP read timeout; with num_retries it
    # fails fast and retries instead of hanging on one socket). Callers can override.
    kwargs.setdefault("timeout", REQUEST_TIMEOUT_S)
    return litellm.completion(**kwargs)
