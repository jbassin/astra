# akasha redesign

- **Date:** 2026-10-29 (repo at `38df1428`)
- **Status:** Josh approved the direction and the akasha-only scope on 2026-10-29. Building.
- **Why:** the stakeholders called the current site ugly and asked for a complete redesign.
- **Mockup:** https://claude.ai/artifact/4c5Fj5v95T75Fd8aEWbwYn (private canvas). The screen
  sources and screenshots are on the main checkout at
  `/ruby/data/experiments/astra/.playwright-mcp/akasha-canvas/project/*.dc.html` and
  `/ruby/data/experiments/astra/.playwright-mcp/mock-{home,article,session,blocks,mobile,mobilemenu}.png`
  (gitignored; read them by absolute path). The `.dc.html` files are plain HTML plus CSS; ignore
  the `<x-dc>`, `<helmet>` and `data-dc-script` wrappers.

## 0.1 Status and checklist

- [ ] **A. Foundation.** Tokens, fonts, theme switch, header, layout shell, section tree, search,
      graph, phone menu. Everything else builds on it, so it lands first.
- [ ] **B. Wiki page.** Page head, prose and gothic block overrides, section-coloured links,
      right rail (contents, sessions strip, "Mentioned on"), popover.
- [ ] **C. Transcript page.** Episode header, line layout, docked player, speaker rail, sessions tree.
- [ ] **D. Home and listings.** Home page, Sessions (chronicle) pages, folder and tag listings,
      error and 404 pages.
- [ ] **E. Finish.** Cross-page review at 1440 and 390 px in both themes, README traps, deploy
      (flag to Josh first: it replaces the live look), `docs/now.md`.

B, C and D run in parallel after A merges. Each owns its own stylesheet and components (see
section 3), so their pull requests don't conflict.

## 1. Scope

- akasha-frontend only. gothic stays untouched: akasha re-themes gothic's rendered blocks from its
  own CSS by overriding gothic's token variables and adding unlayered overrides for gothic's
  hard-coded utilities (uppercase, tracking, borders). No vellum-render goldens change.
  Known consequence: vellum-frontend's preview no longer looks like akasha.
- Every URL, slug and alias stays exactly as it is (README trap "URLs are a public contract").
- Keep every README trap that still applies: lazy transcript bodies, no generated modules in
  routes or components, `body[data-slug]`, the non-reactive TranscriptPlayer, fresh mount per
  page, concrete hex for the graph, `@layer base` reset, localStorage only in effects, UTC dates.
- Drop: the nebula backdrop, the "Looking Glass" explorer title, the Quartz three-sidebar shell,
  Caslon Antique and Serif Gothic, the "min read" label, the "Folder:" and "Tag:" title prefixes.

## 2. Design system

### Principles

- A quiet page. The only bold element is the section spectrum on the home page.
- Each section owns one hue, and a hue only ever carries information: the current section's
  underline in the header, a link's underline (the section it points to), graph nodes, the dot
  beside a page name in lists, the tint on the current tree item.
- Copy: sentence case, plain verbs. No all-caps labels, no middle-dot (`·`) separators, no `→`
  or `❯` glyphs, no monospace for UI labels (monospace only for code and logs).
- Motion: none on load. Hover and focus transitions at 120 ms. Respect reduced motion.
- Accessibility: visible focus (2 px outline in `--ink`, 2 px offset), 44 px touch targets on
  phones, real buttons and links, every text colour at 4.5:1 or better (values below are checked).

### Colour tokens

Define on `:root` (light) and for dark under both `:root[data-theme="dark"]` and
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. Use an `--ak-` prefix.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ak-page` | `#F3F3F7` | `#16152A` | page background |
| `--ak-surface` | `#FFFFFF` | `#1E1D35` | header, cards, inputs, player |
| `--ak-sunk` | `#EBEBF1` | `#121124` | hover fill |
| `--ak-ink` | `#1E1D2E` | `#ECEBF4` | body text (14.9:1 / 15.1:1) |
| `--ak-muted` | `#55536C` | `#AEACC6` | secondary text (6.7:1 / 8.1:1) |
| `--ak-faint` | `#6B6983` | `#8F8DAB` | tertiary text, counts (4.8:1 / 5.6:1) |
| `--ak-rule` | `#DADAE4` | `#302E4D` | hairlines and borders |

