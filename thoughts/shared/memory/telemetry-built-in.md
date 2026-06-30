---
name: telemetry-built-in
description: every app/asset must wire traces+metrics+logs to SigNoz in its actual runtime from the start — importing observe is not enough
metadata:
  type: feedback
---

**Telemetry (traces + metrics + logs → SigNoz) must be built into every app, service, and
Dagster asset from the start — not bolted on later.** This is standing principle #1
(CLAUDE.md), and it's easy to *think* it's satisfied when it isn't.

The trap, found 2026-06-20: scribe + linguist *imported* `astra_observe` and created spans,
but **`init_telemetry()` was only called in the CLIs, never in the Dagster runtime** — so in
the actual pipeline (where the assets run) there was no provider installed and every span was
a **no-op**. Logs weren't wired at all (the observe libs installed only Tracer + Meter
providers, no Logger), and the only metrics were on the `LiteLLMClient` path (not the apps,
not the dspy judge). So the instrumentation existed at import-level but was **dead at
runtime**.

**How to apply (checklist for any new app/service/asset):**
- Call `init_telemetry("astra.<sub>")` in the **process that actually runs the code** — a
  long-running service's entrypoint, the Dagster **code location** (`dagster/definitions.py`,
  so the daemon + every run worker install providers), a CLI's `main()`. *Importing observe
  ≠ wiring it.* A span/metric/log is a no-op until a provider is installed **in that
  process**.
- Wire **all three signals**: spans (`get_tracer`), metrics (`get_meter` counters/histograms
  at meaningful boundaries — per-session, per-item, cost), and logs (`get_logger("astra.<sub>")`,
  which the py+ts `observe` libs now route to SigNoz via a LoggerProvider).
- **TS metrics: use `lazyCounter`/`lazyHistogram` from `@astra/observe`, NEVER `getMeter().createCounter()`
  at module scope.** The JS metrics API has no deferred proxy (unlike `getTracer`/`getLogger`, which DO
  defer), so a counter created before `initTelemetry` — which ES import hoisting guarantees for module-scope
  instruments — is a **permanent no-op**. This silently zeroed every TS metric until 2026-06-30; full
  detail in [[telemetry-coverage-pass]].
- Instrument **cost/spend** wherever LLM/paid calls happen (incl. the dspy/litellm path, not
  just `LiteLLMClient`).
- Keep the `libs/py/observe` and `libs/ts/observe` mirrors in lock-step (both wire
  traces+metrics+logs).

**Why:** SigNoz is the single pane across pipeline + services + CI (roadmap Decision H); an
app that's instrumented only on import contributes nothing to it. Relates to
[[config-single-source]], [[signoz-mcp]], [[astra-migration-research]].
</content>
