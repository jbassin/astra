"""astra-llm unit tests — mirror @faerrin/llm's client.test.ts via a stub completion_fn.

No network: a fake litellm-shaped response is injected, so the contract (truncation
guard, forced-tool parse, cost pricing) is exercised offline.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from astra_llm import (
    LiteLLMClient,
    LlmError,
    TextRequest,
    ToolCallRequest,
    ToolSpec,
    cost_usd,
)
from astra_llm.client import TokenCounts, _extract_usage
from pydantic import BaseModel


def _usage(prompt: int = 0, completion: int = 0, cache_read: int = 0, cache_write: int = 0) -> Any:
    return SimpleNamespace(
        prompt_tokens=prompt,
        completion_tokens=completion,
        cache_read_input_tokens=cache_read,
        cache_creation_input_tokens=cache_write,
        prompt_tokens_details=None,
    )


def _response(
    *,
    content: str | None = "",
    tool_args: dict[str, Any] | None = None,
    tool_name: str = "record_thing",
    finish_reason: str = "stop",
    usage: Any | None = None,
) -> Any:
    tool_calls = None
    if tool_args is not None:
        fn = SimpleNamespace(name=tool_name, arguments=json.dumps(tool_args))
        tool_calls = [SimpleNamespace(function=fn)]
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    choice = SimpleNamespace(finish_reason=finish_reason, message=message)
    return SimpleNamespace(choices=[choice], usage=usage)


def _client(response: Any) -> LiteLLMClient:
    return LiteLLMClient(completion_fn=lambda **_: response)


TOOL = ToolSpec(
    name="record_thing",
    description="record",
    input_schema={"type": "object", "properties": {}, "additionalProperties": True},
)
TOOL_REQ = ToolCallRequest(system="sys", user_content="content", tool=TOOL)


# --- call_tool -------------------------------------------------------------------------
def test_call_tool_returns_forced_input() -> None:
    client = _client(_response(tool_args={"ok": True}, finish_reason="tool_calls"))
    assert client.call_tool(TOOL_REQ) == {"ok": True}


def test_call_tool_raises_on_truncation() -> None:
    client = _client(_response(tool_args={"partial": True}, finish_reason="length"))
    with pytest.raises(LlmError, match="max_tokens"):
        client.call_tool(TOOL_REQ)


def test_call_tool_raises_when_tool_not_called() -> None:
    client = _client(_response(content="nope", finish_reason="stop"))
    with pytest.raises(LlmError, match="did not call the forced tool"):
        client.call_tool(TOOL_REQ)


# --- call_structured (forced-tool → Pydantic) -----------------------------------------
class _Beat(BaseModel):
    title: str
    order: int


def test_call_structured_returns_validated_model() -> None:
    client = _client(
        _response(tool_args={"title": "The Voidheart", "order": 1}, finish_reason="tool_calls")
    )
    beat = client.call_structured(_Beat, system="sys", user_content="hi")
    assert isinstance(beat, _Beat)
    assert beat.title == "The Voidheart" and beat.order == 1


# --- call_text -------------------------------------------------------------------------
def test_call_text_returns_text() -> None:
    client = _client(_response(content="Bram: uh— Maeve: the Voidheart.", finish_reason="stop"))
    assert client.call_text(TextRequest(user_content="hi")) == "Bram: uh— Maeve: the Voidheart."


def test_call_text_raises_when_empty() -> None:
    client = _client(_response(content="", finish_reason="stop"))
    with pytest.raises(LlmError, match="no text"):
        client.call_text(TextRequest(user_content="hi"))


def test_call_text_raises_on_truncation() -> None:
    client = _client(_response(content="Bram: half a tra", finish_reason="length"))
    with pytest.raises(LlmError, match="max_tokens"):
        client.call_text(TextRequest(user_content="hi"))


# --- usage + pricing -------------------------------------------------------------------
def test_usage_buckets_are_disjoint() -> None:
    # prompt_tokens is reported inclusive of cache; uncached input is the remainder.
    usage = _extract_usage(_usage(prompt=100, completion=30, cache_read=20, cache_write=10))
    assert usage.input_tokens == 70
    assert usage.cache_read_tokens == 20
    assert usage.cache_write_tokens == 10
    assert usage.output_tokens == 30


def test_cost_known_model_and_unknown_zero() -> None:
    # 1M uncached input on opus-4-8 = $5.00; unknown model = $0.
    assert cost_usd("claude-opus-4-8", TokenCounts(1_000_000, 0, 0, 0)) == pytest.approx(5.0)
    assert cost_usd("claude-opus-4-8", TokenCounts(0, 0, 0, 1_000_000)) == pytest.approx(25.0)
    assert cost_usd("no-such-model", TokenCounts(1_000_000, 0, 0, 0)) == 0.0
