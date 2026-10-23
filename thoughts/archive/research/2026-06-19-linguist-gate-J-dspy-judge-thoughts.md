---
date: 2026-06-19
subsystem: linguist (0006)
gate: J — live dspy judge + optimizer tuning
status: pre-implementation thoughts (K-decisions pending user confirm)
---

# linguist gate J — dspy judge + optimizer: design thoughts

Gate J is the one deferred piece of sub-plan 0006 (decision H1). Everything around it is built,
tested, and on `origin/main`: the Phase-1 phonetic filter (`known.find_known`), the lexicon, the
**deterministic** judge machinery (`judge.py`: `SYSTEM`, pydantic `Candidate`/`ScanResult`/`Flagged`/
`CompleteArgs`, `windows`, `render_window`, `apply_guardrails`, `judge_session` with haiku→sonnet
escalation), and the `CompleteFn` Protocol seam. The single stub is
`make_dspy_complete_fn()` → `raise NotImplementedError(... gate J ...)`. The LLM seam
`astra_llm.make_dspy_lm(model, *, max_tokens)` returns a `dspy.LM` routed through litellm
(`anthropic/` prefix). `dspy>=2.5` is already a dependency. Gold source: `defs.yaml` (232 canonical
keys, each value a list of mistranscription regex-fragments = labeled **confirm** examples).

## What gate J builds

A dspy program that *is* the judge, plus the offline optimizer harness that tunes it against a gold
set mined from the corpus, with the **token-spending compile gated** behind a one-command local step
(never CI). Concretely, mirroring the prior linguist slices:

1. **dspy module** — a `dspy.Signature` whose inputs are the cached lexicon block, the transcript
   window, and the pre-flagged spans, and whose output is a pydantic-typed `list[Candidate]`
   (`ScanResult`). Wrapped in `dspy.Predict`/`ChainOfThought`, configured with
   `make_dspy_lm(JUDGE_MODEL, max_tokens=JUDGE_MAX_TOKENS)`. This becomes the body of
   `make_dspy_complete_fn()`: it loads a committed compiled program if present, else falls back to the
   uncompiled (zero-shot) program, and adapts `CompleteArgs → ScanResult` so `judge_session` is
   unchanged (escalation just swaps the LM to Sonnet on the same program).

2. **Gold-set builder** — from `defs.yaml`, emit one **confirm** `dspy.Example` per (garble → key)
   pair, each wrapped in a minimal synthetic transcript window (`"... <garble> ..."`), labeled
   `verdict=confirm, suggested_canonical=key`. Mine **negatives** from the 76 committed transcripts:
   run `find_known` over the corpus and auto-label its flags — a flagged span that is itself already a
   lexicon canonical/ordinary English → **reject**; a recurring OOV proper-noun-shaped flag with no
   confident canonical → **new** candidate. Auto-labels are heuristic; they're committed as a
   reviewable artifact so the labels can be hand-corrected offline. A confirm-only gold set teaches
   "confirm everything", so the negatives are load-bearing.

3. **Metric** — `metric(example, prediction)` runs `apply_guardrails` on the prediction FIRST (the
   guardrails are fixed safety, not learned), then scores: correct verdict on the gold line **and**
   exact `suggested_canonical` match for confirms. Reported as confirm/new/reject precision+recall on
   a held-out eval slice.

4. **Optimizer + compile** — `dspy.BootstrapFewShot` (default; cheap, robust) over the trainset;
   `opt.compile(judge, trainset=…)`; `judge.save(artifact)`. The committed artifact (the tuned
   "prompt", a JSON snapshot) is produced by the **real** compile later; this session ships the
   harness + a **synthetic-fixture** compile test that compiles against a tiny in-memory gold set with
   a stubbed/dummy LM so CI proves the wiring without a token spend.

5. **Wire-back** — finish `make_dspy_complete_fn()`; `judge_session` untouched.

## The one thing to validate live (when budget exists)

The dspy **structured-output path** — a pydantic-typed `OutputField` (`list[Candidate]`) flowing
through litellm → Claude and parsing back — is the single behavior that must be confirmed against a
real Claude call before trusting any compile. faerrin did this via Anthropic tool-forcing
(`emit_result` tool from the zod schema, `tool_choice` forced); dspy's litellm path uses its own
structured-output adapter. That live check is part of the deferred one-command step, not CI.

## K-decisions — my recommendations (confirm before I write the spec)

- **K1 (live compile now vs machinery only):** **machinery only** + synthetic-fixture compile test;
  defer the real token-spending compile + eval. Mirrors H1; no Claude budget was given, and there are
  **no real Groq sessions yet** (Risk 3) so a compile now would tune on historical/synthetic confirms
  that re-tune anyway when real sessions arrive. *If you want a live compile this session, that needs a
  budget/credential I don't have — I'll stop and ask.*
- **K2 (negative mining):** mine `find_known` over the 76 committed transcripts, **auto-label**
  heuristically (already-canonical/English → reject; recurring unknown proper-noun → new), commit the
  result as a reviewable gold artifact for offline hand-correction. Cheapest path to a real negative
  set; no live tokens.
- **K3 (optimizer):** **BootstrapFewShot** default (cheap, robust), `MIPROv2` selectable via a flag.
- **K4 (scope):** **judge tuning machinery only** this round (gold-set builder + dspy module + metric +
  optimizer harness + synthetic compile test + wire-back). **Defer the G1 review-loop asset** — it
  consumes live judge output that won't exist until the real compile.
- **K5 (artifact + gold-set location/format):** gold set is *built by code* (confirms from `defs.yaml`,
  negatives a committed mined JSON artifact under `apps/linguist/`); compiled program committed later
  as `…/surface/judge.compiled.json`; `make_dspy_complete_fn()` loads it if present, else runs
  uncompiled. The synthetic test compiles to a tmpdir and commits nothing.

## CI / constraint reminders

- CI stays hermetic — no live LLM/network. CI runs the stubbed `CompleteFn` tests (unchanged), the
  gold-set builder unit tests, the synthetic compile test (dummy LM), and an artifact-load smoke if a
  compiled artifact is committed. The real compile + eval is a one-command offline step, **not** a CI
  job.
- Claude-only octo team mode; never route to a non-Claude model; never run `/octo:setup`.
- New work stays in `apps/linguist`. ruff + ty + pytest. Telemetry from day 1. Plain git + Conventional
  Commits, small logical commits.
</content>
</invoke>
