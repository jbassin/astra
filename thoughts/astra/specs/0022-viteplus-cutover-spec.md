# NLSpec 0022 — Vite+ toolchain cutover (Vite 8 · Node 24 · pnpm · oxlint+oxfmt · vp)

**Status:** SPEC — ready to implement. All decisions resolved; no open questions.
**Scope doc:** `thoughts/shared/research/2026-07-02-viteplus-migration-0022-thoughts.md` (verified; the
  addendum's R1–R7 roadmap supersedes the doc's original plan — this spec covers **R1–R6**; R7 = TS 7 at
  GA rides independently). Phase-0 spikes DONE: Vite 8 canary PASSED on strider; oxc tools run against
  the repo; bun-exit study complete.
**Date:** 2026-07-02 · **Subsystem slug:** `viteplus-cutover` · **Phase:** post-migration toolchain cutover
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`.
**Honors memory:** [[viteplus-cutover-0022]], [[verify-before-acting]], [[no-silent-scope-cuts]],
  [[no-ci-monitoring]], [[deploy-apply-with-just]], [[telemetry-built-in]], [[strider-0016-gotchas]],
  [[pipeline-reorder-0021]] (the linguist-commit timer gotcha).

## Goal

Move astra's entire TypeScript lane onto the VoidZero toolchain — **Vite 8 (Rolldown)** for
dev/build, **Vitest 4** as the single test runner, **Node 24 LTS** as the single runtime (bun exits),
**pnpm** as the package manager (bun exits entirely), **oxlint + oxfmt** for lint/format (biome
retires), **tsdown** for the one non-vite bundle step, and the **`vp` CLI** as the orchestrator — while
keeping `tsc --noEmit` as the typecheck gate. The Python lane (uv/ruff/ty/pytest) is untouched.

Why now: the presumed upstream blocker (TanStack/router#7614) did **not** reproduce in the Phase-0
canary — strider builds, SSRs, and serves correctly on vite 8.1.3 (build 1.44s vs 4.7s baseline);
Vite+ is beta, fully MIT, and Cloudflare-backed; and stakeholders explicitly chose the full cutover
over partial adoption (decisions D1–D3 below).

## Decisions in force

D1–D3 locked with the stakeholder 2026-07-02 (scope doc §"RESOLVED decisions"); D4–D7 locked in a
follow-up round while authoring this spec (2026-07-02); D8–D14 settled here from verified evidence.

| # | Decision | Choice & rationale |
|---|---|---|
| D1 | Cutover scope | **LOCKED: FULL cutover** — Vite 8 lockstep, then bun-runtime exit → **Node 24 LTS**, vitest everywhere, vp adoption. Migrating off the bun runtime is explicitly accepted. |
| D2 | Package manager | **LOCKED: pnpm.** bun exits the repo entirely (runtime AND package manager). Accept the lockfile/CI/Dockerfile churn; sequence it as its own slice (R4). |
| D3 | Lint/format lane | **LOCKED: full switch to oxlint + oxfmt.** Biome retires. Mitigations from the Phase-0 audit are mandatory (glob-scoped oxfmt, override port, `react-in-jsx-scope` off, baseUrl fix — see D9, R1/R5 slices). |
| D4 | Import sorting | **LOCKED (stakeholder-corrected): keep the convention via oxfmt `sortImports`.** The Phase-0 audit's "import auto-sorting is lost" claim was WRONG — oxfmt ships a stable, fix-capable `sortImports` (perfectionist-based, opt-in, oxc.rs/docs/guide/usage/formatter/sorting.html). Enable it in `.oxfmtrc.json`; expect regrouping diffs in the one-time reformat (grouping differs from biome's flat alphabetical). |
| D5 | tsdown | **LOCKED: include.** orator-controller's rollup 4 → tsdown (the Rolldown-family bundler) ships in this spec (slice S15) — completes the VoidZero story, retires the last rollup dep. |
| D6 | Gate strictness | **LOCKED: unify strict.** Today CI's `ts-lint` runs plain `biome ci .` while pre-commit runs `--error-on-warnings` (verified asymmetry the docs don't admit). Under R5 both gates run `oxlint --deny-warnings` — warnings block everywhere. |
| D7 | vp in CI | **LOCKED: hard requirement.** R6 is not done until `vp` runs in CI. If the CI install path (curl installer; `setup-vp` action unverified) proves immature, R6 stays open and the trade-off is surfaced — no silent fallback to plain pnpm CI ([[no-silent-scope-cuts]]). |
| D8 | Typecheck gate | **SETTLED: `tsc --noEmit` stays.** tsgolint is lint-grade (its own README: experimental PoC), not a tsc replacement. TS 7 at GA is R7, out of this spec. |
| D9 | Vite-family pins | **SETTLED: exact-pin `vite` (no caret) until TanStack officially certifies Vite 8.** We pass empirically; an upstream regression could land silently on a caret bump. Everything else keeps repo-convention carets (lockfile pins day-to-day anyway). |
| D10 | SSR server | **SETTLED: srvx + `send`.** `Bun.serve` → `srvx.serve({fetch})` (the same abstraction TanStack Start's Node output already uses via Nitro); `Bun.file` static mounts → `send` for Range/206. The Range proof on the real audio mounts is THE gate before fan-out (slice S6). ⚠ "Drop-in" holds only for the 7 thin SSR frontends (return value unused — verified); the four hand-rolled servers have real API deltas (`.stop`→`.close`, no `.port`, no `idleTimeout`, `requestIP`→`req.ip`) — itemized per slice (adversarial pass B3). |
| D11 | Postgres driver | **SETTLED: postgres.js (porsager), ~1:1.** `sql.unsafe(query, params)`, tagged templates, `sql.begin` all identical. **Delete** (don't port) the `IN (…)`-instead-of-`= any($1)` workaround in orator `store.ts:623-633` — postgres.js handles array params natively. Delete both one-shot `migrate.ts` scripts (verified unwired anywhere). |
| D12 | Dockerfile staging in R3 | **SETTLED: mixed-stage during the R3 window.** Build stage stays `oven/bun:1.3.14` (bun is still the package manager until R4); runtime stage becomes `node:24-slim` per service as it exits. R4 then swaps the build stages to node+pnpm. Two touches per Dockerfile, deliberately — it keeps every intermediate state shippable. `node:24-slim` ships user `node` = uid 1000, so the compose `user: "1000:1000"` pattern carries over unchanged ([[deploy-artifacts-run-as-user]]). |
| D13 | Healthchecks | **SETTLED: `bun -e` → `node -e`** (Node 24 has global fetch) in each service's R3 slice — all 11 compose healthchecks are bun-invoking today (a surface the scope doc missed). |
| D14 | Storybook | **SETTLED: verify in R1; sanctioned deferral if it fights.** gothic's `@storybook/react-vite` 8.6 is dev-only and NOT in CI. If it's incompatible with vite 8, bump storybook; if the bump balloons, defer it with an explicit note in the slice commit — this deferral is spec-sanctioned. |

## Verified footprint (corrections to the scope doc — trust these numbers)

Every count below was re-verified against the repo on 2026-07-02, after the scope doc. Where they
disagree, **this table wins**; errata are marked ⚠.

| Surface | Verified fact |
|---|---|
| TS workspace members | 21 (12 `apps/*` + 9 `libs/ts/*`); 6 Python apps excluded by manifest. |
| Vite-using members | 12 — uniform `vite ^6.3.6`, `@vitejs/plugin-react ^4.4.0`, tailwind `^4.1.13`: ⚠ **7** TanStack Start apps (`react-start ^1.168.10`; the scope doc's "8" was an internal inconsistency) + vellum-render (plain-vite) + orator-backend + weal-overlay (SPAs) + gothic + site-kit (devDeps). |
| Vitest today | `^3.0.0` + jsdom on the 7 frontends; separate `vitest.config.ts` each; ⚠ **5 of 7** run `bun run scripts/build-content.ts` in `globalSetup` (akasha-frontend, strider, ledger, mouthpiece-frontend, **harrow** — the adversarial pass caught the fifth). |
| bun:test files | ⚠ **50**, not 48 (orator-backend 18, weal-bot 8, orator-controller 6, weal-overlay 4, vellum-render 2, libs 12). ⚠ **4** (not 5) touch Bun constructs: `vellum-lang/corpus.test.ts`, `ontology/ontology.test.ts`, `site-kit/index.test.ts` (`import.meta.dir`), `config/config.test.ts` (`import.meta.dir` + `Bun.write`). |
| Real `Bun.serve` call sites | ⚠ **6** (site-kit `ssrServer.ts`, weal-bot `speak.ts`, weal-overlay `src/server.ts`, orator-backend `app.ts`, vellum-render `server.ts` + its VR script). The other 8 grep hits are doc-comments in the frontends' thin `server.ts` wrappers — **one site-kit fix covers all 7 frontends**. |
| `staticMounts` (audio) | Exactly 2: akasha-frontend + mouthpiece-frontend (`/audio/` → volume). Range/206 today is `Response(Bun.file(...))` native behavior — the thing `send` must replace. |
| Misc Bun APIs | 8 non-test source files with `Bun.file/write/spawn` (~17 occurrences); `Bun.spawn` only in orator media (`ytdlp.ts`, `probe.ts`); `Bun.env` **zero** hits; `bun:sqlite` only in the two deletable `migrate.ts`. |
| tsconfigs | Exactly 7 set `baseUrl` (the 7 Start frontends) — tsgolint rejects it (oxc-project/tsgolint#351). `@/*` alias mirrored in exactly 3 places each (tsconfig + vite.config + vitest.config). `tsconfig.base.json` has **`types: ["bun"]`** — must go at R3-final. |
| `--configLoader runner` | 8 members (7 frontends + vellum-render); orator-backend/weal-overlay don't need it. Survives on vite 8 (canary-verified). |
| Dockerfiles | 11 TS Dockerfiles, all 2-stage, 22 `oven/bun:1.3.14(-slim)` FROM lines. dagster/Dockerfile is Python — untouched. |
| Compose | 11 TS services; ⚠ all healthchecks are `bun -e` and `command:` overrides are `["bun","run","start"]` — per-service edits the scope doc didn't size. `user: "1000:1000"` throughout. |
| CI | 4 TS jobs (`bun --filter '*' {typecheck,test,build}` + `bunx biome ci .`) + corpus-validate + VR job (pinned `container: oven/bun:1.3.14` — the one pin baked into a container directive) + commitlint; composite `setup-bun` (v2, 1.3.14, cache keyed on `bun.lock`). |
| Pre-commit | `.githooks/pre-commit`: `bunx biome ci --error-on-warnings .` + ruff check/format-check. ⚠ CI's biome run has NO `--error-on-warnings` — asymmetric today (→ D6). |
| justfile | ⚠ Only **1** direct bun line (`heartwood-apply`: `bun libs/ts/vellum-lang/scripts/validate-corpus.ts …`) — the other recipes touch bun only via docker builds. |
| bun references to zero | 33 `bunx|bun run|bun --filter` hits across root + 11 app package.jsons; CLAUDE.md 3 lines, CONTRIBUTING.md 2 lines + gotchas entries; `deploy/README.md` 1; no root `packageManager` field today. ⚠ Plus THREE **bare** `bun <path>` call sites the naive grep misses: `snapshot.py:76` (Python! subprocess in the live corpus-snapshot flow), `justfile:178`, `ci.yml:132` (corpus-validate) — all → `node <path>` at S11. |
| biome | 13 per-path overrides (verified by JSON parse; mapping table in the scope doc addendum); `organizeImports: "on"` and genuinely relied on; `noLeakedRender`/`noUndeclaredEnvVars` NOT configured anywhere (dormant — losing them costs nothing); invoked only at root (never per-member). |
| oxfmt scope risk | Real: a bare-root run would rewrite ~110 thoughts/ markdown files, 17 pyproject.toml (ruff's lane), package.json key order, and `deploy/sops/secrets.enc.yaml` (confirmed on disk). Config has `ignorePatterns` only — no language allowlist → **wrapper scripts with explicit globs are mandatory** (R5). |
| ⚠ Import sorting | The scope doc's "auto-sorting is lost" is WRONG — oxfmt `sortImports` exists, stable, fix-capable (D4). |
| typecheck scripts | 6 members generate-then-check (`build-content.ts` ×5, `generate-routes.ts` ×1); vellum-frontend is plain `tsc --noEmit`. |
| rollup | orator-controller only: `rollup ^4.32.1` + `rollup.config.mjs` → Stream Deck plugin bundle (Node target) — the D5 tsdown target. |

## Scope (in)

1. **R1 — Vite 8 lockstep**: all 12 vite-using members to vite 8 (exact-pinned, D9) + plugin-react
   ^5.2 + tailwind ^4.3 + vitest ^4.1, in ONE slice; the baseUrl→relative-`paths` fix on the 7
   frontend tsconfigs; VR goldens regenerated if bytes shift; strider README updated.
2. **R2 — bun:test → vitest codemod** (50 files), while still on the bun runtime — decouples
   test-runner risk from runtime risk.
3. **R3 — runtime exit to Node 24**, per-service pilot ladder: site-kit (srvx + `send`) → ledger
   pilot → weal-bot → **the audio-mounts Range/206 proof** (mouthpiece-frontend + akasha-frontend) →
   remaining 4 SSR frontends → weal-overlay → orator-backend → vellum-render → cleanup
   (`types: ["bun"]`, `@types/bun`, migrate.ts deletion, `.node-version`).
4. **R4 — pnpm cutover**, one slice: workspace file, lockfile, root/member scripts, all 11
   Dockerfile build stages, CI composite, pre-commit, docs. Exit = grep-to-zero on bun.
5. **R5 — biome → oxlint + oxfmt**: tuned `.oxlintrc.json` (13 overrides ported) + `.oxfmtrc.json`
   (`sortImports` on) + glob-scope wrapper scripts + type-aware lint on (fix the real
   floating-promises bugs it found) + the one-time reformat + gate swap (unified strict, D6).
6. **R6 — vp adoption + tsdown**: orator-controller rollup→tsdown; `vp install`/`vp run`/`vp env`;
   config consolidation via `vp migrate`; **vp in CI (hard, D7)**.
7. Doc ripple throughout: `CLAUDE.md` Pins + CI commands, `CONTRIBUTING.md` §4/§5/§8, pre-commit
   header comments, `apps/strider/README.md`, `thoughts/shared/guides/migrating-an-app-into-astra.md`.

## Scope (out) / deferred

- **R7 — TypeScript 7 at GA** (still RC as of 2026-07-02): independent; pilot-one-lib → flip root
  pin when `dist-tags.latest` reads 7.x. Not gated on anything here.
- **The Python lane** (uv/ruff/ty/pytest), `dagster/Dockerfile`, the SigNoz stack, Caddy config: no
  changes — with ONE sanctioned carve-out: `akasha-backend/snapshot.py:76`'s `subprocess.run(["bun",
  …])` is a TS-toolchain call site in Python clothing and converts to `node` at S11.
  `pyproject.toml` stays ruff's lane — oxfmt must never touch it (R5 scoping).
- **Storybook major bump** if vite-8-incompatible (D14 — dev-only, not CI; sanctioned deferral).
- **Remote task caching** (`vp run`): not in the beta; revisit at vp 1.0.
- **Config/behavior changes to any app**: this is a toolchain migration — byte-identical runtime
  behavior is the bar everywhere except the sanctioned simplifications (D11's workaround deletion).

## Slices

> Reproduce the TS lane locally before every push. The command **changes as the migration lands** —
> use the lane's current form: through R3 `bun --filter '*' typecheck && bunx biome ci . && bun
> --filter '*' test && bun --filter '*' build`; after R4 swap `bun --filter '*'`→`pnpm -r` and
> `bunx`→`pnpm exec`; after R5 the lint step is the scoped `pnpm run lint` (oxlint) + `pnpm run
> format:check` (oxfmt); after R6, `vp`-orchestrated equivalents. Update `CLAUDE.md` +
> `CONTRIBUTING.md` in the same slice that changes a command. Push per chunk; don't watch GHA
> ([[no-ci-monitoring]]). ⚠ Keep a clean git index across the 15-min linguist-commit timer windows,
> or `systemctl --user stop linguist-commit.timer` during multi-file slices ([[pipeline-reorder-0021]]).

### Slice S1 — R1: Vite 8 lockstep (the one big bump)

- Bump ALL 12 vite-using members together — **no partial bumps** (a partial bump silently installs a
  duplicate vite, the exact upstream-#7614 trigger; bun neither dedupes nor warns): `vite` → exact
  `8.1.3`+ (D9), `@vitejs/plugin-react` → `^5.2.0` (hard requirement — 4.x peer range stops at ^7),
  `@tailwindcss/vite`/`tailwindcss` → `^4.3`, `vitest` → `^4.1` + compatible jsdom on the 7 frontends
  (**vitest 3 green is a FALSE vite-8 signal** — its `vite-node` dep pins a private vite ≤7).
- Fix the 7 frontend tsconfigs: drop `baseUrl`, keep the alias as relative `paths`
  (`"@/*": ["./src/*"]` — works without baseUrl since TS 5); vite/vitest `resolve.alias` mirrors
  unchanged. This unlocks tsgolint for R5 (it rejects `baseUrl`).
- Verify the load-bearing seams: `--configLoader runner` on all 8 users; `gothicFontsPlugin` /
  `contentWatchPlugin`; the 5 frontends' `globalSetup` content builds under vitest 4 (incl. harrow);
  react-compiler plugin shape under Rolldown; storybook in gothic (D14); no tailwind
  `optimize:false` needed at ^4.3 (canary-verified).
- vellum-render on vite 8: rebuild; if any output byte shifts, regenerate the VR goldens **in the
  pinned CI container** ([[vellum-frontend-0013-gotchas]]).
- Update `apps/strider/README.md` (the template recipe) with the vite-8 state.
- Deploy: `just up` (image rebuilds pick up the lockfile) + live visual spot-check per frontend
  (SSR HTML via `grep -a`; a real WebGL browser for the pixi/shader pages — [[backdrop-signature-style]]).

**Acceptance:** exactly ONE vite version in `bun.lock` (grep); all 7 frontends build + `ssrSmoke`
green on vite 8 + vitest 4; VR job green; live spot-checks pass.
**CI:** full TS lane + VR job.

### Slice S2 — R2: bun:test → vitest, libs (12 files)

- Codemod the 9 libs' tests (`bun:test` imports → `vitest`; mechanical — near-zero mock/spyOn in the
  repo). The 4 Bun-construct files get their swaps here, ahead of R3: `import.meta.dir` →
  `import.meta.dirname`, `Bun.write` (config.test.ts) → `node:fs/promises`.
- Each lib gains a `vitest` devDep + `"test": "vitest run"`; root `bun --filter '*' test` still
  fans out unchanged.

**Acceptance:** zero `bun:test` imports under `libs/ts/`; all lib tests green under vitest on Node.
**CI:** ts-test + ts-typecheck.

### Slice S3 — R2: bun:test → vitest, apps (38 files)

- Same codemod for orator-backend (18), weal-bot (8), orator-controller (6), weal-overlay (4),
  vellum-render (2). If a test transitively imports a module that evaluates a Bun API at module
  scope (vitest workers are Node), give it a seam or move that file to ride with its service's R3
  slice — list any such deferral in the commit message (sanctioned, expected ≈0 per Phase 0).

**Acceptance:** zero `bun:test` imports repo-wide; full `bun --filter '*' test` green.
**CI:** ts-test.

### Slice S4 — R3 pilot: site-kit on srvx + `send`, proven on ledger

- Add `srvx` + `send` as DIRECT deps of `libs/ts/site-kit` (srvx is transitive-only today via
  `@tanstack/start-plugin-core`; `send` is absent — verified).
- Rewrite `libs/ts/site-kit/src/ssrServer.ts`: `Bun.serve` → `srvx.serve({fetch})` (safe here —
  verified no frontend caller reads the return value's `.port`/`.stop`); `Response(Bun.file(...))`
  static serving → `send` (Range/206, content-type, 404 semantics); keep the OTel span wrapper, the
  path-traversal guard, and the mount-precedence order **byte-identically observable**.
- Add an integration test: real HTTP against a temp static mount asserting 200, 404, traversal
  block, and a `Range: bytes=` request → 206 + correct slice + `Content-Range`.
- Pilot on **ledger** (simplest SSR, no audio): `server.ts` unchanged (thin caller), package.json
  `start` → `node server.ts` (Node 24 runs `.ts` natively — grep first that no enum/non-erasable
  syntax exists in directly-executed files), Dockerfile runtime stage → `node:24-slim` (build stage
  stays bun, D12), compose `command` + healthcheck → node (D13). `just up` ledger + live verify
  (SSR 200 through the edge, SigNoz `astra.ledger` spans — [[telemetry-built-in]]).

**Acceptance:** site-kit Range/206 integration test green; ledger live on Node 24 with SSR spans.
**CI:** ts-test + ts-build; deploy verified per [[deploy-apply-with-just]].

### Slice S5 — R3: weal-bot (the postgres.js pattern)

- `db.ts` tagged templates → postgres.js (near-identical); `speak.ts` `Bun.serve` → srvx — incl.
  `server.stop(true)` → `server.close(true)` (srvx has no `.stop`; adversarial pass B3); delete
  `src/migrate/migrate.ts` (one-shot, already run, verified unwired). Dockerfile/compose/healthcheck
  per D12/D13. Live smoke: bot connects to Discord, a real roll round-trips, roll history reads.

**Acceptance:** weal-bot live on Node 24 + postgres.js; roll + history verified in Discord.
**CI:** ts-test scoped; deploy verified.

### Slice S6 — R3: THE Range/206 proof — mouthpiece-frontend + akasha-frontend

- Move both audio-serving frontends to Node 24 (their `server.ts` files pass `staticMounts` —
  no code change beyond `start` script + Dockerfile/compose/healthcheck).
- **THE gate:** against the live public edge, `curl -r` byte-range requests on real episode/session
  mp3s (~14 GB corpus) return 206 with correct `Content-Range`/byte slices; browser seek works in
  the mouthpiece Player and the akasha TranscriptPlayer (manual check); full-file 200 still streams.
  Do NOT fan out to S7 until this passes.

**Acceptance:** 206 verified through `mouthpiece.iridi.cc` + `akasha.iridi.cc` on real audio;
players seek; SigNoz SSR spans 0-error for both.
**CI:** ts-build; deploy verified.

### Slice S7 — R3: remaining SSR frontends (strider, harrow, vellum-frontend, heartwood-frontend)

- Same recipe ×4 (thin callers, no staticMounts). Live spot-check each (strider hex map + pixi,
  harrow starfield in a real browser; heartwood review surface loads; vellum editor `<ClientOnly>`).

**Acceptance:** all 7 SSR frontends live on Node 24, SigNoz spans 0-error.
**CI:** ts-build; deploys verified.

### Slice S8 — R3: weal-overlay + orator-backend

- weal-overlay: the hand-rolled `src/server.ts` (`Bun.serve` + `Bun.file` ×2, SSE) → srvx + `send`,
  incl. the B3 deltas: `server.port` → derive from `server.url`, `.stop(true)` → `.close(true)`;
  SSE streaming verified live under srvx long-lived responses (overlay renders a roll end-to-end).
- orator-backend (the deep one): `app.ts` `Bun.serve` → srvx — `idleTimeout: 60` has NO srvx
  equivalent; set it via srvx's `.node.server` escape hatch (Node `server.timeout` /
  `keepAliveTimeout`), don't drop it silently; `store.ts`
  (748 lines, `sql.unsafe` positional) → postgres.js, **deleting** the `IN (…)` workaround for
  `= any($1)` (D11) with the existing no-live-PG test doubles proving shape; `uploads.ts` `Bun.write`
  → `node:fs`; `ytdlp.ts`/`probe.ts` `Bun.spawn` → `node:child_process` (stdout already
  async-iterable on Node); delete `src/migrate/migrate.ts`. `@snazzah/davey`/`@discordjs/voice`
  napi prebuilds are Node-first — this REMOVES a known bun risk class. Live smoke: web SPA loads,
  track list reads (87 tracks), **Discord voice joins a channel and plays audio**.

**Acceptance:** both services live on Node 24; overlay SSE + orator voice smoke pass; orator API
metrics still land in SigNoz ([[telemetry-coverage-pass]]).
**CI:** ts-test + ts-build scoped; deploys verified.

### Slice S9 — R3: vellum-render on Node (the CI container swap waits for S11)

- Convert vellum-render's OWN Bun surface in one commit (adversarial pass B1 — none of this was
  itemized before): `src/server.ts` `Bun.serve` → srvx incl. `idleTimeout: 30` via the `.node.server`
  escape hatch and the two-arg `fetch(req, srv)` + `srv.requestIP(req)?.address` → single-arg
  `fetch(req)` + `req.ip`; `scripts/visual-regression.ts` sheds its `#!/usr/bin/env bun` shebang and
  `Bun.file/serve/write` calls (node:fs + the same srvx idiom); package.json `start`/`visual-regression`
  scripts `bun run <file>` → `node <file>`.
- Playwright under Node 24 (officially Node-first — removes the other bun risk class); runtime
  Dockerfile stage → `node:24-slim` + `npx playwright install --with-deps chromium` + the
  `chown /ms-playwright` line kept ([[deploy-artifacts-run-as-user]]); compose `command` +
  healthcheck per D12/D13 (same as every R3 sibling).
- **The CI VR job does NOT swap here** — its steps (`bun install`, `bunx playwright`,
  `bun --filter`) need bun-as-package-manager, which exits at S11. The job's pinned `oven/bun`
  container keeps working against the now-node-compatible scripts; the container + steps swap and
  the golden regeneration move to S11.
- Live verify: `/render` produces a real PNG through the edge; SigNoz spans for both vellum services.

**Acceptance:** vellum-render live on Node 24 (real PNG through the edge); VR job still green in the
old container; zero Bun APIs left in the app.
**CI:** VR job + ts-build.

### Slice S10 — R3 cleanup: bun runtime fully out

- Remove `types: ["bun"]` from `tsconfig.base.json` and `@types/bun` from root devDeps; full-lane
  typecheck. Add `.node-version` (24) + root `engines.node`. Sweep: `grep -rE 'Bun\.\w'` over
  `apps/ libs/ts` → zero production hits (comments referencing history are fine — reword the 8
  server.ts doc-comments while here); the two migrate.ts are gone (S5/S8).

**Acceptance:** grep-zero on Bun APIs; full TS lane green with node types only.
**CI:** full TS lane.

### Slice S11 — R4: pnpm cutover (one slice, the whole surface)

- `pnpm-workspace.yaml` (`apps/*`, `libs/ts/*` — bun's globs verbatim); generate `pnpm-lock.yaml`,
  delete `bun.lock`; root `packageManager` field + corepack. Root scripts `bun --filter '*' X` →
  `pnpm -r X`; member scripts `bun run` → `node`/`pnpm run` (incl. akasha-frontend's
  `build-search.ts` Pagefind step — a build-time step, not a typecheck generator); commitlint via
  `pnpm exec`.
- The THREE bare `bun <path>` call sites (footprint table): `snapshot.py:76` subprocess →
  `["node", …]` (the sanctioned Python-file edit — it runs host-side, the dagster image has no
  bun/node); `justfile:178` (`heartwood-apply`) → `node <path>`; ci.yml's corpus-validate step →
  `node <path>`. **Node 24 must be installed on the deploy host** by this point (host-side flows:
  this subprocess, the justfile line, pnpm, later vp) — verify, don't assume.
- All 11 Dockerfiles: build stage `oven/bun:1.3.14` → `node:24-slim` + corepack-pinned pnpm +
  `pnpm install --frozen-lockfile` (keep the manifest-COPY ripple; runtime COPY must carry the whole
  `node_modules` including the `.pnpm` store — pnpm's layout is symlinks into it; if it fights, use
  `pnpm deploy --prod` per app instead). CI: `setup-bun` composite → node + corepack/pnpm, cache
  keyed on `pnpm-lock.yaml`; the VR job's container `oven/bun:1.3.14` → the pinned node image +
  its steps to pnpm/npx, **regenerating the VR goldens in the NEW pinned container** if bytes shift
  (the golden contract is container-pinned, [[vellum-frontend-0013-gotchas]]); ⚠ the `changes`
  path-filter job's `ts`/`vellumRender` globs list `bun.lock` — swap to `pnpm-lock.yaml` or those
  jobs silently stop triggering on lockfile-only changes (adversarial pass B4).
- pnpm's strict, non-hoisting layout WILL surface phantom dependencies (imports not declared by the
  importing member) — fix by declaring them, never by `shamefully-hoist`.
- `.githooks/pre-commit`: `bunx biome` → `pnpm exec biome` (biome still the linter until R5); update
  the hook's fix-hint text. Docs: CLAUDE.md Pins/commands, CONTRIBUTING.md §4/§5, `deploy/README.md`,
  the stale `.dockerignore` "do NOT exclude bun.lock" comment.
- **Exit gate:** the WIDENED grep — `grep -rE '\bbun\b|bunx|oven/bun'` across active surfaces (code,
  scripts, Dockerfiles, compose, CI, justfile, docs; excluding thoughts/ history) → zero after
  triage (the naive `bun run|bun --filter` pattern misses the bare `bun <path>` call sites — B2).
  `just up` full-stack rebuild + all 11 services healthy.

**Acceptance:** grep-zero; full CI green under pnpm; whole stack redeployed healthy.
**CI:** both lanes (the py lane proves no cross-contamination).

### Slice S12 — R5: oxlint + oxfmt configs land (gates unchanged yet)

- `.oxlintrc.json`: categories correctness+suspicious+perf + plugins react/jsx-a11y/import/promise;
  `react/react-in-jsx-scope` OFF (automatic JSX runtime — 1,355 false positives otherwise); port the
  13 biome overrides via the scope doc's mapping table (11 direct; `noAssignInExpressions` → the
  narrower `no-cond-assign`; drop the dormant no-equivalents); carry the ignore list (biome
  `files.includes` negations verbatim). Triage the 252 residual diagnostics: new overrides vs real
  fixes, each deliberate.
- Enable `--type-aware` (tsgolint; baseUrl already fixed in S1) and FIX the real bugs Phase 0 found:
  floating promises in `weal-overlay/server.ts`, `orator-controller/plugin.ts`, `weal-bot/speak.ts`,
  `backdrop/ShaderBackground.tsx` (note: three of these were rewritten in R3 — re-audit, don't
  assume).
- `.oxfmtrc.json` from `oxfmt --migrate=biome` + **`sortImports` enabled** (D4). **Hard scoping:**
  root scripts `lint`/`format`/`format:check` wrap oxlint/oxfmt with explicit JS/TS/JSON/CSS globs —
  a bare `oxfmt .` must be impossible to reach through any documented command (it would rewrite
  ~110 markdown files, 17 pyproject.toml, and the SOPS `secrets.enc.yaml`).

**Acceptance:** `pnpm run lint` (oxlint, scoped) green including type-aware; oxfmt config present;
biome still gating (no behavior change yet); the floating-promise fixes tested.
**CI:** full TS lane (still biome-gated).

### Slice S13 — R5: the reformat + gate swap (biome retires)

- One-time reformat commit: scoped `oxfmt` over JS/TS/JSON/CSS only. **Verify by `git status` that
  zero `.md`/`.toml`/`.yaml` files moved** — `deploy/sops/secrets.enc.yaml` untouched is an explicit
  check. Import regrouping from `sortImports` lands here (D4).
- Swap the gates in the SAME slice (a reformat without the gate swap leaves the tree failing biome):
  pre-commit → `pnpm exec oxlint --deny-warnings <globs>` + `pnpm exec oxfmt --check <globs>`;
  CI `ts-lint` → the SAME strict commands (D6 — unified); root `lint`/`format` scripts final;
  remove `@biomejs/biome` + `biome.json`; ⚠ the `changes` path-filter `ts` glob lists `biome.json` —
  swap to `.oxlintrc.json`/`.oxfmtrc.json` or lint-config-only commits stop triggering CI (B4).
- Docs: CLAUDE.md ("one fast tool" note → two oxc tools, deliberately; Pins line), CONTRIBUTING.md
  §5/§8 (the biome gotcha entries → oxlint/oxfmt equivalents incl. the exit-code note), pre-commit
  header comments.
- Prove the gate: a deliberate lint violation + a deliberate format violation each block a test
  commit (then discard).

**Acceptance:** reformat commit clean (no non-JS/TS/JSON/CSS file moved, SOPS byte-identical);
both gates block on a planted violation; CI green on the swapped ts-lint.
**CI:** full TS lane on the new gates.

### Slice S14 — R6a: orator-controller rollup → tsdown (D5)

- `rollup.config.mjs` + the 4 rollup plugins → `tsdown` config producing the same
  `com.astra.orator.sdPlugin/bin/plugin.js` (Node target, minified in production). Verify the
  bundle loads in the Stream Deck runtime shape (at minimum: byte-level sanity + the plugin's 6
  tests + a smoke `node --check`-grade load); the public OTLP emitter keeps working
  ([[telemetry-coverage-pass]]).

**Acceptance:** plugin bundle builds via tsdown, tests green, rollup gone from the lockfile.
**CI:** ts-build + ts-test scoped.

### Slice S15 — R6b: vp adoption (CI is the bar, D7)

- Install vp (curl installer locally; resolve the npm/CI install story — REQUIRED, not optional);
  `vp migrate` consolidates vitest/task config into `vite.config.ts` task blocks where it pays;
  root orchestration `pnpm -r` → `vp run` (task graph + local caching); `vp env` pins Node 24
  against `.node-version`; `vp install` drives pnpm.
- CI lanes re-expressed via vp — **R6 is not done until the TS jobs run under vp in GHA** (D7). If
  the install path is broken upstream, this slice stays open and the blocker is surfaced to the
  stakeholder; do not silently ship a pnpm-only CI as "done".
- `tsc --noEmit` remains the typecheck gate inside whatever vp task calls it (D8).
- Final docs pass: CLAUDE.md Pins (vite 8/vitest 4/node 24/pnpm/oxc/vp versions), CONTRIBUTING.md
  §5 reproduce-CI commands in their final `vp` form, `migrating-an-app-into-astra.md`, strider README.

**Acceptance:** `vp run`-orchestrated local lane green; GHA TS jobs run under vp; docs final.
**CI:** full CI under the final toolchain.

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | ONE vite (8.x, exact-pinned) across the workspace; plugin-react ^5.2; vitest ^4.1 everywhere | lockfile grep + CI |
| B | Zero `bun:test` imports; 50 files on vitest; the 4 Bun-construct tests ported | grep + ts-test |
| C | All 11 TS services live on Node 24 (`node:24-slim` runtime stages, node healthchecks) | compose ps healthy + `just up` |
| D | **Range/206 proven on the real audio mounts through the public edge; players seek** | `curl -r` ×2 hosts + manual player check |
| E | postgres.js live for orator (87 tracks read; voice joins + plays) and weal (roll round-trip); both migrate.ts deleted | live smokes + grep |
| F | Bun grep-zero: no `Bun.\w` production call, no `bunx|bun run|bun --filter|oven/bun` anywhere active | the S10/S11 greps |
| G | pnpm sole package manager (`pnpm-lock.yaml`, corepack pin); phantom deps declared, no hoist hacks | CI + `.npmrc` review |
| H | oxlint (type-aware, 13 overrides ported) + oxfmt (`sortImports` on) gate BOTH pre-commit and CI at `--deny-warnings`; biome fully removed | planted-violation test + grep |
| I | Reformat scope-safety: no md/toml/yaml touched; `deploy/sops/secrets.enc.yaml` byte-identical | git log of the reformat commit |
| J | VR goldens green in the pinned **node** container; live `/render` PNG | VR job + curl |
| K | orator-controller bundles via tsdown; rollup gone | ts-build + lockfile grep |
| L | **vp runs the TS CI jobs in GHA** (hard, D7) | the GHA run on the final slice |
| M | Every service still emits traces+metrics+logs to SigNoz post-cutover (no init regression) | `signoz_*` MCP spot-check ([[signoz-mcp]]) |
| N | Docs final (CLAUDE.md Pins/commands, CONTRIBUTING.md, strider README, migration guide); memory `[[viteplus-cutover-0022]]` updated with gotchas; RESUME current-state updated | review |

## Risks

1. **THE load-bearing risk — Range/206 static audio on Node.** Bun gave it for free; `send` must
   replicate it against ~14 GB of real mounts. *Mitigation:* proven twice — a site-kit integration
   test (S4) and the live-edge gate (S6) — before any fan-out; the ladder ordering exists for this.
2. **oxfmt scope-creep** (SOPS/markdown/pyproject rewrite). *Mitigation:* wrapper-script globs are
   the only documented invocation path (S12); the reformat commit's git-status check (S13); criterion I.
3. **Duplicate-vite** from a partial bump — the actual #7614 trigger condition. *Mitigation:* S1 is
   atomic across all 12 members; the ONE-vite lockfile grep is its acceptance line.
4. **vitest 4 × the globalSetup content-build pattern** (5 frontends) — untested in the canary.
   *Mitigation:* verified inside S1 before anything else lands; the pattern is a plain shell hook, so
   worst case is a config-shape fix, not an architecture change.
5. **pnpm strict layout** — phantom deps surface at install-time; Docker runtime-stage COPY of a
   symlinked `node_modules`. *Mitigation:* declare-don't-hoist policy (S11); `pnpm deploy --prod`
   as the sanctioned fallback per app.
6. **Upstream Start regression on vite 8** — we pass empirically; TanStack hasn't certified.
   *Mitigation:* exact pins (D9); watch router#7614 + Start releases; the canary recipe is
   re-runnable in a worktree.
7. **vp beta churn / CI install story** — D7 makes CI the bar, so an upstream gap BLOCKS R6 rather
   than degrading it. *Mitigation:* R1–R5 are each independently shippable and valuable; an open R6
   parks cleanly.
8. **The linguist-commit timer** sweeps staged files every ~15 min and auto-redeploys akasha on
   timeline changes. *Mitigation:* clean index discipline / stop the timer during multi-file slices
   ([[pipeline-reorder-0021]]).
9. **Mid-migration CI-command drift** — the reproduce-CI commands change at R4, R5, and R6.
   *Mitigation:* the slice that changes a command updates CLAUDE.md + CONTRIBUTING.md in the same
   commit (the blockquote above; criterion N).

## Adversarial completeness pass

An independent challenge ran against the drafted spec (general-purpose agent, every finding
grep/read-verified against the live repo — srvx claims checked against `srvx@0.11.16`'s shipped
type declarations). All blockers are resolved in the spec text above; recorded here per the 0020
idiom.

**Blockers — resolved in-spec:**
- **B1 — S9's VR-CI swap was unsequenceable.** The VR job's steps (`bun install`, `bunx playwright`,
  `bun --filter`) need bun-as-package-manager until S11, and vellum-render's own Bun surface
  (package.json `bun run <file>` scripts; `visual-regression.ts`'s bun shebang +
  `Bun.file/serve/write`) was unassigned. Fix: S9 now converts the app's whole Bun surface and
  explicitly PARKS the CI container/steps swap + golden regen at S11.
- **B2 — a Python file subprocesses bare `bun`.** `akasha-backend/snapshot.py:75-76` runs
  `["bun", <validate-corpus.ts>]` in the live corpus-snapshot flow, and the original exit-gate grep
  (`bun run|bun --filter`) would NEVER match it (nor `justfile:178` / ci.yml's corpus-validate —
  bare `bun <path>` forms). Fix: all three named in S11, the scope-out carve-out added, the exit
  grep widened to `\bbun\b`, and the host-Node-24 prerequisite stated.
- **B3 — srvx is NOT drop-in for the hand-rolled servers** (verified against srvx's types):
  `.stop(true)`→`.close(true)` (weal-bot, weal-overlay), `.port` doesn't exist (weal-overlay —
  derive from `.url`), `idleTimeout` isn't a srvx option (orator `:60`, vellum-render `:30` — use
  the `.node.server` escape hatch), and Bun's two-arg `fetch(req, srv)` + `srv.requestIP()` →
  single-arg + `req.ip` (vellum-render). Fix: itemized in S5/S8/S9; D10 annotated. The 7 thin SSR
  frontends ARE clean (return value verifiably unused).
- **B4 — CI path-filters go silently stale.** The `changes` job's globs list `bun.lock` (×2) and
  `biome.json`; after S11/S13 delete those files, lockfile-only or lint-config-only commits would
  stop triggering the TS/VR jobs — CI would pass by not running. Fix: glob swaps named in S11 + S13.

**Edge cases — folded into the slice plan:**
- **E1** — akasha-frontend's `build-search.ts` (Pagefind) `bun run` step named in S11.
- **E2** — the vitest `globalSetup` count is **5 of 7**, not 4 (harrow was missed) — footprint
  table, S1, and Risk 4 corrected.
- **E3** — `srvx` is transitive-only and `send` absent today → S4 adds both as direct site-kit deps.
- **E4** — S9 now restates the compose `command`/healthcheck conversion (D12/D13) like its siblings.
- **E5** — `.dockerignore`'s "do NOT exclude bun.lock" comment swept in S11's doc pass.

**Verified non-issues (the spec's claims that held up):**
- bun:test = exactly 50 files; the Bun-construct test files = exactly 4; biome overrides = exactly
  13; no root `packageManager` field — all re-confirmed independently.
- `createSsrServer`'s return value is unused by all 7 frontend callers → the S4 swap is safe there.
- `types: ["bun"]` + `node:*` imports + `import.meta.dirname` already coexist (98 files import
  `node:*` today; bun-types pulls `@types/node` transitively) → S2's vitest port has no typecheck
  hazard ahead of S10.
- `deploy/systemd/*` units: zero bun references — no ripple.
- `bunx commitlint` + the `setup-bun` composite: already covered by S11's text.

**Residual (implementation-time watch items, not spec changes):**
- The S12 override triage (252 residual diagnostics) was measured at Phase 0 — files added since
  need re-audit at implementation time.
- Three of the four Phase-0 floating-promises bugs live in files R3 rewrites — re-audit under
  type-aware oxlint at S12 rather than trusting the Phase-0 line numbers.

## Hand-off

- **Implement** with `octo:embrace` against this spec, slice-by-slice (S1–S15); each slice CI-green,
  Conventional Commit, push per chunk (R-boundary), confirm push + one status check, don't babysit
  GHA. Deploys land per-slice via `just up` (+ nothing edge-side — no Caddy changes in this spec).
- **Sequencing is load-bearing:** S1 before everything (vitest 4 floor); S2/S3 before S4 (test
  runner decoupled from runtime); S6 gates S7 (Range proof before fan-out); S11 (pnpm) only after
  the runtime exit is complete; S13's reformat and gate-swap are one slice, never split.
- **On completion:** update `thoughts/shared/memory/viteplus-cutover-0022.md` (status + the
  load-bearing gotchas discovered), the MEMORY.md index line, and RESUME.md's current-state; note
  the R7 (TS 7) watch item stays open.