Section hues (all pass 4.5:1 as text on page and surface in their theme):

| Section | Folder / slugs | Light | Dark |
|---|---|---|---|
| Bestiary | `Bestiary/` | `#A43B38` | `#FDA19A` |
| Divinity | `Divinity/` | `#945000` | `#EBB16C` |
| Geography | `Geography/` | `#2F751D` | `#98CF8B` |
| Organisations | `Org/` | `#007A75` | `#59D4CD` |
| People | `People/`, and any slug with a `/People/` segment | `#006DA6` | `#71C9FA` |
| Phenomena | `Phenomena/` | `#4E59B1` | `#A9B8FF` |
| Rules | `Rules/` | `#7B489E` | `#D3AAF3` |
| Sessions | `Script/`, `chronicle/` | `#9B3B6E` | `#F4A0C8` |
| Timeline | `Timeline` | uses `--ak-faint` | uses `--ak-faint` |

Home (`index`) and `tags/` belong to no section.

Map gothic's tokens onto these so its blocks follow the theme: `--color-page` and `--color-void`
to page; `--color-panel` and `--color-elevated` to surface; `--color-hover` to sunk; `--color-fg`
and `--color-ink` to ink; `--color-fg-muted` and `--color-ink-dim` to muted; `--color-fg-faint` to
faint; `--color-rule` and `--color-rule-strong` to rule; `--color-accent` to ink;
`--color-accent-secondary` to muted.

Speaker colours (`--text<Name>` from being.kdl) are pastels made for a dark page. In the light
theme, mix each with ink (for example `color-mix(in oklab, var(--textMike) 45%, var(--ak-ink))`)
and check every result reaches 4.5:1 on page and surface.

### Type

- **Literata** (`@fontsource-variable/literata`, with italics and the `opsz` axis): reading text,
  page titles, block titles, synopses.
- **Archivo** (`@fontsource-variable/archivo`, with the `wdth` axis): navigation, section headings
  inside prose, labels, buttons, counts, breadcrumbs, timestamps.
- IBM Plex Mono (already loaded by site-kit): code blocks and in-world logs only.
- Override gothic's `--font-body` to Literata and `--font-display` to Archivo.

| Use | Face | Size / line height | Weight |
|---|---|---|---|
| Home hero "Akasha" | Literata, `opsz` 72 | 128 px / 0.92, tracking −0.035em (72 px on phones) | 400 |
| Page title | Literata, `opsz` 72 | 60 px / 1.02, tracking −0.025em (40 px on phones) | 500 |
| Prose | Literata | 18 px / 1.72 (17 px on phones), measure 38rem | 400 |
| Prose h2 | Archivo, `font-stretch: 108%` | 24 px / 1.2, margin-top 2.2em | 650 |
| Prose h3 | Archivo | 19 px / 1.3 | 650 |
| Block title | Literata italic (handout), roman (deity) | 22 to 24 px | 500 / 600 |
| UI text | Archivo | 14 px | 500 |
| Small labels, counts, crumbs | Archivo | 13 px | 400 to 600 |
| Timestamps | Archivo, tabular figures | 12 px | 400 |

Left-align everything. Never justify.

### Layout

- **Header** (64 px, `--ak-surface`, 1 px rule below, sticky): wordmark "Akasha" (Literata 24 px,
  600) linking home; the section nav (Bestiary, Divinity, Geography, Organisations, People,
  Phenomena, Rules, a thin divider, Sessions, Timeline), each link 14 px Archivo in muted, the
  current one in ink at 600 with a 3 px underline in its hue sitting on the header's bottom edge;
  the search trigger (272 px field look, placeholder "Search the wiki and sessions", a "Ctrl K"
  hint); the theme button (moon in light, sun in dark).
- **Body grid:** `232px minmax(0,1fr) 280px`, gap 64 px, max-width 1440 px, padding 40 px.
  Left rail: the section tree. Centre: the page. Right rail: page-specific (graph, contents,
  sessions strip, mentioned on). Pages with no right-rail content use two columns.
