# NLSpec 0006-J — linguist: live dspy judge + optimizer (gate J)

**Status:** **implemented + compiled** (2026-06-20). Live MIPROv2-medium compile run (sonnet proposes /
haiku executes); committed `judge.compiled.json`. Held-out (144): **confirm P=0.915 / R=0.607**,
**restraint 0.946** (only 2/37 negatives falsely confirmed); MIPROv2 metric **58.3 → 69.4** over the seed.
Spend ≈ $12 (compile) + $1.2 (eval). All CI lanes green; code-reviewer pass folded in. **Phase:** 3
(pipeline). **Parent spec:**
[`0006-linguist-spec.md`](./0006-linguist-spec.md) (gate **J** there: *"live dspy judge run + optimizer
tuning"*, deferred by H1). **Pre-impl thoughts:**
[`../../shared/research/2026-06-19-linguist-gate-J-dspy-judge-thoughts.md`](../../shared/research/2026-06-19-linguist-gate-J-dspy-judge-thoughts.md).
**Process:** octo Claude-only team mode (python-pro, code-reviewer), per astra `CLAUDE.md`. **Depends-on:**
the built+verified deterministic surfacer (`apps/linguist/.../surface/`), `astra_llm.make_dspy_lm`,
`astra_config.resolve_sops_ref`. dspy **3.2.1** installed.

## Goal

Replace the `make_dspy_complete_fn()` stub with a real dspy program that *is* the Phase-2 judge, plus an
offline MIPROv2 optimizer harness that tunes it against a gold set mined from `defs.yaml` + the 76
committed transcripts. The token-spending compile is a **one-command local step**, never CI. Also close
the runtime gap that blocks any live call: **wire the SOPS-resolved Anthropic key into litellm**.

## Decisions in force (K-series, confirmed with the user)

| # | Decision | Choice |
|---|---|---|
| K1 | Live compile this session? | **Yes** — run a real MIPROv2 compile + held-out eval and commit `judge.compiled.json`. Gated behind an explicit `--live` flag + a printed pre-spend estimate. |
| K2 | Negative examples | **Mine `find_known` over the 76 transcripts + auto-label** (already-canonical/ordinary → reject; recurring no-match proper-noun → new; real garble matching a `defs.yaml` key → confirm). Committed as a reviewable JSON artifact for offline hand-correction. |
| K3 | Optimizer | **MIPROv2**, `auto="medium"`, over the **full** gold set. |
| K4 | Scope | **Judge tuning only.** The G1 `correction_candidates` review-loop asset is **deferred** (needs live judge output). |
| K5 | Artifact + gold location | Gold *built by code* (confirms from `defs.yaml`; mined negatives committed under `apps/linguist/.../surface_gold/`). Compiled program committed at `apps/linguist/.../surface/judge.compiled.json`. `make_dspy_complete_fn()` loads it if present, else runs uncompiled (zero-shot). |
| K6 | Compile models | **prompt_model = `claude-sonnet-4-6`** (instruction proposal), **task_model = `claude-haiku-4-5-…` (`JUDGE_MODEL`)** (execution — what production runs). Tuning the task on sonnet would mismatch production + ~3× cost. |
| K7 | Credential | A new `astra_llm.ensure_anthropic_env()` resolves `sops:anthropic_api_key` via `astra_config` and sets `ANTHROPIC_API_KEY` if unset (env-export wins → no decrypt). litellm reads it. |

## Scope (in)

- **`libs/py/llm` — credential bridge.** `ensure_anthropic_env()`: if `ANTHROPIC_API_KEY` unset, resolve
  `sops:anthropic_api_key` via `astra_config.resolve_sops_ref` and set it in `os.environ`. Idempotent,
  lazy, never logs the value. Add `astra-config` to astra-llm deps (acyclic: config ⊀ llm).
- **`surface/dspy_judge.py` — the program.** A `dspy.Signature` (inputs `lexicon`, `window`; typed output
  `candidates: list[Candidate]`) with `SYSTEM` as the instruction (`.with_instructions(SYSTEM)`), wrapped
  in `dspy.ChainOfThought`. `build_judge_program()`, `load_compiled(path)`, `save_compiled(prog, path)`.
- **`surface/goldset.py` — gold-set builder + negative miner.** `build_confirms()` from `defs.yaml`
  (literal garble → key, in a minimal synthetic window; skip non-literal regex fragments).
  `mine_negatives(data_dir)` runs `find_known` over the 76 sessions, auto-labels (K2), uses the **real
  transcript line** as the window; writes the reviewable artifact. `build_goldset()` → combined
  `list[dspy.Example]` (each carries `.transcript`, `.gold`, `.with_inputs("lexicon","window")`), split
  train/val.
- **`surface/metric.py` (or in goldset)** — `make_metric(lex)`: runs `apply_guardrails` on the prediction
  **first** (fixed safety, not learned), then scores the focal span: correct verdict, and exact
  `suggested_canonical` for confirms. `reject` ⇔ no surviving confirm for that span.
- **`surface/optimize.py` — the offline CLI** (`uv run python -m astra_linguist.surface.optimize`).
  `ensure_anthropic_env()` → build gold → split → `MIPROv2(metric, prompt_model=sonnet, task_model=haiku,
  auto="medium")` → `compile(requires_permission_to_run=…)` → eval held-out → print confirm/new/reject
  precision/recall + **token/cost totals** → `save_compiled`. Refuses to spend without `--live`; prints
  the pre-spend estimate and exits otherwise. **NOT a CI job.**
- **Wire-back** `make_dspy_complete_fn()`: `ensure_anthropic_env()`; load compiled artifact if present
  else `build_judge_program()`; per-call `dspy.context(lm=make_dspy_lm(args.model, …))` (haiku, or sonnet
  on escalate); adapt `CompleteArgs(cached→lexicon, user→window) → ScanResult`. `judge_session` unchanged.
- **Tests (hermetic).** Gold-set builder + miner unit tests (no LM); metric unit tests; a
  **synthetic-fixture compile test** (tiny gold set + `DummyLM`, tiny `auto`) asserting a compiled program
  is produced + save/load round-trips; an artifact-load smoke if committed. Existing stubbed
  `judge_session` tests stay green.

## Scope (out)

- **The G1 `correction_candidates` Dagster asset + review loop** (defer, K4).
- **Re-tuning on real Groq sessions** (none exist yet, Risk 3) — this compile trains on historical
  whisperx garbles + synthetic confirms; re-tune when real sessions arrive.
- Any CI job that calls an LM. The compile/eval is local-only.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| J1 | Signature shape | inputs `lexicon` (=`CompleteArgs.cached`) + `window` (=`CompleteArgs.user`, already carries the flagged list from `render_window`); output `list[Candidate]`. Keeps the `CompleteFn` seam byte-identical so `judge_session` + its tests don't change. |
| J2 | Instruction | `SYSTEM` is the signature instruction (what MIPROv2 mutates). The deterministic `SYSTEM` const stays the source of truth. |
| J3 | Guardrails in the loop | the metric runs `apply_guardrails` on every prediction before scoring — the optimizer learns to satisfy the *post-guardrail* contract, never to bypass it. |
| J4 | Escalation | unchanged: `judge_session` re-runs the **same** compiled program under a Sonnet LM on borderline confirms. The compile does not separately tune Sonnet. |
| J5 | Confirm windows | synthetic confirms embed the literal garble verbatim (guardrail span-membership); mined examples use the real line. Non-literal regex fragments (`\b`, `$`, `^`, char classes) are skipped for synthesis. |
| J6 | Spend safety | `optimize.py` requires `--live`; prints the estimate; `MIPROv2.compile(requires_permission_to_run=…)` as a second gate; cost printed from `astra_llm` cost hooks. |
| J7 | Artifact | `judge.compiled.json` committed (the tuned prompt/demos snapshot). Loaded by `make_dspy_complete_fn`; a missing artifact ⇒ uncompiled program (still functional). |

## Acceptance criteria (exit gate J) — **all met (2026-06-20)**

| # | Criterion | How verified | ✓ |
|---|---|---|---|
| J-a | `ensure_anthropic_env()` resolves the key via `astra_config` (config→SOPS); stub path stays key-free | env-override unit test + live compile proved the SOPS path | ✅ |
| J-b | dspy judge program builds; `CompleteArgs → ScanResult` adapter keeps `judge_session` + escalation green | unit tests | ✅ |
| J-c | Gold-set builder (confirms from `defs.yaml`) + confidence-gated miner + dedupe + new-entity proposer + reviewable artifact (TUI-curated) | unit tests + committed 111-record artifact | ✅ |
| J-d | Metric runs guardrails-first and scores verdict + exact canonical | unit test | ✅ |
| J-e | Synthetic-fixture compile (`DummyLM`) + optuna-dep guard (hermetic) | pytest (CI) | ✅ |
| J-f | **Live MIPROv2-medium compile** over the 722-example gold set; held-out **confirm P=0.915/R=0.607, restraint 0.946**; metric **58.3→69.4**; `judge.compiled.json` committed | one-command local run | ✅ |
| J-g | `make_dspy_complete_fn()` loads the committed artifact without an LM | unit smoke + real-artifact load | ✅ |
| J-h | All CI lanes green; no live LLM/network in any test | local CI reproduction | ✅ |

## Risks

1. **dspy structured-output live behavior** — the typed `list[Candidate]` `OutputField` through
   litellm→Claude is the one thing only a live call validates; the live compile (J-f) exercises it before
   we trust the artifact. *Mitigation:* a tiny live single-call smoke runs first inside `optimize.py`
   before the full compile, so a structured-output break fails for cents, not dollars.
2. **MIPROv2 medium spend** — ~$6–12 expected (haiku task LM; sonnet only proposes), ±2× band.
   *Mitigation:* `--live` gate + printed estimate + `requires_permission_to_run`; sonnet confined to
   instruction proposal (K6).
3. **Auto-label noise** (K2) — heuristic new/reject labels are imperfect. *Mitigation:* committed as a
   reviewable artifact; confirms (the high-signal majority) come from `defs.yaml` + real-context mined
   garbles, not the heuristic.
4. **whisperx-vs-Groq drift** (parent Risk 3) — tuning on historical whisperx garbles; re-tune when real
   Groq sessions land. Accepted; out of scope.
5. **Compiled-artifact churn** — `judge.compiled.json` is a generated snapshot; treat like a committed
   lockfile, regenerated by the one-command step, reviewed on change.

## Hand-off

- **Unblocks** the surfacer to run live on new sessions once Groq sessions exist; the **G1 review loop**
  (deferred, K4) consumes its output next.
- Updates parent `0006-linguist-spec.md` gate **J** status from *deferred* to *implemented* on completion.
</content>
