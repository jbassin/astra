---
name: viteplus-cutover-0022
description: "PROJECT 2026-07-02: full cutover of the TS lane to Vite+ / VoidZero — ALL 15 SLICES BUILT (S1–S15, R1–R6 complete): vite 8 lockstep, vitest everywhere, Node 24 runtime, pnpm sole package manager, oxlint+oxfmt (biome retired), tsdown (rollup retired), and vp (vite-plus 0.2.2) orchestrating typecheck/test/build in CI (D7 met). DEPLOYED + LIVE-VERIFIED same session (deploys unparked mid-session): `just up` at S9 and at the S11 exit gate, full live batch passed (8-page WebGL visual check, Range/206 both audio hosts through the edge, /render PNG, overlay SSE, weal-bot Discord reconnect + macro read, SigNoz three signals 0-error)"
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
· `70c6ee1` S8). **DEPLOYS UNPARKED the next session** (stakeholder granted `just up`): full-stack
rebuild + live verifications at S9 and again at the S11 exit gate — all PASSED: 17 containers healthy,
8-page real-WebGL visual spot-check (pixi shaders painting, zero console errors), Range/206
head/mid/suffix + 416 + HEAD through the public edge on BOTH audio hosts (criterion D live half),
vellum-render `/render` real PNG via the edge, weal-overlay `/feed` SSE, weal-bot Discord reconnect +
10 macros read via postgres.js, SigNoz traces+logs+metrics 0-error (criterion M). Still human-only:
an interactive Discord roll round-trip, orator voice-join, in-player seek (Range/206 proven at the
HTTP layer).

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

**S9–S14 (same 2026-07-02 session, staff-orchestrator + sonnet agents, one reviewed commit each):
vellum-render on Node 24** (`ae8093c` S9) — **bun type-surface fully out** (`1093ba0` S10 —
`types:["bun"]`→`["node"]`, `@types/bun` removed, `@types/node ^24.13.2` had to become an explicit
root devDep (NOTHING else declared it — the types swap had no reachable @types/node), `.node-version`
+ `engines.node` added, grep-zero on `Bun.\w`) — **pnpm cutover** (`0e708b1` S11) — **oxlint+oxfmt
configs land** (`3855676` S12, gates still biome) — **the reformat + gate swap, biome retires**
(`4b7bde8` S13, one slice) — **orator-controller rollup→tsdown** (`c04d8f5` S14, D5). R1–R5 complete
after S14.

**THE S9–S14 load-bearing gotchas (each found only by RUNNING):**
- **S9:** yet another TS parameter property (`renderService.ts` constructor) that grep missed —
  running is the only reliable detector. And a bare node:fs static read (no content-type) makes
  Chromium REFUSE module scripts (`window.vellumRender is not a function`) — always reuse site-kit's
  `serveFile` (send-backed) for static serving, never hand-roll. The CI VR job kept its bun container
  by invoking the script file directly with bun (`bun scripts/visual-regression.ts` — the package.json
  script says `node …` and oven/bun has no node binary).
- **S11 (beyond the spec's "three bare-bun call sites" — three more CLASSES existed):** site-kit
  `contentWatchPlugin`'s `spawnSync("bun")`; 5× `vitest.global-setup.ts` guarded `execSync("bun run
  …")` (fires only on a FRESH checkout with no `src/generated/*` — masked in every normal test run;
  delete the generated dirs to expose); 5–6× `ssrSmoke.test.ts` hardcoded `execFileSync("bun")`; plus
  3× `import.meta.dir` in vellum-lang scripts (S10's `Bun\.\w` grep can't see it). Verify with **bun
  removed from PATH**, not just grep. **`nodeTsResolve.mjs` grew two load-bearing behaviors:** a
  lazy-esbuild JSX `load` hook (Node type-stripping does NOT do JSX; every content-pipeline
  `build-content.ts` renders gothic `.tsx`; `jsx:"automatic"` to match react-jsx) and sibling-file-
  BEFORE-`/index.*` retry order (akasha has `transcripts.ts` AND `transcripts/` side by side — the
  index-first order silently resolved the WRONG module). pnpm 10 blocks lifecycle scripts →
  `onlyBuiltDependencies: ["esbuild"]` only; `esbuild` declared in site-kit (the one phantom dep).
  **VR goldens stayed byte-identical across BOTH container swaps** (oven/bun→node:24-slim, 8/8 at
  0.000% — the Chromium pin, not the base image, is what matters). Playwright isn't hoisted under
  pnpm — `npx playwright install` must run FROM `apps/vellum-render`.
