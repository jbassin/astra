"""Gate-J machinery tests — hermetic (DummyLM only, no live LLM/network).

Covers the dspy judge program (build + save/load), the gold-set builder + negative
miner (J5/K2), the guardrails-first metric (J3), a synthetic-fixture MIPROv2 compile
(J-e), and `make_dspy_complete_fn` wired to a compiled artifact (J-g). The live compile
(J-f) is the one-command `optimize.py --live` step, never run in CI.
"""

from __future__ import annotations

from pathlib import Path

import dspy
from astra_lexicon import build_lexicon_from, fold_for_match
from astra_linguist.models import FormattedLine, Speaker, Transcript
from astra_linguist.surface.dspy_judge import (
    build_judge_program,
    load_compiled,
    save_compiled,
)
from astra_linguist.surface.goldset import (
    MinedRecord,
    _already_correct,
    _carry_hand_labels,
    _is_ordinary_english,
    build_confirms,
    dedupe_records,
    examples_from_mined,
    is_literal_fragment,
    load_mined_artifact,
    make_metric,
    mine_negatives,
    propose_new_entities,
    synthetic_new_examples,
    write_mined_artifact,
)
from astra_linguist.surface.judge import (
    SYSTEM,
    Candidate,
    CompleteArgs,
    ScanResult,
    make_dspy_complete_fn,
)
from dspy.utils.dummies import DummyLM


class _Pred:
    def __init__(self, candidates: list[Candidate]) -> None:
        self.candidates = candidates


def _line(text: str, name: str = "Player") -> FormattedLine:
    return FormattedLine(
        start="00:00:00", second=0.0, text=text, user=Speaker(name=name, color="--x"), duration=1.0
    )


# ── dspy program ────────────────────────────────────────────────────────────
def test_signature_carries_system_instruction() -> None:
    prog = build_judge_program()
    assert prog.predict.signature.instructions == SYSTEM
    assert set(prog.predict.signature.input_fields) == {"lexicon", "window"}
    assert "candidates" in prog.predict.signature.output_fields


def test_compiled_program_round_trips(tmp_path: Path) -> None:
    prog = build_judge_program()
    out = tmp_path / "judge.compiled.json"
    save_compiled(prog, out)
    assert out.exists()
    reloaded = load_compiled(out)
    assert reloaded.predict.signature.instructions == SYSTEM


# ── gold-set builder ────────────────────────────────────────────────────────
def test_is_literal_fragment() -> None:
    assert is_literal_fragment("Anak")
    assert is_literal_fragment("An eye")  # spaces are fine
    assert not is_literal_fragment(r"\$")  # regex metachar
    assert not is_literal_fragment("a|b")
    assert not is_literal_fragment("")


def test_build_confirms_emits_confirm_examples() -> None:
    lex = build_lexicon_from(["Anouk", "Calaria"])
    defs = {"Anouk": ["Anak", "Onyx"], "Calaria": ["Galaria"], "Missing": ["Foo"]}
    examples = build_confirms(lex, defs)
    pairs = {(e.candidates[0].span, e.candidates[0].suggested_canonical) for e in examples}
    assert ("Anak", "Anouk") in pairs
    assert ("Galaria", "Calaria") in pairs
    # canonical not in the lexicon is skipped (guardrail-invalid)
    assert all(e.candidates[0].suggested_canonical != "Missing" for e in examples)
    for e in examples:  # every confirm example's span sits verbatim in its window
        assert e.candidates[0].span in e.window
        assert e.candidates[0].verdict == "confirm"


# ── negative miner (K2) ─────────────────────────────────────────────────────
def test_mine_negatives_confidence_gated(tmp_path: Path) -> None:
    lex = build_lexicon_from(["Calaria", "Anouk"])
    defs = {"Calaria": ["Galaria"]}
    # 'Galaria' is a known garble (→ confirm). 'Caloria' is a single-token near-miss the
    # filter flags but can't confidently classify (confirm vs new) → skip, not guessed.
    t = Transcript(
        date="2024-01-01",
        audio="a",
        script=[_line("We rode to Galaria today."), _line("The Caloria market was busy.")],
    )
    (tmp_path / "2024-01-01.json").write_text(t.model_dump_json(), encoding="utf-8")

    by_span = {r.span: r for r in mine_negatives(lex, defs, tmp_path)}
    assert by_span["Galaria"].auto_label == "confirm"
    assert by_span["Galaria"].canonical == "Calaria"
    assert by_span["Caloria"].auto_label == "skip"  # ambiguous single-token near-miss


