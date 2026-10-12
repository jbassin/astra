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
**How to apply:** next = ship decision (D4: Deno in dagster-code vs host step) and wiring into `session_script`.

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
