# NLSpec 0014 — strider (hexmap site; the SSR frontend template)

**Status:** **Plan (pre-implementation)** — scoping verified; all decisions resolved (P1–P3, S1–S5,
**Decision I**); ready for `octo:embrace`. **Phase:** 5 (frontends). **Source plan:**
[`../plans/0014-strider.md`](../plans/0014-strider.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-20-strider-0014-thoughts.md`](../../shared/research/2026-06-20-strider-0014-thoughts.md).
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`. **Depends-on:** `0003` gothic (Tailwind v4
`@theme`). **Blocks (as the SSR template):** `0011` akasha-fe, `0012` mouthpiece-fe, `0013` vellum-fe.

## Goal

Bring faerrin's `strider` (TanStack Start + Vite + React 19 + pixi hexmap) into astra as **`apps/strider`**,
the **first TS app in `apps/`** and the **canonical SSR frontend template**. P1 is decided (lift the
faction-territory data model as-is), so the framework + data model lift ~verbatim — but **Decision I** makes
strider a **server-side-rendered Docker Compose service behind Caddy** (not prerendered static `dist/`),
bundling the **editor + editor-server**, with **client RUM + server `observe`**. Its value is the template:
the build-content → generated-modules → route-loader pattern **and** the SSR-Compose-Caddy-RUM deploy wiring
that `0011`–`0013` copy.

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| P1 (plan) | concept / data model | **Lift the faction-territory map as-is** (factions/territories/layers/skein). |
| P2 (plan) | hex rendering | **Reuse** `hexUtils` + the pixi `HexMap` canvas (concept-agnostic). |
| P3 (plan) | content source | **strider-local** `content/*.md` + build-content (it IS the template). |
| **I** (roadmap) | frontend hosting | **SSR Compose service behind Caddy + client RUM** — not static `dist/`; all frontends follow. |
| S1 | frontend observe | **Client RUM (browser OTel) + server-side `observe`** in the SSR runtime. |
| S2 | editor | **Lift now** — Editor + `editor-server` ship with strider (the SSR server serves the editor API). |
| S3 | OG-image build | **Gate behind a flag** so the CI `build` lane stays browser-free (opt-in). |
| S4 | test runner | **vitest + jsdom** (runs under `bun --filter test`; pixi/DOM need jsdom). |
| S5 | vite version | **Pin vite 6** to match gothic (no split vite across the bun lane). |

## Scope (in)

- **`apps/strider`** (first bun frontend member): `package.json` (gothic `workspace:*`, TanStack
  Start/router + router-generator, pixi 8, react 19, vite 6); `tsconfig` extends `tsconfig.base.json`;
  conforms to **biome** (eslint/prettier removed); `typecheck`/`test`/`build` scripts the root runs via
  `bun --filter '*'`; **`src/generated/**` added to the biome ignore list** (build-content output).
- **SSR server (Decision I):** target TanStack Start's **server** output (not prerender); runs as a
  long-running process. A **Docker Compose** unit (`restart: unless-stopped` + healthcheck) in `deploy/`,
  **reverse-proxied by Caddy** (not static-served). Host port in the astra 10350–10399 band.
- **gothic re-consumption:** `@tailwindcss/vite` + import `@astra/gothic/theme.css` (the v4 `@theme`);
  consume gothic primitives/tokens; the I5 identity seam if used.
- **build-content pattern (the template):** lift `scripts/build-content.ts` (gray-matter + remark → typed
  `src/generated/`), `contentWatchPlugin.ts`, `generate-routes.ts`. **No `fs`/`remark`/`gray-matter` in the
  client bundle** (devDeps). Document the pattern for 0011–0013.
- **pixi hexmap (P2):** lift `hexUtils` + `HexMap/` (`pixiScene`/`animationManager`/`skeinGeometry`),
  gated **`<ClientOnly>`** — no WebGL in SSR or prerender.
- **Data model + routes (P1/P3):** lift `content/{factions,layers}/*.md` + the faction/territory/layer/
  skein model + generated types + the faction-map routes/rendering.
- **Editor (S2):** lift `routes/editor.tsx`, `EditorHexMap`, `editorReducer`, `saveLayer`, and the
  **`editor-server.ts`** — served by the strider SSR service (its own API surface + auth).
- **Telemetry (S1):** wire `libs/ts/observe` server-side (SSR spans/metrics/logs) **and** client RUM
  (browser OTel → SigNoz) — strider is a running service, so principle #1 applies directly.

## Scope (out)

- **Prerendered static `dist/` served by Caddy** — replaced by SSR (Decision I). (A client bundle still
  builds; Caddy reverse-proxies the server, doesn't static-serve the site.)
- **Redesigning the data model / concept** — P1 is a lift; ASTRA.md's "journey hexmap" reword is not a
  redesign here.
- **Sourcing content from akasha/ontology** — strider-local content (P3).
- **OG-image generation in the CI build lane** — flagged off (S3); an opt-in local/build step.
- **eslint + prettier** — removed in favor of biome.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| T1 | First `apps/` TS app | strider sets the bun-frontend conventions: `package.json` scripts under `bun --filter`, `tsconfig` extends base, biome governs, `dist/` build output gitignored, `src/generated/**` biome-ignored. These propagate to 0011–0013. |
| T2 | Lint/format | **biome** only (drop eslint/prettier); expect lifted-code churn → scope per-file overrides like the vellum-lang/gothic lifts, keep rules on for new code. |
| T3 | gothic | Tailwind v4 via `@tailwindcss/vite` + `@astra/gothic/theme.css`; re-validate styling vs gothic's current exports (0003 moved CSS-Modules → `@theme`). |
| T4 | Render/host | **SSR** (TanStack Start server target) — a **Compose service behind Caddy** (Decision I), not static. |
| T5 | pixi | stays **`<ClientOnly>`** — no WebGL in SSR/prerender (Risk: SSR must not import the pixi scene). |
| T6 | observe | server-side `observe` in the SSR process **+** client RUM (browser OTel) → SigNoz (S1). |
| T7 | editor | Editor + `editor-server` served by the strider service (S2); its auth surface is part of this app. |
| T8 | vite / test | vite **6** (match gothic, S5); **vitest + jsdom** (S4). |
| T9 | build-content purity | `fs`/`remark`/`gray-matter` stay build-time only (devDeps) — never in the client bundle (the template invariant). |
| T10 | template artifact | the **deploy wiring** (Compose unit + Caddy reverse-proxy + RUM) is as load-bearing a template output as the build-content pattern — document both for 0011–0013. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | `apps/strider` scaffolded as the first bun frontend; `bun --filter strider {typecheck,test,build}` green; **biome ci clean** (no eslint/prettier); `src/generated` biome-ignored | run locally |
| B | gothic (Tailwind v4) styling renders via `@tailwindcss/vite` + `theme.css` | dev + a render check |
| C | build-content → generated-modules → loaders works; the watch plugin re-runs; no `fs`/`remark` in the client bundle | build + bundle inspect |
| D | pixi hex map renders **client-only**; SSR/prerender never touches WebGL | `<ClientOnly>` + an SSR smoke |
| E | faction/territory/layer/skein data + content lifted; the map draws territories | dev + a route test |
| F | **SSR server runs as a Compose unit behind Caddy** (Decision I); reachable in the 10350–10399 band | `docker compose up` + curl |
| G | **Editor + editor-server** work (load a layer, `saveLayer`) | editor smoke |
| H | **client RUM + server `observe`** land in SigNoz (RUM page-load span + an SSR request span) | `signoz_*` MCP check |
| I | **Documented as the SSR template** (build-content pattern + the Compose/Caddy/RUM deploy wiring) for 0011–0013 | a template note in the app/deploy README |

## Risks

1. **Template drift (the #1 risk).** strider is what 0011–0013 copy — now including the **SSR deploy
   pattern** (Compose + Caddy reverse-proxy + RUM), not just build-content. A wrong convention propagates
   to three frontends; document it deliberately.
2. **gothic API skew.** 0003 rebuilt gothic (CSS-Modules → Tailwind v4 `@theme`); re-validate strider's
   styling against the current `@astra/gothic` exports.
3. **SSR + pixi.** WebGL must never run in SSR — keep the pixi scene strictly behind `<ClientOnly>` and
   ensure the server render path doesn't import it.
4. **eslint → biome churn** on lifted TS — per-file overrides; rules on for new code.
5. **Decision I ripple.** This reopens Decision D's hosting model — `0011`–`0013` must replan as SSR
   services (flagged in the roadmap); strider's spec is the reference they'll follow.
6. **editor-server auth surface.** Lifting the editor adds an authoring API to a public service — scope its
   auth (not a public write path).

## Hand-off (the template for 0011–0013)

strider is the **canonical SSR frontend template**: 0011 akasha-fe / 0012 mouthpiece-fe / 0013 vellum-fe
copy both its **build-content → generated-modules → route-loader** structure **and** its **SSR-Compose-
behind-Caddy + client-RUM** deploy wiring. akasha-fe still consumes the akasha **build-time snapshot** as its
data source (Decision D), but serves it SSR (Decision I). The strider service + editor-server live in
`deploy/` Compose; Caddy reverse-proxies them.
