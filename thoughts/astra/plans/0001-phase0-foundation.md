# Astra Sub-plan 0001 — Phase 0: Foundation

**Status:** Plan (pre-implementation). **Phase:** 0 (substrate). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-18. **Target:** `/ruby/data/experiments/astra` (fresh git repo, currently only `ASTRA.md`).

> Goal: turn the empty astra repo into an **empty-but-green** polyglot monorepo — dual workspaces, CI,
> deploy substrate, and conventions — so every later subsystem drops into a working frame. No product
> code. Exit when CI is green on an empty repo and `docker compose up` brings the runtime substrate up.

This sub-plan is the **template** for the others: numbered steps, each with concrete artifacts and a
verification. Reproduce its rigor in 0002+.

---

## Prerequisites & pins

- Tooling: `uv` (Python ≥3.12), `bun` (pin a version, e.g. `1.3.x`), Docker + compose, `git`, `gh`.
- VCS: plain **git** + **conventional commits** (no jj in astra). Branch from `main`; PRs via `gh`.
- Decisions in force: two toolchains only (no Rust), Postgres, Dagster (pipeline) + Compose (services) + SigNoz substrate now, SOPS for secrets.

## Steps

### 1. Repo skeleton + meta files
Create the directory tree from roadmap §4 (empty dirs carry a `.gitkeep`). Add:
- `.gitignore` — at minimum: `dist/`, `Caddyfile`, SOPS age key, `node_modules/`, `.venv/`,
  `__pycache__/`, `*.pyc`, `.env`, `target/` (defensive), `.DS_Store`.
