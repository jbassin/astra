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

**Phase 0 (Foundation): complete.** Dual workspaces + CI + conventions are green; the `deploy/`
substrate (Dagster + SigNoz + Caddy) comes up via one `docker compose up`, SOPS decrypts, and py+ts
spans land in SigNoz. Bring it up with [`deploy/README.md`](./deploy/README.md). Next: Phase 1
(ontology + shared libs) — see [`thoughts/astra/plans/`](./thoughts/astra/plans/).
