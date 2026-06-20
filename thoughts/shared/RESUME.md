# RESUME — pick up astra work here

A living handoff doc. To resume in a fresh session, the prompt can simply be:
**"Read `thoughts/shared/RESUME.md` and continue."**

Keep the **Current state** section below updated as work lands (it's the only part that goes stale —
everything else points at durable docs). Update it when you finish a slice/subsystem.

---

## Orient first (read before doing anything)

1. **`CONTRIBUTING.md`** (root) — the practical guide: dev process, exact CI commands, working-style
   rules, the gotchas catalog. Primary onboarding doc.
2. **`CLAUDE.md`** — authoritative conventions.
3. **`thoughts/astra/plans/0000-astra-migration-roadmap.md`** — phases + the decisions ledger A–I.
   Note **Decision I**: frontends are **SSR Compose services behind Caddy**, not prerendered static.
4. **`thoughts/shared/memory/MEMORY.md`** + its memories — especially the feedback memories
   **`verify-before-acting`** and **`no-silent-scope-cuts`**.

## How to work (hard rules — see the feedback memories)

- **Port faerrin; don't reinvent** — grep `/ruby/data/experiments/faerrin` FIRST for any logic and lift it.
- **Verify before acting** — check the real repo/config/source; don't assume or run on a default.
- **Build the spec's scope in full; never silently collapse/defer** to fit budget — surface the trade-off
  and ask. Only defer what the spec explicitly sanctions.
- **Commit each CI-green slice** (Conventional Commits) and **push on chunk completion**, after
  reproducing CI locally. Don't accumulate uncommitted work; don't watch the GHA run (confirm push + one
  status check).
- **Reproduce CI locally before pushing:**
  ```
  uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest
  bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build
  ```
  (scope to the lane/app you touched).

---

## Current state — UPDATE THIS SECTION (as of commit `fedd4b8`, 2026-06-20)

- **Phases 0–3 COMPLETE:** substrate + shared libs + the full pipeline (scribe → linguist →
  akasha-backend → mouthpiece-backend), all wired in `dagster/definitions.py`.
- **IN PROGRESS — strider (0014):** the first TS app in `apps/` and the canonical **SSR frontend
  template**.
  - **Slice 1 (SSR scaffold) shipped + green** — TanStack Start on vite 6 + React 19, SSR build
    (`dist/server/server.js`), gothic via `@astra/gothic/theme.css`, port 10360.
  - **Slice 2 (build-content + data model) shipped + green** (`fedd4b8`) — the template's build-time
    content pipeline: `scripts/build-content.ts` (gray-matter + remark → `src/generated/`),
    `contentWatchPlugin` (buildStart + dev re-gen), `generate-routes.ts`; the faction/territory/layer/
    skein model (`src/lib/{regions,hexUtils,factions,layers}.ts` + tests); `content/{factions,layers}/*.md`.
    `src/generated/**` gitignored (except `.gitignore`) + biome-ignored. **58 tests pass**; client bundle
    is free of fs/remark/gray-matter (invariant T9). Lift adaptation for astra's stricter base tsconfig
    (`noUncheckedIndexedAccess`/`verbatimModuleSyntax`): `verts()` is a fixed 6-tuple; provably-safe index
    sites use `!` with a per-file biome override on the lib (spec T2). **Not yet pushed.**
  - Contract: `thoughts/astra/specs/0014-strider-spec.md`
  - Verified scoping: `thoughts/shared/research/2026-06-20-strider-0014-thoughts.md`
  - Source to port: `/ruby/data/experiments/faerrin/pkg/strider`

### Next: continue strider, one committed+pushed slice at a time (per the spec)

3. **pixi hexmap** — `components/HexMap` (`pixiScene`/`animationManager`/`skeinGeometry`) + `PixiHost`,
   gated `<ClientOnly>` (no WebGL in SSR). `lib/hexUtils` already lifted in slice 2.
4. **routes + map layer** — `MapView`, `FactionDetail`, the faction routes.
5. **editor + editor-server** — in scope (a Compose service / API surface).
6. **deploy** — a strider Compose service in `deploy/docker-compose.yml` + Caddy reverse-proxy (frontends
   are SSR services now — Decision I; editing docker-compose is authorized).
7. **telemetry** — client RUM + server-side `libs/ts/observe` → SigNoz.

**Frontend gotchas:** SSR (no `prerender` block); commit `src/routeTree.gen.ts` (biome-ignored); `vite.config`
is ESM (`import.meta.dirname`, not `__dirname`).

### After strider

Update the spine memory (`astra-migration-research`) with strider's load-bearing gotchas. Then the
remaining subsystems: **Phase 4** services (0009 weal — Rust→TS with a roller parity harness; 0010 orator)
and the other **frontends** (0011 akasha-fe, 0012 mouthpiece-fe, 0013 vellum-fe) — all now SSR per Decision
I, so they replan as services when speced. **Phase 6** (0015) is the big-bang cutover, last.

---

*Start by reading the orient docs, then pick up at the "Next" item above.*
