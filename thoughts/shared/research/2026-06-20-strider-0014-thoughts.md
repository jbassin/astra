# 0014 strider — pre-implementation thoughts

**Date:** 2026-06-20. **Author:** Claude. **Status:** analysis (verified against both repos) → awaiting
NLSpec (`octo:spec`) before `octo:embrace`.
**Plan:** [`thoughts/astra/plans/0014-strider.md`](../../astra/plans/0014-strider.md). **Depends-on:**
`0003` gothic. **Blocks (as the template):** `0011` akasha-frontend, `0012` mouthpiece-frontend,
`0013` vellum-frontend. **Phase:** 5 (frontends).

## What 0014 is

Bring faerrin's `strider` (a TanStack Start + Vite + React 19 + pixi hexmap site) into astra as
`apps/strider`. P1 is **decided: lift the faction-territory data model as-is** (factions/territories/
layers/skein), so the *framework + data model* lift nearly verbatim. **The headline is that strider is the
canonical frontend template** — its build-content → generated-modules → route-loader → prerender pattern is
what `0011`–`0013` copy (CLAUDE.md standing principle #4). So the value isn't the lift; it's getting the
**astra-ify conventions right**, because they propagate.

## Verified against the repos

- **strider is the FIRST TS app in `apps/`** — no `apps/*/package.json` exists yet (only the 4 py apps).
  So 0014 establishes the bun-frontend-app conventions: a member with `typecheck`/`test`/`build` scripts
  (the root runs `bun --filter '*' {typecheck,test,build}`), `tsconfig` extending `tsconfig.base.json`,
  output to the root `dist/` (gitignored), and the biome config that governs it.
- **gothic is consumable but CHANGED shape (0003).** `@astra/gothic` exports `.` (index), **`./theme.css`**
  (the Tailwind **v4 `@theme`**), and `./fonts/*`; it builds on `@tailwindcss/vite` + `tailwindcss@4` +
  `@vitejs/plugin-react` (vite **6**), React 19 peer. faerrin strider consumed `@faerrin/gothic` as CSS;
  astra strider must adopt `@tailwindcss/vite` and import `@astra/gothic/theme.css`, and re-check any
  styling that assumed gothic's old CSS-Modules vars (0003 restyled CSS-Modules → Tailwind v4).
- **The TS lane is biome, not eslint/prettier.** faerrin strider ships `eslint .` + `prettier --write .`;
  astra's root is `biome ci .` / `biome format --write` (recommended preset, lineWidth 100, indent 2).
  The lift must **drop eslint+prettier and conform to biome** — expect lint churn on lifted code (the
  vellum-lang/gothic lifts needed per-file biome overrides; strider will too).
- **biome ignores generated/fixture files** (`being.canonical.json`, `akasha-snapshot.json`,
  `fixtures/**`); strider's **`src/generated/*.ts`** (build-content output: `factions.ts`, `layers.ts`,
  `contentHash.ts`) are generated → must be added to the biome ignore list, or biome will fight the
  generator.

## What lifts ~verbatim (P1/P2/P3 decided)

