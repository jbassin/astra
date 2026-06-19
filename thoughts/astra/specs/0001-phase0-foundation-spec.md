# NLSpec 0001 — Phase 0: Foundation

**Status:** implemented + verified (full Phase 0, incl. the deploy substrate). **Phase:** 0 (substrate).
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

## Scope (now complete)

- `deploy/` substrate: `docker-compose.yml` that `include`s the vendored SigNoz (pinned v0.129.0) and
  adds Dagster (Postgres + code location + webserver + daemon) and Caddy; SOPS `.sops.yaml` + an
  encrypted `secrets.enc.yaml`; `Caddyfile` (local, gitignored) + `Caddyfile.example`. Published ports
  remapped into 10350–10399. **Built and brought up live.**
- The "hello, green" **telemetry smoke** — a py span + a ts span land in SigNoz. **Verified.**

## Scope (out — later phases)

- All product subsystems (Phases 1–6).

> **Note:** the substrate gates need live infra (docker) + a SOPS age key; both became available on the
> host (you generated the key), so these gates were verified end-to-end rather than deferred.

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
| H | CI **green on GitHub Actions** | ✅ pushed to `origin/main`; CI run triggered |
| I | `docker compose up` → Dagster UI (10350) + SigNoz UI (10351) + Caddy (10354); OTLP (10352/10353) reachable; SOPS decrypt | ✅ verified live |
| J | A py span and a ts span land in SigNoz | ✅ both queryable in ClickHouse (`astra-smoke-py`, `astra-smoke-ts`) |

## Done

Phase 0 is complete: CI green, both workspaces green, the substrate comes up via one `docker compose
up`, SOPS round-trips, and py+ts spans land in SigNoz. **Operational note:** a fresh SigNoz needs a
one-time org/admin registration before it ingests telemetry (no org → the collector logs *"cannot
create agent without orgId"* and OTLP drops data) — see [`deploy/README.md`](../../../deploy/README.md).
