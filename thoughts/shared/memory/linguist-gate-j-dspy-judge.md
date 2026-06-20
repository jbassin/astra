---
name: linguist-gate-j-dspy-judge
description: how linguist's optimizable dspy judge + MIPROv2 compile works — gold set, miner, triage TUI, optimize.py, committed artifact
metadata:
  type: project
---

Gate J of sub-plan 0006 (linguist) is the **live, optimizable dspy judge** behind the
transcription-correction surfacer. Live-compiled 2026-06-20.

**Pieces** (`apps/linguist/src/astra_linguist/surface/`):
- `dspy_judge.py` — the `JudgeSignature` (inputs `lexicon`+`window`, output typed `list[Candidate]`) with
  the faerrin `SYSTEM` prompt as its instruction; `build_judge_program()` / `load_compiled` / `save_compiled`.
- `judge.py::make_dspy_complete_fn()` — wires the compiled program behind the `CompleteFn` seam (loads
  `judge.compiled.json` if present, else uncompiled). Takes a `lm_factory` for hermetic tests; resolves the
  real key (via `ensure_anthropic_env`) only on the production path. `judge_session` + guardrails unchanged.
- `goldset.py` — gold set = `defs.yaml` confirms + corpus-mined confirm/reject (confidence-gated, **deduped
  one-per-span-fold**, `prior`-merge preserves hand-labels on re-mine) + synthetic & human `new`.
  `propose_new_entities` mines real far-from-lexicon proper nouns for `new`. `make_metric` runs
  `apply_guardrails` first (safety is fixed, not learned).
- `review_tui.py` — keyboard TUI to triage the mined artifact (`--label proposed|skip|reject|…`); one keypress
  per record, writes back resumably.
- `optimize.py` — the **one-command offline step, never CI**. `--mine-only`, `--propose`, dry-run (prints a
  pre-spend estimate), `--live` (real MIPROv2-medium compile, sonnet proposes / haiku executes, spend-gated),
  `--eval-only` (re-eval the committed artifact). Needs `optuna` (MIPROv2 dep; guarded by a test).

**Committed artifacts:** `surface/judge.compiled.json` (tuned prompt+demos) and
`surface/gold/mined_negatives.json` (the curated 111-record gold negatives). MIPROv2 always keeps the
faerrin `SYSTEM` prompt as candidate 0, so a compile can only match or beat it.

**Result (first compile):** held-out confirm **P=0.915 / R=0.607**, **restraint 0.946** (2/37 negatives
falsely confirmed); MIPROv2 metric **58.3 → 69.4**. Re-tune as real Groq sessions arrive (defs.yaml was tuned
to whisperx). The G1 review-loop asset (write confirmed corrections back to defs.yaml) is the next deferred
piece. See [[config-single-source]] and [[astra-migration-research]].
</content>
