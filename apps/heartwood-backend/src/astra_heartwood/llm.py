"""The shared LLM seam — the injectable structured-client protocol + the real client/model.

Both Stage 1 (filter) and Stage 2 (extract) classify/extract via ``call_structured`` on the
config-single-source model (GLM-5.2). Keeping the protocol + the real-client/model helpers
here lets every stage stay Dagster-free and unit-test with a stub (no key, no network) —
mirroring chronicle's ``chronicle_llm``.
"""

from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

_T = TypeVar("_T", bound=BaseModel)


class StructuredClient(Protocol):
    """The slice of ``LiteLLMClient`` heartwood uses (lets tests inject a stub)."""

    def call_structured(
        self,
        output_model: type[_T],
        *,
        system: str,
        user_content: str,
        model: str,
        max_tokens: int = ...,
        tool_name: str = ...,
        tool_description: str = ...,
    ) -> _T: ...


def real_client() -> StructuredClient:
    """Build the real client, resolving the OpenRouter key into the env first."""
    from astra_llm import LiteLLMClient, ensure_openrouter_env

    ensure_openrouter_env()
    return LiteLLMClient()


def default_model() -> str:
    """The config-single-source model (GLM-5.2 via ``llm.default-model``)."""
    from astra_ontology_config import load as load_config

    return load_config().llm.default_model
