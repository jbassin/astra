---
name: mouthpiece-producer-0034
description: mouthpiece producer 0034 — RLM brief replacing fixed grounding+continuity; experiment results and load-bearing gotchas
metadata:
  type: project
---

PROJECT 2026-10-12: 0034 built (S1 `d76feccf` lift heartwood's RLM core → `astra_llm.rlm`; S2 `b278dc02`
read-only producer RLM + `brief_block` Pass A seam; S3 `a2a298d0` `just mouthpiece-experiment`). Spec
`thoughts/archive/specs/0034-mouthpiece-producer-spec.md` §10 has the full results. Experiment-only — NOT wired
into Dagster; runtime placement (Deno in dagster-code vs host step) is decided only if it ships.

**Result on 2026-10-5:** producer $0.20 / 10 min / 0 bad citations, callbacks back to May. GLM 5.3 + brief
= best script (lint 8/10 vs live 7/10, 18/22 lore names vs 13/22). DeepSeek as the DIALOGUE model is weak
(464 choppy turns, clean-line tell) — keep DeepSeek for the producer only. ⚠ Brief makes Nell (newcomer)
stop asking (16/50 question turns vs 31/52); the seat guard `4d5c4e30` ("only the regulars read the notes") brought it to 25/64, lint 9/10. **Stakeholder 2026-10-12: GLM writes the scripts**; experiment default = one GLM arm.

**Why:** [[heartwood-0033-gotchas]] showed DeepSeek RLMs navigate transcript+wiki cheaply; fixed grounding
needed the manual force-grounding recipe ([[ashen-pact-mouthpiece-grounding]]).
**LIVE since 2026-10-12 (0035, `997d2904`+`8eb9cd06`):** `session_brief` asset (digest → brief → script) runs in
dagster-code with Deno 2.5.6 cache-only (Pyodide 314.0.7 warmed at build); wiki mounted live read-only. Producer
failure → no `brief.json` → script falls back to the old prompt (WARN, no page). In-container proof on 2026-10-5:
$0.06, 4 min. Spec `thoughts/archive/specs/0035-mouthpiece-producer-wiring-spec.md`.
**First live session 2026-10-12 ✅:** brief 4m29s/$0.18 (0/92 citations bad) → script `brief=used` in 12m08s (fastest
on record) "The Door Answers With a Rifle", lint 8/10, Nell asks 47% (live pre-brief 60%), 6,727 words (over the
~6k cap). Zip → published 44 min. Stage history table: `artifacts/pipeline-timing-2026-10-12.md` (gitignored).
**How to apply:** listen to 2026-10-12; watch Nell's share and episode length on the next sessions.

Gotchas:
- dspy RLM typed output: declare `brief: ProducerBrief` — a `str` output `str()`s a submitted dict into a
  Python repr; typed output gets dspy's free in-loop `[Type Error]` retry (proven through real Deno).
- heartwood tests monkeypatch module-level `tracer`/`instruments` → the lifted `MeteringMixin` uses
  `_tracer()`/`_instruments()` hooks that heartwood's subclass binds to its own module functions.
- ruff strips re-exported names as unused → use `from x import y as y` for re-exports.
- Episode dirs are mixed: legacy `000.<slug>.<date>/` (sessionId, uppercase A/B/C hosts), a recap dir
  (`date_key` raises on it), live `<date>/` — enumerate via `episodes_index.parse_id`/`is_recap`.
- `LiteLLMClient` prices from a static table: an unknown model silently costs $0; GLM 5.3's row has
  drifted from the OpenRouter listing ($0.079/$4.80 now).
- `pnpm run lint` OOMs at default threads; run `oxlint ... --threads=4` directly.
- (0035) The dagster-code image has NO git: `subprocess.run(["git",…])` raises FileNotFoundError regardless
  of `check=False` — catch OSError. A detached CLI `dagster asset materialize` exports no telemetry; launch
  proof runs via GraphQL `launchRun` (location `astra-pipeline`, repo `__repository__`, job `__ASSET_JOB`).
- (0035) `--select session_script` re-renders now REUSE `episodes/<date>/brief.json` (2026-10-5 has one);
  add `session_brief` to the selection for a fresh brief. The force-grounding recipe only affects the fallback.
- (0035) The Deno warm layer re-runs on any source change and may pull a newer unpinned Pyodide — the build log
  prints it; `sandbox_version` swallows errors, so the warm step exits 1 on `None`.
- (0035) Before 0035 the container read an image-baked wiki copy (stale since the last `just up`).
- (2026-10-12) chronicle `session_episode_summary` failed on GLM structured output that parsed but failed
  `EpisodeSummary` (items as a JSON string, cliffhanger missing) → mouthpiece gate stayed closed until a hand
  FROM_FAILURE re-run. Fixed `a8de0bcd`: `call_structured` retries ValidationError ×3 then raises LlmError
  (deployed 00:40 after the episode — `just up` mid-run would kill the mouthpiece run).
- Pipeline stage times (first passes, 9-7…10-12): scribe 8–11.5 min (Whisper), linguist+chronicle 1–6 min,
  digest 1–11 min, brief ≈ 4.5 min, script 12–36 min (most failure-prone), TTS 7–15 min, assemble ≈ 20 s;
  sensor handoffs 10–30 s. Dagster `stepStats` via GraphQL has every run's step times.
