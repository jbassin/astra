---
name: mouthpiece-producer-0034
description: mouthpiece producer 0034 — RLM brief replacing fixed grounding+continuity; experiment results and load-bearing gotchas
metadata:
  type: project
---

PROJECT 2026-10-12: 0034 built (S1 `d76feccf` lift heartwood's RLM core → `astra_llm.rlm`; S2 `b278dc02`
read-only producer RLM + `brief_block` Pass A seam; S3 `a2a298d0` `just mouthpiece-experiment`). Spec
`thoughts/astra/specs/0034-mouthpiece-producer-spec.md` §10 has the full results. Experiment-only — NOT wired
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
$0.06, 4 min. Spec `thoughts/astra/specs/0035-mouthpiece-producer-wiring-spec.md`.
**How to apply:** check the first new session's `mouthpiece.script.brief` span attr = "used" and listen to it.

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
