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

## Current state — UPDATE THIS SECTION (as of commit `6474eb2`, 2026-06-20)

- **Phases 0–3 COMPLETE:** substrate + shared libs + the full pipeline (scribe → linguist →
  akasha-backend → mouthpiece-backend), all wired in `dagster/definitions.py`.
- **0010 orator IN PROGRESS (Phase 4) — slices 1–6 DONE + PUSHED** (`98b5618`…`6474eb2`). Scope+spec at
  `thoughts/{shared/research/2026-06-20-orator-0010-thoughts.md, astra/specs/0010-orator-spec.md}`; decisions
  **M1–M5** locked. Lifting faerrin `lark` → **orator-backend** (Bun Compose service) + merging `birdfeed` →
  **orator-controller** (Node/Elgato). Done: (1) **scaffold** both apps + M1 ontology-derived allowlist; (2)
  **Postgres library store** — lark's 9-table schema SQLite→PG + the async `LibraryStore`/`PostgresStore`
  (sync `bun:sqlite`→async Bun `SQL`) + `orator-postgres` Compose unit (10364); (3) **bot+voice+REST** —
  `@discordjs/voice` adapter + the single-session playback engine + the `/api/v1/*` router/library/playback
  routes; (4) **auth** — OAuth2-identify→signed cookie OR Bearer key, session-gated key mgmt, `lark_`→`orator_`
  rebrands; (5) **ingest** — yt-dlp+ffmpeg+R128 + SSE jobs + upload; (6) **data migrator** — lark.sqlite→PG
  (preserve ids) + audio copy (M2, runs at deploy). **Remaining: 7 operator UI (TanStack *Router* client SPA
  served by orator-backend — M3, the biggest), 8 orator-controller (birdfeed lift), 9 deploy (Dockerfile w/
  ffmpeg+yt-dlp+davey, Compose `orator-backend`@10363, Caddy `orator.iridi.cc`, then RUN the migrator).**
  **Deferred (spec-sanctioned):** live Discord run (SOPS token) + the physical Stream Deck hardware test. CI
  green both toolchains each slice (113 backend tests). See `[[orator-0010-gotchas]]`.
- **0009 weal BUILT (Phase 4) — first bun *service*.** Scope+spec at `thoughts/{shared/research/
  2026-06-20-weal-0009-thoughts.md, astra/specs/0009-weal-spec.md}`. Six CI-green slices (`c40a026`…
  `21d1f18`; last `21d1f18` deploy-wiring is the only UNPUSHED commit): (1) **roller** hand-ported
  faithfully + the **K1 parity harness** (parse/eval-given-faces/plot/property + a serde-codec
  round-trip on the 10 real `mouth.db` `funcs` payloads — the gate); (2) **hosts** — GSR/Rex/Els/
  Whiskers flavor banks lifted into `ontology-being` `weal-host` `lines{}` (py+ts model+reader,
  canonical-JSON parity holds); GSR-only but host-swappable (K8); (3) **Postgres** store + `save_die`
  guards + dedicated `weal-postgres` Compose unit (K9); (4) **discord.js gateway** — full message
  pipeline tested dry via injected deps (acceptance D), I/O shell (gateway/speak/index) typechecked;
  (5) **weal-overlay** — eerie lifted (Bun.serve SPA+SSE, K7), v1-only schema, gothic v4 re-consume,
  client RUM; (6) **deploy** — both Dockerfiles + Compose units + overlay Caddy block (`flush_interval
  -1`). **Deferred (spec-sanctioned):** the live Discord run (acceptance I — needs the SOPS token) +
  the Phase-6 SQLite→PG data migration + webhook rotation. See `[[weal-0009-gotchas]]`.
