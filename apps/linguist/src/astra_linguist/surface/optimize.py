"""Offline MIPROv2 compile + eval for the dspy judge (NLSpec 0006 gate J).

A **one-command local step — never a CI job** (it spends LLM tokens). It mines the
gold set, runs a cheap live structured-output smoke, compiles the judge with MIPROv2
(prompt_model + task_model both GLM 5.2 — instruction-proposer and executor share the
model now that judge == escalate, K6), evaluates on a held-out slice, and saves the
committed `judge.compiled.json`.

    uv run python -m astra_linguist.surface.optimize            # dry run: gold + estimate, no spend
    uv run python -m astra_linguist.surface.optimize --mine-only  # (re)write the mined artifact
    uv run python -m astra_linguist.surface.optimize --live      # the real compile (spends tokens)

The OpenRouter key is resolved through `astra_config` (via `ensure_openrouter_env`); the
guardrails + escalation in `judge.py` are unchanged and wrap the compiled program.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

from astra_llm import TokenCounts, cost_usd, ensure_openrouter_env, make_dspy_lm
from astra_observe import init_telemetry

from . import config
from .dspy_judge import DEFAULT_COMPILED_PATH, build_judge_program, save_compiled
from .goldset import (
    DEFAULT_DATA_DIR,
    DEFAULT_MINED_PATH,
    DEFS_PATH,
    build_goldset,
    load_defs,
    load_mined_artifact,
    make_metric,
    mine_negatives,
    propose_new_entities,
    split_goldset,
    write_mined_artifact,
)
from .judge import Candidate
from .lexicon import build_lexicon
from .normalize import fold_for_match

# Few-shot demo caps — kept small to bound per-call prompt size (each demo carries the
# full lexicon block as an input field).
MAX_BOOTSTRAPPED_DEMOS = 3
MAX_LABELED_DEMOS = 3
#: Rough program-call count for a MIPROv2 medium run (bootstrap + proposal + trials +
#: full evals) — for the pre-spend estimate only; the real count varies.
_EST_MEDIUM_CALLS = 2200
_CHARS_PER_TOKEN = 4
_EST_OUTPUT_TOKENS = 280


def _avg_input_tokens(examples: list[Any]) -> int:
    if not examples:
        return 0
    demo_overhead = (MAX_BOOTSTRAPPED_DEMOS + MAX_LABELED_DEMOS) * _avg_chars(examples)
    chars = _avg_chars(examples) + demo_overhead
    return math.ceil(chars / _CHARS_PER_TOKEN)


def _avg_chars(examples: list[Any]) -> int:
    total = sum(len(e.lexicon) + len(e.window) for e in examples)
    return total // max(1, len(examples))


def print_estimate(trainset: list[Any], valset: list[Any]) -> None:
    avg_in = _avg_input_tokens(trainset + valset)
    in_tokens = _EST_MEDIUM_CALLS * avg_in
    out_tokens = _EST_MEDIUM_CALLS * _EST_OUTPUT_TOKENS
    cost = cost_usd(
        config.JUDGE_MODEL,
        TokenCounts(input=in_tokens, cache_read=0, cache_write=0, output=out_tokens),
    )
    print("── pre-spend estimate (MIPROv2 medium, very approximate) ──")
    print(f"  gold set:          {len(trainset)} train + {len(valset)} val")
    print(
        f"  est. program calls: ~{_EST_MEDIUM_CALLS} (bootstrap + proposal + trials + full evals)"
    )
    demos = MAX_BOOTSTRAPPED_DEMOS + MAX_LABELED_DEMOS
    print(f"  est. input/call:   ~{avg_in} tok (incl. {demos} demos)")
    print(
        f"  est. tokens:       ~{in_tokens / 1e6:.1f}M in / ~{out_tokens / 1e6:.2f}M out (GLM 5.2)"
    )
    print(f"  est. cost:         ~${cost:.2f}  (no-cache upper bound; incl. GLM proposal calls)")
    print("  NOTE: ±2× band — real num_trials/caching/output verbosity dominate.")


def live_smoke(program: Any, example: Any) -> None:
    """One real GLM-5.2 call to prove the typed structured-output path before the compile."""
    import dspy

    lm = make_dspy_lm(config.JUDGE_MODEL, max_tokens=config.JUDGE_MAX_TOKENS)
    with dspy.context(lm=lm):
        pred = program(lexicon=example.lexicon, window=example.window)
    cands = [Candidate.model_validate(c) for c in pred.candidates]
    print(f"  live structured-output smoke OK — parsed {len(cands)} candidate(s) from GLM 5.2")


def evaluate(program: Any, valset: list[Any], lex: Any, lm: Any) -> dict[str, Any]:
    """Held-out diagnostics aligned with the surfacer's job (post-guardrail, J3).

    Reports what matters for a corrections feed, all on `lm` (so its calls land in that
    LM's cost history):
    - **confirm precision/recall** — of the corrections we would write (focal verdict
      `confirm`), how many are exactly right (`confirm` + exact canonical); and of the real
      garbles, how many we catch. A wrong-canonical confirm and a false confirm on a
      negative both count against precision.
    - **restraint** — of the negatives (gold `new`/`reject`), the fraction we correctly do
      NOT confirm (the same "no surviving confirm" safety contract as `make_metric`, so the
      two agree).
    - **confusion** — a gold×predicted verdict matrix for inspection (a dropped/silent span
      counts as predicted `reject` = no correction).
    """
    import dspy

    from .goldset import _normalize_ws, _one_line_transcript
    from .judge import apply_guardrails

    classes = ("confirm", "new", "reject")
    confusion = {g: dict.fromkeys(classes, 0) for g in classes}
    confirm_tp = confirm_fp = confirm_fn = 0
    neg_total = neg_restrained = 0
    for ex in valset:
        gold: Candidate = ex.candidates[0]
        with dspy.context(lm=lm):
            pred = program(lexicon=ex.lexicon, window=ex.window)
        try:
            cands = [Candidate.model_validate(c) for c in pred.candidates]
        except Exception:
            cands = []
        kept = apply_guardrails(cands, _one_line_transcript(ex.line_text), lex)
        focal = next(
            (
                c
                for c in kept
                if c.line_ref == 0 and _normalize_ws(c.span) == _normalize_ws(gold.span)
            ),
            None,
        )
        pred_v = focal.verdict if focal is not None else "reject"
        confusion[gold.verdict][pred_v] += 1

        proposed_confirm = focal is not None and focal.verdict == "confirm"
        correct_confirm = proposed_confirm and focal.suggested_canonical == gold.suggested_canonical
        if gold.verdict == "confirm":
            confirm_tp += int(correct_confirm)
            confirm_fn += int(not correct_confirm)
            confirm_fp += int(proposed_confirm and not correct_confirm)  # confirmed wrong canonical
        else:
            neg_total += 1
            neg_restrained += int(not proposed_confirm)
            confirm_fp += int(proposed_confirm)  # false confirm on a negative
    prec = confirm_tp / (confirm_tp + confirm_fp) if (confirm_tp + confirm_fp) else 0.0
    rec = confirm_tp / (confirm_tp + confirm_fn) if (confirm_tp + confirm_fn) else 0.0
    return {
        "confirm": {
            "precision": round(prec, 3),
            "recall": round(rec, 3),
            "support": confirm_tp + confirm_fn,
        },
        "restraint": {
            "rate": round(neg_restrained / neg_total, 3) if neg_total else 0.0,
            "support": neg_total,
        },
        "confusion": confusion,
    }


def print_eval(rows: dict[str, Any]) -> None:
    c = rows["confirm"]
    r = rows["restraint"]
    print(f"  confirm    P={c['precision']:.3f} R={c['recall']:.3f} (n={c['support']})")
    print(f"  restraint  {r['rate']:.3f} of {r['support']} negatives correctly not confirmed")
    print("  confusion (gold→pred):")
    for gold, preds in rows["confusion"].items():
        print(f"    {gold:8s} " + "  ".join(f"{p}={n}" for p, n in preds.items()))


def _sum_cost(*lms: Any) -> float:
    """Best-effort total USD across the given LMs' call histories (litellm-computed).

    The compile drives a prompt-model + a task-model (both GLM 5.2 now), so summing a
    single LM under-reports; pass every LM used.
    """
    total = 0.0
    for lm in lms:
        for entry in getattr(lm, "history", []) or []:
            total += float(entry.get("cost") or 0.0)
    return total


def build_split(
    *, data_dir: Path, defs_path: Path, mined_path: Path, val_frac: float, seed: int
) -> tuple[Any, list[Any], list[Any]]:
    lex = build_lexicon(defs_path)
    mined = load_mined_artifact(mined_path) if Path(mined_path).exists() else None
    gold = build_goldset(lex, mined=mined, data_dir=data_dir, defs_path=defs_path)
    trainset, valset = split_goldset(gold, val_frac=val_frac, seed=seed)
    return lex, trainset, valset


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Compile + eval the dspy judge (gate J).")
    ap.add_argument("--live", action="store_true", help="run the real compile (spends tokens)")
    ap.add_argument(
        "--eval-only",
        action="store_true",
        help="re-eval the committed compiled judge (spends tokens)",
    )
    ap.add_argument("--mine-only", action="store_true", help="just (re)write the mined artifact")
    ap.add_argument(
        "--propose", action="store_true", help="append `proposed` new-entity candidates for review"
    )
    ap.add_argument("--auto", default="medium", choices=["light", "medium", "heavy"])
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--defs", type=Path, default=DEFS_PATH)
    ap.add_argument("--mined", type=Path, default=DEFAULT_MINED_PATH)
    ap.add_argument("--out", type=Path, default=DEFAULT_COMPILED_PATH)
    ap.add_argument("--val-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--threads", type=int, default=8, help="concurrent LM calls during compile")
    args = ap.parse_args(argv)

    init_telemetry("astra.linguist.optimize")

    if args.propose:
        lex = build_lexicon(args.defs)
        existing = load_mined_artifact(args.mined) if Path(args.mined).exists() else []
        seen = {fold_for_match(r.span) for r in existing}
        fresh = [
            p
            for p in propose_new_entities(lex, args.data_dir)
            if fold_for_match(p.span) not in seen
        ]
        write_mined_artifact(existing + fresh, args.mined)
        print(f"appended {len(fresh)} `proposed` new-entity candidates → {args.mined}")
        print(
            "review them with: uv run python -m astra_linguist.surface.review_tui --label proposed"
        )
        return 0

    if args.mine_only:
        lex = build_lexicon(args.defs)
        # Carry forward any prior hand-review so a re-mine never clobbers curation.
        prior = load_mined_artifact(args.mined) if Path(args.mined).exists() else None
        print(f"mining {len(list(Path(args.data_dir).glob('*.json')))} sessions…")
        records = mine_negatives(lex, load_defs(args.defs), args.data_dir, prior=prior)
        write_mined_artifact(records, args.mined)
        kept = sum(1 for r in records if r.reason.startswith("hand-reviewed"))
        print(f"wrote {len(records)} deduped records → {args.mined} ({kept} hand-labels preserved)")
        return 0

    if args.eval_only:
        import dspy

        from .dspy_judge import load_compiled

        ensure_openrouter_env()
        lex, _, valset = build_split(
            data_dir=args.data_dir,
            defs_path=args.defs,
            mined_path=args.mined,
            val_frac=args.val_frac,
            seed=args.seed,
        )
        eval_lm = make_dspy_lm(config.JUDGE_MODEL, max_tokens=config.JUDGE_MAX_TOKENS)
        dspy.configure(lm=eval_lm)
        print(f"evaluating committed judge ({args.out}) over {len(valset)} held-out examples…")
        print_eval(evaluate(load_compiled(args.out), valset, lex, eval_lm))
        print(f"\napprox spend: ${_sum_cost(eval_lm):.2f}")
        return 0

    lex, trainset, valset = build_split(
        data_dir=args.data_dir,
        defs_path=args.defs,
        mined_path=args.mined,
        val_frac=args.val_frac,
        seed=args.seed,
    )
    print_estimate(trainset, valset)

    if not args.live:
        print("\nDry run — pass --live to compile (spends tokens). No LM was called.")
        return 0

    import dspy

    ensure_openrouter_env()
    program = build_judge_program()
    print("\nrunning live structured-output smoke…")
    live_smoke(program, trainset[0])

    metric = make_metric(lex)
    prompt_lm = make_dspy_lm(config.ESCALATE_MODEL, max_tokens=config.JUDGE_MAX_TOKENS)
    task_lm = make_dspy_lm(config.JUDGE_MODEL, max_tokens=config.JUDGE_MAX_TOKENS)
    dspy.configure(lm=task_lm)

    optimizer = dspy.MIPROv2(
        metric=metric,
        prompt_model=prompt_lm,
        task_model=task_lm,
        auto=args.auto,
        max_bootstrapped_demos=MAX_BOOTSTRAPPED_DEMOS,
        max_labeled_demos=MAX_LABELED_DEMOS,
        num_threads=args.threads,
    )
    print(f"\ncompiling (MIPROv2 auto={args.auto}, prompt=glm-5.2, task=glm-5.2)…")
    compiled = optimizer.compile(
        program,
        trainset=trainset,
        valset=valset,
        requires_permission_to_run=False,  # already gated behind --live + the printed estimate
    )

    print("\nevaluating held-out val…")
    print_eval(evaluate(compiled, valset, lex, task_lm))
    print(f"\napprox spend: ${_sum_cost(task_lm, prompt_lm):.2f}")

    save_compiled(compiled, args.out)
    print(f"saved compiled judge → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
