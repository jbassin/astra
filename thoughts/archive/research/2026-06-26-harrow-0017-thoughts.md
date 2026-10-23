---
date: 2026-06-26
subsystem: harrow
plan: 0017
status: scope (pre-spec)
source: /ruby/data/experiments/tarot
---

# Scope — harrow (0017): porting the tarot reader into astra

Pre-implementation research for migrating **harrow** (the repo at `/ruby/data/experiments/tarot`,
deployed page-title "Harrow") into astra as a first-class SSR frontend on the **strider template**.
Per the migration playbook (`thoughts/shared/guides/migrating-an-app-into-astra.md`) this is the
**Scope** gate: read the source, **verify every claim against the real repos**, and call out the
decisions to lock in the spec.

> One-line philosophy: a migration is a *port*, not a rewrite. harrow's parsing / draw / fortune /
> predicate logic is lifted ~verbatim; only the plumbing the ecosystem standardizes (config,
> telemetry, deploy, the frontend template, the design system) is reinvented.

This migration is **net-new post-cutover product work**, not a faerrin migration slice (the
faerrin→astra migration is COMPLETE per `[[astra-migration-research]]`). It reuses the exact
playbook the 0011–0013 frontends used.

---

## 1. What harrow is (verified against the source tree)

A small, self-contained **React 18 + Vite 5 + Tailwind v4** SPA — a custom tarot deck reader. No
backend, no router, no persistence, no network. State is one `useReducer` (`ReadingContext`) with a
`view` discriminant + an in-memory `currentReading`. Content is plain-text files loaded at build via
`import.meta.glob`.

**Content (verified file counts):**
- **24 `.card` files** across 4 deck directories: `aetheric` 5, `divine` 7, `diabolic` 6,
  `hierophant` 6 (`src/cards/<deck>/<id>.card`; deck = parent dir, id = filename).
- **1 `.spread` file** today (`src/spreads/2026-05-07.the-pilgrimage.spread`); the format supports
  many, sorted reverse-chronologically by the `YYYY-MM-DD.<slug>.spread` filename prefix.
- **`public/`** holds only `vite.svg` — there are **no image assets**; every card glyph is an inline
  SVG `path` in the `.card` file. (So there is **no audio/asset volume to seed** — unlike
  mouthpiece/akasha.)

