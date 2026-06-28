"""Stage 2.5 — the fact-refinement pass (durable-vs-event + canonical naming).

Window-level filtering (Stage 1) can't stop a *kept* window's durable facts from sitting
beside event narration, so the extractor still emits some play-by-play ("X sniped several
people this session"). This pass reviews the extracted facts and:

1. drops EVENT facts (not durable wiki content) into a ``refined_out`` audit; and
2. restates each kept fact under the registry's CANONICAL name — so a resolved ASR mislabel
   (e.g. ``Y'shael`` → ``Ichel``) never surfaces in the output at all.

Keep-when-in-doubt on the durable axis; a deterministic safety-net replace guarantees a
resolved fact's raw mislabel can't survive in the claim even if the LLM misses it.
"""

from __future__ import annotations

import re

from astra_ontology import EntityRef

from .llm import StructuredClient, default_model, real_client
from .models import DropCategory, RefineCategory, RefinedOutFact, ResolvedFact, _Base
from .prompts import REFINE_SYSTEM

# Headroom for GLM-5.2 reasoning tokens (which share the budget) on top of the per-chunk
# verdict list — 8k risks truncation even on modest output (see extract.py).
REFINE_MAX_TOKENS = 16_000
REFINE_CHUNK_FACTS = 20  # small batches → smaller per-call outputs, less malformed-JSON risk


class FactVerdict(_Base):
    """The refinement LLM's per-fact verdict (keyed by the input index)."""

    index: int
    keep: bool
    category: RefineCategory
    reason: str
    claim: str


class _RefineVerdicts(_Base):
    """The forced-tool output wrapper (a verdict per fact)."""

    items: list[FactVerdict]


def _name(fact: ResolvedFact) -> str:
    """The canonical wiki name if resolved, else the raw mention (unknown/ambiguous)."""
    if fact.status == "resolved" and isinstance(fact.entity, EntityRef):
        return fact.entity.canonical
    return fact.subject


def _render(facts: list[ResolvedFact], start: int) -> str:
    return "\n".join(
        f"{start + j}. [{_name(f)} | {f.kind_hint or '?'}] {f.claim}" for j, f in enumerate(facts)
    )


def _safety_replace(fact: ResolvedFact, name: str, claim: str) -> str:
    """Deterministic net: a resolved fact's raw ASR mislabel must never survive in output text
    (e.g. a stray ``Y'shael`` for ``Ichel``), even if the LLM left it in — kept OR refined-out."""
    if fact.status == "resolved" and fact.subject != name and len(fact.subject) > 2:
        return re.sub(re.escape(fact.subject), name, claim)
    return claim


def _canonicalize(fact: ResolvedFact, name: str, claim: str) -> ResolvedFact:
    """Set the subject to the canonical name and scrub any surviving raw mislabel from the claim."""
    return fact.model_copy(update={"subject": name, "claim": _safety_replace(fact, name, claim)})


def refine_facts(
    facts: list[ResolvedFact],
    *,
    client: StructuredClient | None = None,
    model: str | None = None,
    chunk: int = REFINE_CHUNK_FACTS,
) -> tuple[list[ResolvedFact], list[RefinedOutFact]]:
    """Drop non-wiki facts + canonicalize names → (kept setting facts, refined-out audit)."""
    if not facts:
        return [], []
    client = client if client is not None else real_client()
    model = model if model is not None else default_model()

    verdicts: dict[int, FactVerdict] = {}
    for start in range(0, len(facts), chunk):
        out = client.call_structured(
            _RefineVerdicts,
            system=REFINE_SYSTEM,
            user_content=_render(facts[start : start + chunk], start),
            model=model,
            max_tokens=REFINE_MAX_TOKENS,
            tool_name="record_refinements",
            tool_description="Record a keep/category verdict + cleaned claim for every fact.",
        )
        for v in out.items:
            verdicts[v.index] = v

    kept: list[ResolvedFact] = []
    refined_out: list[RefinedOutFact] = []
    for i, fact in enumerate(facts):
        name = _name(fact)
        v = verdicts.get(i)
        if v is None:  # keep-when-in-doubt; still canonicalize the name
            kept.append(_canonicalize(fact, name, fact.claim))
            continue
        drop = _drop_category(v)
        if drop is None:
            kept.append(_canonicalize(fact, name, v.claim))
        else:
            claim = _safety_replace(fact, name, fact.claim)
            refined_out.append(
                RefinedOutFact(subject=name, claim=claim, category=drop, reason=v.reason)
            )
    return kept, refined_out


def _drop_category(v: FactVerdict) -> DropCategory | None:
    """The drop reason if this fact is not wiki-worthy, else None (keep).

    A genuine setting fact is kept even on a contradictory keep=false + category=setting —
    we never drop real lore on a labelling slip.
    """
    if v.keep or v.category == "setting":
        return None
    return v.category