def test_labeling_helpers() -> None:
    lex = build_lexicon_from(["Calaria", "Iridescent Church"])
    # multi-word ordinary English → reject material; single tokens / name-bearing are not
    assert _is_ordinary_english("I will save")
    assert not _is_ordinary_english("Galaria")  # single token
    assert not _is_ordinary_english("the Galarion fortress")  # contains an OOV name
    # possessive/plural of an existing canonical is already-correct (skip, not a garble)
    assert _already_correct(fold_for_match("Iridescent Church's"), lex)
    assert _already_correct(fold_for_match("Calarias"), lex)
    assert not _already_correct(fold_for_match("Galaria"), lex)


def test_synthetic_new_examples_are_far_from_lexicon() -> None:
    lex = build_lexicon_from(["Calaria", "Anouk", "Iridescent Church"])
    examples = synthetic_new_examples(lex)
    assert examples
    for e in examples:
        assert e.candidates[0].verdict == "new"
        assert e.candidates[0].suggested_canonical is None
        assert e.candidates[0].span in e.window


def test_mined_artifact_round_trips(tmp_path: Path) -> None:
    recs = [
        MinedRecord(
            "2024-01-01",
            0,
            "Galaria",
            "Player",
            "to Galaria",
            "confirm",
            "Calaria",
            "Calaria",
            0.95,
            1,
            "defs garble",
        ),
        MinedRecord(
            "2024-01-02",
            3,
            "I will save",
            "Player",
            "I will save",
            "reject",
            None,
            "a Will save",
            0.9,
            2,
            "ordinary English",
        ),
    ]
    path = tmp_path / "gold" / "mined.json"
    write_mined_artifact(recs, path)
    assert path.exists()
    back = load_mined_artifact(path)
    assert {r.span for r in back} == {"Galaria", "I will save"}
    assert {r.auto_label for r in back} == {"confirm", "reject"}


def test_examples_from_mined_skips_unusable_labels() -> None:
    lex = build_lexicon_from(["Calaria"])
    recs = [
        MinedRecord(
            "d", 0, "Galaria", "P", "to Galaria", "confirm", "NotInLex", "Calaria", 0.9, 1, "x"
        ),
        MinedRecord(
            "d",
            1,
            "Workshop here",
            "P",
            "the Workshop here",
            "reject",
            None,
            "Calaria",
            0.8,
            1,
            "x",
        ),
        MinedRecord(
            "d", 2, "Caloria", "P", "the Caloria", "skip", None, "Calaria", 0.9, 3, "ambiguous"
        ),
    ]
    examples = examples_from_mined(recs, lex)
    # confirm w/ canonical not in lexicon → dropped; skip → ignored; only the reject survives
    assert [e.candidates[0].verdict for e in examples] == ["reject"]


# ── dedupe + prior-merge ────────────────────────────────────────────────────
def _mr(
    span: str, label: str, *, line_text: str = "", date: str = "d", reason: str = "auto"
) -> MinedRecord:
    return MinedRecord(
        date=date,
        line_ref=0,
        span=span,
        speaker="P",
        line_text=line_text or f"a line with {span} in it",
        auto_label=label,
        canonical=("Vilksnake" if label == "confirm" else None),
        top_canonical="Vilksnake",
        top_score=0.93,
        recurrence=1,
        reason=reason,
    )


def test_dedupe_collapses_by_fold_keeps_richest_context() -> None:
    recs = [
        _mr("Filksnake", "skip", line_text="short", date="2024-01-01"),
        _mr(
            "Filksnake",
            "skip",
            line_text="a much longer line with Filksnake here",
            date="2024-01-02",
        ),
        _mr("the Earth", "reject"),
    ]
    out = {r.span: r for r in dedupe_records(recs)}
    assert len(out) == 2  # two unique folds
    assert "longer line" in out["Filksnake"].line_text  # richest-context occurrence kept
    assert out["Filksnake"].recurrence == 2  # distinct sessions counted