- **S12/S13:** type-aware oxlint enforces `no-floating-promises` only — the other 10 type-aware rules
  (363 hits, 264 = `no-unsafe-type-assertion`) are config-disabled with rationale, a DELIBERATE
  deferral surfaced at commit time. tsgolint can transiently die (`terminated abnormally (possibly
  out of memory)`, exit 254) under load — retry before calling a red lint real (documented in
  CONTRIBUTING §8). Deleting comment lines changes oxfmt's wrap decisions → a reformat after a
  comment sweep needs a SECOND `--write` pass. `pnpm remove` reorders package.json keys by itself
  (diff noise beyond oxfmt).
- **S14:** **rolldown/tsdown does NOT lower TC39 class decorators** — the Elgato `@action` decorator
  passed through unlowered and V8 has zero native decorator support (`node --check` SyntaxError); the
  old build worked only because `@rollup/plugin-typescript` shelled to real tsc. Fix: `bundle` runs
  `tsc --outDir .tsbuild` first (identical `__esDecorate` lowering), tsdown bundles the decorator-free
  JS. Also: tsdown entries need an explicit `./` prefix; ESM+node output defaults to `.mjs`
  (`outExtensions` forces `.js`); target is **node20** = the Stream Deck EMBEDDED runtime pin
  (manifest.json `Nodejs.Version`), deliberately NOT the repo's Node 24.
- **Cross-slice:** `apps/heartwood-frontend/src/routeTree.gen.ts`'s trailing `declare module
  '@tanstack/react-start'` block FLAPS — the full vite build adds it (siblings all have it), some
  lighter regeneration path strips it. Committed state = the vite-build state (with the block);
  `git checkout` the file if a test/typecheck run strips it, don't commit the flap.

**S15 (this session) — vp adoption, CI is the bar (D7): BUILT.**
- **Install story resolved: `vite-plus` is a real, official npm package** (not the curl script) —
  `github.com/voidzero-dev/vite-plus`, homepage `viteplus.dev`, published by the VoidZero/Cloudflare
  maintainers (`yyx990803`/`boshen`/etc, matches the curl installer's own version). **`vp` on npm is
  an UNRELATED namesquat** (`vp@1.0.3`, `fengmk2/vp-cli-placeholder`, zero deps) — same footgun class
  as the `bunx biome`-outside-repo namesquat already in this memory; never `npm i -g vp`. The real
  package ships bins `oxfmt`, `oxlint`, `vp`, `vpr`. **Adopted: `vite-plus@0.2.2` exact-pinned as a
  root devDependency** (`pnpm add -D -w vite-plus@0.2.2`) — `pnpm install --frozen-lockfile` (the
  existing `setup-pnpm` composite, unchanged) is now the ENTIRE CI install story for `vp`; no new
  composite action, no curl step, fully deterministic via `pnpm-lock.yaml`. Confirmed the lockfile
  diff touches ONLY the new package + its own deps — the workspace's existing exact-pinned `vite@8.1.3`
  resolution is untouched (D9 preserved).
- **`vp migrate` was run, reviewed, and FULLY REVERTED** — it fights this repo's conventions on three
  fronts: (1) it silently swaps the real `vite` package for `npm:@voidzero-dev/vite-plus-core@0.2.2`
  via a new `pnpm-workspace.yaml` `catalog:` + `overrides` pair (an ALIAS, not literally `vite`) —
  undermining D9's exact-pin decision (chosen specifically to avoid any duplicate/divergent vite
  resolution, the literal #7614 trigger class) without re-running the S1 canary against it; (2) its
  own auto-format step **failed outright** loading `apps/strider/vite.config.ts`
  (`ERR_MODULE_NOT_FOUND` on `libs/ts/site-kit/src/config`) — vp's internal config-loader for
  `vp fmt`/`vp migrate` does NOT chain through this repo's `nodeTsResolve.mjs` hook, so it can't
  resolve the extensionless workspace-TS imports that `--configLoader runner` + the hook make possible
  everywhere else (S4's load-bearing pattern); (3) it rewrote 137 files' imports (`from "vite"` →
  `from "vite-plus"`, `from "vitest"` → `from "vite-plus/test"`) and even a git-committed GENERATED
  file (`apps/heartwood-frontend/src/routeTree.gen.ts`) — invasive, unverified, and unnecessary for
  the CI-orchestration goal. **Kept nothing from migrate**; adoption is source-level-inert (zero
  `vite`/`vitest` import rewrites, zero vite.config.ts task-block consolidation) — vp only orchestrates
  the ALREADY-WORKING per-member `package.json` scripts.
- **`vp env` is NOT a real subcommand in `0.2.2`** (the scope doc's assumption, carried from earlier
  vp docs, is stale for this release — `vp --help` lists no `env`). Node-version pinning is instead
  fully automatic and undocumented-as-a-command: every `vp`-spawned child process resolves through
  vp's OWN managed Node runtime (`~/.vite-plus/js_runtime/node/<patched-version>`) matching
  `.node-version`'s major, independent of `$PATH` — proven by shadowing a decoy `node` (prints a
  sentinel + exits 99) at the FRONT of `$PATH` and confirming a `vp run`-spawned `tsc --noEmit` still
  ran for real (the decoy was never invoked). `vp install --frozen-lockfile` correctly drives pnpm and
  respects the lockfile ("Lockfile is up to date, resolution step is skipped").
- **THE root-orchestration gotcha (found only by running): a root `package.json` script with the SAME
  NAME as the fanned-out task self-collides with `vp run -r <task>`.** The pre-S15 root scripts
  (`"typecheck": "pnpm -r typecheck"`, same for `test`/`build`) get matched by `-r typecheck` as if
  root were just another workspace member — so `vp run -r typecheck` ran the 21-member fan-out
  **AND** root's own script (`astra#typecheck: pnpm -r typecheck`) as a 22nd, unordered, PARALLEL
  task — a second full recursive typecheck racing the first. Concretely: two `akasha-frontend`
  `build-content.ts` invocations raced on `rmSync` of the shared `src/generated/transcripts/` dir →
  `ENOTEMPTY`, hard crash. **Fix: remove the root `typecheck`/`test`/`build` scripts entirely** — call
  `pnpm exec vp run -r <task>` directly (CI + docs + CONTRIBUTING.md §5); do not re-add root scripts
  of those names. `lint`/`format`/`format:check` are unaffected (no member defines those script names).
