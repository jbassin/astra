# astra-observe — telemetry for Python processes

`astra_observe` installs OpenTelemetry traces, metrics and logs and exports them over
OTLP/HTTP to the SigNoz collector. Every Python process that runs astra code wires it in
its own entry point: the CLIs (`astra-ops`, assay, heartwood, the mouthpiece tools, the
entity seed) and the Dagster code location (`dagster/definitions.py`). The TypeScript twin is
`libs/ts/observe`.

## Public surface

- `with astra_observe.run("astra.<sub>"):` wraps a CLI's `main()` body. It initialises
  telemetry and always flushes and shuts down on the way out: on return, on an exception and
  on SIGTERM, which it turns into `SystemExit(143)` while the body runs.
- `init_telemetry("astra.<sub>")` is for a long-lived process. It is idempotent: a second call
  is a no-op, and a second call with a different name logs a warning.
- `get_tracer`, `get_meter` and `get_logger` return the installed providers' objects (no-ops
  before init). Only loggers under the `astra` namespace export, from INFO up; third-party
  logs stay local.
- `report_ignored(site, exc)` records a deliberately swallowed exception: one
  `astra.errors.ignored{site}` count and a DEBUG record. Use it instead of a bare
  `except: pass`; `site` is a short stable name, never a value.
- `shutdown()` flushes and tears down. `run()` calls it; call it yourself only in a short
  process that used `init_telemetry` directly.
- `astra_observe.testing.capture()` and the pytest fixture `telemetry_capture` (registered by
  the repo-root `conftest.py`) record spans, metrics and logs in memory: `spans()`,
  `span(name)`, `logs()`, `metric_points(name)`, `metric_sum(name, **attrs)`.

## Where telemetry goes

The process decides, never the caller:

- `ASTRA_RUNTIME=container` (set in `dagster/Dockerfile`) exports to
  `telemetry.otlp-endpoint`, the in-cluster collector. Unset means a host process, which exports
  to `telemetry.host-otlp-endpoint` (`localhost:10353`).
- `deployment.environment` is `test` under pytest, `production` in a container or when the
  code runs from the deploy checkout (`$ASTRA_DEPLOY_ROOT`, default `/ruby/data/astra-deploy`),
  else `development`.
- Under pytest `init_telemetry` does nothing, so no test reaches the collector.

## Testing

```sh
uv run pytest libs/py/observe
```

## Traps

- **Importing the library does nothing.** Telemetry starts only in the process that calls
  `run()` or `init_telemetry()`.
- **A tracer or instrument stays bound to the first provider it saw.** Code that fetches its
  tracer or instruments at call time is captured by every `capture()`; a module-scope tracer
  only by the first capture that uses it. An instrument created before `init_telemetry` is a
  permanent no-op.
- **`run()` only installs its SIGTERM handler on the main thread** and only when nothing else
  has claimed SIGTERM.
- **After `shutdown()` telemetry stays off** for the rest of the process: the global providers
  can be installed once.
