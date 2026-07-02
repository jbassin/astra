---
name: viteplus-cutover-0022
description: "PROJECT 2026-07-02: full cutover of the TS lane to Vite+ / VoidZero — S1–S8 BUILT + PUSHED (R1 vite-8 ✓, R2 vitest ✓, R3 through S8: all 7 SSR frontends + weal-bot/overlay + orator-backend on Node 24); ▶ NEXT: S9 vellum-render, S10 cleanup, then R4 pnpm. DEPLOYS PARKED (permission-gated) — live stack still on bun-era images"
metadata:
  type: project
---

**Vite+ cutover (0022)** — stakeholders want the whole TS lane on Vite+ (VoidZero `vp`, beta v0.2.2,
**fully MIT/free** since the March-2026 reversal; Cloudflare acquired VoidZero 2026-06-04).
Scoping doc + Phase-0 addendum + revised R1–R7 roadmap:
`thoughts/shared/research/2026-07-02-viteplus-migration-0022-thoughts.md`. **SPEC'D 2026-07-02:
`thoughts/astra/specs/0022-viteplus-cutover-spec.md` — 14 decisions (D1–D14), 15 slices S1–S15 up
the R-ladder (R1 vite-8 lockstep → R2 bun:test→vitest → R3 runtime exit → R4 pnpm → R5
oxlint+oxfmt → R6 vp+tsdown; R7 = TS7 at GA, independent), verified-footprint table (corrects the
scope doc: 7 Start apps not 8, 50 bun:test files not 48, 5-of-7 globalSetup) + an adversarial pass
(4 blockers folded in: the S9/S11 VR-CI sequencing, the `snapshot.py:76` bare-`bun` subprocess, the
srvx API deltas on the 4 hand-rolled servers, the stale CI path-filter globs). Late stakeholder
decisions: oxfmt `sortImports` KEEPS import sorting (the audit's 'lost' claim was WRONG — stakeholder
caught it); tsdown included (S14); gates unified strict (`--deny-warnings` in CI too); **vp-in-CI is
a HARD requirement for R6**.

**RESOLVED stakeholder decisions (2026-07-02):** (1) FULL cutover — explicitly OK to migrate off
the bun runtime; (2) package manager → **pnpm** (bun exits entirely); (3) lint/format → **full
switch to oxlint+oxfmt**, biome retires.

**THE Phase-0 spike findings (all load-bearing for implementation):**
- **Vite 8 canary PASSED on strider** — upstream TanStack/router#7614 did NOT reproduce (dev SSR +
  build + serve all correct; build 3.3x faster). Hard requirements: `@vitejs/plugin-react` ^5.2
  (4.x peer-caps at vite 7), **lockstep bump of every vite-using member in ONE slice** (a partial
  bump creates a silent duplicate-vite install — bun won't warn — which is exactly #7614's trigger),
  `--configLoader runner` survives on vite 8, no tailwind `optimize:false` needed (@tailwindcss/vite
  4.3.2). **vitest 3 green is a FALSE vite-8 signal** (its vite-node dep privately installs vite 6;
  need vitest ^4.1); `ssrSmoke.test.ts` is the trustworthy smoke. Also: react-start 1.168.26
  declares `vite >=7` peers — our vite 6 baseline is already out-of-range, bun tolerates silently.