- **Below 1180 px:** the right rail moves under the page content.
- **Below 860 px (phones):** the header becomes wordmark, a search icon button and a menu button.
  The menu is a full-height sheet: a search field, one row per section (hue dot, label, page
  count; 48 px rows), the current section's tree open under its row (the current page tinted,
  then an "All N organisations" style link to the section's folder page), and a
  Light / Dark / System segmented control. The left rail is not shown on phones. Page padding
  16 px.
- **Section tree** (left rail): only the current section's subtree, headed by its hue dot, label
  and page count. Items are 14 px Archivo, muted, 6 px 10 px padding, 6 px radius; hover fills
  sunk; the current page is ink, 600, on a 13 % tint of the section hue. Folders keep their
  expand toggles and saved state. Nested items indent 18 px with a 1 px rule on the left. For
  long sections, keep the current item in view on load.
- **Blocks** (gothic cards): `--ak-surface`, 1 px rule border, 6 px radius, no top colour bar, no
  shadow, no rotation. Header row: title on the left, the block kind in faint 13 px Archivo on the
  right ("Handout", "Deity, outer god"), a hairline below. Deity fields are a two-column grid
  (150 px label column in 13 px Archivo 600 muted, value in Literata 16 px), baseline aligned.

### Theme switch

- Default follows the system. The choice is stored in localStorage `akasha-theme`
  (`light`, `dark`, or absent for system) and applied as `data-theme` on `<html>`.
- An inline script in the document head applies it before first paint (no flash). React must not
  manage that attribute.
- The graph must redraw with the new colours when the theme changes.

## 3. Slices and file ownership

Shared rule: a slice edits only the files it owns, plus the README sections about its area.
Stylesheets are split by area in slice A so B, C and D never edit the same CSS file.

### A. Foundation

Owns: `package.json` (font dependencies; add them to the root catalog in `pnpm-workspace.yaml`),
`src/routes/__root.tsx`, `src/styles/globals.css` (becomes imports only), new
`src/styles/{tokens,shell,wiki,transcript,listing,home}.css` (the area files start with the
existing rules moved verbatim, so later slices restyle them), `src/domain/lib/sections.ts` (slug to
section, label, nav order, folder href, page counts come from the server), `PageLayout.tsx`, a new
`SiteHeader` and phone menu, `PageTitle.tsx`, `islands/Explorer.tsx` (becomes the section tree),
`islands/Search.tsx`, `islands/Graph.tsx` (theme-aware concrete hex palette owned by akasha; nodes
coloured by section; a legend of the sections present), `islands/SpaLinks.tsx` if needed,
`RouteError.tsx` only for the shell.

### B. Wiki page

Owns: `wiki.css`, `ContentArticle.tsx`, `Breadcrumbs.tsx`, `ContentMeta.tsx`, `TagList.tsx`,
`Backlinks.tsx`, `SidebarImage.tsx`, `ArticleTitle.tsx`, `islands/Popover.tsx`,
`runtimeSite.ts` (content view: split wiki and session backlinks, children list),
`crossref.ts` and `linker.ts` (add `data-section` to generated links), `renderBody.tsx` and the
bodies part of `build-content.ts` (heading ids and a contents list).

### C. Transcript page

Owns: `transcript.css`, `islands/TranscriptPlayer.tsx`, `transcriptBuild.ts`, a new
`TranscriptArticle.tsx`, the transcript branch in `routes/$.tsx`, the transcript part of
`pageData.ts` (episode data for the page), the Script-tree part of `build-content.ts` (episode
titles as tree labels).

### D. Home and listings

Owns: `home.css`, `listing.css`, `routes/index.tsx`, `routes/chronicle/**`, `routes/tags/**`,
`Chronicle.tsx`, `FolderListing.tsx`, `PageList.tsx`, `TagListing.tsx`, `RouteError.tsx` content,
the home, chronicle and tag parts of `pageData.ts`.

## 4. Page specs

The mockup screens are the reference. Where they differ from this text, this text wins.

