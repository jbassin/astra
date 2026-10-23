# NLSpec 0017 — harrow (the tarot deck reader)

**Status:** **DONE — all 6 slices BUILT + PUSHED + LIVE ON THE PUBLIC EDGE** (`1aa0c81`(s1)…`a2c9a5e`(s6)
+ edge cutover `4b3ad33`, 2026-06-26). Serving on **`https://harrow.iridi.cc`** (host takeover — DNS
pre-existed from the old deploy); `/` (client-only draw), `/gallery`, `/spreads`, `/spreads/history` all
SSR 200; `service.name=astra.harrow` SSR spans land in SigNoz (0 errors). Both parity gates green (deck
golden + 29 predicate labels). Full gothic re-skin; deck hues via identityStyle. **Only open item:** the
old standalone deploy's container still runs unrouted on `localhost:10204` (teardown awaiting go-ahead). Minor
in-build regrouping: `/spreads` + `/spreads/history` landed in slice 5 (grouped by the FlipCard dependency),
not slice 4 — no scope cut. Gotchas in [[harrow-0017-gotchas]]. Net-new post-cutover product work (the
faerrin→astra migration is COMPLETE per [[astra-migration-research]]); this reused the 0011–0013 frontend
playbook to bring an external app into astra. Scope gate COMPLETE
([`../../shared/research/2026-06-26-harrow-0017-thoughts.md`](../../shared/research/2026-06-26-harrow-0017-thoughts.md),
commit `67439da`) — every load-bearing fact verified against the real repos. This spec carries the user-locked
decisions **A–F** (2026-06-26) and **settles G–J** below.
**Source app:** `/ruby/data/experiments/tarot` (deployed page-title "Harrow") — React 18 + Vite 5 + Tailwind v4
SPA; standalone, no backend, no persistence.
**Process:** octo:spec → octo:embrace, Claude team mode (typescript-pro, frontend-developer, code-reviewer),
per astra `CLAUDE.md`.
**Depends-on:** `0003` gothic (Tailwind v4 theme + IBM Plex Mono + `identityStyle`), Phase 1 (`@astra/config`,
`@astra/observe`+`/web`), `0014`/`0016` strider (the SSR template + `@astra/site-kit` + `@astra/content-build`
+ the hardened shell), and the migration playbook
[`../../shared/guides/migrating-an-app-into-astra.md`](../../shared/guides/migrating-an-app-into-astra.md).
**Phase:** post-6 (net-new frontend). A **backend-less interactive frontend** — a sibling of strider, not a
read-surface like akasha/mouthpiece. The smallest net-new app since the migration: 24 cards, 4 routes, pure
domain logic, **no DB / no asset volume / no backend asset** (every card glyph is inline SVG).

## Goal

Rebuild **harrow** (the tarot deck reader) as a first-class astra citizen: a **TanStack Start SSR** site on the
strider template that draws custom tarot readings (Fisher-Yates draw + 50/50 orientation + per-position fortune
templates + a tag-predicate that *names* the reading), browses the 24-card deck, and surfaces curated `.spread`
readings — all behind a **full gothic re-skin** (Decision A) and served at **`harrow.iridi.cc`**.

Like every astra migration this is a **behaviour port, not a rewrite**: lift harrow's `parseCard`/`parseSpread`/
`draw`/`fortune`/`tags`/`predicates`/`decks`/`types` **verbatim** (they are pure functions and they are the
value); reinvent only the plumbing astra standardizes — the content pipeline (`import.meta.glob` →
build-time generated modules), config, telemetry, deploy, and the design system. The genuinely new work is
**SSR-ifying a client-only SPA** (three hydration seams, §Risks) and the **gothic re-skin**.

## Decisions in force (A–F locked with the user 2026-06-26; G–J settled here)

