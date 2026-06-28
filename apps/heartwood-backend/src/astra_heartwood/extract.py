"""Stage 2 — the noun-fact extractor (spec §7).

``call_structured`` over the filter's kept context → a list of atomic, grounded
noun-facts. Plain factual claims, NOT polished wiki prose (Phase 3). Large kept contexts
are split under a word budget (mouthpiece ``_split_transcript`` precedent) and the fact
lists concatenated. Client + model are injectable (Dagster-free) for stub testing.
"""

from __future__ import annotations

from .llm import StructuredClient, default_model, real_client
from .models import NounFact, _Base
from .prompts import EXTRACT_SYSTEM

EXTRACT_MAX_TOKENS = 8_000
EXTRACT_CHUNK_WORDS = 16_000


class _NounFacts(_Base):
    """The forced-tool output wrapper for Stage 2."""

    facts: list[NounFact]


def _split(text: str, max_words: int) -> list[str]:
    """Split rendered ``Speaker: text`` lines into chunks bounded by a word budget."""
    chunks: list[str] = []
    cur: list[str] = []
    cur_words = 0
    for line in text.split("\n"):
        wc = len(line.split())
        if cur and cur_words + wc > max_words:
            chunks.append("\n".join(cur))
            cur, cur_words = [], 0
        cur.append(line)
        cur_words += wc
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def extract_facts(
    kept_text: str,
    *,
    client: StructuredClient | None = None,
    model: str | None = None,
    chunk_words: int = EXTRACT_CHUNK_WORDS,
) -> list[NounFact]:
    """Extract atomic noun-facts from the filter's kept context (empty → no facts)."""
    if not kept_text.strip():
        return []
    client = client if client is not None else real_client()
    model = model if model is not None else default_model()

    facts: list[NounFact] = []
    for chunk in _split(kept_text, chunk_words):
        out = client.call_structured(
            _NounFacts,
            system=EXTRACT_SYSTEM,
            user_content=chunk,
            model=model,
            max_tokens=EXTRACT_MAX_TOKENS,
            tool_name="record_noun_facts",
            tool_description="Record every durable noun-fact the text establishes.",
        )
        facts.extend(out.facts)
    return facts
