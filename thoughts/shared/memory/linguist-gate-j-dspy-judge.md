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
- `surface.py` — the **live session runner** (the actual product use): `surface_session` = `find_known` →
  `judge_session(make_dspy_complete_fn())` → candidates; `--session data/{date}.json` writes a reviewable
  `{date}.candidates.json` (deduped one row per correction; verdict + canonical + speaker/line context).
  Live (key+network, not CI); orchestration unit-tested with a stub.
- **The G1 loop closes** (built as CLIs, not yet the Dagster asset): `review_tui --candidates {file}` to
  accept/reject the judge's corrections, then `surface/apply.py --candidates {file}` appends the accepted
  `confirm`s to `defs.yaml` via `corrections.add_correction` (faerrin-parity fragment encoding +
  idempotency + **minimal-diff text append**, not a YAML redump — clean PRs). Full loop:
  **surface → review → apply → defs.yaml**. Accepted `new`s are lexicon/akasha material, not defs.

**Committed artifacts:** `surface/judge.compiled.json` (tuned prompt+demos) and
`surface/gold/mined_negatives.json` (the curated 111-record gold negatives). MIPROv2 always keeps the
faerrin `SYSTEM` prompt as candidate 0, so a compile can only match or beat it.

**Result (first compile, haiku/sonnet):** held-out confirm **P=0.915 / R=0.607**, **restraint 0.946** (2/37
negatives falsely confirmed); MIPROv2 metric **58.3 → 69.4**. Re-tune as real Groq sessions arrive (defs.yaml
was tuned to whisperx).

**RETUNED ONTO GLM 5.2 (2026-06-26, `199e5ab`).** Both `surface-model-judge` + `surface-model-escalate` now
`openrouter/z-ai/glm-5.2` (config.kdl + both schemas), matching mouthpiece's [[mouthpiece-glm-debate-switch]]
— reverses the prior "linguist judges stay Anthropic" stance. **Key bridge:** new
`astra_llm.ensure_openrouter_env()` mirrors `ensure_anthropic_env` (resolves `llm.openrouter-api-key` →
`OPENROUTER_API_KEY`); `optimize.py` + `judge.py`'s production path call it. The anthropic key stays only for
the substrate smoke. **Escalation is now INERT** — `judge_session` only escalates when `escalate_model !=
judge_model`, so with both GLM the borderline second-pass never fires (machinery kept, dormant, zero runtime
cost; re-enable by pointing escalate at a distinct model). A `test_judge_session_no_escalation_when_models_match`
locks that in; the existing escalation test now passes explicit distinct models. **GLM held-out eval beats
haiku** (gold set has since grown to 580 train / 144 val): confirm **P=0.936 / R=0.779**, **restraint 0.935**
(2/31); MIPROv2 metric **81.25**. Live MIPROv2-medium compile spent **$7.32**. GLM 5.2 is a reasoning model
(emits `reasoning_content`) — judge max-tokens 4096 is sufficient (verified: candidates parse, natural stop).
Re-run: `uv run python -m astra_linguist.surface.optimize --live` (needs `OPENROUTER_API_KEY` via SOPS + net).
**Deploy:** the `correction_candidates` asset runs IMAGE-baked code in the dagster container → `just up`
(rebuilds dagster-code) deploys it. **DONE 2026-06-26** — rebuilt + recreated, code location loaded clean;
`OPENROUTER_API_KEY` was already on the `*dagster-env` anchor from the mouthpiece switch (no env change).
GLM judge is live; next `correction_candidates` materialization uses it. **G1 is DONE** (no longer deferred): the surfacer is a Dagster asset `correction_candidates`
(`bd7f533`, in `assets.py`, SigNoz-instrumented `295a3fa`), the defs.yaml write-back landed (`c07a314`), and
the live judge is compiled (`judge.compiled.json`). The apply step stays a CLI **by design** (human triage
shouldn't auto-rewrite the lexicon) — that's not a deferral. See [[config-single-source]] and
[[astra-migration-research]].
