# CLAUDE.md

Root guidance for **astra** — the campaign's live stack (a completed 2026 re-architecture of its
now-decommissioned predecessor, faerrin). astra is a **polyglot monorepo**: Python (data + LLM, managed by **uv**) and TypeScript (web servers +
frontends, managed by **pnpm**) — two primary toolchains, plus a third, **deliberately confined** one:
Rust, for the `libs/rust/weal-engine` crate only (0032), compiled to a **committed** wasm artifact
(`libs/ts/weal-engine/gen/`) that the pnpm workspace consumes — cargo is needed only when the engine
changes, and CI lanes are unchanged (no Rust CI lane). Read [`ASTRA.md`](./ASTRA.md) for the
product vision and [`thoughts/astra/plans/`](./thoughts/astra/plans/) for the migration roadmap (`0000`)
and per-subsystem sub-plans. **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** is the practical onboarding guide —
the dev process, exact CI commands, working-style expectations, and the load-bearing gotchas catalog.

## Version control: plain git + conventional commits (NOT jj)

astra uses **plain git** on GitHub — no jujutsu. Commit
messages follow **Conventional Commits** (`type(scope): subject`); CI lints them with commitlint. A
**pre-commit gate** (`.githooks/pre-commit`, auto-installed via the root `package.json` `prepare` script →
`git config core.hooksPath .githooks`) blocks a commit on any **format/lint** issue across both lanes —
**oxlint** (`--type-aware --deny-warnings`, so warnings block too) + **oxfmt** (`--check`) for TS and
**ruff** (check + format) for Python. It's a check-only gate (never modifies files); fix with
`pnpm run format` / `uv run ruff format .`, or bypass in a genuine emergency with `git commit --no-verify`.
**Typecheck + tests stay CI-only** (too slow for every commit); the hook is the fast format/lint subset of
CI.

## Memory + thoughts (project-local — astra owns its own)

Project memory and planning docs live **in this repo**, not in the harness default `~/.claude/…`. The memory index is auto-loaded each session via this import:

@thoughts/shared/memory/MEMORY.md

- **Writing memory:** create/update one-fact-per-file memories under `thoughts/shared/memory/` (harness
  format — frontmatter + body), and add a one-line pointer in `MEMORY.md`. Do **not** write astra memory
  to `~/.claude`.
- `thoughts/` is also the home for the migration **plans + specs** (`thoughts/astra/{plans,specs}`) and
  **research** (`thoughts/shared/research/`). astra is the single canonical home for all of these.

## Development process (per subsystem)

Each subsystem moves through three gates, leaving a paper trail in `thoughts/`:

