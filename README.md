# astra

The next generation of [faerrin](/ruby/data/experiments/faerrin): a polyglot monorepo for a Pathfinder 2e
campaign. **Python (uv)** runs the data + LLM pipeline; **TypeScript (bun)** runs the web servers and
frontends. Pipeline orchestration is **Dagster**, long-running services run on **Docker Compose**, the
edge is **Caddy**, and observability is **OTel → SigNoz**.

- **Vision:** [`ASTRA.md`](./ASTRA.md)
- **Migration roadmap + sub-plans:** [`thoughts/archive/plans/`](./thoughts/archive/plans/)
- **Conventions:** plain git + Conventional Commits; CI is GitHub Actions. See [`CLAUDE.md`](./CLAUDE.md).

## Quickstart

```sh
mise trust && mise install   # the host toolchain (mise.toml); then activate mise in your shell
just bootstrap               # both workspaces, the git hooks, the codex guards' Chromium
just ci                      # everything CI runs
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the rest (`just check`, `just fix`, `just test`,
`just dev <app>`).

## Status

**Phase 0 (Foundation): complete.** Dual workspaces + CI + conventions are green; the `deploy/`
substrate (Dagster + SigNoz + Caddy) comes up via one `docker compose up`, SOPS decrypts, and py+ts
spans land in SigNoz. Bring it up with [`deploy/README.md`](./deploy/README.md). Next: Phase 1
(ontology + shared libs) — see [`thoughts/archive/plans/`](./thoughts/archive/plans/).
