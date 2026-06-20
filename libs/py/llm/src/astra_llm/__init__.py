"""astra-llm — the shared LLM client (litellm transport + dspy program layer).

    from astra_llm import LiteLLMClient, ToolCallRequest, ToolSpec
    client = LiteLLMClient()
    data = client.call_tool(ToolCallRequest(system=..., user_content=..., tool=...))

litellm is the transport (uniform call surface, retries, cost hooks); dspy is the program
layer used by linguist + mouthpiece in Phase 3 — `make_dspy_lm()` returns a dspy.LM that
routes through litellm to the same model. No litellm *proxy* in Phase 1 (SDK-first, I6).
"""

from __future__ import annotations

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
    "cost_usd",
    "make_dspy_lm",
    "transcribe",
]


def make_dspy_lm(model: str = DEFAULT_MODEL, *, max_tokens: int = DEFAULT_MAX_TOKENS) -> Any:
    """A `dspy.LM` routed through litellm to `model` (the Phase-3 program-layer entry).

    dspy is imported lazily so `import astra_llm` and the offline unit tests stay light.
    """
    import dspy

    routed = model if "/" in model else f"anthropic/{model}"
    return dspy.LM(routed, max_tokens=max_tokens)