1. **Scope** — a verified pre-implementation research doc at
   `thoughts/shared/research/<date>-<subsystem>-<NNNN>-thoughts.md`: read the sub-plan + any prior art,
   **verify claims against the actual repo** (resolve real config/secrets, load real ontology, inspect
   real fixtures — don't list "open questions" that are checkable now), and call out decisions to revisit
   before speccing.
2. **Spec** — author the NLSpec with **`octo:spec`** → `thoughts/astra/specs/<NNNN>-<subsystem>-spec.md`,
   built on the scoping doc and the sub-plan's settled decisions.
3. **Implement** — drive the build with **`octo:embrace`** against that spec; wire telemetry from day one,
   reproduce CI lanes locally before pushing, then update the memory (`thoughts/shared/memory/`) with the
   load-bearing gotchas. Build the spec's scope **in full** — don't quietly collapse or defer pieces to fit
   a budget; surface the trade-off and ask (only spec-sanctioned deferrals are OK). And **reuse existing
   astra patterns** — mirror the nearest already-built subsystem rather than reinventing.

**Version control cadence (not "commit only when asked"):** commit each CI-green slice with a Conventional
Commit message as you go, and **push when a chunk/subsystem is done** — after reproducing the CI lanes
locally (don't then watch the GHA run; confirm push + one status check, per the memory). Mirror the git
log's per-slice rhythm; don't accumulate a large uncommitted/unpushed working tree.

## Two toolchains, disjoint workspaces

- **Python (uv):** virtual workspace at the root `pyproject.toml`; members `apps/*`, `libs/py/*`,
  `ontology/*`. Lint+format = **ruff**, type-check = **ty** (Astral; preview, pinned), tests = **pytest**.
  Run `uv sync`, `uv run pytest`, `uv run ruff check`, `uv run ty check`.
- **TypeScript (pnpm):** workspace at `pnpm-workspace.yaml` (`apps/*`, `libs/ts/*`); root `package.json`
  pins the exact version via `packageManager` + corepack. Lint = **oxlint** (`--type-aware
  --deny-warnings`), format = **oxfmt** (`sortImports` on) — deliberately two tools (both VoidZero/oxc,
  biome retired at 0022 S13). Type-check = `tsc --noEmit` against `tsconfig.base.json` (strict), stays
  the gate even under vp (D8). **`vp` (`vite-plus`, exact-pinned root devDependency) orchestrates
  typecheck/test/build** (0022 S15) — `vp run -r <task>` fans a task out across all 21 members with a
  local task-graph cache; lint/format stay **direct** oxlint/oxfmt (vp's `lint`/`fmt` are thin
  pass-throughs with no scoping of their own — the explicit globs are what keeps oxfmt off
  markdown/toml/the SOPS file). Run `pnpm install`, `pnpm exec vp run -r {typecheck,test,build}` /
  `pnpm run lint` / `pnpm run format:check`.
- **Disjoint globs, manifest-decided membership.** Both lanes glob `apps/*`; a directory belongs to
  whichever lane its manifest declares (`pyproject.toml` → uv; `package.json` → pnpm). They never
  cross-claim.
- **uv rejects empty members (gotcha).** A glob-matched *directory* lacking a `pyproject.toml` is a hard
  `uv` error — so **do not pre-create empty placeholder member dirs**; create a member dir only when you
  give it a manifest. Glob roots (`apps/`, `libs/py/`, `ontology/`) are kept in git via a `.gitkeep`
  *file* (a dotfile isn't matched by `*`). pnpm silently ignores manifest-less dirs, so this is uv-only.

## Runtime split (roadmap Decision H) vs CI

Three non-overlapping concerns; **SigNoz/OTel is the single pane across all three**, not one runtime:

- **Pipeline** (craig → scribe → linguist → akasha → mouthpiece) = a **Dagster** asset graph, one
  partition per session/date, scheduled/sensor-triggered, with lineage. *(This supersedes the older
  "windmill" mention in earlier drafts of `ASTRA.md`.)*
- **Long-running services** (Discord bots, overlay SSE, vellum render service, DBs, **the SSR frontends** —
  Decision I) = **Docker Compose** units (`restart: unless-stopped` + healthchecks).
- **Edge** = **Caddy** (TLS + reverse-proxying service APIs **+ the SSR frontend servers**). *(Frontends are
  SSR Compose services now, not prerendered static `dist/` — Decision I, decided on 0014.)*
- **CI** = GitHub Actions (`.github/workflows/ci.yml`) — parallel, path-filtered jobs.

## Standing principles (apply in every subsystem)

1. **Telemetry from day one.** Every app imports `libs/{py,ts}/observe` before anything else; no app
   ships without OTel wired to SigNoz.
2. **KDL at the edges.** Parse KDL → validate into Pydantic/Zod immediately; never thread raw KDL nodes
   through code. Secrets are `ref=` pointers resolved from a **SOPS**-decrypted file at load — no
   plaintext in git.
3. **All LLM calls** go through `libs/py/llm` (litellm + dspy); never call a provider SDK directly.
4. **strider is the frontend template** — every TanStack frontend follows its build-time-content →
   generated-modules → route-loader pattern, and runs **SSR as a Compose service behind Caddy** with
   client RUM (Decision I — not prerendered static `dist/`).
5. **Preserve identity keys.** `player_id` integers are load-bearing FKs; carry them verbatim.

## Layout

```
apps/        # per-subsystem apps (py or ts, manifest-decided); sites build to dist/
libs/py/     # observe, config, llm  (+ _smoke)
libs/ts/     # observe, config, gothic, vellum-lang  (+ _smoke); weal-engine = committed wasm artifact
libs/rust/   # weal-engine — the ONLY Rust in the repo (0032); builds via `just weal-engine-build`
ontology/    # ontology-being, ontology-config (py truth + config stores)
dagster/     # Dagster definitions (loads each pipeline app's assets; schedules/sensors)
deploy/      # docker-compose.yml (Dagster + SigNoz + services), otel-collector.yaml, SOPS
sites.caddyfile  # host-edge config for the shared reverse proxy; `just caddy-reload`
.github/     # CI workflow + composite setup-{uv,pnpm} actions
thoughts/    # research + per-subsystem plans + specs + memory
dist/        # all site-gen output (gitignored), served by Caddy
```

## Pins (set in Phase 0; TS toolchain finalized 0022 S15)

- Python ≥ 3.12; **ty** pinned (`==0.0.51`, preview — bump deliberately).
- Node **24** (`.node-version` + root `engines.node`); pnpm **10.34.4** (root `packageManager` +
  corepack); oxlint **^1.72.0** + oxfmt **^0.57.0** (+ oxlint-tsgolint **^0.24.0** for type-aware
  lint); typescript **5.x**; **vite-plus (`vp`) `0.2.2`** exact-pinned root devDependency — the
  orchestrator for typecheck/test/build (task graph + local caching; `tsc --noEmit` stays the
  actual typecheck gate underneath it, D8).
- Rust **1.96.0** (pinned via `libs/rust/weal-engine/rust-toolchain.toml`) for the weal-engine crate
  ONLY — compiled to the committed `libs/ts/weal-engine/gen/` wasm via `just weal-engine-build`
  (wasm-bindgen-cli **0.2.127** + binaryen wasm-opt **124**, both hard-pinned in the recipe). cargo
  runs only when the engine changes; **no Rust CI lane** — the local gate
  (`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`) is recorded per
  slice, and a vitest wasm smoke guards the committed artifact in CI.
- Reproduce CI locally:
  `uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest` and
  `pnpm exec vp run -r typecheck && pnpm run lint && pnpm run format:check && pnpm exec vp run -r
  test && pnpm exec vp run -r build`.
