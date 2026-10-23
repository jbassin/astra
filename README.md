# astra

The live stack for a Pathfinder 2e campaign: it turns session recordings into transcripts, a
setting wiki and a recap podcast, and runs the campaign's sites and Discord bots. Python (uv) runs
the data and LLM pipeline on Dagster; TypeScript (pnpm) runs the SSR frontends and services on
Docker Compose; Caddy is the edge; OpenTelemetry feeds SigNoz.

- **Vision:** [`ASTRA.md`](./ASTRA.md)
- **Docs:** [`docs/`](./docs/README.md): architecture, development, runbook, now, backlog, ADRs
- **Rules for agents:** [`CLAUDE.md`](./CLAUDE.md)

## Quickstart

```sh
mise trust && mise install   # the host toolchain (mise.toml); then activate mise in your shell
just bootstrap               # both workspaces, the git hooks, the codex guards' Chromium
just ci                      # everything CI runs
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the rest.
