# 0003 gothic — pre-implementation thoughts

**Date:** 2026-06-19. **Author:** Claude (session resume). **Status:** analysis → awaiting J-fork
confirmation before NLSpec. **Plan:** [`thoughts/astra/plans/0003-gothic.md`](../../astra/plans/0003-gothic.md).
**Renders:** the `@astra/vellum-lang` AST (0004) — see [`0004-vellum-lang-spec.md`](../../astra/specs/0004-vellum-lang-spec.md)
+ `libs/ts/vellum-lang/MARKDOWN.md`.

## What 0003 actually is

Grow faerrin's `gothic` (pure-CSS skin) into astra's TS UI framework = **four layers** in
`libs/ts/gothic` (bun/React 19): (1) tokens as a Tailwind preset, (2) primitives (grow-as-consumed),
(3) **the vellum AST→React renderer** (lifted + extended), (4) a component dev env + visual-regression
surface. The renderer is the heart — it's the 0004 exit gate ("gothic renders that AST").

## The AST contract to render (frozen, from 0004 `model.ts`)

`VellumDocument { frontmatter: Frontmatter, mode: ThemeMode, nodes: VellumNode[] }`

- `VellumNode = VellumBlock | VellumProse | VellumColumns | VellumFields | VellumTimeline`
- `VellumBlock` — `:::kind` card; kind ∈ {statblock, hazard, item, spell, handout, edict};
  `{ attributes, label?, labelNodes?, children: RootContent[] }`.
- `VellumProse` — loose top-level markdown run (`children: RootContent[]`).
- `VellumColumns` — `{ attributes, columns: VellumNode[][] }` (recursive).
- **NEW** `VellumFields` — `{ items: { term: string, value: PhrasingContent[] }[] }`.
- **NEW** `VellumTimeline` — `{ entries: { marker?: string, children: RootContent[] }[] }`.
- **NEW** inline `CrossRef` — `{ type:"crossref", target, alias?, heading? }` in PhrasingContent.
  gothic renders it as a link/placeholder; it does **not** resolve targets (akasha-backend 0007).
- `Frontmatter` — `{ title?, tags[], aliases[], img?, extra }`. Render title/tags as page header.

The 4 NEW things vs the faerrin renderer: `:::fields`, `:::timeline`, `crossref`, frontmatter.

## Lift inventory (faerrin `pkg/vellum/src/render/` → `libs/ts/gothic`)

| faerrin file | action |
|---|---|
| `mdastToReact.tsx` (`renderNodes`/`collectText`/`renderDirective`) | **lift**; ADD a `crossref` case in `renderNode` |
| `glyphs/actions.tsx` (`ActionGlyph`, `normalizeActionCost`) | **lift verbatim** — inline SVG, never icon font (AD-7: fonts blank in PNG export) |
| `components/{StatCard,ProseCard,TraitPill,Redaction,ErrorChip}.tsx` | **lift** |
| `components/DocumentView.tsx` | **lift**; ADD `fields`/`timeline` cases to `Node`; render frontmatter header; keep `[data-vellum-export]` boundary + `data-mode` skin axis |
| `components/grimeStyle.ts` + `seed.ts` (FNV-1a hash → deterministic grime) | **lift verbatim** — keeps goldens stable |
| `blocks.module.css` (~11KB: card/header/traits/prose/columns/diegetic/grime/redaction) | **lift**; ADD `.fields` + `.timeline` rules. *(CSS Modules — see Fork B)* |
| `model.ts` types | **already in `@astra/vellum-lang`** — import from there, don't re-declare |
| `parse.ts`/`surface.ts`/`vss.ts`/`format.ts` | **already lifted into 0004** — gothic imports `@astra/vellum-lang`, never parses |

New components to write: `Fields` (term/value `<dl>`-ish), `TimelineBlock` (marker + entry), `CrossRef`
(link/placeholder), `Frontmatter`/page-header. `tag=` aliases unchanged.

## Seams (who owns what)

- **gothic owns:** framework palette + tokens, primitives, the renderer (AST→React), action glyphs, the
  mechanical/diegetic theme axis, `[data-vellum-export]`.
- **ontology-being owns (I5):** per-player/host identity color **values** (`Player.color`, `WealHost.color`,
  `guest_color` — already in `libs/ts/ontology`). gothic applies them as **runtime CSS vars**
  (`--identity-color`), referenced via arbitrary values; never a static preset token. Fall back visibly on
  a missing color, don't crash.
- **vellum-lang owns:** the parser/AST (0004). gothic renders, never parses.
- **frontends (0011–0014, vellum-frontend) own:** page composition; extend gothic's preset, import gothic.

## Genuine forks — DECIDED (2026-06-19, with user)

