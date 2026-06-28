"""Stage-2.5 fact refinement (durable-vs-event + canonical naming) — stub client, no network.

Covers: dropping event facts into the audit; the canonical-name safety net (a resolved ASR
mislabel never survives in the output); keep-when-in-doubt on a missing verdict; empty input.
"""

from __future__ import annotations

from typing import TypeVar

from astra_heartwood.models import DropCategory, ResolvedFact
from astra_heartwood.refine import FactVerdict, _RefineVerdicts, refine_facts
from astra_ontology import EntityRef
from pydantic import BaseModel

_M = TypeVar("_M", bound=BaseModel)


def _resolved(subject: str, canonical: str, claim: str) -> ResolvedFact:
    return ResolvedFact(
        subject=subject,
        kind_hint="person",
        claim=claim,
        status="resolved",
        entity=EntityRef(canonical=canonical, kind="person", page=None, being=None),
        confidence=0.9,
    )


class _Stub:
    def __init__(self, items: list[FactVerdict]) -> None:
        self._payload = _RefineVerdicts(items=items).model_dump()

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
        return output_model.model_validate(self._payload)


def _keep(index: int, claim: str) -> FactVerdict:
    return FactVerdict(index=index, keep=True, category="setting", reason="r", claim=claim)


def _drop(index: int, category: DropCategory) -> FactVerdict:
    return FactVerdict(index=index, keep=False, category=category, reason="r", claim="")


def test_keeps_setting_drops_non_wiki() -> None:
    facts = [
        _resolved("Ichel", "Ichel", "Ichel leads the Scale."),
        _resolved("Ichel", "Ichel", "Ichel attacked a guard this session."),
        _resolved("Ichel", "Ichel", "Ichel can cast heroism."),
        _resolved("Ichel", "Ichel", "Ichel carries 400 gold."),
    ]
    stub = _Stub(
        [
            _keep(0, "Ichel leads the Scale."),
            _drop(1, "event"),
            _drop(2, "ability"),
            _drop(3, "mechanical"),
        ]
    )
    kept, refined_out = refine_facts(facts, client=stub, model="stub")
    assert [f.claim for f in kept] == ["Ichel leads the Scale."]
    assert {r.category for r in refined_out} == {"event", "ability", "mechanical"}


def test_contradictory_drop_setting_is_kept() -> None:
    # keep=false but category=setting → never drop genuine lore on a labelling slip
    facts = [_resolved("Ichel", "Ichel", "Ichel is a healer.")]
    stub = _Stub(
        [
            FactVerdict(
                index=0, keep=False, category="setting", reason="r", claim="Ichel is a healer."
            )
        ]
    )
    kept, refined_out = refine_facts(facts, client=stub, model="stub")
    assert len(kept) == 1
    assert refined_out == []


def test_refined_out_claims_also_scrub_the_mislabel() -> None:
    # a dropped (event) fact whose subject is a mislabel must still not surface "Y'shael"
    facts = [_resolved("Y'shael", "Ichel", "Y'shael sniped several people this session.")]
    stub = _Stub([_drop(0, "event")])
    kept, refined_out = refine_facts(facts, client=stub, model="stub")
    assert kept == []
    assert refined_out[0].subject == "Ichel"
    assert refined_out[0].category == "event"
    assert "Y'shael" not in refined_out[0].claim


def test_canonical_name_safety_net_strips_mislabel() -> None:
    # the LLM (stub) leaves the raw mislabel in the claim → the deterministic net must fix it
    facts = [_resolved("Y'shael", "Ichel", "Y'shael is a healer.")]
    stub = _Stub([_keep(0, "Y'shael is a healer.")])
    kept, _ = refine_facts(facts, client=stub, model="stub")
    assert kept[0].subject == "Ichel"
    assert "Y'shael" not in kept[0].claim
    assert kept[0].claim == "Ichel is a healer."


def test_missing_verdict_kept_and_canonicalized() -> None:
    facts = [_resolved("Y'shael", "Ichel", "Y'shael guards the gate.")]
    stub = _Stub([])  # no verdict for index 0 → keep-when-in-doubt
    kept, refined_out = refine_facts(facts, client=stub, model="stub")
    assert refined_out == []
    assert kept[0].subject == "Ichel"
    assert "Y'shael" not in kept[0].claim


def test_empty_input() -> None:
    stub = _Stub([_keep(0, "x")])
    assert refine_facts([], client=stub, model="stub") == ([], [])
