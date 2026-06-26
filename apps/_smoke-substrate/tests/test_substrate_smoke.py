"""Offline coverage for the substrate smoke — real client, stubbed completion, no network.

Sets OPENROUTER_API_KEY so secret resolution takes the env-override path (no SOPS age key
needed — this is what lets the test run in CI, where the key file is absent)."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from astra_llm import LiteLLMClient
from astra_smoke_substrate import run


def _fake_completion(**_: Any) -> Any:
    args = json.dumps({"status": "online", "note": "phase 1 substrate live"})
    fn = SimpleNamespace(name="record_heartbeat", arguments=args)
    message = SimpleNamespace(content="", tool_calls=[SimpleNamespace(function=fn)])
    choice = SimpleNamespace(finish_reason="tool_calls", message=message)
    usage = SimpleNamespace(
        prompt_tokens=20,
        completion_tokens=8,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
        prompt_tokens_details=None,
    )
    return SimpleNamespace(choices=[choice], usage=usage)


def test_smoke_runs_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    # run() bridges the OpenRouter key via ensure_openrouter_env() (the default model is
    # GLM 5.2); set THAT env override so the offline smoke resolves it directly and never
    # shells out to `sops` (absent in CI). The Anthropic key stays wired as a fallback.
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-offline")
    summary = run(LiteLLMClient(completion_fn=_fake_completion))
    assert summary["model"] == "openrouter/z-ai/glm-5.2"
    assert summary["players"] == 5  # ontology-being consolidation
    assert summary["being_parity"] is True  # canonical JSON round-trips
    assert summary["status"] == "online"  # forced-tool → Pydantic path
