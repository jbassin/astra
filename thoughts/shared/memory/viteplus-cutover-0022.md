---
name: viteplus-cutover-0022
description: "PROJECT 2026-07-02: full cutover of the TS lane to Vite+ / VoidZero — SCOPED + Phase 0 spikes DONE + decisions RESOLVED (full cutover incl. bun-runtime exit to Node 24, pnpm, biome→oxlint+oxfmt); ▶ NEXT: spec R1–R6"
metadata:
  type: project
---

**Vite+ cutover (0022)** — stakeholders want the whole TS lane on Vite+ (VoidZero `vp`, beta v0.2.2,
**fully MIT/free** since the March-2026 reversal; Cloudflare acquired VoidZero 2026-06-04).
Scoping doc + Phase-0 addendum + revised R1–R7 roadmap:
`thoughts/shared/research/2026-07-02-viteplus-migration-0022-thoughts.md`. **▶ RESUME: author
`octo:spec` → `thoughts/astra/specs/0022-viteplus-cutover-spec.md` covering R1–R6, then implement
up the R-ladder** (R1 vite-8 lockstep → R2 bun:test→vitest codemod → R3 runtime exit to Node 24
per-service → R4 pnpm → R5 oxlint+oxfmt → R6 vp; R7 = TS7 at GA, independent).

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
  diagnostics); tuned config leaves 252 residual disagreements to triage; import auto-sort is
  LOST (oxlint detects, cannot fix). 11/13 biome overrides map 1:1 (table in the doc);
  `bunx biome` outside the repo hits a namesquatted `biome` package.
- `vp` facts: `vp migrate` requires already-Vite-8 + Vitest 4.1; `vp env` is Node-only (never bun);
  `vp check`'s tsgolint is lint-grade — **`tsc --noEmit` stays the typecheck gate**; TS 7 still RC
  (7.0.1-rc; latest 6.0.3) — R7 when GA.

Builds on [[astra-migration-research]] + [[strider-0016-gotchas]] + [[deploy-apply-with-just]] +
[[no-silent-scope-cuts]].
