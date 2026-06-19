# NLSpec 0001 — Phase 0: Foundation

**Status:** implemented (this run, up to the infra gate). **Phase:** 0 (substrate).
**Source plan:** [`../plans/0001-phase0-foundation.md`](../plans/0001-phase0-foundation.md).
**Process:** octo:embrace, Claude team mode (persona subagents), per faerrin/astra `CLAUDE.md`.

## Goal

Turn the empty astra repo into an **empty-but-green** polyglot monorepo — dual uv/bun workspaces, CI,
and conventions — so every later subsystem drops into a working frame. No product code.

## Scope (in)

- Repo skeleton + meta files (`.gitignore`, `.editorconfig`, `README.md`, `CLAUDE.md`).
- Python (uv) virtual workspace root + `ruff`/`ty`/`pytest` config + a `libs/py/_smoke` member.
- TypeScript (bun) workspace root + `tsconfig.base.json` (strict) + `biome.json` + a `libs/ts/_smoke`
  member.
- GitHub Actions CI (`.github/workflows/ci.yml`) — parallel, path-filtered jobs + composite
  `setup-{uv,bun}` actions.
- Conventional-commit linting (`commitlint.config.js` + a CI lane).
- The planning corpus carried into `thoughts/` (research §4 requirement).

## Scope (out — deferred to the infra gate / later phases)

- `deploy/` substrate: `docker-compose.yml` (Dagster + Postgres + SigNoz + ClickHouse + Caddy +
  otel-collector), `otel-collector.yaml`, SOPS config, `Caddyfile.example`.
- The "hello, green" **telemetry smoke** (a py span + a ts span landing in SigNoz).
- All product subsystems (Phases 1–6).

> **Why deferred:** these gates require infrastructure/secrets that cannot be validated from the
> implementation environment (`docker compose up` standing up the SigNoz/Dagster stack; SOPS keys).
> Per the run's agreed policy, we **stop at the first unverifiable gate** rather than ship infra we
> cannot prove green.

## Locked technical decisions (recorded in `CLAUDE.md`)

- **ruff** (lint + format) + **ty** (type check; preview, pinned `==0.0.51`) — the Astral Python stack.
- **biome** over eslint+prettier (one fast tool for the TS lane).
- bun pinned **1.3.14**; Python **≥ 3.12**.
- **Membership is manifest-decided**; both lanes glob `apps/*` but never cross-claim. uv errors on a
  glob-matched directory lacking `pyproject.toml`, so empty placeholder member dirs are **not**
  pre-created — glob roots are tracked with a `.gitkeep` file instead.
- Plain **git** + **Conventional Commits** (no jj in astra).

## Acceptance criteria

| # | Criterion | How verified (this env) |
|---|---|---|
| A | `uv sync` + `uv run pytest` green; single root `uv.lock` | ✅ ran locally |
| B | `uv run ruff check` + `ruff format --check` + `ty check` clean | ✅ ran locally |
| C | `bun install` + `bun --filter '*' {typecheck,test,build}` green; single `bun.lock` | ✅ ran locally |
| D | `bunx biome ci .` clean | ✅ ran locally |
| E | Disjoint membership — uv sees only `astra-smoke`, bun only `@astra/smoke`; no `node_modules` in py dirs | ✅ verified |
| F | commitlint **rejects** a non-conventional message, **accepts** `type(scope): subject` | ✅ verified |
| G | CI workflow + composite actions are well-formed YAML; each job's command reproduced green locally | ✅ verified |
| H | CI **green on GitHub Actions** | ⏳ needs a GitHub remote + push (not done here) |
| I | `docker compose up` → Dagster UI + SigNoz UI + Caddy; OTLP :4318 reachable; SOPS decrypt | ⏳ **infra gate — deferred** |
| J | A py span and a ts span land in SigNoz | ⏳ **infra gate — deferred** |

## Handoff

Remaining for Phase 0 completion: build `deploy/` (Decision H substrate) + the telemetry smoke (I/J),
then push to a GitHub remote to confirm CI green (H). Docker is available on the host, so the gate is
runnable when secrets (SOPS age key) are provisioned.