**The real `.card` format** (verified — `number:` is present and was undocumented in the source
CLAUDE.md's field list at one point; it is the sort key):
```
number: IV                    # Roman numeral — sort key for DECK ordering
name: The Author
path: M8.083 8.5a2.084 ...     # optional: SVG `d` for the glyph
viewbox: 100                   # optional: numeric viewBox (some cards omit → default)
suit: major                    # optional: free-form, distinct from deck
tags: season:autumn, element:metal, gem:amethyst, flower:orchid   # optional, comma-sep `kind:value`
flavor: The chains are warm where the wrist has rested against them.
uprightMeaning: binding, chosen weight
reversedMeaning: loosening, open hand, release

--- upright
<fortune text>
---
--- reversed
<fortune text>
---
```
Required: `name`, `uprightMeaning`, `reversedMeaning`, `upright`/`reversed` blocks. The parser
(`src/lib/parseCard.ts`) throws a descriptive startup error on any missing required field; tags are
split on commas, trimmed, sorted. `deck` (dir) and `id` (filename) must **not** appear in the file.

**The real `.spread` format** (verified): `name` + five positions
(`foundation`/`challenge`/`past`/`future`/`outcome`, each `<card-id> <upright|reversed>`) +
`--- reading ---` block. Card ids are validated against `DECK` at load → unknown id throws.

**The tag / predicate engine** (verified against `src/lib/predicates.ts`, `src/data/predicates.ts`,
`src/lib/tags.ts`) — the load-bearing bit not in the original CLAUDE.md:
- Every card carries `tags: string[]` of `kind:value` (5 kinds: `season`, `element`, `gem`,
  `flower`, plus `deck:<dir>` auto-injected). `expandTag('element:fire')` → `['element:fire','element']`.
- **29 predicates** (verified count in `data/predicates.ts`) over 4 types: `haveTag(tag,count)`,
  `haveTags(...tags)` (≥1 of each), `and(...)`, `or(...)`. `matchedPredicate()` returns the **lowest-
  complexity** matching predicate (complexity = a combinatoric `choose()` rarity score), used to
  **name** a drawn reading (e.g. *Devil Rising*, *Frosted Outlook*, *Full Bloom*).
  - ⚠️ **The real predicate labels differ from the source CLAUDE.md / first survey** — the actual
    `data/predicates.ts` uses *Dissonant Pull*, *Devil Rising*, *Godhome Rising*, *Slip Rising*,
    *Mortal Rising*, *Allied Outlook*, *…Outlook* (season), etc. **The file is authoritative** — port
    labels verbatim from it, not from any prose summary.

**Interactivity (the product):**
- `src/lib/draw.ts` — `drawCards()` Fisher-Yates over `DECK`, 50/50 upright/reversed per card,
  positions from the spread; `createReading()` draws 5 + generates the fortune. Uses `Math.random()`.
- `src/lib/fortune.ts` — per-position template banks (`cross` template, 8 variants per position),
  random pick, interpolated with card name/meaning/text.
- `src/hooks/useCardReveal.ts` — sequenced reveal (`REVEAL_ORDER=[0,2,3,1,4]`, 500ms then 1000ms
  between) → `{revealed[], allRevealed}`.
- `src/components/` — `FlipCard` (3D flip), `CardFront`/`CardBack`/`Icon`/`CardName` (SVG glyph
  frame), `CardSpread` (circular geometry on desktop via `matchMedia`, vertical stack on mobile),
  `CardRow`/`FortuneDisplay`/`DrawButton`.
- `src/index.css` — bespoke design tokens (oklch void/brass), a 50-gradient **starfield**, the 3D-flip
  utilities (`.preserve-3d`/`.backface-hidden`/`.rotate-y-180`/`.perspective-1000`), a title shimmer,
  per-deck `--deck-color`.

**The four views** (the SPA switch, `src/App.tsx` + `ReadingContext`): `reading` (live draw),
`gallery` (encyclopedia of all 24), `spread` (features `CUSTOM_SPREADS[0]`), `spread-history` (all
curated spreads). NavBar dispatches `SET_VIEW`. **No localStorage, no backend, no `history`** —
verified: drawn readings are ephemeral; only the `.spread` files persist.

---

## 2. How it maps onto the astra strider template

harrow is structurally a sibling of **strider**: a standalone, backend-less, *interactive* frontend
(strider's interactivity is a pixi hex map; harrow's is the draw/flip/reveal). It is **not** a pure
read-surface like akasha/mouthpiece. The template absorbs it with one structural shift and one
content-pipeline swap:

| harrow today | astra (strider SSR template) |
|---|---|
| `import.meta.glob('../cards/*/*.card')` + `glob('../spreads/*.spread')` | build-time `scripts/build-content.ts` (`@astra/content-build`) → `src/generated/{cards,spreads}.ts` |
| `useReducer` `view` switch + NavBar dispatch | TanStack **routes**: `/`, `/gallery`, `/spreads`, `/spreads/history` |
| client-only SPA render | **SSR** shell; draw/flip/reveal/`matchMedia` hydrate client-side (`<ClientOnly>` / shell `useIsMobile`) |
| bespoke `index.css` (starfield, brass, Josefin/Barlow) | **gothic** theme + IBM Plex Mono (full re-skin, Decision A) |
| `Math.random()` draw + fortune | unchanged — runs **client-side only** (never during SSR) |
| `Dockerfile` + nginx + `upload.sh` | templated `ARG APP` Dockerfile + Compose unit + Caddy `harrow.iridi.cc` |
| no config | `harrow { service-name; port; public-origin }` in config.kdl (+ Zod + Pydantic) |
| no telemetry | `@astra/observe` via `createSsrServer` + browser RUM |

**Pure functions that port ~verbatim** (no rewrite): `parseCard`, `parseSpread`, `draw`, `fortune`,
`tags`, `predicates`, `data/predicates`, `decks`, `types/tarot`. These are the value; preserve them.

---

## 3. Verified facts (resolved now, not deferred)

- **Free port: `10369`.** Verified the assigned band from `config.kdl` + `docker-compose.yml`: 10350
  (Dagster UI), 10360 (strider), 10361 (weal-overlay), 10362 (weal PG), 10363 (orator-backend), 10364
  (orator PG), 10365 (akasha-fe), 10366 (mouthpiece-fe), 10367 (vellum-fe), 10368 (vellum-render),
  10353 (signoz collector host-publish). **10369 is the next free** → `harrow.port = 10369`.
- **Next free plan number: `0017`.** specs go …`0014-strider`, `0016-strider-hardening`; no 0017.
- **Deck identity colors (verified `src/data/decks.ts`):** hierophant `#f4a261`, divine `#7dd3fc`,
  diabolic `#fca5a5`, aetheric `#a78bfa` (label "Ætheric"). These are **content/identity** colors (4
  semantic hues), not chrome. → map them onto gothic's **identity** mechanism (`identityStyle` /
  `IDENTITY_COLOR_VAR`, the same seam strider uses for faction colors), NOT onto a fixed gothic token.
  This keeps the full gothic re-skin (Decision A) while preserving the four deck hues as the one
  bespoke accent dimension. *(Confirm in spec: keep the exact 4 hex values, or re-pick within gothic's
  palette. Recommendation: keep the 4 hues — they're the deck taxonomy, like faction colors.)*
- **gothic tokens available** (verified `libs/ts/gothic/src/theme.css`): `--color-void/panel/
  elevated/hover`, `--color-ink/ink-dim/ink-faint`, `--color-accent` (teal), `--color-accent-amber`,
  `--color-rule/rule-bright`, parchment family, `--color-wax`, `--color-gold-leaf`. Font is IBM Plex
  Mono (`@fontsource/ibm-plex-mono`). These cover harrow's chrome; the starfield/brass/Josefin/Barlow
  are dropped (Decision A).
- **Template versions** (verified `apps/strider/package.json`): React **19**, `@tanstack/react-router`
  1.170, `@tanstack/react-start` 1.168, vite **6**, vitest 3, `@tailwindcss/vite` 4. → harrow's
  React-18 components port to React 19 (trivial); no class components, no legacy context.
- **Shell helpers already exist**: `src/lib/useIsMobile.ts` (replaces harrow's bespoke `matchMedia`
  in `CardSpread`), `src/components/ClientOnly/`, `src/components/SiteHeader/` (the nav seam).
- **The 3D-flip CSS is the one bespoke style that MUST survive the re-skin** — `.preserve-3d`,
  `.backface-hidden`, `.rotate-y-180`, `.perspective-1000` are behavioral (gothic has no card-flip
  primitive). Carry them into `globals.css` **inside `@layer`** so they don't fight gothic, and fold
  in harrow's open **Safari `-webkit-` fix** (`plans/2026-05-07-safari-card-flip-fix.md`, currently
  *unapplied* in the source) while porting.

