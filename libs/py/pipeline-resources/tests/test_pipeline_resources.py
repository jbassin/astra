"""The shared pipeline resources: config-sourced paths, one object per key, the LLM client."""

from pathlib import Path
from typing import Any

import astra_pipeline_resources as res
import dagster as dg
import pytest
from astra_config import load_config
from astra_llm import LlmError


def test_paths_come_from_config() -> None:
    cfg = load_config()
    paths = res.PipelinePaths.from_config(cfg)
    assert paths.scribe_incoming == cfg.scribe.incoming_path
    assert paths.scribe_tmp == cfg.scribe.tmp_path
    assert paths.scribe_data == cfg.scribe.data_path
    assert paths.linguist_saved == cfg.linguist.ingest_saved_dir
    assert paths.linguist_data == cfg.data.linguist_data
    assert paths.linguist_script == cfg.linguist.script_path
    assert paths.transcripts == Path(cfg.data.linguist_transcripts)
    assert paths.chronicle_episodes == Path(cfg.data.linguist_timeline) / "episodes"
    assert paths.seasons == Path(cfg.data.linguist_timeline) / "seasons.json"
    assert paths.akasha_content == cfg.data.akasha_content
    assert paths.episodes == Path(cfg.mouthpiece.episodes_path)
    assert paths.heartwood_requests == cfg.heartwood.requests_path


def test_default_resources_are_built_once() -> None:
    """Definitions.merge rejects two different objects under one key, so every app must bind
    the very same resource objects."""
    first, second = res.default_resources(), res.default_resources()
    assert first.keys() == {"astra_config", "pipeline_paths", "llm"}
    assert all(first[key] is second[key] for key in first)
    merged = dg.Definitions.merge(
        dg.Definitions(resources=res.default_resources()),
        dg.Definitions(resources=res.default_resources()),
    )
    assert merged.resources is not None and merged.resources.keys() == first.keys()


def test_config_is_loaded_once_per_process() -> None:
    assert res.AstraConfig().get() is res.AstraConfig().get()


def test_llm_client_resolves_the_openrouter_key_first(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(res, "ensure_openrouter_env", lambda: calls.append("key") or "k")

    class Client:
        def __init__(self, *, caller: str) -> None:
            calls.append(f"client:{caller}")

    monkeypatch.setattr(res, "LiteLLMClient", Client)
    client: Any = res.LlmResource().client("mouthpiece.session_script")
    assert isinstance(client, Client)
    assert calls == ["key", "client:mouthpiece.session_script"]


def test_a_spent_llm_retry_is_final_for_dagster() -> None:
    """The client's retries are spent: Dagster must not rerun the step (no N x M)."""
    with pytest.raises(dg.Failure) as exc, res.llm_failures_final():
        raise LlmError("Forced tool call failed after 3 attempts: no tool call")
    assert exc.value.allow_retries is False
    assert "after 3 attempts" in (exc.value.description or "")


def test_transport_and_retryable_errors_pass_through_to_dagster() -> None:
    with pytest.raises(TimeoutError), res.llm_failures_final():
        raise TimeoutError("read timed out")
    with pytest.raises(LlmError), res.llm_failures_final():
        raise LlmError("transient", retryable=True)


def test_a_spent_retry_fails_the_asset_once_despite_its_retry_policy() -> None:
    """End to end in Dagster: a step with RetryPolicy(max_retries=3) runs once."""
    runs: list[int] = []

    @dg.asset(retry_policy=dg.RetryPolicy(max_retries=3))
    def paid() -> None:
        runs.append(1)
        with res.llm_failures_final():
            raise LlmError("Structured output for X failed validation after 3 attempts")

    result = dg.materialize([paid], raise_on_error=False)
    assert not result.success
    assert runs == [1]


def test_a_transport_error_still_gets_the_retry_policy() -> None:
    runs: list[int] = []

    @dg.asset(retry_policy=dg.RetryPolicy(max_retries=2))
    def paid() -> None:
        runs.append(1)
        with res.llm_failures_final():
            raise ConnectionError("provider down")

    result = dg.materialize([paid], raise_on_error=False)
    assert not result.success
    assert runs == [1, 1, 1]