- **Wiki page (B):** crumbs ("Organisations / Iridescent Church", the section in its hue);
  title; a facts row (tags as pill chips, "Updated 5 June 2026" when the page has a date); prose.
  Links are ink with a 2 px underline in the target's section hue (`data-section` on the link),
  offset 4 px. Children of a folder index page: "In <title>" with one row per child (hue dot, name,
  a faint summary of its own children). Right rail: "On this page" (only with 2+ entries),
  "Sessions" (main campaign: one tick per chronicle episode in order, filled in the Sessions hue
  where that session's transcript links here, "N of M", the axis start and end months, and a
  `<details>` list of the linked sessions by date and episode title, other campaigns included),
  "Mentioned on" (wiki backlinks only, first 6 with hue dots, then a `<details>` "Show all N"),
  "Connections" (the graph). Hide any rail block with nothing to show.
- **Transcript (C):** crumbs Sessions / show / Season n; the title is the episode title, or
  "Session of 17 February 2026" when the chronicle has no entry; facts: "Tuesday 17 February
  2026", "Session 17, season 3 episode 3", the duration ("3 h 34 min"). A find field (with match
  count and previous / next) above the lines. Lines: a grid of time (72 px), speaker (104 px,
  right-aligned, speaker colour, Archivo 13 px 600) and text (Literata 17 px). A line by the same
  speaker as the line before hides its time and name (time shows on hover and focus). The playing
  line gets a 12 % tint of its speaker colour; a deep-link target gets a brief highlight. Player:
  docked to the bottom of the viewport (76 px, surface, rule above): back, play / pause, forward,
  current time, a scrubber filled in the Sessions hue, total time, speed (1×, 1.25×, 1.5×, 2×),
  and a "Follow along" toggle. Right rail: "What happened" (synopsis and a link to the chronicle
  entry) and "Speakers" (a checkbox per speaker in their colour, character name, player name, line
  count; toggling hides their lines) with the character / real-name switch. Left rail: the
  campaign's sessions, grouped by season where the chronicle knows them, labelled with episode
  title and date. Keep the player non-reactive and keep every keyboard shortcut.
- **Home (D):** hero ("Akasha", the lede "Everything the table knows about Færrin: its places,
  people and powers, and a full transcript of every session we have recorded.", the spectrum: one
  segment per section, `flex: <count> 1 96px`, 14 px bar in its hue, label and "N pages" /
  "N transcripts" under it, each segment linking to the section). Then "Latest session" (show in
  Sessions hue, season, date, episode title in Literata 40 px, synopsis, "Read the transcript"
  primary and "Read the chronicle entry" secondary, then the four previous episodes as rows of
  date and title). Beside it, "Updated after that session": pages whose date is the latest session
  date (hue dot, name, section). Then the wiki index page's own body ("Recovered Log 2a") in its
  block style.
- **Sessions (D):** `/chronicle` is titled "Sessions": the main campaign first (seasons with arc
  summaries and episode rows), the other shows as rows with season and episode counts. A show
  page: seasons as sections (heading "Season 3: Keystones and Fractures", arc summary in Literata
  muted), episode rows of date, title and the synopsis's first sentence. An episode page: the
  title, show / season / episode / date line, synopsis, key beats, characters / locations /
  factions as chips, the cliffhanger, and a primary "Read the transcript" button.
- **Folder listing (D):** crumbs, the folder title (no "Folder:" prefix), the folder's own body,
  then rows (hue dot, title, tags as chips, a faint child count for folders). Tag pages and the
  tag index use the same rows; the tag title is the tag name, with "Tag" as a faint label.
- **Error and 404 (D):** a short message in the shell with a link home and the search trigger.

## 5. Verification for every slice

- In the worktree: `pnpm install --frozen-lockfile`, then from `apps/akasha/web`:
  `pnpm typecheck`, `pnpm test`, `pnpm build`; from the repo root: `pnpm run lint`,
  `pnpm run format:check`, `just ssr-externals-check`. Don't run typecheck and test in parallel
  (README trap).
- Look at the real content: `ASTRA_CONTENT_ROOT=/ruby/data/astra-state/astra-data` with
  `pnpm dev -- --port <your port>` (or `pnpm build` then `pnpm start`), and screenshot at 1440 and
  390 px wide in both themes. Pages to check: `/`, `/Org/Iridescent-Church`,
  `/Divinity/Outer-Gods/Iridescent-Host`, `/Script/Through-a-Song,-Darkly/2026-2-17`,
  `/chronicle`, `/chronicle/through-a-song-darkly`, `/Bestiary`, `/tags`.
- Compare against the mockup screenshots. Check contrast of any new colour pairing.