---

## 4. SSR / hydration seams (the load-bearing porting risks)

harrow is currently client-only; SSR + hydration introduces three seams that MUST be handled or
they cause hydration mismatches / SSR crashes:

1. **The random draw** (`Math.random()` in `draw.ts`/`fortune.ts`) must run **only after hydration**
   (in an effect / event handler), never in the SSR render. The `/` route SSRs an idle "draw" shell;
   the first reading is generated client-side on mount (or on the Draw button). Mirrors strider's
   pixi map (SSR renders the container, the canvas hydrates).
2. **`CardSpread` responsive layout** uses `window.matchMedia` → swap to the shell `useIsMobile`
   (SSR-safe, returns a stable default server-side then corrects on hydrate) or wrap the spread in
   `<ClientOnly>`. Avoids the desktop-circle-vs-mobile-stack hydration mismatch the first survey
   flagged.
3. **Reveal timers** (`useCardReveal` `setTimeout`) are client effects already — fine under SSR as
   long as initial `revealed` state is deterministic (all-false) on both server and client.

The **static views** (`/gallery`, `/spreads`, `/spreads/history`) have **no randomness** and SSR
cleanly from the generated content — they need no `<ClientOnly>` (the flip cards there render in an
always-revealed state). This is why the slice plan builds static views before the interactive draw.