- **`vp run -r <task>` decomposes `&&`-chained package.json scripts into separate cacheable subtasks**
  — e.g. `"typecheck": "node build-content.ts && tsc --noEmit"` becomes 2 tasks in the graph (27 tasks
  total for 21 members' `typecheck`, since 6 frontends have a `&&` generate step). Real, useful
  behavior — no config change required to get it.
- **Member coverage verified 1:1 with pre-vp `pnpm -r <task>` behavior, no member silently dropped:**
  `typecheck` = 21/21, `test` = 21/21, `build` = 20/21 (`orator-controller` has NO `build` script by
  design — it uses `bundle`/`package` for its Stream Deck plugin bundle, was ALREADY excluded from
  `pnpm -r build`/CI's `ts-build` before this slice; not a vp regression).
- **Local caching is real for `typecheck`, near-useless for `test`.** `vp run --cache -r typecheck`:
  0/27 cold → 26/27 (96%) warm, 42.25s → 32.58s full-lane wall time on a warm rerun (~23% faster,
  driven almost entirely by typecheck). `vp run --cache -r test`: **0/21 on EVERY run, cold or
  warm** — root cause (via `vp run --last-details`): vitest writes its own results cache to
  `<pkg>/node_modules/.vite/vitest/<hash>/results.json`, and vp's input-tracking treats that
  self-write as "modified its input" and refuses to cache, every single time, every member. `build`
  landed in between (19% warm, only pure `echo`-placeholder lib builds cache; the 7 real `vite build`
  members with a content-generate step don't, same self-modifying-input class as heartwood-frontend's
  typecheck). Not chased further — the S15 ask was CI-is-the-bar orchestration, not perfect caching;
  noted here as a real limitation, not a bug to silently paper over. CI doesn't persist the cache
  across runs anyway (ephemeral runners, no remote cache in this vp beta — confirmed in the Phase-0
  research), so this only costs local dev-loop speed, not CI correctness.
- **CI shape:** `ts-typecheck`/`ts-test`/`ts-build` now run `pnpm exec vp run -r <task>` (unchanged
  `setup-pnpm` composite — no new install step needed). `ts-lint` stays DIRECT `pnpm exec oxlint`/
  `pnpm exec oxfmt` (`vp lint`/`vp fmt` are thin pass-throughs to the identical binaries with no
  default glob-scoping — routing through vp adds a layer without adding safety; the explicit globs
  are what keeps oxfmt off markdown/toml/the SOPS file). `corpus-validate` + the VR job stay direct
  `node`/`node --import nodeTsResolve.mjs` invocations (standalone script calls, not per-member
  workspace tasks — vp's filtering/graph value doesn't apply). `tsc --noEmit` is unchanged underneath
  every typecheck task (D8 — vp orchestrates, never replaces the checker).

Builds on [[astra-migration-research]] + [[strider-0016-gotchas]] + [[deploy-apply-with-just]] +
[[no-silent-scope-cuts]].
