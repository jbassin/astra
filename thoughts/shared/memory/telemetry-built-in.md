---
name: telemetry-built-in
description: every app wires traces, metrics and logs to SigNoz in the process that actually runs it; importing observe is not enough; TS metrics use lazyCounter
metadata:
  type: feedback
---

Telemetry (traces, metrics, logs to SigNoz) is built into every app, service and Dagster asset from
the start.

- Wire it in the process that runs the code: a Python CLI's `main()` uses
  `with astra_observe.run("astra.<sub>"):`, `dagster/definitions.py` calls `init_telemetry`, a TS
  service calls `initTelemetry(...)`. Until then every span is a no-op.
- TS metrics use `lazyCounter`/`lazyHistogram` from `@astra/observe`, never a module-scope
  `getMeter().createCounter()`, which stays a no-op forever.
- Python never passes an endpoint: `ASTRA_RUNTIME=container` picks the in-cluster collector.
- Tests assert on telemetry with the `telemetry_capture` fixture, never a hand-built provider.
- Meter cost wherever a paid call happens.

**Why:** an app instrumented only at import time sent nothing for weeks, twice, and nobody noticed
because spans from other paths kept flowing.

**How to apply:** after wiring, prove all three signals in SigNoz with the `signoz_*` tools
([[signoz-mcp]]). Details: [`docs/development.md`](../../../docs/development.md).
