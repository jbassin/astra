# Vite+ migration scoping — what moving astra's TS lane to the VoidZero toolchain entails

- Date: 2026-07-02
- Status: scoping (pre-spec). No code changed.
- Ask: stakeholders want "all of the TypeScript in this repository moved to the new Vite+ tooling, instead of whatever equivalent tooling is currently being used."
- Method: three parallel research streams (repo tooling inventory; Vite+ product/licensing/docs; per-tool migration paths), cross-checked against live npm dist-tags on 2026-07-02.

## Executive summary

**A full "Vite+ is the one toolchain" cutover is not possible for astra today, and the single biggest piece — the frontends' vite 6 → vite 8 (Rolldown) move — is blocked upstream by TanStack Start.** What *is* achievable now is a partial adoption: upgrade the frontends to Vite 7 + Vitest 4 (the stepping stone Vite+ requires anyway), and optionally adopt the `vp` CLI as an orchestrator on top of bun. Three of our current tools survive any version of this migration for structural reasons:

1. **bun stays as the runtime.** Vite+ manages Node only (`vp env`/`vp node`); it explicitly declines to manage Bun as a runtime. Every SSR `server.ts` (via `@astra/site-kit`'s `createSsrServer`), orator-backend (Bun SQL/Postgres), weal-bot/overlay, and vellum-render depend on `Bun.serve`/`Bun.file`/Bun SQL. Bun-as-package-manager *is* supported by `vp install` (it detects `bun.lock` and shells out to bun).
2. **`bun:test` stays for Bun-runtime code.** Vitest has no Bun pool — its workers are Node processes; `Bun.serve`/`bun:sqlite`/Bun SQL are unavailable inside them. This is a structural gap, not a maturity gap. 48 files across all 9 `libs/ts/*` + 5 apps use `bun:test`; the ones touching Bun APIs can never move.
3. **`tsc --noEmit` stays as the typecheck gate** (for now). `vp check`'s type-check path is tsgolint, whose own upstream README calls it "an experimental proof-of-concept… not expected to be production ready." TypeScript 7 (the Go-native compiler) is at RC (7.0.1-rc; npm `latest` is 6.0.3 as of today) — when it goes GA it's the best single win available (~10x typecheck speedup, drop-in `tsc`), but that's a TypeScript upgrade, independent of Vite+.

**Licensing is a non-issue.** Vite+ reversed its 2025 freemium plan in March 2026 and is fully MIT, free for everyone, no company-size gates — reaffirmed at the July 2026 beta and by the Cloudflare acquisition of VoidZero (2026-06-04). Sources: voidzero.dev alpha/beta announcements, blog.cloudflare.com/voidzero-joins-cloudflare.

**Recommendation:** run Phases 0–1 now (verification spikes + the Vite 7/Vitest 4 upgrade), hold Phase 2 (Vite 8/Rolldown) on the upstream TanStack Start blocker, and treat Phase 3 (`vp` CLI adoption) and Phase 4 (biome → oxlint+oxfmt) as explicit stakeholder decision gates — the biome swap in particular trades astra's stated "one fast tool" principle for two younger tools and is not rule-lossless.

## What Vite+ actually is (as of 2026-07-02)

- **Beta, v0.2.2** (beta announced 2026-07-02; alpha 2026-03-13; concept announced ViteConf 2025-10-13). VoidZero was acquired by Cloudflare 2026-06-04; everything stays MIT and open.
- One binary, **`vp`**, wrapping: **Vite 8** (Rolldown bundler — Vite 8.0.0 GA 2026-03-12; the old Rollup/esbuild vite is no longer developed), **Vitest 4.1+** (`vp test`), **Oxlint** (`vp lint`), **Oxfmt** (`vp fmt`, beta, `--migrate=biome` exists), **tsgolint** type-check inside `vp check` (experimental), **tsdown** (`vp pack`, published-lib bundling), **Vite Task** (`vp run`, task graph + local caching; GH Actions cache integration; **no remote caching yet** — on the 1.0 roadmap), plus package-manager orchestration (`vp install` etc., bun supported) and a Node version manager (`vp env`, Node-only).
- Config: everything consolidates into `vite.config.ts` (vite + vitest + oxlint + oxfmt + task blocks).
- **`vp migrate`** automates Vitest/tsdown/lint-staged/husky/ESLint/Prettier consolidation — but **requires the project to already be on Vite 8 + Vitest 4.1**, and has no bun-test or biome-lint migration target.
- Install: `curl -fsSL https://vite.plus | bash` (the only officially confirmed path; npm-package install path unverified — npmjs 403'd during research).

## Current state (inventory highlights)

21 TS workspace members (`apps/*` × 12, `libs/ts/*` × 9):

| Surface | Today | Vite+ equivalent | Verdict |
|---|---|---|---|
| Frontend dev/build | **vite 6.3.6**, 8 TanStack Start SSR apps (react-start **~1.168**, = current latest line) + vellum-render plain-vite + orator-backend/weal-overlay SPAs; all Start apps need `--configLoader runner` | Vite 8 (Rolldown) | **Blocked upstream** (see Phase 2) |
| Frontend tests | **vitest 3** already (7 frontends, jsdom, separate `vitest.config.ts` + `globalSetup` content builds) | Vitest 4.1 / `vp test` | Upgrade, low risk |
| Lib + backend tests | **bun:test** (48 files: all libs + orator-backend 17, orator-controller 5, weal-overlay 4, weal-bot, vellum-render) | Vitest | **Partial at most** — Bun-API tests can't move |
| Lint + format | **biome 2.x**, one tool, 13 per-path overrides, big generated-path exclude list; pre-commit runs `--error-on-warnings` | Oxlint + Oxfmt (two tools/configs; `oxfmt --migrate=biome` exists, no lint-config converter from biome; `--deny-warnings` ≈ our flag) | Decision gate; default **keep biome** |
| Typecheck | **tsc 5.x `--noEmit`**, strict + `noUncheckedIndexedAccess`, per-app generate-then-check scripts | tsgolint via `vp check` (experimental) / TS 7 when GA | Keep tsc; swap to TS7 at GA (independent of Vite+) |
| Package manager / fan-out | **bun 1.3.14** workspaces, `bun --filter '*' …` | `vp install` (drives bun) + `vp run` (cached task graph) | Optional; caching win unproven for us |
| Runtime | **bun** everywhere (Bun.serve ×14 files, Bun SQL, Bun.file/write/spawn) | none — Vite+ is Node-only at runtime | **Keep bun, permanently** |
| One-off bundler | rollup 4 in orator-controller (Stream Deck plugin, Node target) | **tsdown** | Nice, easy, in-family |
| Storybook | gothic, `@storybook/react-vite` 8.6 (not in CI) | n/a | Follows the vite major, watch during Phase 2 |

Pin/ripple sites any toolchain change must touch together: root `package.json` scripts, `CONTRIBUTING.md` CI-reproduction commands, `.githooks/pre-commit`, `.github/workflows/ci.yml` (4 TS jobs + commitlint + the VR job's pinned `oven/bun:1.3.14` container) + `.github/actions/setup-bun`, and **all 10 app Dockerfiles** (the manifest-COPY ripple + `oven/bun:1.3.14` base images ×2 stages each). The `@/*` alias is maintained in 3 places per frontend (tsconfig + vite.config + vitest.config).

## Fit analysis — the six migration edges

### 1. vite 6.3.6 → Vite 8 (Rolldown) — **blocked upstream, do not attempt yet**
- Vite 8 is the only maintained line; rolldown-vite (the transitional alias) was archived 2026-03-19. We are two majors behind.
- **TanStack Start breaks on Vite 8**: [TanStack/router#7614](https://github.com/TanStack/router/issues/7614) (open, no milestone) — SSR middleware silently fails to register (`dispatchFetch` compat-check false-positive + cross-module `instanceof` failure in monorepos with duplicate vite resolutions) → dev server serves "Cannot GET /". Nitro has its own Vite 8 breakages. HMR issues also reported ([router#5100](https://github.com/TanStack/router/issues/5100)).
- react-start `latest` is **1.168.27** — the exact line we pin. There is no newer Start major to upgrade to; TanStack has not certified Vite 8. The blocker is entirely upstream.
- Tailwind v4 side is fine on Vite 8 with `@tailwindcss/vite ≥4.2.2`, but note the double-lightningcss minify conflict → `tailwindcss({ optimize: false })` ([tailwindcss discussion #19530](https://github.com/tailwindlabs/tailwindcss/discussions/19530)).
- Unknowns to spike when unblocked: does `--configLoader runner` still exist/behave on Vite 8 (our configs import workspace TS `@astra/site-kit`); react-compiler plugin shape changed under Rolldown; storybook `react-vite` compat.

### 2. bun test → vitest — **partial only, by design**
- API shape (`describe/it/expect`) ports easily, but vitest workers are Node — no Bun pool exists, `bun run --bun vitest` does not put Bun APIs inside test workers. Official ecosystem guidance: use each runtime's own runner.
- Pragmatic split: frontends already use vitest; pure-logic lib tests *could* move (mechanical); orator-backend/weal-*/vellum-render/site-kit tests touching Bun.serve/SQL/file **stay on bun:test indefinitely**.
- Moving the pure-logic lib tests buys us `vp test`/`vp migrate` eligibility but means two runners in `libs/ts/*` or per-package splits. Only worth doing as part of Phase 3, not standalone.

### 3. biome → oxlint + oxfmt — **decision gate; default keep biome**
- For: oxlint has broader rule surface (~700+ incl. ported React/Jest/Vitest/unicorn/jsx-a11y rules) and **type-aware linting** (tsgolint, 59/61 typescript-eslint type-aware rules as of 2026-06-04) that biome doesn't match; `oxfmt --migrate=biome` converts formatter config; `--deny-warnings` matches our pre-commit strictness; oxfmt passes 100% of Prettier's JS/TS conformance suite (beta 2026-02-24).
- Against: **two tools + two configs replace one** (astra's CLAUDE.md principle: "one fast tool, chosen over eslint+prettier"); no biome→oxlint lint-config converter — our 13 per-path overrides + generated-path excludes get hand-ported twice; known biome rules with no oxlint equivalent (`noLeakedRender`, `noUndeclaredEnvVars`, `noSwitchDeclarations`); speed win over biome is marginal (~500ms — the 97%-faster stories are ESLint migrations); oxfmt still beta; biome 2.x is healthy and actively developed.
- Trigger to revisit: oxfmt 1.0 + a real need for type-aware rules (`no-floating-promises`-class) that biome lacks.

### 4. tsc → TypeScript 7 (tsgo) — **best single win; wait for GA (weeks away)**
- Verified today: npm `latest` = 6.0.3, `rc` = 7.0.1-rc. GA expected ~a month after the 2026-06-18 RC.
- At GA the Go compiler ships under the `tsc` name — near drop-in, ~10x faster. `noUncheckedIndexedAccess` confirmed supported; full strict-flag parity not exhaustively verified; one open monorepo editor-DX bug (auto-import paths, [typescript-go#2175](https://github.com/microsoft/typescript-go/issues/2175)).
- Independent of Vite+ entirely. Pilot on one small lib (`libs/ts/_smoke` or `observe`), then flip the root devDependency.

### 5. `vp` CLI + Vite Task — **optional orchestration layer, thin value today**
- `vp install` drives bun correctly (lockfile-aware). `vp run` caching only fully applies to tasks declared in `vite.config.ts` (plain package.json scripts need `--cache` opt-in and can't share names); our `bun --filter '*'` fan-out isn't a pain point, and there's no remote cache yet. `vp check` type-check path is experimental (tsgolint).
- Adopting `vp` before Phase 2 completes buys little: the flagship (`vp dev`/`vp build` on Vite 8) is exactly the blocked part, and `vp migrate` refuses pre-Vite-8 projects.

### 6. rollup → tsdown (orator-controller) — **easy, in-family, anytime**
- The one real bundle step outside vite (Stream Deck plugin, Node target). tsdown is the tsup successor on Rolldown; migration is config-shaped, low risk, and independent of everything above. Our workspace-source-only `libs/ts/*` need no build step — tsdown is otherwise out of scope.

## The plan

### Phase 0 — verification spikes (now, ~half a day)
1. **Vite 8 + Start canary branch**: on a throwaway worktree, alias one frontend (strider) to vite 8 and confirm/observe router#7614 firsthand; check whether `--configLoader runner` survives. Outcome: our own repro to watch upstream against, not a migration.
2. **Lint-gap audit**: run `npx @oxlint/migrate --details` (ESLint-config-shaped, so expect a manual mapping) + `oxfmt --migrate=biome` dry-run to get the concrete biome→oxc gap list for our 13 overrides. Input to the Phase-4 decision.
3. Subscribe/watch: TanStack/router#7614, `@tanstack/react-start` releases, TS 7 GA (`npm view typescript dist-tags`), oxfmt stable tag, Vite+ 1.0 roadmap.

### Phase 1 — the unblocked stepping stone (now; prerequisite for everything Vite+)
- **vite 6.3.6 → 7.x** across the 10 vite-using members (Start apps + vellum-render + orator-backend + weal-overlay; Rollup-based vite 7, no bundler swap — moderate, mostly plugin/peer bumps). Verify `--configLoader runner`, `gothicFontsPlugin`/`contentWatchPlugin`, tailwind v4 plugin, storybook.
- **vitest 3 → 4.1** on the 7 frontends (Vite+'s floor).
- Ripple: per-app package.json + lockfile; no Dockerfile/CI command changes (commands are version-agnostic). Reproduce both CI lanes locally; per-slice conventional commits.
- Exit gate: all 4 TS CI jobs + VR job green; each frontend visually spot-checked live (SSR HTML via `grep -a`, real browser for pixi/shader pages).

### Phase 2 — Vite 8 / Rolldown cutover (**gated on upstream**)
- Gate: TanStack Start ships Vite-8 support (router#7614 closed + a Start release stating Vite 8 compat). Re-verify with the Phase-0 canary.
- Then: bump vite 7→8 per app; apply the tailwind `optimize: false` workaround if still needed; re-verify react-compiler plugin shape; regenerate vellum VR goldens **in the pinned container** if any output byte shifts; storybook `react-vite` compat check.
- Risk: high-touch across 8 SSR apps; do 1 app (strider, the template) → soak → fan out to the other 7, updating `apps/strider/README.md` as the canonical recipe.

### Phase 3 — `vp` CLI adoption (decision gate; only meaningful after Phase 2)
- If adopted: `vp install`/`vp run` at the root (bun stays the package manager + runtime); move per-app scripts into `vite.config.ts` task blocks for caching; try `vp migrate` for the vitest/config consolidation; optionally migrate pure-logic lib tests to vitest for `vp test` coverage; orator-controller rollup→tsdown (can be done anytime, even before this phase).
- Keep outside `vp` permanently: `bun test` (Bun-API suites), `tsc --noEmit` gate (until tsgolint graduates), bun runtime for all services.
- Ripple if adopted: root scripts, CONTRIBUTING.md, pre-commit hook, CI jobs (+ a `vp` install step or the `setup-vp` action — unverified), possibly Dockerfiles (likely unchanged: images can keep plain `bun run build`).

### Phase 4 — lint/format decision (independent; default: keep biome)
- Present the Phase-0 gap audit to stakeholders. Recommend **keep biome** unless the type-aware-lint need is concrete. If switching: hand-port the 13 overrides + excludes into `.oxlintrc.json` + oxfmt config, swap pre-commit to `oxlint --deny-warnings` + `oxfmt --check`, update CI `ts-lint`, CONTRIBUTING.md, editor config; expect a one-time whole-repo reformat commit.

### Phase 5 — TypeScript 7 at GA (independent of Vite+; likely lands before Phase 2 unblocks)
- When `npm view typescript dist-tags.latest` reads 7.x: pilot on one lib → flip root `typescript` devDependency → full `bun --filter '*' typecheck` + editor-DX check (watch typescript-go#2175 for the monorepo auto-import bug).

## What stakeholders should decide

1. **Green-light Phases 0–1 now?** (Recommended — low risk, required groundwork for any Vite+ future.)
2. **Phase 3 appetite**: is "one `vp` CLI" worth adopting given bun test + tsc + bun runtime stay outside it regardless? (Honest framing: astra gets `vp` as an orchestrator over ~60% of the toolchain, not the unified-toolchain story from the marketing.)
3. **Phase 4 (biome → oxlint+oxfmt)**: recommended **no** for now; revisit at oxfmt 1.0 or a concrete type-aware-lint need.

## Sources (load-bearing)

- Vite+ beta (v0.2.2, 2026-07-02, MIT): voidzero.dev/posts/announcing-vite-plus-beta; alpha + MIT reversal: voidzero.dev/posts/announcing-vite-plus-alpha; docs: viteplus.dev/guide/{,check,run,install,env,migrate}
- Cloudflare acquisition: blog.cloudflare.com/voidzero-joins-cloudflare/
- Vite 8 GA: vite.dev/blog/announcing-vite8; rolldown-vite archived: github.com/vitejs/rolldown-vite
- TanStack Start × Vite 8 blocker: github.com/TanStack/router/issues/7614 (open); HMR: issues/5100
- Tailwind v4 on Vite 8: tailwindlabs/tailwindcss discussion #19530
- Vitest pools (Node-only): vitest.dev/config/pool
- Oxlint type-aware: voidzero.dev/posts/announcing-oxlint-type-aware-linting; tsgolint experimental status: github.com/typescript-eslint/tsgolint README
- Oxfmt beta: oxc.rs/blog/2026-02-24-oxfmt-beta; biome→oxc gap writeup: charpeni.com/blog/migrating-from-eslint-biome-prettier-to-oxlint-oxfmt
- TS 7 RC: devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/; live dist-tags checked 2026-07-02 (`latest` 6.0.3, `rc` 7.0.1-rc)
- Vite Task vs Turborepo limits: github.com/voidzero-dev/vite-plus/discussions/1216