- **Runtime exit is shallow (~2–3 days)**: Node 24 LTS runs `.ts` directly (type stripping stable
  ≥24.12; grep for enums in directly-run files first); `Bun.serve`→`srvx.serve({fetch})` (TanStack
  Start's own Node output uses srvx via Nitro); **THE one behavioral risk = Range/206 static-mount
  serving** (Bun.file gave it free; use `send` on Node) — prove on the real ~14GB mouthpiece/akasha
  audio mounts before fanning out. Bun SQL→postgres.js is ~1:1 (`sql.unsafe`, tagged templates,
  `begin()`; the `IN (…)` array workaround becomes deletable); the two bun:sqlite migrate.ts are
  dead one-shots → delete; 48 bun:test files = mechanical codemod (near-zero mock/spyOn). Node
  REMOVES risk: @discordjs/voice NAPI (oven-sh/bun#11313) + Playwright are Node-first. Pilot
  ladder: site-kit ssrServer → weal-bot → ledger → mouthpiece/akasha (Range proof) → rest →
  orator-backend (voice smoke) → vellum-render. Docker: node:24-slim ×11 Dockerfiles.
- **oxc audit (oxfmt 0.57.0 / oxlint 1.72.0 / tsgolint 0.24.0):** type-aware lint WORKS on our
  tsconfig tree (0.6s repo-wide, found real no-floating-promises bugs in weal-overlay/orator-
  controller/weal-bot/backdrop) **but tsgolint rejects `baseUrl`** (tsgolint#351) → the 7
  strider-template frontends need baseUrl-less relative `paths` first (do in R1). **⚠️ oxfmt
  scope-creep footgun: a bare repo-root run reformats 111 markdown + pyproject.toml (ruff's lane!)
  + package.json key-reorder + the SOPS `secrets.enc.yaml`** — ALWAYS glob-scope to JS/TS/JSON/CSS
  (config has ignorePatterns only, no language allowlist). Disable `react/react-in-jsx-scope`
  (1,355 FPs on automatic JSX); oxlint's `style` category ≈ ESLint-strict, NOT biome style (17k
  diagnostics); tuned config leaves 252 residual disagreements to triage; ~~import auto-sort is
  LOST~~ **CORRECTED at spec time: oxfmt has a stable fix-capable `sortImports` (perfectionist-based,
  opt-in) — the convention survives (spec D4)**. 11/13 biome overrides map 1:1 (table in the doc);
  `bunx biome` outside the repo hits a namesquatted `biome` package.
- `vp` facts: `vp migrate` requires already-Vite-8 + Vitest 4.1; `vp env` is Node-only (never bun);
  `vp check`'s tsgolint is lint-grade — **`tsc --noEmit` stays the typecheck gate**; TS 7 still RC
  (7.0.1-rc; latest 6.0.3) — R7 when GA.

**IMPLEMENTATION (2026-07-02 session, orchestrated w/ sonnet agents): S1–S8 BUILT, CI-green, PUSHED
(`09bfc42` S1 · `c04aaca` S2 · `cbdd568` S3 · `df853b4` S4 · `e9581bd` S5 · `e648ad2` S6 · `c6adf06` S7
· `70c6ee1` S8). ⚠ DEPLOYS PARKED session-wide** — the permission classifier denies `just up` (production
stack); all code landed in git while the live stack keeps running bun-era images. **One deploy window
needed** (`just up` full rebuild), then the parked live verifications: per-frontend visual spot-check
(pixi pages in a real WebGL browser), Range/206 + player-seek through the public edge on
mouthpiece/akasha, weal-bot Discord roll round-trip + history read, orator voice-join + 87-track read,
vellum-render `/render` PNG through the edge, SigNoz three-signals spot-check (criterion M).

**THE S1–S8 load-bearing gotchas:**
- **Storybook 8.6 transitively PINS `vite@6.4.3`** (`@storybook/builder-vite` + the docgen plugin) →
  duplicate-vite = the #7614 trigger; the D14 "verify" escalated to a REQUIRED bump — storybook ^10
  declares vite as a peer, collapsing the lockfile to one vite. Zero config changes needed.
- **`@vitejs/plugin-react` stays ^5.2** — 6.x adds `@rolldown/plugin-babel` + react-compiler peers; don't.
- **Node can't walk the workspace's TS imports natively** → `libs/ts/site-kit/src/nodeTsResolve.mjs`
  (`node --import` resolve hook), now load-bearing for EVERY node execution of workspace TS (all start
  scripts, CMDs, compose commands). It handles TWO failure classes: `ERR_MODULE_NOT_FOUND` (extensionless
  → retry `.ts`, `/index.ts`) and `ERR_UNSUPPORTED_DIR_IMPORT` (directory → `/index.ts`).
- **TS parameter properties are non-erasable** under Node type stripping — 9 files fixed (SecretRef,
  weal-bot ×4, orator-backend ×4) — and **only RUNNING finds them** (a grep pass missed `ingest.ts`;
  container runs caught it). Same for `import.meta.dir` (Bun-only) → `.dirname` (bun supports it too;
  vitest's module runner has no `.dir`) — incl. 3 production root-locators in config/ontology.
- **vitest workers have no `Bun` global even under `bun run vitest`** — module-scope `import {SQL} from
  "bun"` and in-path `Bun.write` broke tests before the runtime even exited (fixed ahead of R3).
- **The `send`→Response bridge has three traps** (`libs/ts/site-kit/src/sendFile.ts`): `on-finished`
  needs a `.finished` getter on the fake res (else it destroys the stream before byte one); do NOT attach
  an `'error'` listener on the SendStream (send then EMITS instead of writing its own 404/416/304
  responses); send's error path calls `res.getHeaderNames()`.
- **THE Range/206 gate passed locally against the real corpus** (250 MB + 45 MB mp3s, sha256-exact
  head/mid/suffix slices, 416, HEAD; both audio frontends under node) — live-edge re-check parked.
- **srvx deltas confirmed in practice:** `.stop(true)`→`.close(true)`; `idleTimeout` → after
  `await server.ready()` set `server.node.server.keepAliveTimeout`/`headersTimeout`; `req.ip` replaces
  `requestIP`. `node -e` supports top-level await (the D13 healthchecks).
- **`bun-types` transitively resolved a broken `@types/node@26` pre-release** (ChildProcess with zero
  usable `.on` overloads — first manifested typing `node:child_process`) → root `overrides` pin
  `@types/node ^24.13.2`; remove the override when bun-types exits at R4 (re-evaluate at S11).
- D11 landed: orator `= any($1)` restored (workaround deleted, new shape test); both dead `migrate.ts`
  deleted; S3's three parked test files all resolved (migrate ×2 deleted, weal-overlay server.test.ts
  unparked green against srvx incl. the SSE round-trip).
- **py-test was red on main before this work** — the 0021 tuning (`01216e1`) left a stale
  `CONTINUITY_BUDGET == 6_000` pin; fixed (`assert 26_000`) after the S1–S3 push surfaced it.

Builds on [[astra-migration-research]] + [[strider-0016-gotchas]] + [[deploy-apply-with-just]] +
[[no-silent-scope-cuts]].
