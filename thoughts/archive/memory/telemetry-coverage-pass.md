---
name: telemetry-coverage-pass
description: Repo-wide observability once-over (2026-06-30) — added spans/logs/metrics across every service, DEPLOYED + verified live. THE load-bearing gotcha: TS metric instruments grabbed at module scope before initTelemetry are PERMANENT no-ops (JS metrics has no deferred proxy) → use lazyCounter/lazyHistogram from @astra/observe.
metadata:
  type: project
---

PROJECT 2026-06-30 — **DONE + DEPLOYED + verified live.** A comprehensive "add spans, logging, and
metrics across all services" pass. Audited by 3 parallel codebase agents cross-checked against live
SigNoz, then 5 phases + 1 fix, each its own CI-green commit, then `just up` (whole stack) and a
SigNoz spot-check that confirmed **all three signals flowing live** — and caught a latent bug.

Commits: `a7a6a25` (P1) · `1673a45` (P2) · `24b2111` (P3) · `cda5814` (P4) · `262f5e0` (P5) ·
**`88e6057` (the metrics fix)**.

## ⭐ THE load-bearing gotcha — TS metrics have NO deferred proxy provider
`getTracer()` returns a **ProxyTracer** and `logs.getLogger()` a **ProxyLogger** — both connect
**retroactively** when `initTelemetry` later installs the real provider. **`metrics.getMeter()` does
NOT** — a counter/histogram from `getMeter().createCounter()` obtained **before** init is a
**permanent no-op** that never connects. Module-scope instruments hit this **every time**, because ES
import hoisting runs an imported module's top-level code **before** the entry's `initTelemetry()` call.
This had **silently zeroed every TS metric for the life of the repo** (strider's `editor.writes` + all
of this pass's) — spans + logs from the same code worked, so it was invisible until a post-deploy
metric spot-check (the span landed, the counter didn't).

**Fix (`88e6057`): `lazyCounter` / `lazyHistogram` in `@astra/observe`** — defer instrument creation
to first `.add()`/`.record()` (runtime, after init), mirroring the `libs/py/llm` lazy bind. **ALWAYS
use these for TS metrics**, never `getMeter().createCounter()` at module scope. (`getTracer`/`getLogger`
at module scope are FINE — they defer.) **Python is unaffected**: Dagster inits `astra.pipeline` in
`dagster/definitions.py` before importing the asset modules (Python imports aren't hoisted), and the
LLM client binds lazily. Verified live: `astra.orator.api.requests{outcome=unauthenticated}=5` matched
the exact test calls. NB metric ingestion lags ~1–3 min (export reader 60s + clickhouse index); the
metadata catalog (`signoz_list_metrics`) lags the data — query the metric directly to distinguish
"broken" from "lag".

## Phase 1 (`a7a6a25`) — correctness + identity (also load-bearing)
- **Short-lived procs must `shutdown()` or buffered exports DROP on exit.** 5 py standalone scripts
  (linguist surface/optimize via `__main__` try/finally; heartwood extract/propose + ontology-entity
  seed via try/finally **inside `main()`** because they're console_scripts that bypass `__main__`;
  akasha-snapshot got init+shutdown — it had none) + 3 TS services (orator-backend/weal-bot/weal-overlay
  capture the `initTelemetry()` handle + `shutdown()` on SIGINT/SIGTERM, mirroring vellum-render). The
  `@astra/observe/preload` path also does this but **no service uses it** (all init in-entry).
- **heartwood-FRONTEND service.name de-collided** `astra.heartwood` → **`astra.heartwood-frontend`**
  (it collided with heartwood-BACKEND's `astra.heartwood`). Config-single-source: the value lives in
  `config.kdl` + is mirrored as the default in BOTH schemas + asserted in BOTH config tests (5 spots).
- strider metric renamed → `astra.strider.editor.writes` (the `astra.` prefix convention).

## Phases 2–5 (what each added)
- **P2 TS long-running services** (`1673a45`): orator-backend/weal-bot/weal-overlay/vellum-render got
  spans on hot paths (API dispatch, the multi-min yt-dlp ingest via an **extract-inner** wrapper to
  avoid reindent, roll pipeline, voice join, render) + exporting logs on the critical error paths
  (console.* → getLogger) + counters/histograms. `@opentelemetry/api` added as a direct dep of weal-bot
  + orator-backend (for `SpanStatusCode`).
- **P3 Python depth** (`24b2111`): llm client emits cache-token counters + `request_duration_ms`;
  **mouthpiece's 4 assets now run inside spans — which ALSO fixes the `astra.llm.*` cost attributes that
  were silently landing on a no-op span** (`trace.get_current_span()` had no real span); scribe
  `transcribe_track` span + per-chunk outcome counter; akasha logger+`astra.akasha.pages`+span attrs.
- **P4 heartwood-frontend** (`cda5814`): the human review write paths (decision/conflict/registry/body)
  were 100% dark → span+log+`astra.heartwood.review.{decisions,body_edits}`. `(span): WriteResult =>`
  explicit callback return type needed — `startActiveSpan` widened the `{ok:true}` literal otherwise.
- **P5 orator-controller** (`262f5e0`): a desktop Stream Deck plugin — **can't reach the in-cluster
  collector**, so it posts to the **public** OTLP endpoint `https://otel.iridi.cc/v1/traces` (same one
  browser RUM uses) via a tiny **hand-rolled best-effort OTLP/JSON emitter** (`src/telemetry.ts`,
  node:crypto ids + fetch, fire-and-forget). The full OTel SDK was deliberately avoided (heavy/brittle
  in a Rollup'd plugin). Endpoint hardcoded (config.kdl isn't shipped in the bundle). **End-to-end
  delivery from a real desktop can't be verified in CI** (no Elgato runtime).

## The observe contract (recap)
- Python `init_telemetry("astra.<sub>")`; logs export ONLY via `logging.getLogger("astra.<sub>")`;
  `get_meter`/`get_tracer`; `shutdown()` for short-lived procs.
- TS `initTelemetry("astra.<sub>")`; `getTracer`/`getLogger` ok at module scope; **metrics → `lazyCounter`/
  `lazyHistogram`**; `console.log` does NOT export; frontends get the SSR-request span + RUM free via
  site-kit `createSsrServer`/`startRum` (RUM live on all 7, `telemetry.rum-endpoint`).
- Live coverage now: every frontend (SSR span + RUM), the pipeline (`astra.pipeline`), the 4 TS services
  (now with spans+metrics), heartwood review, orator-controller (best-effort). Verified post-deploy.

## Possible follow-ups (not blocking)
- Broaden Class-A SigNoz alerting beyond logs (only `astra.{pipeline,orator-backend,weal-bot,weal-overlay}`
  emit logs; the frontends emit traces) — an exceptions/trace-error-rate alert. See [[astra-alerting-setup]].
- scribe Groq ASR cost is still invisible (`litellm.transcription` bypasses the LLM client's `_record_cost`;
  Whisper is per-audio-second, not tokens — a different pricing path).

Builds on [[telemetry-built-in]] + [[config-single-source]] + [[signoz-mcp]] + [[deploy-apply-with-just]] +
[[deploy-sops-injection]] + [[no-ci-monitoring]].
