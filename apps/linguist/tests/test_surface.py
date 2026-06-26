"""Surfacer tests (NLSpec 0006 gates G/H) — hermetic, no LLM.

The phonetic filter + guardrails are pure; the judge's LLM call is a stubbed
`CompleteFn`. The live dspy run (gate J) is deferred.
"""

from __future__ import annotations

from astra_linguist.models import FormattedLine, Speaker, Transcript
from astra_linguist.surface.judge import (
    Candidate,
    CompleteArgs,
    Flagged,
    ScanResult,
    apply_guardrails,
    judge_session,
    windows,
)
from astra_linguist.surface.known import find_known
from astra_linguist.surface.lexicon import build_lexicon_from
from astra_linguist.surface.normalize import fold_for_match, ngrams, tokenize
from astra_linguist.surface.phonetics import ensemble_sim


def _line(text: str, name: str = "Josh") -> FormattedLine:
    return FormattedLine(
        start="00:00:00", second=0.0, text=text, user=Speaker(name=name, color="--x"), duration=1.0
    )


def _transcript(*texts: str) -> Transcript:
    return Transcript(date="2025-01-01", audio="a", script=[_line(t) for t in texts])


# ── normalize + phonetics ──────────────────────────────────────────────────
def test_fold_and_tokenize() -> None:
    assert fold_for_match("Færrin") == "faerrin"  # ligature expanded
    assert fold_for_match("Anaïs") == "anais"  # diacritic stripped
    toks = tokenize("Ki-Rin met P'ter.")
    assert [t.span for t in toks] == ["Ki-Rin", "met", "P'ter"]  # punctuation excluded
    assert {t.span for t in ngrams(toks, 2)} >= {"Ki-Rin", "met P'ter", "Ki-Rin met"}


def test_ensemble_sim_ranks_phonetic_near_misses() -> None:
    assert ensemble_sim("calaria", "calaria") == 1.0
    near = ensemble_sim("galaria", "calaria")  # one-letter phonetic garble
    far = ensemble_sim("galaria", "anouk")
    assert near > 0.78 > far


# ── lexicon ────────────────────────────────────────────────────────────────
def test_lexicon_membership_and_nearest() -> None:
    lex = build_lexicon_from(["Calaria", "Hildebrandt Corporation", "Anouk"])
    assert lex.has("calaria")
    assert lex.is_token("hildebrandt")  # word within a multi-word canonical
    assert not lex.has("hildebrandt")  # not a whole canonical on its own
    top = lex.nearest("galaria", k=1, floor=0.5)
    assert top and top[0].canonical == "Calaria"


# ── Mode-1 filter (gate G) ─────────────────────────────────────────────────
def test_find_known_flags_mistranscription() -> None:
    lex = build_lexicon_from(["Calaria", "Anouk"])
    transcript = _transcript("We finally traveled to Galaria this evening.")
    candidates = find_known(transcript, lex)
    spans = {(c.span, c.hypotheses[0].canonical) for c in candidates}
    assert ("Galaria", "Calaria") in spans


def test_find_known_ignores_plain_english() -> None:
    lex = build_lexicon_from(["Calaria", "Anouk"])
    # No invented proper noun → nothing flagged.
    assert find_known(_transcript("we walked to the store and bought some bread"), lex) == []


# ── guardrails (gate H) ────────────────────────────────────────────────────
def test_apply_guardrails_drops_unsafe() -> None:
    lex = build_lexicon_from(["Calaria"])
    transcript = _transcript("a trip to Galaria")
    cands = [
        Candidate(
            line_ref=0,
            span="Galaria",
            verdict="confirm",
            suggested_canonical="Calaria",
            confidence=0.9,
            reason="x",
        ),
        Candidate(
            line_ref=9,
            span="Galaria",
            verdict="confirm",
            suggested_canonical="Calaria",
            confidence=0.9,
            reason="oob line",
        ),
        Candidate(
            line_ref=0,
            span="Nowhere",
            verdict="confirm",
            suggested_canonical="Calaria",
            confidence=0.9,
            reason="span not in line",
        ),
        Candidate(
            line_ref=0,
            span="Galaria",
            verdict="confirm",
            suggested_canonical="Bogus",
            confidence=0.9,
            reason="hallucinated canonical",
        ),
        Candidate(
            line_ref=0,
            span="Calaria",
            verdict="confirm",
            suggested_canonical="Calaria",
            confidence=0.9,
            reason="already correct",
        ),
        Candidate(
            line_ref=0,
            span="Galaria",
            verdict="confirm",
            suggested_canonical="Calaria",
            confidence=0.8,
            reason="dup",
        ),
    ]
    kept = apply_guardrails(cands, transcript, lex)
    assert len(kept) == 1
    assert kept[0].reason == "x"


def test_windows_hybrid_vs_full() -> None:
    # 300 lines, one flagged at 200 → hybrid keeps only the windows covering it.
    hybrid = windows(300, {200}, size=150, overlap=10, mode="hybrid")
    full = windows(300, {200}, size=150, overlap=10, mode="full")
    assert all(start <= 200 < end for start, end in hybrid)
    assert len(full) > len(hybrid)


# ── judge orchestration + escalation (gate H) ──────────────────────────────
def test_judge_session_escalates_on_borderline_confirm() -> None:
    lex = build_lexicon_from(["Calaria"])
    transcript = _transcript("a trip to Galaria")
    calls: list[str] = []

    def stub(args: CompleteArgs) -> ScanResult:
        calls.append(args.stage)
        confidence = 0.5 if args.stage == "judge" else 0.95  # borderline → escalate sharpens it
        return ScanResult(
            candidates=[
                Candidate(
                    line_ref=0,
                    span="Galaria",
                    verdict="confirm",
                    suggested_canonical="Calaria",
                    confidence=confidence,
                    reason=args.stage,
                )
            ]
        )

    # Exercise the mechanism with two distinct models (escalation only fires when they
    # differ). In production both are GLM 5.2, so this tier is inert — see the next test.
    out = judge_session(
        transcript,
        [Flagged(line_ref=0, span="Galaria")],
        lex,
        complete_fn=stub,
        mode="full",
        judge_model="judge-model",
        escalate_model="escalate-model",
    )
    assert calls == ["judge", "judge-escalate"]  # borderline confirm escalated
    assert len(out) == 1
    assert out[0].confidence == 0.95 and out[0].reason == "judge-escalate"


def test_judge_session_no_escalation_when_models_match() -> None:
    """With judge == escalate (the GLM-5.2 production config) the tier is inert: a
    borderline confirm is NOT re-judged, so only the `judge` stage is ever called."""
    lex = build_lexicon_from(["Calaria"])
    transcript = _transcript("a trip to Galaria")
    calls: list[str] = []

    def stub(args: CompleteArgs) -> ScanResult:
        calls.append(args.stage)
        return ScanResult(
            candidates=[
                Candidate(
                    line_ref=0,
                    span="Galaria",
                    verdict="confirm",
                    suggested_canonical="Calaria",
                    confidence=0.5,  # borderline — would escalate if the models differed
                    reason=args.stage,
                )
            ]
        )

    out = judge_session(
        transcript,
        [Flagged(line_ref=0, span="Galaria")],
        lex,
        complete_fn=stub,
        mode="full",
        judge_model="glm-5.2",
        escalate_model="glm-5.2",
    )
    assert calls == ["judge"]  # no escalation
    assert len(out) == 1 and out[0].reason == "judge"
