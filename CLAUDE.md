# CLAUDE.md

Root guidance for **astra** — the next-generation rebuild of [faerrin](/ruby/data/experiments/faerrin).
astra is a **polyglot monorepo**: Python (data + LLM, managed by **uv**) and TypeScript (web servers +
frontends, managed by **bun**) — two toolchains, no third language. Read [`ASTRA.md`](./ASTRA.md) for the
product vision and [`thoughts/astra/plans/`](./thoughts/astra/plans/) for the migration roadmap (`0000`)
and per-subsystem sub-plans.

## Version control: plain git + conventional commits (NOT jj)

astra uses **plain git** on GitHub — no jujutsu. (faerrin used jj; astra deliberately does not.) Commit
messages follow **Conventional Commits** (`type(scope): subject`); CI lints them with commitlint. There
are **no local hooks** — format/lint/typecheck/test run in CI (GitHub Actions), not pre-commit.

## Two toolchains, disjoint workspaces

- **Python (uv):** virtual workspace at the root `pyproject.toml`; members `apps/*`, `libs/py/*`,
  `ontology/*`. Lint+format = **ruff**, type-check = **ty** (Astral; preview, pinned), tests = **pytest**.
  Run `uv sync`, `uv run pytest`, `uv run ruff check`, `uv run ty check`.
- **TypeScript (bun):** workspace at the root `package.json`; members `apps/*`, `libs/ts/*`. Lint+format
  = **biome** (one fast tool, chosen over eslint+prettier). Type-check = `tsc --noEmit` against
  `tsconfig.base.json` (strict). Run `bun install`, `bun --filter '*' {typecheck,test,build,lint}`.
- **Disjoint globs, manifest-decided membership.** Both lanes glob `apps/*`; a directory belongs to
  whichever lane its manifest declares (`pyproject.toml` → uv; `package.json` → bun). They never
  cross-claim.
- **uv rejects empty members (gotcha).** A glob-matched *directory* lacking a `pyproject.toml` is a hard
  `uv` error — so **do not pre-create empty placeholder member dirs**; create a member dir only when you
  give it a manifest. Glob roots (`apps/`, `libs/py/`, `ontology/`) are kept in git via a `.gitkeep`
  *file* (a dotfile isn't matched by `*`). bun silently ignores manifest-less dirs, so this is uv-only.

## Runtime split (roadmap Decision H) vs CI

Three non-overlapping concerns; **SigNoz/OTel is the single pane across all three**, not one runtime:

- **Pipeline** (craig → scribe → linguist → akasha → mouthpiece) = a **Dagster** asset graph, one
  partition per session/date, scheduled/sensor-triggered, with lineage. *(This supersedes the older
  "windmill" mention in earlier drafts of `ASTRA.md`.)*
- **Long-running services** (Discord bots, overlay SSE, vellum render service, DBs) = **Docker Compose**
  units (`restart: unless-stopped` + healthchecks).
- **Edge** = **Caddy** (TLS + static `dist/` + reverse-proxying service APIs).
- **CI** = GitHub Actions (`.github/workflows/ci.yml`) — parallel, path-filtered jobs.

## Standing principles (apply in every subsystem)

1. **Telemetry from day one.** Every app imports `libs/{py,ts}/observe` before anything else; no app
   ships without OTel wired to SigNoz.
2. **KDL at the edges.** Parse KDL → validate into Pydantic/Zod immediately; never thread raw KDL nodes
   through code. Secrets are `ref=` pointers resolved from a **SOPS**-decrypted file at load — no
   plaintext in git.
3. **All LLM calls** go through `libs/py/llm` (litellm + dspy); never call a provider SDK directly.
4. **strider is the frontend template** — every TanStack frontend follows its build-time-content →
   generated-modules → route-loader → prerender pattern.
5. **Preserve identity keys.** `player_id` integers are load-bearing FKs; carry them verbatim.

## Layout

```
apps/        # per-subsystem apps (py or ts, manifest-decided); sites build to dist/
libs/py/     # observe, config, llm  (+ _smoke)
libs/ts/     # observe, config, gothic, vellum-lang  (+ _smoke)
ontology/    # ontology-being, ontology-config (py truth + config stores)
dagster/     # Dagster definitions (loads each pipeline app's assets; schedules/sensors)
deploy/      # docker-compose.yml, otel-collector.yaml, SOPS, Caddyfile.example
.github/     # CI workflow + composite setup-{uv,bun} actions
thoughts/    # research + per-subsystem plans (carried from faerrin)
dist/        # all site-gen output (gitignored), served by Caddy
```

## Pins (set in Phase 0)

- Python ≥ 3.12; **ty** pinned (`==0.0.51`, preview — bump deliberately).
- bun **1.3.14**; biome **2.x**; typescript **5.x**.
- Reproduce CI locally:
  `uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest` and
  `bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build`.
