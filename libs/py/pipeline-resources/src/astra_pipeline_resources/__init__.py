"""The Dagster resources the pipeline apps share.

An asset declares what it needs as a parameter, and Dagster injects it by key:

    @dg.asset
    def session_digest(llm: LlmResource, pipeline_paths: PipelinePaths) -> ...

- ``astra_config`` (`AstraConfig`): config.kdl, loaded once per process.
- ``pipeline_paths`` (`PipelinePaths`): every runtime data path the assets read or write.
- ``llm`` (`LlmResource`): builds the `astra_llm` client, with the OpenRouter key in place.

The client ``llm`` builds already treats its final failures as final for Dagster
(`llm_failures_final`), so a step whose LLM retries are spent, or that a provider rejected
with a 4xx, fails once instead of being rerun by the asset's ``RetryPolicy``
(`astra_llm.retry` explains the two retry levels). The policy itself, and the assets that have
none, are in `astra_pipeline_resources.retries`.

Each app binds `default_resources()` in its ``defs``. The values are cached, so every app
binds the same objects and ``dg.Definitions.merge`` accepts them (it rejects two different
objects under one key). Tests pass their own values to ``dg.materialize(resources=...)``:
a `PipelinePaths` over ``tmp_path``, and plain objects with the same methods as fakes for
the other two (no key, no network, no money).

The key ``astra_config`` is not ``config`` because Dagster reserves an asset's ``config``
parameter for run config.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from functools import cache
from pathlib import Path
from typing import TypeVar

import dagster as dg
from astra_config import Config, load_config
from astra_llm import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_MODEL,
    LiteLLMClient,
    LlmError,
    TextRequest,
    ToolCallRequest,
    ensure_openrouter_env,
)
from pydantic import BaseModel

from .retries import EXTERNAL_API_RETRY, NO_RETRY, client_error_status

_T = TypeVar("_T", bound=BaseModel)

__all__ = [
    "EXTERNAL_API_RETRY",
    "NO_RETRY",
    "AstraConfig",
    "FinalFailuresClient",
    "LlmResource",
    "PipelinePaths",
    "default_resources",
    "llm_failures_final",
    "loaded_config",
]


@cache
def loaded_config() -> Config:
    """config.kdl, parsed once per process. Secrets stay lazy: a `SecretRef` resolves only
    when an asset calls ``require()``."""
    return load_config()


class AstraConfig(dg.ConfigurableResource):
    """The loaded config.kdl. Assets read model pins, secrets and limits through ``get()``."""

    def get(self) -> Config:
        return loaded_config()


class PipelinePaths(dg.ConfigurableResource):
    """The runtime data paths the pipeline assets read and write.

    Production builds it from config.kdl (`from_config`), so the paths are those of
    ``data.root`` (/ruby/data/astra-state). A test builds it over ``tmp_path``.
    """

    #: Where Craig zips land (`scribe.incoming-path`).
    scribe_incoming: str
    #: scribe's per-session work dir (`scribe.tmp-path`).
    scribe_tmp: str
    #: scribe's output root; sessions go to ``saved/<date>/`` (`scribe.data-path`).
    scribe_data: str
    #: The ``saved/`` dir linguist ingests from (`linguist.ingest-saved-dir`).
    linguist_saved: str
    #: linguist's per-session JSON (`data.linguist-data`).
    linguist_data: str
    #: linguist's campaign-matched context scripts (`linguist.script-path`).
    linguist_script: str
    #: The canonical transcripts (`data.linguist-transcripts`).
    linguist_transcripts: str
    #: The chronicle: ``episodes/<date>.json`` and ``seasons.json`` (`data.linguist-timeline`).
    linguist_timeline: str
    #: The akasha wiki corpus (`data.akasha-content`).
    akasha_content: str
    #: mouthpiece's per-session episode dirs (`mouthpiece.episodes-path`).
    mouthpiece_episodes: str
    #: The Dagster-to-host heartwood request dir (`heartwood.requests-path`).
    heartwood_requests: str

    @classmethod
    def from_config(cls, cfg: Config) -> "PipelinePaths":
        return cls(
            scribe_incoming=cfg.scribe.incoming_path,
            scribe_tmp=cfg.scribe.tmp_path,
            scribe_data=cfg.scribe.data_path,
            linguist_saved=cfg.linguist.ingest_saved_dir,
            linguist_data=cfg.data.linguist_data,
            linguist_script=cfg.linguist.script_path,
            linguist_transcripts=cfg.data.linguist_transcripts,
            linguist_timeline=cfg.data.linguist_timeline,
            akasha_content=cfg.data.akasha_content,
            mouthpiece_episodes=cfg.mouthpiece.episodes_path,
            heartwood_requests=cfg.heartwood.requests_path,
        )

    @property
    def transcripts(self) -> Path:
        return Path(self.linguist_transcripts)

    @property
    def chronicle_episodes(self) -> Path:
        """``<timeline>/episodes``: one chronicle `EpisodeEntry` per session."""
        return Path(self.linguist_timeline) / "episodes"

    @property
    def seasons(self) -> Path:
        """``<timeline>/seasons.json``: the grouped `Chronicle`."""
        return Path(self.linguist_timeline) / "seasons.json"

    @property
    def episodes(self) -> Path:
        return Path(self.mouthpiece_episodes)


class LlmResource(dg.ConfigurableResource):
    """Builds the `astra_llm` client. All pipeline LLM calls go through it (CLAUDE.md)."""

    def client(self, caller: str) -> LiteLLMClient:
        """A fresh client, with the OpenRouter key resolved into litellm's env first.

        ``caller`` (the asset's name, e.g. ``mouthpiece.session_script``) labels its calls on
        the LLM meter. Fresh per call, so each asset execution gets a full run retry budget.
        Its final failures skip the asset's ``RetryPolicy`` (`FinalFailuresClient`).
        """
        ensure_openrouter_env()
        return FinalFailuresClient(caller=caller)


@contextmanager
def llm_failures_final() -> Iterator[None]:
    """Turn a failure that a step rerun would only repeat into
    ``dg.Failure(allow_retries=False)``.

    Two kinds: a non-retryable `LlmError` (the client has already spent its retries on a
    billed content failure, so a rerun would re-bill it and every call before it), and a
    provider's deterministic 4xx (`retries.client_error_status`: a bad request, a rejected
    key, an oversized upload). Other errors, such as a 5xx or a transport error litellm gave
    up on, pass through for the asset's ``RetryPolicy``.
    """
    try:
        yield
    except LlmError as err:
        if err.retryable:
            raise
        raise dg.Failure(description=str(err), allow_retries=False) from err
    except Exception as err:
        status = client_error_status(err)
        if status is None:
            raise
        raise dg.Failure(
            description=f"provider rejected the request ({status}): {err}", allow_retries=False
        ) from err


class FinalFailuresClient(LiteLLMClient):
    """`LiteLLMClient` whose public calls run inside `llm_failures_final`, so an asset that
    uses the ``llm`` resource gets the final-failure rule without wrapping its body."""

    def call_tool(self, req: ToolCallRequest) -> dict[str, object]:
        with llm_failures_final():
            return super().call_tool(req)

    def call_text(self, req: TextRequest) -> str:
        with llm_failures_final():
            return super().call_text(req)

    def call_structured(
        self,
        output_model: type[_T],
        *,
        system: str,
        user_content: str,
        model: str = DEFAULT_MODEL,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        tool_name: str = "record",
        tool_description: str = "Record the structured result.",
    ) -> _T:
        with llm_failures_final():
            return super().call_structured(
                output_model,
                system=system,
                user_content=user_content,
                model=model,
                max_tokens=max_tokens,
                tool_name=tool_name,
                tool_description=tool_description,
            )


@cache
def default_resources() -> dict[str, dg.ConfigurableResource]:
    """The production resources, built once so every app's ``defs`` binds the same objects."""
    return {
        "astra_config": AstraConfig(),
        "pipeline_paths": PipelinePaths.from_config(loaded_config()),
        "llm": LlmResource(),
    }
