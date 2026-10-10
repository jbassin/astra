---
name: heartwood-0033-gotchas
description: heartwood 0033 agentic rework (dspy.RLM wiki maintainer) — build state, model pick, and load-bearing gotchas
metadata:
  type: project
---

PROJECT 2026-10-10: heartwood rebuilt as ONE dspy.RLM agent per session (spec
`thoughts/astra/specs/0033-heartwood-agent-spec.md`); supersedes [[heartwood-0020-gotchas]]. S1–S4 built +
pushed (`b12a7b8a`…`22036ffc`, `8c3b9b3f`); heartwood.iridi.cc + the review frontend RETIRED. Auto-publish,
no human review; `just heartwood-agent <date> [--dry-run|--no-push|--model=…]`, `just heartwood-revert`,
`just heartwood-backfill` (detached systemd-run, budget `heartwood.backfill-budget-usd` 100).

**Model = DeepSeek V4.1 Flash** (stakeholder pick after the S5 dry runs): 2025-8-28 = $0.31 / 21 min /
39 of 40 iterations / 16 created + 3 updated. GLM 5.3 was too slow for an RLM loop (~46 s/call rising to
~4 min, 0 writes after 42 min — killed). Kimi K3 rejected on price before the build.

**Why:** the stakeholder judged the 0020 fixed pipeline too rigid to reason across transcript + wiki.
**How to apply:** S6 (go-live + backfill) is next and is PAID + LIVE — flag it ([[flag-paid-live-actions]]).

Gotchas:
- dspy callbacks never see cost/usage → `MeteredLM.forward` reads the litellm response; litellm already
  requests OpenRouter `usage.include`, so cost is OpenRouter's real number (litellm's price map knows neither model).
- `llm_query_batched` runs sub-calls on a raw ThreadPoolExecutor (drops contextvars) → LM spans are parented
  EXPLICITLY to the run span.
- dspy re-injects input variables before EVERY code block → never pass mutable state (a page list) as an input.
- One unparseable reply used to kill the whole run → `HeartwoodRLM._execute_iteration` absorbs `AdapterParseError`.
  ChatAdapter retries via JSONAdapter, so one bad reply = 2 main calls.
- Deno sandbox on this host needs `DENO_NO_PACKAGE_JSON=1` (repo package.json blocks the npm:pyodide fetch) and a
  RESOLVED `DENO_DIR` ($HOME is a symlink → Deno read-permission check fails). `just heartwood-sandbox-warm` first.
- node lives only under nvm → detached runs must carry the caller's PATH (`find_node()` falls back to nvm).
- Host CLIs can't reach `signoz-otel-collector:4318`; heartwood exports to `telemetry.host-otlp-endpoint`
  (localhost:10353) — the first host CLI to export at all.
- linguist-commit now commits with `--only` over its exact changed files (the staged-file sweep class is closed).
- `pkill -f <pattern>` also matches your own shell's command line — it killed the calling shell (exit 144).