def test_dedupe_prefers_hand_labels_and_resolves_conflicts_conservatively() -> None:
    # one copy auto-skip, two hand-reviewed (confirm vs reject) → tie breaks to reject
    recs = [
        _mr("for DC", "skip", reason="auto"),
        _mr("for DC", "confirm", reason="hand-reviewed: confirm"),
        _mr("for DC", "reject", reason="hand-reviewed: reject"),
    ]
    [merged] = dedupe_records(recs)
    assert merged.auto_label == "reject"  # conservative tie-break
    assert merged.canonical is None
    assert merged.reason == "hand-reviewed: reject"


def test_dedupe_confirm_adopts_canonical() -> None:
    [merged] = dedupe_records([_mr("Dyvex", "confirm", reason="hand-reviewed: confirm")])
    assert merged.auto_label == "confirm" and merged.canonical == "Vilksnake"


def test_propose_new_entities_finds_recurring_far_oov(tmp_path: Path) -> None:
    lex = build_lexicon_from(["Calaria", "Anouk"])
    # 'Thessian' is OOV, capitalized, far from any canonical, in 2 sessions → proposed.
    # 'Galaria' is near Calaria (a garble, not new) → excluded. 'Josh' is a speaker → excluded.
    s1 = Transcript(
        date="2024-01-01",
        audio="a",
        script=[_line("We reached Thessian at dusk.", "Josh"), _line("Galaria again.", "Josh")],
    )
    s2 = Transcript(
        date="2024-01-02", audio="a", script=[_line("Back to Thessian once more.", "Josh")]
    )
    (tmp_path / "2024-01-01.json").write_text(s1.model_dump_json(), encoding="utf-8")
    (tmp_path / "2024-01-02.json").write_text(s2.model_dump_json(), encoding="utf-8")

    spans = {r.span: r for r in propose_new_entities(lex, tmp_path, min_sessions=2)}
    assert "Thessian" in spans
    assert spans["Thessian"].auto_label == "proposed"
    assert spans["Thessian"].recurrence == 2
    assert "Galaria" not in spans  # near a canonical → not a new entity
    assert "Josh" not in spans  # speaker name excluded


def test_carry_hand_labels_survives_a_remine() -> None:
    fresh = [_mr("Filksnake", "skip", reason="ambiguous single-token near-miss")]
    prior = [_mr("Filksnake", "confirm", reason="hand-reviewed: confirm")]
    [carried] = _carry_hand_labels(fresh, prior)
    assert carried.auto_label == "confirm" and carried.canonical == "Vilksnake"
    assert carried.reason == "hand-reviewed: confirm"


# ── metric (J3) ─────────────────────────────────────────────────────────────
def test_metric_guardrails_first_scores_verdict_and_canonical() -> None:
    lex = build_lexicon_from(["Calaria"])
    defs = {"Calaria": ["Galaria"]}
    [confirm_ex] = build_confirms(lex, defs)
    metric = make_metric(lex)
    span = confirm_ex.candidates[0].span

    good = _Pred(
        [
            Candidate(
                line_ref=0,
                span=span,
                verdict="confirm",
                suggested_canonical="Calaria",
                confidence=0.9,
                reason="x",
            )
        ]
    )
    wrong_canon = _Pred(
        [
            Candidate(
                line_ref=0,
                span=span,
                verdict="confirm",
                suggested_canonical="Calaria_X",
                confidence=0.9,
                reason="x",
            )
        ]
    )
    as_reject = _Pred(
        [
            Candidate(
                line_ref=0,
                span=span,
                verdict="reject",
                suggested_canonical=None,
                confidence=0.9,
                reason="x",
            )
        ]
    )
    assert metric(confirm_ex, good) is True
    assert (
        metric(confirm_ex, wrong_canon) is False
    )  # canonical not in lexicon → guardrail drops → miss
    assert metric(confirm_ex, as_reject) is False

    # a reject gold: correct iff no surviving confirm for the span
    reject_ex = examples_from_mined(
        [
            MinedRecord(
                "d", 0, "Workshop", "P", "the Workshop here", "reject", None, "Calaria", 0.8, 1
            )
        ],
        lex,
    )[0]
    no_confirm = _Pred(
        [
            Candidate(
                line_ref=0,
                span="Workshop",
                verdict="reject",
                suggested_canonical=None,
                confidence=0.5,
                reason="x",
            )
        ]
    )
    false_confirm = _Pred(
        [
            Candidate(
                line_ref=0,
                span="Workshop",
                verdict="confirm",
                suggested_canonical="Calaria",
                confidence=0.9,
                reason="x",
            )
        ]
    )
    assert metric(reject_ex, no_confirm) is True
    assert metric(reject_ex, false_confirm) is False


