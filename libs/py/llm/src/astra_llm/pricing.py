"""USD per 1,000,000 tokens — the cost table behind cost→OTel (retires faerrin's pricing.ts).

Rates from the claude-api skill (verified, not guessed). Cache-write is the 5-minute-TTL
rate (1.25× input); cache-read is 0.1× input. Only cost-tracked models need a row; an
unknown model costs 0 (graceful — surfaced in summaries rather than throwing).
"""

from __future__ import annotations

from typing import NamedTuple


class ModelPricing(NamedTuple):
    input: float  # uncached input
    cache_read: float  # reads from prompt cache (0.1× input)
    cache_write: float  # 5-minute-TTL cache writes (1.25× input)
    output: float


PRICING_USD_PER_1M: dict[str, ModelPricing] = {
    "claude-opus-4-8": ModelPricing(input=5.0, cache_read=0.5, cache_write=6.25, output=25.0),
    "claude-sonnet-4-6": ModelPricing(input=3.0, cache_read=0.3, cache_write=3.75, output=15.0),
    "claude-haiku-4-5-20251001": ModelPricing(
        input=1.0, cache_read=0.1, cache_write=1.25, output=5.0
    ),
}


class TokenCounts(NamedTuple):
    input: int
    cache_read: int
    cache_write: int
    output: int


def cost_usd(model: str, tokens: TokenCounts) -> float:
    """USD for a call's token usage; unknown model → 0.0 (never throws)."""
    p = PRICING_USD_PER_1M.get(model)
    if p is None:
        return 0.0
    return (
        tokens.input * p.input
        + tokens.cache_read * p.cache_read
        + tokens.cache_write * p.cache_write
        + tokens.output * p.output
    ) / 1_000_000