- **strider (0014) COMPLETE + PUSHED + DEPLOYED LIVE.** The first `apps/*` TS frontend and the canonical
  **SSR-Compose-behind-Caddy template** for 0011–0013. All on `origin/main`. The 7 build slices (`fedd4b8`
  …`a91a72b`): build-content+data-model, pixi hexmap, MapView+routes, editor, SSR Compose deploy
  (`server.ts`/Dockerfile), server `observe`+client RUM. Then this session hardened + shipped it:
  - **Styling fix** (`abbf017`) — the scaffold never wired `@tailwindcss/vite`, so gothic's `@theme`/`@apply`
    shipped raw (black text, no panel bg); add the plugin + the missing `public/` assets.
  - **RUM lib** (`171f28d`) — browser RUM extracted to **`@astra/observe/web`** (`initRum`); frontends import
    it, the `createServerFn` config seam stays per-app.
  - **Host edge** (`e6b3878`, `9374fb4`, `a9a0bf4`, `6a0fdaf`, `15aab1a`) — root **`sites.caddyfile`** is the
    real prod edge (the compose Caddy was dropped): `strider.iridi.cc` (SSR), `otel.iridi.cc` (browser-RUM
    OTLP ingest, CORS for `*.iridi.cc`), `signoz.iridi.cc` (UI). Fonts served from gothic via Caddy (no
    vendored copies; dev middleware for parity). `/editor` + `signoz` gated **local-only**. CF token from
    SOPS via `just caddy-reload`.
  - **Editor → server fn** (`9b87a1b`) — the editor write is now a **`createServerFn`** in the one SSR
    process (the sidecar/`editor-server` is gone). This stack (react-start 1.168) has **no file server
    routes** — `createServerFn` is the server primitive (see `[[tanstack-start-skill]]`).
- **Tooling:** `just up` (rebuild+recreate the stack), `just down`, `just caddy-reload`/`caddy-validate`.
  Apply deploy/edge changes with these — `[[deploy-apply-with-just]]`.
- **Live + verified:** `astra-strider` healthy; the edge serves `/`, `/editor` (local), `/fonts/*`,
  `signoz.iridi.cc` (all 200 via the loopback edge test). **Open:** `otel.iridi.cc` needs a **DNS record**
  before browser RUM spans actually land in SigNoz (cert + reachability); the write server fn isn't itself
  IP-gated (only the `/editor` UI is).

### Next: the remaining subsystems (strider + weal are done)

1. **Phase 4 services:** 0010 orator **IN PROGRESS — resume at slice 7** (operator UI: a TanStack **Router**
   client SPA — `@tanstack/react-router` + gothic + `@astra/observe/web` RUM, built by Vite to a static
   `dist/` served by orator-backend's `serveStatic`; **not** react-start/SSR, see M3). Then slice 8
   (orator-controller birdfeed lift) + slice 9 (deploy + run the migrator). See `[[orator-0010-gotchas]]`.
   (0009 weal is BUILT; 0010 slices 1–6 done — see Current state.)
2. **Frontends 0011–0013** (akasha-fe long pole, mouthpiece-fe, vellum-fe) — each **copies strider's SSR
   template** (build-content→generated→loader, `server.ts`, the Compose+Caddy deploy, server `observe` +
   `@astra/observe/web` RUM via a `createServerFn` endpoint, the uv-exclude). akasha-fe still consumes the
   akasha build-time snapshot (Decision D).
3. **Phase 6** (0015) big-bang cutover, last.

**Frontend gotchas (template — full list in `[[astra-migration-research]]`):** SSR (no `prerender` block);
commit `src/routeTree.gen.ts` (biome-ignored); `vite.config` is ESM and **cannot import `@astra/config`**;
**wire `@tailwindcss/vite`** + ship `public/` (favicon, symbols) or gothic styling is dead; gothic v4
`--color-*` token rename on lifted CSS + Caddy `gothic_fonts` serves the webfonts; pixi behind
`lazy()`+`<ClientOnly>`; server-side endpoints = **`createServerFn`** (no middleware — `[[tanstack-start-skill]]`);
client RUM = `@astra/observe/web`; new `apps/*` TS dir → add to `pyproject.toml` `[tool.uv.workspace]` `exclude`.

---

*Start by reading the orient docs, then pick up at the "Next" item above.*
