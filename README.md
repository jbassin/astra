# astra

The next generation of [faerrin](/ruby/data/experiments/faerrin): a polyglot monorepo for a Pathfinder 2e
campaign. **Python (uv)** runs the data + LLM pipeline; **TypeScript (bun)** runs the web servers and
frontends. Pipeline orchestration is **Dagster**, long-running services run on **Docker Compose**, the
edge is **Caddy**, and observability is **OTel → SigNoz**.

- **Vision:** [`ASTRA.md`](./ASTRA.md)
- **Migration roadmap + sub-plans:** [`thoughts/astra/plans/`](./thoughts/astra/plans/)
- **Conventions:** plain git + Conventional Commits; CI is GitHub Actions. See [`CLAUDE.md`](./CLAUDE.md).

## Quickstart

```sh
uv sync                  # resolve the Python (uv) workspace
bun install              # resolve the TypeScript (bun) workspace
uv run pytest            # Python tests
bun --filter '*' test    # TypeScript tests
```

## Status

Phase 0 (Foundation): dual workspaces, CI, and conventions are in place and green. The `deploy/`
substrate (Dagster + SigNoz + Caddy via Docker Compose) and the telemetry smoke are the next gate —
see [`thoughts/astra/plans/0001-phase0-foundation.md`](./thoughts/astra/plans/0001-phase0-foundation.md).