---

## 5. Decisions ledger

**Locked (user-confirmed 2026-06-26 + template-mandated):**
- **A — Visual: full gothic re-skin.** Drop starfield / brass oklch palette / Josefin+Barlow → gothic
  theme + IBM Plex Mono, like akasha/mouthpiece. Card *structure & behavior* (3D flip, SVG glyph
  frames, circular spread, reveal sequencing) ports unchanged; only colours/typography/surfaces are
  re-toned. The 4 deck hues survive as **identity** colours (§3).
- **B — Identity: `harrow` / `harrow.iridi.cc`.** Bare app name (like strider — backend-less
  frontend), `service-name = "astra.harrow"`, RUM `astra.harrow-rum`.
- **C — Content model: build-time generated modules.** `.card`/`.spread` parsed at build →
  `src/generated/{cards,spreads}.ts`; runtime never touches the filesystem. Predicates/draw/fortune
  are pure TS in `src/domain/`.
- **D — Interactivity hydrates client-side** (§4). SSR by default, no `prerender` (Decision I).
- **E — Views → routes** (`/`, `/gallery`, `/spreads`, `/spreads/history`).
- **F — No backend / no persistence.** Readings ephemeral; `.spread` files the only durable history.
  No DB, no Compose backend, **no asset volume** (glyphs are inline SVG).

**To lock in the spec (recommendations noted):**
- **G — Deck colours:** keep the exact 4 hex hues as identity vars (recommended) vs. re-pick within
  gothic. → *keep them.*
- **H — Route shape for spreads:** `/spreads` (featured = most-recent) + `/spreads/history` (all) vs.
  a single `/spreads` listing. → *keep harrow's two-view split as two routes* (matches source).
- **I — Fortune/predicate parity gate:** assert generated `DECK` (24, sorted, all fields) byte-equals
  the source-parsed deck, and that `matchedPredicate` over the 29 predicates is preserved (snapshot a
  set of hand-drawn card sets → expected predicate label). → *include both as CI gates.*
- **J — Safari flip fix:** apply the unapplied source fix during the port (recommended) — confirm.

---

## 6. Proposed slice plan (each CI-green; commit-per-slice, push-per-chunk)

1. **Scaffold the shell.** `apps/harrow` from strider (server.ts, vite.config, Dockerfile, router,
   observe/RUM, ClientOnly/SiteHeader, lib, styles, ssrSmoke). `harrow { service-name "astra.harrow";
   port 10369; public-origin "https://harrow.iridi.cc" }` mirrored in config.kdl + Zod
   (`libs/ts/config`) + Pydantic (`libs/py/config`). Add `apps/harrow` to `pyproject.toml` uv
   `exclude`. SSR smoke green.
2. **Content pipeline + parity gate.** Copy the 24 `.card` + `.spread` into `content/`; port
   `parseCard`/`parseSpread` into `scripts/build-content.ts`; emit `src/generated/{cards,spreads}.ts`
   (+ `decks`). **Gate (I):** generated deck == source-parsed deck (24, Roman-numeral sort, all fields).
