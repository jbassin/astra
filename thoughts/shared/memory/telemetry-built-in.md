---
name: telemetry-built-in
description: every app wires traces, metrics and logs to SigNoz in the process that actually runs it; importing observe is not enough; TS metrics use lazyCounter
metadata:
  type: feedback
---

Telemetry (traces, metrics, logs to SigNoz) is built into every app, service and Dagster asset from
the start.

- Call `init_telemetry("astra.<sub>")` / `initTelemetry(...)` in the process that runs the code:
  the service entrypoint, `dagster/definitions.py`, a CLI's `main()`. Until then every span is a
  no-op.
- TS metrics use `lazyCounter`/`lazyHistogram` from `@astra/observe`, never a module-scope
  `getMeter().createCounter()`, which stays a no-op forever.
- Short-lived processes call `shutdown()` before exit.
- Meter cost wherever a paid call happens.

**Why:** an app instrumented only at import time sent nothing for weeks, twice, and nobody noticed
because spans from other paths kept flowing.

**How to apply:** after wiring, prove all three signals in SigNoz with the `signoz_*` tools
([[signoz-mcp]]). Details: [`docs/development.md`](../../../docs/development.md).
