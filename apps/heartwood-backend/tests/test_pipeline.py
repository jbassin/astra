"""The Phase-2 orchestration (spec §9, S4) — skip path + end-to-end with a stub client.

The non-faerrin skip needs no LLM (returns before any call). The happy path runs a tiny
constructed transcript through filter→extract→resolve with a stub that dispatches by the
requested output model. Also asserts the Dagster code location builds.
"""

from __future__ import annotations

from typing import TypeVar

import dagster as dg
from astra_heartwood import assets as hw
from astra_heartwood.extract import _NounFacts
from astra_heartwood.filter import WindowVerdict, _FilterVerdicts
from astra_heartwood.models import NounFact, SessionFacts
from astra_heartwood.pipeline import _session_facts, build_session_facts
from astra_heartwood.refine import FactVerdict, _RefineVerdicts
from astra_linguist.models import FormattedLine, Speaker, Transcript
from pydantic import BaseModel

_M = TypeVar("_M", bound=BaseModel)


def _transcript(turns: list[tuple[str, str]]) -> Transcript:
    script = [
        FormattedLine(
            start="00:00:00",
            second=float(i),
            text=t,
            user=Speaker(name=n, color="--x"),
            duration=1.0,
        )
        for i, (n, t) in enumerate(turns)
    ]
    return Transcript(date="2099-1-1", audio="/audio/2099-1-1.mp3", script=script)


class _Stub:
    """Dispatches by the requested output model: filter verdicts, noun-facts, or refinements."""

    def __init__(
        self,
        verdicts: list[WindowVerdict],
        facts: list[NounFact],
        refinements: list[FactVerdict],
    ) -> None:
        self._payloads: dict[type, dict] = {
            _FilterVerdicts: _FilterVerdicts(verdicts=verdicts).model_dump(),
            _NounFacts: _NounFacts(facts=facts).model_dump(),
            _RefineVerdicts: _RefineVerdicts(items=refinements).model_dump(),
        }

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
        return output_model.model_validate(self._payloads[output_model])


def test_skips_non_faerrin_session_without_llm() -> None:
    # 2026-4-6 is observatory-slipped (sedecium) → dropped by the world filter, no client needed
    assert build_session_facts("2026-4-6") is None


def test_end_to_end_assembles_resolved_session_facts() -> None:
    t = _transcript([("Gamemaster", "Ichel leads the Scale."), ("Argyle", "snack break, brb.")])
    stub = _Stub(
        verdicts=[WindowVerdict(window_id=1, decision="keep", category="in_world", reason="lore")],
        facts=[NounFact(subject="Ichel", kind_hint="person", claim="Ichel leads the Scale.")],
        refinements=[
            FactVerdict(
                index=0,
                keep=True,
                category="setting",
                reason="standing role",
                claim="Ichel leads the Scale.",
            )
        ],
    )
    sf = _session_facts("2099-1-1", "through-a-song-darkly", t, client=stub, model="stub")
    assert isinstance(sf, SessionFacts)
    assert sf.world == "faerrin"
    assert sf.show == "through-a-song-darkly"
    assert len(sf.facts) == 1
    assert sf.facts[0].status == "resolved"
    assert sf.facts[0].entity is not None
    assert sf.facts[0].entity.canonical == "Ichel"


def test_dagster_defs_builds_with_the_asset() -> None:
    assert isinstance(hw.defs, dg.Definitions)
    assert hw.session_noun_facts.key.to_user_string() == "session_noun_facts"