- **A → Tailwind v4** (CSS-first `@theme`; frontends `@import` gothic's theme CSS).
- **B → Rewrite the renderer to Tailwind utilities** (full J1 purity; no `blocks.module.css`). Consistent
  with C: the golden-churn risk that argued for lifting CSS verbatim is removed by deferring PNG goldens.
  Grime/diegetic effects expressed via utilities + `data-[mode=diegetic]:` variants + runtime CSS vars.
- **C → Storybook node-gallery is the exit gate; PNG goldens deferred to vellum-frontend** (where the
  Playwright render service lives). No new pinned-container CI job this phase.
- **D → Storybook** (8 + Vite, React 19); a Storybook test-runner pass is the CI smoke.

## Genuine forks (original analysis + recommendations)

### Fork A — Tailwind v3 (JS preset) vs v4 (CSS `@theme`)
The plan says "a `gothic/tailwind-preset` that frontends extend" — that's **v3**'s mental model (a JS
`preset` object). **v4** dropped JS presets for CSS-first `@theme {}` + `@import` (frontends `@import`
gothic's theme CSS). v4 is current and dovetails with "CSS vars stay the runtime source" + the runtime
identity-color seam. v3 is what the plan's wording assumes and has the more mature ecosystem.
**Lean v4** (current, CSS-native tokens), but the plan's "preset" language reads v3 — user's call.

### Fork B — Renderer styling: lift `blocks.module.css` (CSS Modules) vs rewrite to Tailwind utilities
J1 says "components styled with utilities." But the renderer's ~11KB CSS (grime transforms, diegetic
drop-cap/parchment, action-pip geometry, redaction bar) is proven and **pins the visual-regression
goldens**. Rewriting it to utilities is large, error-prone, and risks every golden. **Strong rec:** ship
the **Tailwind preset for tokens + the primitives layer** (honoring J1), but **lift the renderer's CSS
Modules verbatim** (reading the same token CSS vars). J1 = "tokens as a preset" is satisfied; the renderer
stays the proven CSS. Confirm this scoping — it's the biggest risk lever.

### Fork C — Visual regression: stand it up in gothic now vs defer to vellum-frontend
faerrin's golden harness (`pkg/vellum/scripts/visual-regression.ts`) needs **Playwright + a Vite-built
`render.html` + a pinned CI container** — it lived in the *app*, not the lib. Per 0003 §8 the Playwright
**render service is vellum-frontend's job**, yet §6/exit-criteria want goldens "in gothic's CI." Phase-0
CI has **no** visual-regression job and no pinned container. Options: **(C1)** gothic's exit gate =
**Storybook stories for every AST node** (the real "gothic renders that AST" smoke) + a lightweight
Storybook test-runner/snapshot pass in CI; **defer PNG goldens to vellum-frontend** (which owns the render
service). **(C2)** stand up a minimal Playwright golden harness + pinned-container CI job in gothic now.
**Lean C1** (don't duplicate the render service; goldens belong where the service lives), with the node-gallery
stories as the binding exit gate this phase. If C2, I'd need to add a pinned-container CI job + Playwright.

### Fork D — Storybook vs Ladle (J5)
Plan recommends Storybook unless build speed bites. Storybook 8 (Vite) is standard + has the better
snapshot/test-runner story (ties to Fork C). Ladle is Vite-native + much faster/lighter for a pure
component gallery. **Lean Storybook** per the plan (esp. if C1 leans on its test-runner), but Ladle is the
leaner fit for a lib that only needs a node gallery.

## Proposed work breakdown (post-confirmation)
1. Scaffold `libs/ts/gothic` (bun/React 19; package.json mirroring vellum-lang; tsconfig; deps).
2. Tokens → Tailwind preset (Fork A); bundle IBM Plex Mono (`@fontsource/ibm-plex-mono`); port the 3
   gothic CSS files (tokens/fonts/index) + the 5 font binaries.
3. Identity-color seam: a small helper applying ontology-being colors as runtime CSS vars (I5).
4. Primitives (grow-as-consumed): typography scale, panel/card, columns/grid, button/input.
5. Renderer: lift the table above into `libs/ts/gothic/src/render/`; ADD crossref/fields/timeline/
   frontmatter; rewrite `.ts` import extensions (astra drops them); scope a `biome.json` override for any
   lifted-file `arr[i]!` non-null assertions (the vss.ts override pattern).
6. Dev env (Fork D): stories for every primitive + **each vellum AST node** (the exit gate).
7. Visual regression (Fork C): per the chosen option.
8. Verify all CI lanes locally; code-reviewer subagent; small conventional commits; push; update spec
   status + MEMORY.

## CI / pins notes
- Phase-0 CI: path-filtered py/ts lanes; ts lane = `tsc` + `biome ci` + `bun test` + `bun build`. gothic
  drops in as a `libs/ts/*` member; no workflow change needed **unless** Fork C → C2 (then a new job +
  pinned container). React 19, vite 8, biome 2.x, tsc strict per repo pins.
- gothic adds the first React + JSX + Tailwind to astra's TS lane — confirm `tsconfig.base.json` `jsx`
  setting + add `@types/react`. (faerrin used `"jsx": "react-jsx"`.)
- `bun build` script: vellum-lang uses a no-op echo; gothic likely same (lib, no bundle) unless the
  Storybook/preset build needs one.
