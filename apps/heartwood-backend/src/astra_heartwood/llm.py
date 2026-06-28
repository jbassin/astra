"""The shared LLM seam — the injectable client protocols + the real client/model.

Stages 1–2.5 (filter / extract / refine) classify via ``call_structured``; Phase-3's prose
proposer drafts via ``call_text`` (P3.5 — prose must not be tool-JSON-shaped). Both protocols are
the slice of ``LiteLLMClient`` each stage uses, so every stage stays Dagster-free and unit-tests
with a stub (no key, no network) — mirroring chronicle's ``chronicle_llm``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, TypeVar

from pydantic import BaseModel

if TYPE_CHECKING:
    from astra_llm import TextRequest

_T = TypeVar("_T", bound=BaseModel)


class StructuredClient(Protocol):
    """The slice of ``LiteLLMClient`` the extraction stages use (lets tests inject a stub)."""

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


class TextClient(Protocol):
    """The slice of ``LiteLLMClient`` the prose proposer uses (free-text drafting, P3.5)."""

    def call_text(self, req: TextRequest) -> str: ...


def real_client() -> StructuredClient:
    """Build the real client, resolving the OpenRouter key into the env first."""
    from astra_llm import LiteLLMClient, ensure_openrouter_env

    ensure_openrouter_env()
    return LiteLLMClient()


def real_text_client() -> TextClient:
    """The real client typed for free-text drafting (resolves the OpenRouter key first)."""
    from astra_llm import LiteLLMClient, ensure_openrouter_env

    ensure_openrouter_env()
    return LiteLLMClient()


def default_model() -> str:
    """The config-single-source model (GLM-5.2 via ``llm.default-model``)."""
    from astra_ontology_config import load as load_config

    return load_config().llm.default_model
