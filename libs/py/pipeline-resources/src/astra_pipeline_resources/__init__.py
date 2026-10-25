"""The Dagster resources the pipeline apps share.

An asset declares what it needs as a parameter, and Dagster injects it by key:

    @dg.asset
    def session_digest(llm: LlmResource, pipeline_paths: PipelinePaths) -> ...

- ``astra_config`` (`AstraConfig`): config.kdl, loaded once per process.
- ``pipeline_paths`` (`PipelinePaths`): every runtime data path the assets read or write.
- ``llm`` (`LlmResource`): builds the `astra_llm` client, with the OpenRouter key in place.

An asset that calls an LLM wraps that work in `llm_failures_final()`, so a step whose LLM
retries are spent fails once instead of being rerun by the asset's ``RetryPolicy``
(`astra_llm.retry` explains the two retry levels).

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

import dagster as dg
from astra_config import Config, load_config
from astra_llm import LiteLLMClient, LlmError, ensure_openrouter_env

__all__ = [
    "AstraConfig",
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
        """
        ensure_openrouter_env()
        return LiteLLMClient(caller=caller)


@contextmanager
def llm_failures_final() -> Iterator[None]:
    """Turn a non-retryable `LlmError` into ``dg.Failure(allow_retries=False)``.

    The client has already spent its retries on the billed content failure, so a step
    rerun would re-bill the same failure (and every call before it). Other errors, such as
    a transport error litellm gave up on, pass through for the asset's ``RetryPolicy``.
    """
    try:
        yield
    except LlmError as err:
        if err.retryable:
            raise
        raise dg.Failure(description=str(err), allow_retries=False) from err


@cache
def default_resources() -> dict[str, dg.ConfigurableResource]:
    """The production resources, built once so every app's ``defs`` binds the same objects."""
    return {
        "astra_config": AstraConfig(),
        "pipeline_paths": PipelinePaths.from_config(loaded_config()),
        "llm": LlmResource(),
    }
