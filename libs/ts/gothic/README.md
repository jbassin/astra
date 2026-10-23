# @astra/gothic — astra's design system and vellum renderer

gothic is the amber/teal dark theme (Tailwind v4 `@theme` tokens and fonts), a few React
primitives (`Panel`, `Title`, `Button`, `Input`, `Columns`), and `DocumentView`, which renders a
parsed vellum document (`@astra/vellum-lang`) as React: statblocks, handouts, fields, timelines,
deity cards and prose. Consumers: strider, akasha-frontend, mouthpiece-frontend, vellum-frontend,
vellum-render, harrow, ledger, orator-backend, weal-overlay. codex and menhir use their own
parchment tokens instead. Plain TS source, no build step; `pnpm --filter @astra/gothic storybook`
shows the primitives and vellum fixtures.

## Using it in an app

- Import the theme once from the app's global CSS: `@import "@astra/gothic/theme.css";`. It
  imports Tailwind and declares `@source "./"`, so Tailwind generates the utility classes gothic's
  own components use (Tailwind's auto-detection skips `node_modules`). Don't import `tailwindcss`
  again; put app CSS after the import. Wire `@tailwindcss/vite` in `vite.config.ts`.
- Fonts load from absolute `/fonts/*` URLs; site-kit's `gothicFontsPlugin` serves and copies them.
- Per-entity colours (players, factions, decks) are not tokens: spread `identityStyle(color)` on
  the element, which sets `--identity-color`, and style with `var(--identity-color)`.
- `DocumentView` takes an optional `resolveCrossref`; without it, `[[wiki links]]` render as
  placeholder spans. Apps that render vellum at build time call
  `renderToStaticMarkup(<DocumentView …/>)` in their build script and inject the HTML, which keeps
  the renderer out of the client bundle (akasha-frontend, strider factions).

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
  unresolved `var(--color-…)` string; give canvas/pixi code concrete hex values (akasha's graph
  does this in its `globals.css`).
- **Keep `libs/ts/backdrop/src/shaders/common.ts` in step** with the palette here; it copies the
  gothic colours as RGB floats.
