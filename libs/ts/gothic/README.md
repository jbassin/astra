# @astra/gothic — astra's design system and vellum renderer

gothic is the amber/teal dark theme (Tailwind v4 `@theme` tokens and fonts), a few React
primitives (`Panel`, `Title`, `Button`, `Input`, `Columns`), and `DocumentView`, which renders a
parsed vellum document (`@astra/vellum-lang`) as React: statblocks, handouts, fields, timelines,
deity cards and prose. Consumers: strider, akasha-frontend, mouthpiece-frontend, vellum-frontend,
vellum-render, harrow, ledger, orator-backend, weal-overlay. gothic also owns astra's one
design-token source, which generates the parchment theme that codex and menhir use instead of
gothic. Plain TS source, no build step; `pnpm --filter @astra/gothic storybook` shows the
primitives and vellum fixtures.

## Using it in an app

- Import the theme once from the app's global CSS: `@import "@astra/gothic/theme.css";`. It
  imports Tailwind and declares `@source "./"`, so Tailwind generates the utility classes gothic's
  own components use (Tailwind's auto-detection skips `node_modules`). Don't import `tailwindcss`
  again; put app CSS after the import. Wire `@tailwindcss/vite` in `vite.config.ts`.
- Fonts load from absolute `/fonts/*` URLs; site-kit's `gothicFontsPlugin` serves and copies them.
- Per-entity colours (players, factions, decks) are not tokens: spread `identityStyle(color)` on
  the element, which sets `--identity-color`, and style with `var(--identity-color)`.
- `DocumentView` takes an optional `resolveCrossref`; without it, `[[wiki links]]` render as
  placeholder spans. It also takes an optional `resolveImage` (`imageResolver.ts`): it maps a
  Markdown image's path to `{ src, width?, height? }` for a file the app itself serves, or null.
  Only a hit with a same-origin `src` (`/…`, never `//host`) renders, as a lazy `<img>`; an
  image alone on its line becomes `<figure class="gothic-figure">` with the Markdown title as
  `<figcaption>`. Without a resolver, or on a miss, an image renders its alt text: gothic never
  makes the browser fetch from another origin. akasha-frontend is the only app that passes one
  (its `akasha/assets/` folder). Apps that render vellum at build time call
  `renderToStaticMarkup(<DocumentView …/>)` in their build script and inject the HTML, which keeps
  the renderer out of the client bundle (akasha-frontend, strider factions).

## Design tokens

Every theme colour, font stack and motion value is written once, in `src/tokens/tokens.ts`
(ADR 0032). `just tokens-gen` renders it into `src/generated/`, which is committed;
`just tokens-check` (in `just check`, `just ci` and CI) fails when a generated file is stale. Edit
the source, run `just tokens-gen`, commit both.

| Generated file | Export | Used by |
|---|---|---|
| `gothic-theme.css` | imported by `theme.css` | every gothic app (a Tailwind `@theme` block: CSS variables and utilities) |
| `parchment-theme.css` | `@astra/gothic/parchment-theme.css` | codex and menhir, from their `styles/tokens.css` |
| `graph-palette.css` | `@astra/gothic/graph-palette.css` | the akasha graph (Quartz variable names as concrete hex) |
| `palette.ts` | `@astra/gothic/palette` | pixi and GLSL code: `gothic.hex.*` strings, `gothic.pixi.*` numbers, `gothic.rgb.*` 0-1 floats rounded to 3 places (backdrop's shader uniforms, strider's map and background, harrow's card gold); `parchment.*` likewise |

App-only tokens stay in the app: codex's pills, links and density, menhir's answer shapes and
medals, and colours that are not theme colours (strider's map highlights, the starfield's
warm tones).

### Token names

A shared name means the same role in both themes. The old names named a lightness or hue, which
flips between gothic (dark) and parchment (light): `--color-void` was near-black in gothic and
cream in parchment. The generated CSS still emits each old name as an alias
(`--color-void: var(--color-page)`) until every consumer uses the new one; use the new names in
new code.

| Old name | New name | Role |
|---|---|---|
| `--color-void` | `--color-page` | page background |
| `--color-ink` | `--color-fg` | body text |
| `--color-ink-dim` | `--color-fg-muted` | secondary text |
| `--color-ink-faint` | `--color-fg-faint` | tertiary text and disabled marks |
| `--color-accent-amber` | `--color-accent-secondary` | secondary accent (amber in gothic, gold in parchment) |
| `--color-rule-bright` | `--color-rule-strong` | input borders and stronger dividers |

These keep their names, since they already name a role: `--color-accent`, `--color-rule`,
`--color-elevated`, `--color-hover`, gothic's `--color-panel` and diegetic set
(`--color-parchment*`, `--color-wax`, `--color-gold-leaf`, `--color-redaction`), and parchment's
palette names (`--color-heading-maroon*`, `--color-gold-*`, `--color-callout-tan-*`,
`--color-page-bg-alt`, `--color-page-vignette`). The Tailwind utilities follow the same names
(`bg-page`, `text-fg-muted`; `bg-void` and `text-ink-dim` still work through the aliases).

## Operations: adding a vellum block kind

1. vellum-lang: add the kind to `DOCUMENT_KINDS` and `DEFAULT_MODE_BY_KIND` (`src/model.ts`); the
   VSS brace form (`@kind "Title" { … }`) follows from `DOCUMENT_KINDS`. Document it in
   `libs/ts/vellum-lang/MARKDOWN.md`.
2. gothic: add a card component and a `case` in `DocumentView`'s block switch.
3. vellum-frontend: add a slash snippet (`slashComplete.ts`) and a template.
4. vellum-render: add a fixture to `test/visual/fixtures.ts` and generate its golden (see
   `apps/vellum/render/README.md`).

Author new wiki content in the VSS brace form; the akasha corpus has no `:::` openers left.

## Traps

- **Wrap every app's CSS reset in `@layer base`.** gothic styles content inside
  `@layer components`, and unlayered CSS beats any layer. An unlayered `*{margin:0;padding:0}`
  silently removes all paragraph spacing, list indents and pill and code-block padding in
  rendered vellum.
- **Cap long-form reading columns at about 42rem.** gothic's content styles are sized for cards;
  an uncapped column runs prose past 100 characters a line.
- **Any change to gothic can drift the vellum-render goldens.** The CI job
  `vellum-visual-regression` runs on every gothic change; regenerate goldens in the pinned
  container and review each PNG.
- **Canvas code can't read token variables reliably.** `getComputedStyle` may return an
  unresolved `var(--color-…)` string; give canvas/pixi code concrete values from
  `@astra/gothic/palette`, or, for code that must read CSS variables (akasha's graph), a generated
  file of concrete hex like `graph-palette.css`.
- **Never hand-edit `src/generated/`.** `just tokens-check` fails on it; edit `src/tokens/tokens.ts`
  and run `just tokens-gen`.
