"""The shared pipeline resources: config-sourced paths, one object per key, the LLM client."""

from pathlib import Path
from typing import NoReturn

import astra_pipeline_resources as res
import dagster as dg
import pytest
from astra_config import load_config
from astra_llm import LiteLLMClient, LlmError, TextRequest, ToolCallRequest, ToolSpec
from pydantic import BaseModel

_TOOL = ToolSpec(name="t", description="d", input_schema={})


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
    client = res.LlmResource().client("mouthpiece.session_script")
    assert isinstance(client, res.FinalFailuresClient)
    assert client.caller == "mouthpiece.session_script"
    assert calls == ["key"]


def test_the_resource_client_makes_spent_retries_final(monkeypatch: pytest.MonkeyPatch) -> None:
    """An asset using the ``llm`` resource gets the final-failure rule without a wrapper."""

    def spent(*_a: object, **_kw: object) -> NoReturn:
        raise LlmError("Forced tool call failed after 3 attempts: no tool call")

    names = ("call_tool", "call_text", "call_structured")
    for name in names:
        monkeypatch.setattr(LiteLLMClient, name, spent)
    client = res.FinalFailuresClient(caller="x")
    calls = (
        lambda: client.call_tool(ToolCallRequest(system="s", user_content="u", tool=_TOOL)),
        lambda: client.call_text(TextRequest(user_content="u")),
        lambda: client.call_structured(BaseModel, system="s", user_content="u"),
    )
    for call in calls:
        with pytest.raises(dg.Failure) as exc:
            call()
        assert exc.value.allow_retries is False


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


class _ProviderError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


@pytest.mark.parametrize("status", [400, 401, 404, 413, 422])
def test_a_deterministic_provider_4xx_is_final(status: int) -> None:
    with pytest.raises(dg.Failure) as exc, res.llm_failures_final():
        raise _ProviderError(status)
    assert exc.value.allow_retries is False


@pytest.mark.parametrize("status", [408, 429, 500, 503])
def test_a_transient_provider_status_keeps_the_retry(status: int) -> None:
    with pytest.raises(_ProviderError), res.llm_failures_final():
        raise _ProviderError(status)


def test_the_shared_policy_retries_three_times_with_backoff() -> None:
    policy = res.EXTERNAL_API_RETRY
    assert (policy.max_retries, policy.delay, policy.backoff) == (
        3,
        120,
        dg.Backoff.EXPONENTIAL,
    )