| # | Decision | Choice |
|---|----------|--------|
| I (roadmap) | Frontend hosting | **SSR Compose service behind Caddy** (client RUM) — **no `prerender` block**. |
| **A** | **Visual treatment** | **LOCKED: full gothic re-skin.** Drop harrow's bespoke `index.css` — the 50-gradient **starfield**, the brass/void **oklch palette**, and the **Josefin Sans + Barlow** fonts — for the gothic theme + IBM Plex Mono, like akasha/mouthpiece. Card *structure & behaviour* (3D flip, SVG glyph frames, circular spread geometry, reveal sequencing) ports **unchanged**; only colours/typography/surfaces are re-toned to gothic tokens. |
| **B** | **App identity** | **LOCKED: `harrow` / `harrow.iridi.cc`.** Bare app name (like strider — a backend-less frontend), `service-name = "astra.harrow"`, browser RUM `astra.harrow-rum`, port **10369**. |
| **C** | **Content model** | **LOCKED: build-time generated modules.** The 24 `.card` + the `.spread` file(s) parse at build (`scripts/build-content.ts` via `@astra/content-build`) → `src/generated/{cards,spreads}.ts`. Runtime never touches the filesystem; `import.meta.glob` is gone. Predicates/draw/fortune/tags are pure TS in `src/domain/`. |
| **D** | **Interactivity** | **LOCKED: hydrates client-side.** SSR renders a static shell; the `Math.random` draw, flips, reveal timers, and responsive layout run **only after hydration** (behind `<ClientOnly>` / the shell `useIsMobile`), never during SSR — mirrors strider's pixi map. |
| **E** | **Views → routes** | **LOCKED:** the `useReducer` `view` switch becomes four routes: `/` (draw/reading), `/gallery`, `/spreads` (featured = most-recent), `/spreads/history` (all). NavBar → the shell `SiteHeader`. |
| **F** | **No backend / no persistence** | **LOCKED:** drawn readings stay ephemeral in-memory; the curated `.spread` files are the only durable history. **No DB, no Compose backend, no asset volume, no `createServerFn` for data** (the only server fn is the RUM-config seam). |
| **G** | **Deck colours** | **SETTLED: keep the four exact hues as identity colours.** hierophant `#f4a261`, divine `#7dd3fc`, diabolic `#fca5a5`, aetheric `#a78bfa` (label "Ætheric") are the deck **taxonomy**, not chrome — carry them verbatim and apply via gothic's **`identityStyle` / `IDENTITY_COLOR_VAR`** seam (the same mechanism strider uses for faction colours). This is the one bespoke accent dimension the full re-skin preserves; everything else is gothic tokens. |
| **H** | **Spread route shape** | **SETTLED: two routes, matching the source two views.** `/spreads` renders `CUSTOM_SPREADS[0]` (the featured most-recent, the source `spread` view); `/spreads/history` lists all (the source `spread-history` view). |
| **I** | **Parity gates** | **SETTLED: two CI gates.** (1) **Deck parity** — generated `DECK` byte-equals the source-parsed deck (24 cards, Roman-numeral sort, all fields incl. `tags`/`path`/`viewbox`/`suit`/`flavor`). (2) **Predicate selection** — a fixture of hand-built drawn-card sets → expected `matchedPredicate` **label** (the authoritative 29 labels from `data/predicates.ts`, lowest-complexity selection). |
| **J** | **Safari flip fix** | **SETTLED: apply it during the port.** harrow's `plans/2026-05-07-safari-card-flip-fix.md` (`-webkit-` prefixes on the 3D-transform utilities) is currently **unapplied in the source**; fold the fix into `globals.css` while porting the flip utilities. |

## Scope (in)

