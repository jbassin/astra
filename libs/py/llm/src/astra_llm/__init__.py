"""astra-llm — the shared LLM client (litellm transport + dspy program layer).

    from astra_llm import LiteLLMClient, ToolCallRequest, ToolSpec
    client = LiteLLMClient()
    data = client.call_tool(ToolCallRequest(system=..., user_content=..., tool=...))

litellm is the transport (uniform call surface, retries, cost hooks); dspy is the program
layer used by linguist + mouthpiece in Phase 3 — `make_dspy_lm()` returns a dspy.LM that
routes through litellm to the same model. No litellm *proxy* in Phase 1 (SDK-first, I6).
"""

from __future__ import annotations

import os
from typing import Any

from .client import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_MODEL,
    LiteLLMClient,
    LlmClient,
    LlmError,
    Result,
    TextRequest,
    ToolCallRequest,
    ToolSpec,
    Usage,
)
from .pricing import PRICING_USD_PER_1M, ModelPricing, TokenCounts, cost_usd
from .transcription import GROQ_WHISPER, Segment, TranscriptionFn, transcribe

#: The env var litellm/anthropic read for the API key.
ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY"
#: The env var litellm reads for OpenRouter-routed models (e.g. GLM 5.2).
OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY"

__all__ = [
    "DEFAULT_MAX_TOKENS",
    "DEFAULT_MODEL",
    "GROQ_WHISPER",
    "PRICING_USD_PER_1M",
    "LiteLLMClient",
    "LlmClient",
    "LlmError",
    "ModelPricing",
    "Result",
    "Segment",
    "TextRequest",
    "TokenCounts",
    "ToolCallRequest",
    "ToolSpec",
    "TranscriptionFn",
    "Usage",
    "ANTHROPIC_API_KEY_ENV",
    "ANTHROPIC_API_KEY_REF",
    "OPENROUTER_API_KEY_ENV",
    "cost_usd",
    "ensure_anthropic_env",
    "ensure_openrouter_env",
    "make_dspy_lm",
    "transcribe",
]


def ensure_anthropic_env() -> str:
    """Resolve the Anthropic key via `astra_config` and expose it to litellm.

    Config/secret resolution (the override→SOPS order, Decision E) lives entirely in
    `astra_config`: this reads `cfg.llm.anthropic_api_key` (a `SecretRef` declared in
    `config.kdl`) and `.resolve()`s it — no ad-hoc env reads, no hardcoded `sops:`
    ref here. The resolved value is then placed in `ANTHROPIC_API_KEY` purely as the
    transport litellm reads. Idempotent, lazy (`astra_config`/`dspy` imported on
    call), never logs the value. Without this bridge litellm sees no key and fails.
    """
    from astra_config import load_config

    ref = load_config().llm.anthropic_api_key
    if ref is None:
        raise LlmError("llm.anthropic-api-key is not set in config.kdl")
    key = ref.resolve()
    os.environ[ANTHROPIC_API_KEY_ENV] = key
    return key


def ensure_openrouter_env() -> str:
    """Resolve the OpenRouter key via `astra_config` and expose it to litellm.

    The GLM-5.2 mirror of `ensure_anthropic_env`: reads `cfg.llm.openrouter_api_key`
    (a `SecretRef` in `config.kdl`, override→SOPS order owned by `astra_config`) and
    places the resolved value in `OPENROUTER_API_KEY`, the env var litellm reads for any
    `openrouter/...` model. Idempotent, lazy, never logs the value. The linguist dspy
    judge + optimizer route through this since both judge + escalate run GLM 5.2.
    """
    from astra_config import load_config

    ref = load_config().llm.openrouter_api_key
    if ref is None:
        raise LlmError("llm.openrouter-api-key is not set in config.kdl")
    key = ref.resolve()
    os.environ[OPENROUTER_API_KEY_ENV] = key
    return key


def make_dspy_lm(model: str = DEFAULT_MODEL, *, max_tokens: int = DEFAULT_MAX_TOKENS) -> Any:
    """A `dspy.LM` routed through litellm to `model` (the Phase-3 program-layer entry).

    dspy is imported lazily so `import astra_llm` and the offline unit tests stay light.
    """
    import dspy

    routed = model if "/" in model else f"anthropic/{model}"
    return dspy.LM(routed, max_tokens=max_tokens)