- `README.md` — one-paragraph overview + pointer to `ASTRA.md` and `thoughts/astra/plans/`.
- `CLAUDE.md` — astra's own root guidance: polyglot layout, runtime split (Dagster=pipeline /
  Compose=services / Caddy=edge) vs CI, OTel-from-day-1,
  KDL-at-edges, "strider is the frontend template", plain-git+conventional-commits. (Port the *spirit*
  of faerrin's CLAUDE.md, not its jj/Bun-only specifics.)
**Verify:** `git status` clean after an initial commit; tree matches §4.

### 2. Python (uv) workspace root
- Root `pyproject.toml` as a **virtual** workspace (no `[project]`): `[tool.uv.workspace] members =
  ["apps/*", "libs/py/*", "ontology/*"]`. Add `[tool.uv]` dev-deps: `ruff`, `ty`, `pytest`.
- `ruff.toml` (shared lint + format) + `ty` type-checker config in root `pyproject.toml` (`[tool.ty]`;
  **pin the version — `ty` is preview**) at root. (ruff + ty = the Astral Python toolchain.)
- One smoke lib `libs/py/_smoke/` with `pyproject.toml` (`name="astra-smoke"`), a trivial function, and
  a passing `test_smoke.py`.
**Verify:** `uv sync` resolves; `uv run pytest` green; `uvx ruff check` + `uv run ty check` clean; single `uv.lock` at root.

### 3. TypeScript (bun) workspace root
- Root `package.json`: `"workspaces": ["apps/*", "libs/ts/*"]`, `"private": true`, scripts that fan out
  (`bun --filter '*' typecheck|test|build|lint`).
- `tsconfig.base.json` (strict) + `biome.json` (lint+format; chosen over eslint+prettier for one fast
  tool — record this in CLAUDE.md).
- One smoke lib `libs/ts/_smoke/` with `package.json`, a trivial export, a `*.test.ts`, and a `tsconfig`.
**Verify:** `bun install` (single `bun.lock`); `bun --filter '*' typecheck && bun --filter '*' test`
green; `bunx biome check` clean. Confirm the bun glob does **not** pick up py dirs and vice-versa.

### 4. CI — `.github/workflows/ci.yml`
Parallel jobs, path-filtered so each lane only runs on relevant changes:
- Composite actions `.github/actions/setup-uv` (pins uv, restores cache) and `.github/actions/setup-bun`
  (pins bun `1.3.x`, restores `~/.bun` + node_modules cache).
- Jobs: `paths` (dorny/paths-filter → outputs `py`/`ts`), then `py-lint` (`uvx ruff check`),
  `py-typecheck` (`uv run ty check`), `py-test` (`uv run pytest`), `ts-typecheck`, `ts-lint`
  (`biome ci`), `ts-test` (`bun test`), `ts-build`
  (`bun --filter '*' build` — no-op until apps exist), each `if: needs.paths.outputs.<lane>=='true'`.
- `commitlint` job runs on PRs (step 5).
**Verify:** push a branch; all triggered jobs green on the empty repo.

### 5. Conventional commits
- `commitlint.config.js` (`@commitlint/config-conventional`).
- CI `commitlint` job validating PR commit messages (no local hooks — astra has none, like faerrin).
**Verify:** a `bad message` commit fails the job; `feat(scope): x` passes.

### 6. Deploy substrate — `deploy/`
- `deploy/docker-compose.yml`:
  - **Dagster** (the pipeline runtime, Decision H): `dagster_db` (Postgres), `dagster-webserver` (UI),
    `dagster-daemon` (schedules/sensors/run-queue), `dagster-code` (the code-location container loading
    `dagster/` definitions). App-service containers (weal-bot, orator-backend, vellum-render) are added
    in Phases 4–5 — Phase 0 just establishes the compose file + Dagster.
  - **SigNoz**: `clickhouse`, `signoz` (query/UI), `signoz-otel-collector` (OTLP :4317/:4318).
  - **otel-collector** (contrib agent) for host/container metrics + logs (or fold into SigNoz collector).
  - **caddy**: reverse proxy / TLS / static edge; mount `../Caddyfile`.
- `deploy/otel-collector.yaml`: OTLP receivers → SigNoz exporter; hostmetrics + filelog receivers.
- `deploy/sops/` — SOPS config (`.sops.yaml` age recipients); a decrypt-at-deploy entrypoint shim.
- `Caddyfile.example` (committed) — documents the host blocks; real `Caddyfile` is gitignored (embeds
  the Cloudflare DNS token, per faerrin's gotcha).
**Verify:** `docker compose -f deploy/docker-compose.yml up -d` → Dagster UI reachable (`:3000`),
SigNoz UI reachable (`:3301`), `curl` to OTLP `:4318/v1/traces` returns non-connection-refused.

### 7. "Hello, green" telemetry smoke (proves the loop)
- Make `libs/py/_smoke` emit one OTel span to the collector (manual SDK, pre-shim) and
  `libs/ts/_smoke` likewise via `--preload`.
**Verify:** both spans appear in SigNoz. (This de-risks Phase 1's `libs/{py,ts}/observe`.)

## Exit criteria (Phase 0 done)

- [ ] CI green on the empty repo (all lanes); conventional-commit lint enforced.
- [ ] `uv sync`+`uv run pytest` and `bun install`+`bun --filter '*' test` both green; two lockfiles, no
      cross-claiming between workspaces.
- [ ] `docker compose up` → Dagster UI + SigNoz UI + Caddy up; OTLP :4318 reachable; SOPS decrypt works.
- [ ] A py span and a ts span land in SigNoz.
- [ ] `Caddyfile` gitignored; `Caddyfile.example` committed; `dist/` gitignored.

## Unblocks

Phase 1 (0002): ontology-config/being + `libs/{py,ts}/observe` + `libs/py/llm` + `libs/{py,ts}/config`
now have a workspace, CI, a Dagster runtime + SOPS secret store, and a telemetry sink to wire into.

## Open choices resolved here (record in CLAUDE.md)

- **ruff** (lint + format) + **ty** (type check) — the Astral Python toolchain; `ty` is preview, so pin it.
- **biome** over eslint+prettier (one fast tool for the ts lane).
- bun pin = `1.3.x`; Python = `≥3.12`.
- SigNoz collector doubles as the app OTLP endpoint (no separate gateway in v1).