# ── synthetic-fixture compile (J-e) ─────────────────────────────────────────
def test_synthetic_bootstrap_compile_round_trips(tmp_path: Path) -> None:
    """A tiny hermetic compile with DummyLM proves the optimizer wiring + artifact I/O."""
    lex = build_lexicon_from(["Calaria", "Anouk"])
    defs = {"Calaria": ["Galaria"], "Anouk": ["Anak"]}
    trainset = build_confirms(lex, defs)
    metric = make_metric(lex)

    # DummyLM that always emits the right confirm for whichever span is in the window.
    def _answer(span: str, canon: str) -> dict[str, object]:
        return {
            "reasoning": "phonetic + context match",
            "candidates": [
                {
                    "line_ref": 0,
                    "span": span,
                    "verdict": "confirm",
                    "suggested_canonical": canon,
                    "confidence": 0.9,
                    "reason": "match",
                }
            ],
        }

    dummy = DummyLM([_answer("Galaria", "Calaria"), _answer("Anak", "Anouk")] * 20)
    dspy.configure(lm=dummy)
    program = build_judge_program()
    optimizer = dspy.BootstrapFewShot(metric=metric, max_bootstrapped_demos=1, max_labeled_demos=1)
    compiled = optimizer.compile(program, trainset=trainset)

    out = tmp_path / "judge.compiled.json"
    save_compiled(compiled, out)
    assert out.exists()
    assert load_compiled(out).predict.signature.instructions == SYSTEM


# ── MIPROv2 dependency guard (the prod optimizer needs optuna) ───────────────
def test_miprov2_optuna_available() -> None:
    """MIPROv2 imports optuna lazily at compile; guard the dep so it can't fail mid-spend."""
    import optuna  # noqa: F401

    dspy.configure(lm=DummyLM([{"reasoning": "r", "candidates": []}]))
    optimizer = dspy.MIPROv2(metric=make_metric(build_lexicon_from(["Calaria"])), auto="light")
    assert optimizer is not None


# ── make_dspy_complete_fn wired to an artifact (J-g) ─────────────────────────
def test_make_dspy_complete_fn_loads_artifact(tmp_path: Path, monkeypatch) -> None:
    """The production CompleteFn loads a compiled artifact + adapts CompleteArgs→ScanResult."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-stub")  # via sanctioned config override
    out = tmp_path / "judge.compiled.json"
    save_compiled(build_judge_program(), out)

    dummy = DummyLM(
        [
            {
                "reasoning": "r",
                "candidates": [
                    {
                        "line_ref": 0,
                        "span": "Galaria",
                        "verdict": "confirm",
                        "suggested_canonical": "Calaria",
                        "confidence": 0.8,
                        "reason": "m",
                    }
                ],
            }
        ]
    )
    complete = make_dspy_complete_fn(compiled_path=out, lm_factory=lambda _model: dummy)
    result = complete(
        CompleteArgs(
            stage="judge",
            model="openrouter/z-ai/glm-5.2",
            system=SYSTEM,
            cached="CANONICAL LEXICON (1 terms):\nCalaria",
            user="[0] (Player) to Galaria",
        )
    )
    assert isinstance(result, ScanResult)
    assert result.candidates[0].suggested_canonical == "Calaria"
