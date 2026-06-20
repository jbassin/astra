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

## Current state — UPDATE THIS SECTION (as of commit `a91a72b`, 2026-06-20)

- **Phases 0–3 COMPLETE:** substrate + shared libs + the full pipeline (scribe → linguist →
  akasha-backend → mouthpiece-backend), all wired in `dagster/definitions.py`.
- **strider (0014) COMPLETE — all 7 slices, both toolchains green, NOT yet pushed.** The first `apps/*`
  TS frontend and the canonical **SSR-Compose-behind-Caddy template** for 0011–0013. Commits:
  - `fedd4b8` slice 2 — build-content pipeline + faction/territory data model
  - `152193c` slice 3 — pixi hexmap + PixiHost + ClientOnly
  - `fc9f3ff` slice 4 — MapView + faction routes (the wired SSR hexmap)
  - `48eb0be` slice 5 — editor + layer-writer server (open by design; gated at Caddy)
  - `6e64db8` slice 6 — SSR Compose service + Caddy reverse-proxy (`server.ts`, Dockerfile)
  - `a91a72b` slice 7 — server `observe` + client RUM (`createServerFn` for the config-sourced
    endpoint) + the `config.kdl` `telemetry.rum-endpoint` field (TS+PY schemas) + a uv-workspace fix
    (exclude TS-only `apps/*` members)
  - Contract `thoughts/astra/specs/0014-strider-spec.md`; load-bearing gotchas captured in the spine
    memory `[[astra-migration-research]]` (the 9-point strider list — read it before starting 0011–0013).
- **Acceptance left open:** criterion H (RUM + SSR spans visibly landing in SigNoz) is wired + structurally
  verified but not confirmed end-to-end against a live SigNoz stack + real browser — do that once the
  deploy stack is up. The strider service hasn't had its Docker image built/run (no `docker compose build`
  in this env); `docker compose config` validates and `bun run start` serves a real build locally.

### Next: push strider, then the remaining subsystems

1. **Push** the strider chunk to `origin/main` (reproduce CI lanes locally first — both toolchains green;
   confirm push + one status check, don't watch the GHA run — `[[no-ci-monitoring]]`).
2. **Phase 4 services:** 0009 weal (Rust→TS, roller parity harness first), 0010 orator.
3. **Frontends 0011–0013** (akasha-fe long pole, mouthpiece-fe, vellum-fe) — each **copies strider's SSR
   template**: build-content→generated→loader, `server.ts` SSR entry, the Compose+Caddy deploy, server
   `observe` + client-RUM-via-`createServerFn`, and the uv-exclude for the new `apps/*` dir.
4. **Phase 6** (0015) big-bang cutover, last.

**Frontend gotchas (template — full list in `[[astra-migration-research]]`):** SSR (no `prerender` block);
commit `src/routeTree.gen.ts` (biome-ignored); `vite.config` is ESM and **cannot import `@astra/config`**
(use `createServerFn` for browser-needed config); gothic v4 `--color-*` token rename on lifted CSS; pixi
behind `lazy()`+`<ClientOnly>`; new `apps/*` TS dir must be added to `pyproject.toml` `[tool.uv.workspace]`
`exclude`.

---

*Start by reading the orient docs, then pick up at the "Next" item above.*
