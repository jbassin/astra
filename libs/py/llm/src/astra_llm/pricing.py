"""USD per 1,000,000 tokens — the cost table behind cost→OTel (retires faerrin's pricing.ts).

Rates from each model's OpenRouter listing. Cache-write is kept at 1.25× input and
cache-read at 0.1× input. Only cost-tracked models need a row. `cost_usd()` returns 0.0 for
a model with no row and never throws, so it cannot tell "unknown" from "free". A caller that
must keep that difference checks `PRICING_USD_PER_1M` first, as `LiteLLMClient._price` does: it
records an unpriced model's cost as unknown (`None`), never as 0.
"""

from __future__ import annotations

from typing import NamedTuple


class ModelPricing(NamedTuple):
    input: float  # uncached input
    cache_read: float  # reads from prompt cache (0.1× input)
    cache_write: float  # 5-minute-TTL cache writes (1.25× input)
    output: float


PRICING_USD_PER_1M: dict[str, ModelPricing] = {
    # GLM 5.2 (open-weight) routed via OpenRouter — mouthpiece's default model. Rate from
    # OpenRouter's listing (~$0.95/$3.00 per 1M; can drift as OpenRouter routes to
    # different upstream providers). OpenRouter doesn't surface separate cache
    # buckets, so cache_* tokens are ~always 0; kept at the usual 0.1x/1.25x ratios.
    "openrouter/z-ai/glm-5.2": ModelPricing(
        input=0.95, cache_read=0.095, cache_write=1.19, output=3.0
    ),
    # GLM 5.3 via OpenRouter — mouthpiece's model (mouthpiece.model). OpenRouter `/models`
    # listing on 2026-10-12: $0.079/$4.80 per 1M (recorded in the 0034 producer spec's
    # pre-run check; the 2026-09 row said $1.15/$3.50). cache_* kept at the 0.1x/1.25x
    # ratios, since the listing gives no cache prices.
    "openrouter/z-ai/glm-5.3": ModelPricing(
        input=0.079, cache_read=0.0079, cache_write=0.09875, output=4.80
    ),
    # DeepSeek V4.1 Flash via OpenRouter — heartwood's agent model and the 0034 producer +
    # experiment arm. OpenRouter listing 2026-10-12: $0.15/$0.60 per 1M (was $0.30/$1.20
    # at the 0033 scope); cache_* kept at the usual 0.1x/1.25x ratios.
    "openrouter/deepseek/deepseek-v4.1-flash": ModelPricing(
        input=0.15, cache_read=0.015, cache_write=0.1875, output=0.60
    ),
}


class TokenCounts(NamedTuple):
    input: int
    cache_read: int
    cache_write: int
    output: int


def cost_usd(model: str, tokens: TokenCounts) -> float:
    """USD for a call's token usage; a model with no row returns 0.0 (never throws)."""
    p = PRICING_USD_PER_1M.get(model)
    if p is None:
        return 0.0
    return (
        tokens.input * p.input
        + tokens.cache_read * p.cache_read
        + tokens.cache_write * p.cache_write
        + tokens.output * p.output
    ) / 1_000_000