1. **`apps/harrow`** — a new bun-workspace SSR frontend scaffolded from strider's shell (`server.ts`,
   `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `Dockerfile`, `scripts/generate-routes.ts`,
   `src/router.tsx`, `src/observe/{rum,rumConfig}.ts`, `src/components/{ClientOnly,SiteHeader}`,
   `src/lib/{useIsMobile,useFocusTrap}.ts`, `src/styles/`, `src/ssrSmoke.test.ts`). Thin `server.ts`/
   `vite.config.ts` driven by config (`--configLoader runner`).
2. **Content pipeline** — `content/cards/<deck>/*.card` + `content/spreads/*.spread` (copied from the source);
   `scripts/build-content.ts` ports `parseCard`/`parseSpread` and emits `src/generated/{cards,spreads}.ts`
   (+ deck registry) via `@astra/content-build` (`defineContentSource`/`buildContent`/`emitModule`),
   gitignored. Deck parity gate (I.1).
3. **Domain logic** (`src/domain/lib/`) — `draw.ts`, `fortune.ts`, `tags.ts`, `predicates.ts`,
   `data/predicates.ts`, `decks.ts`, `types.ts` lifted **verbatim** (import paths re-pointed from `@/data/cards`
   → the generated module). Predicate-selection gate (I.2) + fortune-template tests.
4. **Static views (gothic-skinned)** — routes `/gallery`, `/spreads`, `/spreads/history` + the nav; the
   non-random components (`CardRow`, `CardFront`, `CardBack`, `Icon`, `CardName`, `FortuneDisplay`) re-toned to
   gothic. `globals.css`: the `@layer base` reset (THE cross-cutting gotcha) + the flip utilities (with the
   Safari fix, J). Deck hues as identity vars (G). These SSR cleanly (no randomness).
5. **Interactive reading** — route `/`: draw → flip → reveal. `FlipCard` + `CardSpread` (circular geometry) +
   `useCardReveal` + route-local reading state (the source reducer collapses into one route's state). Draw/
   reveal/`useIsMobile` run client-side behind `<ClientOnly>`. The predicate-named reading title (the source
   shimmer → a subdued gothic-accent treatment). "Draw Again" re-draws.
6. **Config** — a `harrow { service-name "astra.harrow"; port 10369; public-origin "https://harrow.iridi.cc" }`
   namespace in `ontology/ontology-config/config.kdl`, mirrored in **both** `libs/ts/config` (Zod) and
   `libs/py/config` (Pydantic) schemas (`.strict()` / `extra="forbid"`). No env reads; no hardcoded port/name.
7. **Telemetry** — `@astra/observe` via `createSsrServer` (a span per SSR request + SIGTERM/SIGINT flush);
   browser RUM via the `rumConfig` `createServerFn` + the `__root` dynamic-import. `service.name=astra.harrow`.
8. **Deploy** — templated `ARG APP` Dockerfile (COPY all app manifests + `ontology/ontology-config`); Compose
   `harrow` service @10369 (no PORT env, healthcheck, `restart: unless-stopped`); Caddy `harrow.iridi.cc`
   block (`import astra_site` + `reverse_proxy localhost:10369`; fonts self-serve). `apps/harrow` added to
   `pyproject.toml` `[tool.uv.workspace] exclude`. `just up` + live-verify.

## Scope (out)

- **No DNS / `caddy-reload`** of the public edge (outward-facing, manual — deferred like every prior frontend).
  The Caddy block is authored + `caddy-validate`-clean; `harrow.iridi.cc` DNS + reload is the user's go-live step.
- **No teardown** of the existing standalone `tarot` deploy (`reg.iridi.cc/tarot` + `upload.sh` → saffron) in
  this spec — a separate, sequenced decommission once `harrow.iridi.cc` serves (noted in Hand-off).
- **No backend, no DB, no asset volume, no persistence** (Decision F — matches the source; not a cut).
- **No new card/spread content** — port the existing 24 cards + 1 spread verbatim; authoring more is later
  content work (the pipeline supports it with zero code change).
- **No starfield / Josefin+Barlow / brass palette** — dropped under Decision A.

## Locked technical decisions

- **SSR, no prerender** (Decision I); commit `src/routeTree.gen.ts` (biome-ignored); `@tailwindcss/vite` wired;
  ship `public/` (favicon); fonts self-serve via `gothicFontsPlugin({ clientOutDir })`.
- **`--configLoader runner`** on vite `dev`/`build` (mandatory — `vite.config.ts` imports `@astra/site-kit`).
- **`verbatimModuleSyntax: false`** in the frontend tsconfig (Start bundling).
- **`loadSiteConfig()`** (node-safe locator) in `vite.config.ts`; **`loadConfig().harrow`** in `server.ts`.
- **`createServerFn` only in app source** (`src/observe/rumConfig.ts`) — none in a shared lib.
- **OTLP endpoint** = the in-cluster collector name (`http://signoz-otel-collector:4318`), never `localhost`;
  the browser RUM endpoint is the public Caddy URL.
- **Random/flip/reveal client-only** (Decision D) — the SSR render must be deterministic (no `Math.random`,
  no `window`/`matchMedia` in the server path).
- **Deck colours via `identityStyle`** (Decision G) — not a fixed gothic token, not inline hex in components.

## Acceptance criteria (exit gate)

- [ ] Behaviour ported verbatim from the **source files** (parse/draw/fortune; predicate **labels** from
      `data/predicates.ts`, not any prose summary); no silent scope cuts.
- [ ] **Deck parity gate (I.1) green** — generated `DECK` == source-parsed deck (24, sorted, all fields).
- [ ] **Predicate-selection gate (I.2) green** + fortune-template tests; every new TS package has ≥1 test.
- [ ] All four routes (`/`, `/gallery`, `/spreads`, `/spreads/history`) SSR + hydrate; the draw produces a
      reading client-side; flips + reveal sequence run; a matched predicate names the reading.
- [ ] Full gothic re-skin: no starfield/brass/Josefin; gothic tokens + IBM Plex Mono; the four deck hues
      survive as identity colours; the `@layer base` reset is in place; flip utilities carry the Safari fix.
- [ ] All config in `config.kdl` via `@astra/config`/`astra_config`, mirrored in both schemas; no env reads,
      no hardcoded port/name; `apps/harrow` in uv `exclude`.
- [ ] Telemetry wired in `server.ts`; `service.name=astra.harrow` SSR spans land in SigNoz (MCP-verified);
      browser RUM posts to the public endpoint.
- [ ] Both CI lanes green locally; `bunx biome ci .` clean on the **whole repo**; `routeTree.gen.ts` committed.
- [ ] Deploy wired (templated Dockerfile / Compose @10369 no-PORT-env / Caddy block); **live-verified after
      `just up`** (curl `/` + the four routes + a SigNoz span). DNS deferred.
- [ ] Memory updated with the load-bearing gotchas; RESUME current-state updated; committed per-slice + pushed.

## Slices (each CI-green → one commit; push on chunk completion)

1. **Scaffold the shell** — `apps/harrow` from strider; the `harrow` config namespace in all three schemas;
   uv `exclude`; SSR smoke green (empty app boots, `service.name=astra.harrow`).
2. **Content pipeline + parity gate** — copy `.card`/`.spread` into `content/`; port the parsers into
   `scripts/build-content.ts`; emit `src/generated/{cards,spreads}.ts`; **gate I.1 green**.
3. **Domain logic + tests** — lift draw/fortune/tags/predicates/decks/types into `src/domain/lib/`; **gate I.2
   green** + fortune-template tests.
4. **Static views, gothic-skinned** — `/gallery` + `/spreads` + `/spreads/history` + nav; gothic re-skin of the
   non-random components; `globals.css` (`@layer base` reset + flip utils + Safari fix); deck identity vars.
5. **Interactive reading** — `/` draw→flip→reveal behind `<ClientOnly>`; predicate-named title.
6. **Deploy** — Dockerfile/Compose/Caddy; `just up` + live-verify; DNS deferred.

(Slices 4–5 may split further if a slice grows large; keep each CI-green.)

## Risks

1. **SSR/hydration mismatch (the load-bearing risk).** The source is client-only. Three seams must be
   client-gated or they crash SSR / mismatch on hydrate: (a) the **`Math.random` draw + fortune** — generate
   the first reading in a mount effect / on the Draw button, never in the SSR render; (b) **`CardSpread`'s
   `window.matchMedia`** — swap to the shell `useIsMobile` (SSR-stable default → corrects on hydrate) or wrap
   in `<ClientOnly>`; (c) **`useCardReveal` timers** — keep initial `revealed` all-false on both server +
   client. *Mitigation:* build the static, randomness-free views (slice 4) before the interactive draw (slice
   5); reuse strider's proven `<ClientOnly>` + `useIsMobile`.
2. **Predicate-label drift.** The real `data/predicates.ts` labels differ from the source CLAUDE.md / prose
   summaries (*Devil Rising* not *Diabolic Rising*, etc.). *Mitigation:* port labels from the file; the
   I.2 fixture pins them.
3. **gothic re-skin scope creep.** "Full re-skin" must not bleed into rewriting the *behavioural* card
   components (flip/spread/reveal) — only their styling changes. *Mitigation:* keep the component structure
   verbatim; change classes/tokens only; the deck hues stay (G).
4. **New workspace member ripples.** Adding `apps/harrow` re-runs `bun install` (can bump tools within
   semver) and breaks `--frozen-lockfile` in any Dockerfile copying a partial manifest set. *Mitigation:*
   reproduce CI with `bunx biome ci .` over the whole repo; COPY all app manifests in the Dockerfile; add to
   uv `exclude`.
5. **Deck-colour-as-token temptation.** Inlining the four hex values in components (instead of `identityStyle`)
   would scatter them and break the single-source intent. *Mitigation:* route all four through the gothic
   identity seam (G).

## Hand-off

- **Implement** with octo:embrace against this spec, slice-by-slice; reproduce both CI lanes locally before
  pushing (`bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build`;
  the py lane only needs `ruff`/`ty`/`pytest` for the config-schema mirror). Don't watch the GHA run.
- **Deploy** is user-triggered/outward-facing: `just up` (or `docker compose up -d --build harrow`) +
  live-verify; the **`harrow.iridi.cc` DNS record + `caddy-reload`** are the manual go-live step (deferred).
- **After go-live:** decommission the standalone `tarot` deploy (`reg.iridi.cc/tarot` + the saffron container +
  `upload.sh`), mirroring the faerrin edge decommissions — a separate, sequenced step.
- **On completion:** write `thoughts/shared/memory/harrow-0017-gotchas.md` (+ MEMORY.md pointer) with the
  load-bearing gotchas (the three hydration seams, the predicate-label authority, the deck-identity seam,
  the new-member ripple), and update RESUME current-state.
