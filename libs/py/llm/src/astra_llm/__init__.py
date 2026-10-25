"""astra-llm — the shared LLM client (litellm transport + dspy program layer).

    from astra_llm import LiteLLMClient, ToolCallRequest, ToolSpec
    client = LiteLLMClient()
    data = client.call_tool(ToolCallRequest(system=..., user_content=..., tool=...))

litellm is the transport (uniform call surface, transport retries); dspy is the program
layer used by linguist + mouthpiece in Phase 3 — `make_dspy_lm()` returns a dspy.LM that
routes through litellm to the same model. No litellm *proxy* in Phase 1 (SDK-first, I6).

One meter (`meter.py`) records every billed attempt from both paths as `astra.llm.*`; one
retry policy (`retry.py`) bounds billed retries per call and per run.
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
from .meter import Ledger
from .pricing import PRICING_USD_PER_1M, ModelPricing, TokenCounts, cost_usd
from .retry import DEFAULT_RETRY_POLICY, RetryPolicy
from .transcription import GROQ_WHISPER, Segment, TranscriptionFn, transcribe

#: The env var litellm reads for OpenRouter-routed models (e.g. GLM 5.2).
OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY"

__all__ = [
    "DEFAULT_MAX_TOKENS",
    "DEFAULT_MODEL",
    "DEFAULT_RETRY_POLICY",
    "GROQ_WHISPER",
    "OPENROUTER_API_KEY_ENV",
    "PRICING_USD_PER_1M",
    "Ledger",
    "LiteLLMClient",
    "LlmClient",
    "LlmError",
    "ModelPricing",
    "Result",
    "RetryPolicy",
    "Segment",
    "TextRequest",
    "TokenCounts",
    "ToolCallRequest",
    "ToolSpec",
    "TranscriptionFn",
    "Usage",
    "cost_usd",
    "ensure_openrouter_env",
    "make_dspy_lm",
    "transcribe",
]


def ensure_openrouter_env() -> str:
    """Resolve the OpenRouter key via `astra_config` and expose it to litellm.

    Reads `cfg.llm.openrouter_api_key` (a `SecretRef` in `config.kdl`, override→SOPS
    order owned by `astra_config`) and places the resolved value in `OPENROUTER_API_KEY`,
    the env var litellm reads for any `openrouter/...` model. Idempotent, lazy, never logs
    the value. Without this bridge litellm sees no key and fails.
    """
    from astra_config import load_config

    ref = load_config().llm.openrouter_api_key
    if ref is None:
        raise LlmError("llm.openrouter-api-key is not set in config.kdl")
    key = ref.require()
    os.environ[OPENROUTER_API_KEY_ENV] = key
    return key


def make_dspy_lm(
    model: str = DEFAULT_MODEL,
    *,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    lm_class: type | None = None,
    **lm_kwargs: Any,
) -> Any:
    """A `dspy.LM` routed through litellm to `model`, a full litellm `provider/model` id.

    ``lm_kwargs`` pass straight through to the constructor (e.g. ``cache=False`` so a
    rerun makes real calls). ``lm_class`` swaps in a ``dspy.LM`` subclass (heartwood's
    metering ``MeteredLM``); it receives the same arguments. dspy is
    imported lazily so `import astra_llm` and the offline unit tests stay light.
    """
    import dspy

    cls = lm_class if lm_class is not None else dspy.LM
    return cls(model, max_tokens=max_tokens, **lm_kwargs)