- **Framework + pattern:** `scripts/build-content.ts` (gray-matter + remark → typed `src/generated/`),
  the Vite watch plugin (`contentWatchPlugin.ts`), `generate-routes.ts`, file-based routes, static
  prerender → `dist/client/`. **No `fs`/`remark`/`gray-matter` in the client bundle** (they're devDeps).
- **pixi hexmap (P2):** `lib/hexUtils.ts` + the `HexMap/` canvas (`pixiScene`, `animationManager`,
  `skeinGeometry`) — concept-agnostic; **stays `<ClientOnly>`** (no WebGL in SSR/prerender, Risk 2).
- **Data model + content (P1/P3):** `content/{factions,layers}/*.md` + the faction/territory/layer/skein
  model + map routes, lifted unchanged. strider-local content (not sourced from akasha/ontology).

## Decisions to surface before the NLSpec (the astra-ify, not in the plan)

| # | Decision | Why it's open |
|---|---|---|
| S1 | **OTel/observe for a static frontend** | Standing principle #1 says every app wires `libs/ts/observe` to SigNoz — but strider is a prerendered static site (served by Caddy), not a running service. Wire build-time spans? client RUM? or declare static-frontend observe out of scope? The template answer propagates to 0011–0013, so decide deliberately. |
| S2 | **Editor + editor-server scope** | strider ships an authoring **Editor** (`routes/editor.tsx`, `EditorHexMap`, `saveLayer`) backed by a **long-running bun `editor-server.ts`** (`--hot`). Per Decision H a long-running server = a **Compose** unit. Lift the editor now (as a Compose service) or defer it (ship the read-only site first)? The plan's work items don't mention it. |
| S3 | **OG-image build in CI** | `build` runs `vite build && build-og-image.ts`; OG-image gen typically needs a headless browser at build time (cf. gothic's Storybook-in-CI concern). Keep it in the `build` lane, or gate it behind a flag so the CI `bun --filter build` stays browser-free? |
| S4 | **Test runner** | faerrin strider uses **vitest + testing-library + playwright(e2e)**; gothic (the precedent) uses **`bun test`**. Keep vitest+jsdom (runs fine under `bun --filter test`) or convert to `bun test`? Pixi/DOM tests likely need jsdom either way. |
| S5 | **vite version** | gothic pins **vite 6**; faerrin strider uses **vite 8**. Align the workspace (vite 6 to match gothic, or bump gothic to 8). A shared resolution avoids a split vite across the bun lane. |

*(P1 lift-the-faction-map, P2 reuse-hex-rendering, P3 strider-local-content are already DECIDED in the plan.)*

## Suggested slicing (for the NLSpec)

1. **Scaffold** `apps/strider` as the first bun frontend member: `package.json` (gothic `workspace:*`,
   TanStack Start/router, pixi, react 19), `tsconfig` extends base, biome conforms, `typecheck/test/build`
   scripts, `dist/` output, `src/generated/**` biome-ignored.
2. **gothic re-consumption:** `@tailwindcss/vite` + import `@astra/gothic/theme.css`; verify primitives/
   tokens render (the I5 identity seam if used).
3. **build-content pattern:** lift `build-content.ts` + the watch plugin + `generate-routes.ts` (the
   template the other frontends copy — document it).
4. **Hex rendering:** lift `hexUtils` + the `HexMap` pixi canvas (`<ClientOnly>`); confirm no WebGL in
   prerender.
5. **Data model + routes:** lift factions/territories/layers/skein + content + map routes.
6. **Resolve S1–S5**; wire whatever observe decision (S1); decide editor (S2).
7. **CI:** `bun --filter strider {typecheck,test,build}` green; `biome ci` clean; prerender to `dist/`.

## Exit criteria (carry from plan §6 + the astra-ify)

- Builds to `dist/` on TanStack Start; **confirmed + documented as the canonical frontend template**.
- pixi hex map renders **client-only**; gothic (Tailwind v4) styling applied.
- Faction-map data loads via build-content → generated modules → loaders; territories draw.
- **biome + tsc + bun test green** under `bun --filter` (eslint/prettier fully removed); `src/generated`
  ignored by biome.
- S1 (observe) + S2 (editor) decided and reflected.

## Risks

1. **Template drift (the real risk).** strider is what 0011–0013 copy; a wrong convention here (biome
   setup, OTel-for-frontend, dist/ wiring, generated-file handling) propagates to three more frontends.
   Getting the conventions right matters more than the lift.
2. **gothic API skew.** 0003 rebuilt gothic (CSS-Modules → Tailwind v4 `@theme`); faerrin strider's gothic
   consumption may not map 1:1 — re-validate styling against the current `@astra/gothic` exports.
3. **pixi in prerender** — all WebGL stays `<ClientOnly>`; prerender must not touch it (strider already does).
4. **eslint→biome churn** — lifted TS may trip biome rules the faerrin eslint config allowed; scope
   per-file overrides like the vellum-lang/gothic lifts, keep rules on for new code.
