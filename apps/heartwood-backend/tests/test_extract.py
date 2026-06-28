"""Stage-2 noun-fact extractor (Phase-2 spec §7, S3) — stub client, no network.

Covers: extraction returns the model's facts; empty kept-context short-circuits (no call);
and a large context is chunked under the word budget with the fact lists concatenated.
"""

from __future__ import annotations

from typing import TypeVar

from astra_heartwood.extract import _NounFacts, extract_facts
from astra_heartwood.models import NounFact
from pydantic import BaseModel

_M = TypeVar("_M", bound=BaseModel)


class _Stub:
    """A stub structured client returning a canned set of noun-facts on every call."""

    def __init__(self, facts: list[NounFact]) -> None:
        self._payload = _NounFacts(facts=facts).model_dump()
        self.calls = 0

    def call_structured(  # noqa: PLR0913
        self,
        output_model: type[_M],
        *,
        system: str,
        user_content: str,
        model: str,
        max_tokens: int = 0,
        tool_name: str = "record",
        tool_description: str = "record",
    ) -> _M:
        self.calls += 1
        return output_model.model_validate(self._payload)


def test_extract_returns_facts() -> None:
    stub = _Stub([NounFact(subject="Ichel", kind_hint="person", claim="Ichel leads the Scale.")])
    facts = extract_facts("Gamemaster: Ichel leads the Scale.", client=stub, model="stub")
    assert stub.calls == 1
    assert len(facts) == 1
    assert facts[0].subject == "Ichel"
    assert facts[0].kind_hint == "person"


def test_empty_kept_text_makes_no_call() -> None:
    stub = _Stub([NounFact(subject="X", claim="y")])
    assert extract_facts("   \n  ", client=stub, model="stub") == []
    assert stub.calls == 0


def test_large_context_is_chunked_and_concatenated() -> None:
    stub = _Stub([NounFact(subject="X", claim="y")])
    kept = "\n".join(f"A: word{i} more words here" for i in range(6))  # 6 lines, ~4 words each
    facts = extract_facts(kept, client=stub, model="stub", chunk_words=5)
    assert stub.calls > 1  # split into multiple calls under the budget
    assert len(facts) == stub.calls  # one canned fact per chunk, concatenated
