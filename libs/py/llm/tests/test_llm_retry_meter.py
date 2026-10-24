"""The one retry policy and the one meter (0037 lib-6), on replayed litellm responses."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import litellm
import pytest
from astra_llm import LiteLLMClient, LlmError, RetryPolicy, ToolCallRequest, ToolSpec
from astra_llm.client import _litellm_completion
from astra_llm.meter import provider_of
from astra_observe.testing import Captured
from pydantic import BaseModel

_FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "responses.json").read_text())
_GLM = "openrouter/z-ai/glm-5.2"  # $0.95 / $3.00 per 1M (pricing.py)


def _cost(prompt: int, completion: int) -> float:
    return (prompt * 0.95 + completion * 3.0) / 1_000_000


def _replay(*names: str, **client_kwargs: Any) -> tuple[LiteLLMClient, list[int]]:
    calls: list[int] = []
    queue = [litellm.ModelResponse(**_FIXTURES[n]) for n in names]

    def completion(**_: Any) -> Any:
        calls.append(1)
        return queue.pop(0)

    return LiteLLMClient(completion_fn=completion, **client_kwargs), calls


class _Beat(BaseModel):
    title: str
    order: int


_TOOL = ToolSpec(name="record", description="record", input_schema={"type": "object"})
_TOOL_REQ = ToolCallRequest(system="sys", user_content="content", tool=_TOOL)


# --- retry policy -----------------------------------------------------------------------
def test_content_failures_share_one_per_call_budget() -> None:
    """A missing tool call and two invalid replies spend the 3 attempts together (before
    lib-6 this call could bill 9: 3 validation tries x 3 tool tries)."""
    client, calls = _replay("tool_missing", "tool_invalid", "tool_invalid", "tool_ok")
    with pytest.raises(LlmError, match="failed validation after 3 attempts") as exc:
        client.call_structured(_Beat, system="sys", user_content="hi")
    assert len(calls) == 3
    assert exc.value.retryable is False
    assert exc.value.__cause__ is not None  # chained to the last ValidationError


def test_tool_failures_give_up_with_a_typed_error() -> None:
    client, calls = _replay("tool_missing", "tool_bad_json", "tool_missing")
    with pytest.raises(LlmError, match="Forced tool call failed after 3 attempts"):
        client.call_tool(_TOOL_REQ)
    assert len(calls) == 3


def test_the_run_budget_caps_retries_across_calls() -> None:
    client, calls = _replay(
        "tool_missing", "tool_ok", "tool_missing", retry=RetryPolicy(run_retries=1)
    )
    assert client.call_tool(_TOOL_REQ)["order"] == 1  # spends the one run retry
    with pytest.raises(LlmError, match="run retry budget is spent"):
        client.call_tool(_TOOL_REQ)
    assert len(calls) == 3


def test_truncation_is_not_retried() -> None:
    truncated = {**_FIXTURES["tool_ok"]}
    truncated["choices"] = [{**truncated["choices"][0], "finish_reason": "length"}]
    calls: list[int] = []

    def completion(**_: Any) -> Any:
        calls.append(1)
        return litellm.ModelResponse(**truncated)

    with pytest.raises(LlmError, match="max_tokens"):
        LiteLLMClient(completion_fn=completion).call_tool(_TOOL_REQ)
    assert len(calls) == 1


def test_transport_errors_propagate_unchanged() -> None:
    """litellm's own retries are spent: the error is not an LlmError, so a Dagster
    RetryPolicy may rerun the step."""

    def completion(**_: Any) -> Any:
        raise litellm.InternalServerError("overloaded", llm_provider="openrouter", model=_GLM)

    with pytest.raises(litellm.InternalServerError):
        LiteLLMClient(completion_fn=completion).call_tool(_TOOL_REQ)


def test_the_policy_sets_litellm_transport_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    import astra_llm.client as client_mod

    seen: dict[str, Any] = {}
    monkeypatch.setattr(client_mod, "_default_completion", lambda **kw: seen.update(kw))
    _litellm_completion(2)(model="x")
    assert seen["num_retries"] == 2


def test_policy_rejects_nonsense() -> None:
    with pytest.raises(ValueError, match="attempts"):
        RetryPolicy(attempts=0)


# --- meter ------------------------------------------------------------------------------
def test_every_billed_attempt_is_metered(telemetry_capture: Captured) -> None:
    client, _ = _replay("tool_missing", "tool_ok", caller="mouthpiece.test")
    client.call_tool(_TOOL_REQ)

    m = telemetry_capture
    attrs = {"model": _GLM, "provider": "openrouter", "caller": "mouthpiece.test"}
    assert m.metric_sum("astra.llm.attempts", **attrs, outcome="retried") == 1
    assert m.metric_sum("astra.llm.attempts", **attrs, outcome="ok") == 1
    assert m.metric_sum("astra.llm.cost_usd", **attrs, outcome="ok") == pytest.approx(
        _cost(1200, 80)
    )
    # the discarded reply was billed too, and is priced
    assert m.metric_sum("astra.llm.cost_usd", **attrs, outcome="retried") == pytest.approx(
        _cost(1200, 10)
    )
    assert m.metric_sum("astra.llm.tokens", **attrs, kind="input") == 2400
    assert m.metric_sum("astra.llm.tokens", **attrs, kind="output") == 90
    assert len(m.metric_points("astra.llm.request_duration_ms")) == 1

    spans = [s for s in m.spans() if s.name == "astra.llm.call"]
    attributes = [dict(s.attributes or {}) for s in spans]
    assert [a["astra.llm.outcome"] for a in attributes] == ["retried", "ok"]
    assert attributes[1]["astra.llm.cost_usd"] == pytest.approx(_cost(1200, 80))

    assert client.snapshot() == {
        "calls": 2,
        "cost_usd": round(_cost(1200, 80) + _cost(1200, 10), 6),
        "input_tokens": 2400,
        "output_tokens": 90,
        "priced": True,
    }


def test_an_unpriced_model_is_unknown_never_zero(telemetry_capture: Captured) -> None:
    client, _ = _replay("tool_ok")
    req = ToolCallRequest(system="s", user_content="u", tool=_TOOL, model="groq/unpriced")
    client.call_tool(req)
    assert telemetry_capture.metric_points("astra.llm.cost_usd") == []
    assert telemetry_capture.metric_sum("astra.llm.attempts", provider="groq") == 1
    assert client.snapshot()["priced"] is False


def test_a_transport_error_is_metered_as_an_error(telemetry_capture: Captured) -> None:
    def completion(**_: Any) -> Any:
        raise TimeoutError("read timed out")

    with pytest.raises(TimeoutError):
        LiteLLMClient(completion_fn=completion, caller="c").call_tool(_TOOL_REQ)
    assert telemetry_capture.metric_sum("astra.llm.attempts", caller="c", outcome="error") == 1
    assert telemetry_capture.metric_points("astra.llm.tokens") == []


def test_provider_of() -> None:
    assert provider_of("openrouter/z-ai/glm-5.3") == "openrouter"
    assert provider_of("groq/whisper-large-v3") == "groq"
    assert provider_of("claude-sonnet-4-5") == "anthropic"
    assert provider_of("mystery") == "unknown"