3. **Domain logic + unit tests.** Lift `draw`, `fortune`, `tags`, `predicates`, `data/predicates`,
   `types/tarot` into `src/domain/lib/` verbatim. Tests: `matchedPredicate` over the 29 predicates
   (lowest-complexity selection) + fortune-template interpolation (satisfies the ≥1-test rule + gate I).
4. **Static views, gothic-skinned.** `/gallery`, `/spreads`, `/spreads/history` + nav. Port
   CardRow/CardFront/CardBack/Icon/CardName/FortuneDisplay re-toned to gothic; `globals.css` with the
   `@layer base` reset (THE cross-cutting gotcha) + the flip utilities (Safari fix, J). SSR-renderable
   (no randomness). Deck hues as identity vars (G).
5. **Interactive reading.** `/` draw→flip→reveal. Port FlipCard + CardSpread (circle geometry) +
   useCardReveal + route-local reading state; draw/reveal/`useIsMobile` client-side behind
   `<ClientOnly>` (§4). Predicate-named title (shimmer → a gothic accent treatment).
6. **Deploy.** Templated Dockerfile (all app manifests + `ontology/`); Compose `harrow` @10369 (no
   PORT env, healthcheck, restart unless-stopped); Caddy `harrow.iridi.cc` block (import `astra_site`,
   reverse_proxy; fonts self-serve). `just up` → curl `/` + the four routes + verify a
   `service.name=astra.harrow` SSR span via the SigNoz MCP.

**Spec-sanctioned deferrals:** public DNS for `harrow.iridi.cc` + `caddy-reload` (outward-facing,
manual — like every prior frontend's edge step). Decommission of the existing standalone tarot deploy
(`reg.iridi.cc/tarot`, `upload.sh` → saffron) is a separate teardown once harrow.iridi.cc is live.

---

## 7. Acceptance gate (definition of done)

- Behaviour ported verbatim (parse/draw/fortune/predicate labels from the source files, not summaries);
  no silent scope cuts.
- Generated-deck parity gate green (24 cards, all fields, sort) + predicate-selection test green.
- All config in config.kdl via `@astra/config`/`astra_config`, mirrored in both schemas; no env reads,
  no hardcoded port/name.
- Telemetry wired in `server.ts`; `service.name=astra.harrow` SSR spans land in SigNoz (MCP-verified);
  browser RUM posts to the public endpoint.
- SSR — no prerender; `routeTree.gen.ts` committed; `@tailwindcss/vite` wired; `public/` shipped;
  fonts self-serve; the draw/flip behind `<ClientOnly>`; consumes `@astra/site-kit` + `@astra/content-build`.
- Both CI lanes green locally; biome clean on the whole repo; app in uv `exclude`.
- Deploy wired (Dockerfile / Compose / Caddy); live-verified after `just up`; DNS deferred.
- Memory updated with load-bearing gotchas; RESUME current-state updated; committed per-slice + pushed.

---

## 8. Open questions for the spec (none blocking)

1. **G/H/J** above — recommendations given; confirm at spec time.
2. **Starfield** — fully dropped under Decision A. If any atmospheric background is wanted, it would be
   a gothic-toned surface treatment, not the bespoke 50-gradient starfield. (Default: plain gothic
   `--color-void` background.)
3. **Title shimmer** on a matched predicate — re-express as a gothic accent (e.g. `--color-accent`
   sweep) or drop the animation. (Default: keep a subdued gothic-accent treatment.)
4. **Existing `tarot` deploy teardown** — confirm we decommission `reg.iridi.cc/tarot` on saffron once
   harrow.iridi.cc serves (mirrors the faerrin edge decommissions). Sequenced after go-live.

*Next gate: author `thoughts/astra/specs/0017-harrow-spec.md` (octo:spec) — lock A–F + G–J, the slice
list, and the acceptance gate above.*
