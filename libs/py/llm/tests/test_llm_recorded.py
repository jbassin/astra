"""Successful calls behave exactly as before the one retry policy (0037 lib-6).

Each case replays litellm ``ModelResponse`` objects built from ``fixtures/responses.json``
and pins the output and the number of completions made. The table holds the values the
client produced before lib-6 (the pre-change client passes this file unchanged), so a
change to either is a behaviour change for a call that succeeds.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import litellm
import pytest
from astra_llm import LiteLLMClient, TextRequest, ToolCallRequest, ToolSpec
from pydantic import BaseModel

_FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "responses.json").read_text())


def _replay(*names: str) -> tuple[LiteLLMClient, list[dict[str, Any]]]:
    """A client whose completions return the named fixtures in order; the list records
    each completion's kwargs."""
    calls: list[dict[str, Any]] = []
    queue = [litellm.ModelResponse(**_FIXTURES[n]) for n in names]

    def completion(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return queue.pop(0)

    return LiteLLMClient(completion_fn=completion), calls


class _Beat(BaseModel):
    title: str
    order: int


_TOOL = ToolSpec(name="record", description="record", input_schema={"type": "object"})
_TOOL_REQ = ToolCallRequest(system="sys", user_content="content", tool=_TOOL)

_BEAT = {"title": "The Voidheart", "order": 1}


@pytest.mark.parametrize(
    ("replies", "expected", "completions"),
    [
        (["tool_ok"], _BEAT, 1),
        (["tool_missing", "tool_ok"], _BEAT, 2),
        (["tool_bad_json", "tool_ok"], _BEAT, 2),
        (["tool_missing", "tool_bad_json", "tool_ok"], _BEAT, 3),
    ],
)
def test_call_tool(replies: list[str], expected: Any, completions: int) -> None:
    client, calls = _replay(*replies)
    assert client.call_tool(_TOOL_REQ) == expected
    assert len(calls) == completions


@pytest.mark.parametrize(
    ("replies", "completions"),
    [
        (["tool_ok"], 1),
        (["tool_invalid", "tool_ok"], 2),
        (["tool_missing", "tool_ok"], 2),
        (["tool_invalid", "tool_invalid", "tool_ok"], 3),
        (["tool_bad_json", "tool_invalid", "tool_ok"], 3),
    ],
)
def test_call_structured(replies: list[str], completions: int) -> None:
    client, calls = _replay(*replies)
    beat = client.call_structured(_Beat, system="sys", user_content="hi")
    assert beat == _Beat(title="The Voidheart", order=1)
    assert len(calls) == completions


def test_call_text() -> None:
    client, calls = _replay("text_ok")
    assert client.call_text(TextRequest(user_content="hi")) == "Bram: uh— Maeve: the Voidheart."
    assert len(calls) == 1


def test_a_run_of_calls_on_one_client() -> None:
    """A Pass A + Pass B shaped run: the request kwargs and outputs are as before."""
    client, calls = _replay("text_ok", "tool_ok", "tool_missing", "tool_ok", "tool_ok")
    text = client.call_text(TextRequest(user_content="hi", system="improv", max_tokens=99))
    tools = [client.call_tool(_TOOL_REQ) for _ in range(3)]
    assert text == "Bram: uh— Maeve: the Voidheart."
    assert tools == [_BEAT, _BEAT, _BEAT]
    assert len(calls) == 5
    assert calls[0] == {
        "model": "openrouter/z-ai/glm-5.2",
        "messages": [
            {
                "role": "system",
                "content": [
                    {"type": "text", "text": "improv", "cache_control": {"type": "ephemeral"}}
                ],
            },
            {"role": "user", "content": "hi"},
        ],
        "max_tokens": 99,
    }
    assert calls[1]["tool_choice"] == {"type": "function", "function": {"name": "record"}}
    assert calls[2] == calls[1]  # a retry resends the identical request
