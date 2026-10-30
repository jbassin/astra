# akasha-frontend — the campaign wiki's read-only website

akasha-frontend serves the Færrin wiki, the session transcripts and the chronicle timeline at
`https://akasha.iridi.cc` (alias `heart.iridi.cc`). It is a TanStack Start SSR app on the strider
template (see `apps/strider/web/README.md`): Compose service `akasha-frontend`, port 10365,
`service.name=astra.akasha-frontend`. Everything on a page is baked in at build time from the
astra-data clone: the akasha snapshot and vellum corpus (`akasha/snapshot`, `akasha/content`), the
linguist session JSONs (`linguist/data`) and the timeline (`linguist/timeline`). The one runtime
input is session audio: `/audio/<date>.mp3` is served from `/ruby/data/astra-state/audio/akasha`
(config `akasha-frontend.audio-dir`, mounted at `/audio`).

## How a build works

`scripts/build-content.ts` runs at vite `buildStart` and writes `src/generated/`:

- `site.ts`: the page index (slugs, folders, tags, backlinks, aliases) from `buildSite(snapshot)`.
- `bodies.ts`: every wiki page rendered once through gothic `DocumentView` to static HTML. Wiki
  links resolve through the snapshot's `edges` (`src/domain/lib/crossref.ts`); a dangling link
  stays gothic's placeholder span.
- `transcripts/`: one lazy module per session, plus an index of import thunks.
- `public/` endpoints: RSS `index.xml`, `sitemap.xml`, `static/contentIndex.json`.

Route loaders get their page data from the server functions in `src/domain/lib/pageDataFns.ts`
(the logic is in `pageData.ts`). SSR runs them inline; a client navigation fetches them. Only
those functions import `bodies.ts`, the page index in `site.ts`, `chronicle.ts` and the
transcript modules, so none of them reach the browser. The client bundle carries only the
Explorer tree (`EXPLORER_TREE`) and the site title. The root route's loader calls
`getSectionCounts` for the pages per section that the section tree and the phone menu show.
Each call gets an `akasha.page_data` span, the `akasha.page_data.requests` counter (by `kind`
and `outcome`) and the `akasha.page_data.duration` histogram.

`pnpm run build` then runs `scripts/build-search.ts`, which feeds the rendered HTML to Pagefind's
Node indexing API and writes `dist/client/pagefind/`.

## The look

- **Sections.** `src/domain/lib/sections.ts` maps a slug to its section (label, folder page,
  hue): the top folder, except that any page with a `People` segment is a person, and `Script/`
  and `chronicle/` are Sessions. Home and `tags/` have none. Each section's hue
  (`--ak-<id>` in `tokens.css`) only ever marks that section.
- **Styles.** `src/styles/globals.css` only imports one file per area: `tokens.css` (colours,
  faces, and gothic's tokens pointed at akasha's), `shell.css` (header, grid, rails, tree,
  search, graph, phone menu), then `wiki.css`, `transcript.css`, `listing.css` and `home.css`.
  Faces are Literata and Archivo (`@fontsource-variable`, imported in `__root.tsx`); gothic is
  re-themed from here, never edited.
- **Shell.** `PageLayout` renders `SiteHeader`, the left rail (`SectionTree`: the top-level
  `EXPLORER_TREE` subtree that holds the page, or the list of sections on home and tags), the
  page, and the right rail (`rightSidebar`, then the "Connections" graph). Below 1180 px the right
  rail moves under the page; below 1100 px the header's nav gives way to the phone menu; below
  860 px the left rail goes.
- **Home.** `Home.tsx`, full width (`PageLayout rails={false}`, no rails): the hero and the
  section spectrum (counts from the root loader), the latest session (the main campaign's
  newest episode by date, with the four before it), "Updated after that session" (wiki pages
  whose date, the commit that last changed them as a UTC day, equals that session's date; hidden
  when there are none), then the wiki's own front page (`index`) with its title header hidden.
  `homePageData` (`pageData.ts`, logic in `listingData.ts`) returns all of it with
  `slug: "index"`.
- **Listings.** Sessions (`Chronicle.tsx`), folder pages (`FolderListing.tsx`) and tag pages
  (`TagListing.tsx`) share `ListingHead` (crumbs, title) and `PageList` (rows: hue dot, title,
  a faint page count on folders, tag chips). `listingData.ts` adds each row's section and count
  in the page-data function (it resolves the row's relative href against the listing's slug)
  and orders the rows by title, ignoring case and accents, so runtimeSite's views (newest
  first) stay unchanged. A section's own folder is titled by the section
  ("Org" shows as "Organisations"). Dates show in words, in UTC (`listingFormat.ts`).
- **Error and 404 pages** (`RouteError.tsx`) render inside the shell. When the root loader
  itself failed, they render bare: the header and rails read its section counts.
- **Theme.** Light, dark or system, stored in localStorage `akasha-theme` and shown as
  `data-theme` on `<html>` (`src/domain/lib/theme.ts`).

## Operations

- Redeploy after content changes: `just deploy akasha-frontend`. linguist-commit and the heartwood
  recipes already do this after they push to astra-data. The deploy bakes the clone's committed
  HEAD, so uncommitted edits in the clone don't ship.
- Refresh session audio: `just akasha-seed` (copies scribe's recordings; linguist-commit runs it too).
- Local dev: `just dev akasha/web`. Without `ASTRA_CONTENT_ROOT` it builds the checked-in
  `fixtures/astra-data/`. Search is empty under `vite dev`, because `/pagefind/` only exists after
  `pnpm --filter @astra/akasha-frontend build`.

## Traps

- **A plain `docker compose build akasha-frontend` fails on purpose.** The build needs the
  `astra-data` build context, which only `deploy/deploy.sh` supplies. Use `just deploy`.
- **URLs are a public contract.** `src/domain/lib/slug.ts` and `site.ts` are verbatim lifts of the
  old Quartz site. Don't "improve" them: any slug change renames pages and breaks bookmarks.
  Slugs keep commas (`Script/Through-a-Song,-Darkly/2025-10-20`) and unpadded dates.
- **Transcript bodies never go into a bundle-wide module.** Each is about 1 MB. They stay one lazy
  module per session and reach a page only through the `getWikiPage` server function
  (`pageData.ts`). Inlining them into `bodies.ts` makes vitest run out of memory.
- **Routes and components never import the generated content modules.** Importing `bodies.ts`,
  `chronicle.ts`, `PAGES` from `site.ts` or `runtimeSite.ts` from a route or component puts
  them back in the client bundle (about 1.7 MB with the real data). Go through a server
  function in `pageDataFns.ts`; type-only imports are fine.
- **Don't run two build-content passes at once** (for example typecheck and test in parallel).
  Both delete and rewrite `src/generated/transcripts/`, and the race fails with `ENOTEMPTY`.
- **`<body data-slug>` is a contract.** The Graph and TranscriptPlayer islands read it, so every
  route loader must return `slug`.
- **TranscriptPlayer renders nothing.** It attaches imperatively to the SSR transcript markup
  (delegated click, binary search over line times). Keep it non-reactive: a transcript page has
  thousands of lines.
- **Navigation is client-side, but every page mounts fresh.** Gothic wiki links and the listings
  are plain `<a href>`; the `SpaLinks` island catches clicks on them at the document and calls
  `router.navigate` (`spaNav.ts` decides which links stay with the browser: other origins, files
  such as `/audio/` and `index.xml`, and same-page `#anchors`, so `hashchange` still fires for
  the TranscriptPlayer). `__root.tsx` keys the page on the rendered pathname, so each navigation
  unmounts the old page and mounts the new one as a page load did. Every island must therefore
  tear down its listeners, timers and pixi apps in the effect cleanup, and read the page (DOM,
  `body[data-slug]`) in its mount effect. Code that navigates calls the router, never
  `window.location`; code that rewrites the URL passes `history.state` through, or back/forward
  loses its scroll position.
- **Page data is cached for the session** (`defaultStaleTime: Infinity` in `router.tsx`): back,
  forward and revisits don't refetch. A client navigation to an alias follows it with a router
  redirect; only SSR renders the meta-refresh stub.
- **A failed client navigation becomes a full page load.** Every deploy leaves open tabs on the
  old build, and their next navigation asks the new server for old server-function ids or route
  chunks. `RouteError` (the router's error component) then loads the target once
  (`staleBuild.ts`); it shows the error page only when the failing URL is the one the document
  was loaded with, so it never loops. An unknown server-function id gets a 500 that the client
  resolves to `undefined` instead of throwing, so every loader wraps its call in `pageData()`,
  which throws on `undefined`. Page-data functions return `null` for a missing page, never
  `undefined`.
- **Campaign routing is a heuristic.** `matchCampaign` (`campaigns.ts`) files a transcript under
  the first campaign, in `being.kdl` order, whose character names appear at least 15 times; else
  `Unsorted`. Reordering campaigns in `being.kdl` can move transcript URLs.
- **Speaker colours come from `being.kdl`.** linguist writes `user.color` as a CSS variable name
  (`--textJorge`); build-content generates those variables from the player colours.
- **Graph colours must be concrete hex.** The force graph reads the section hues (`--ak-<id>`)
  and Quartz-style variables (`--gray`, `--light`, `--lightgray`, `--dark`) with
  `getComputedStyle`, when it draws. akasha owns them: `tokens.css` defines each as a literal hex,
  once per theme, never as `var(...)`: some browsers return the unresolved `var()` text, which
  pixi can't parse, and the graph then draws no visible nodes or links. The graph redraws on a
  theme change, and its cleanup removes the canvas (`destroy({ removeView: true })`) so a redraw
  never leaves two. gothic's `graph-palette.css` is no longer imported.
- **No pixi backdrop here.** The force graph already owns a pixi Application, so akasha has no
  `@astra/backdrop` (and, since the redesign, no CSS backdrop either).
- **The theme is set before first paint, outside React.** An inline script in the document head
  (`THEME_SCRIPT`, `theme.ts`, passed through `SiteDocument`'s `head` in `__root.tsx`) copies
  `akasha-theme` to `<html data-theme>`. React never renders that attribute, so controls that
  show the current theme do it in CSS (`.ak-when-light` / `.ak-when-dark`), and SiteDocument's
  `<html>` carries `suppressHydrationWarning` for the attribute the script adds.
- **Read localStorage only in effects.** The section tree seeds its open folders from the current
  slug during render and applies saved state (localStorage `fileTree`) in an effect; the theme
  controls read `akasha-theme` the same way. Reading storage during render causes a hydration
  mismatch.
- **The search dialog and the phone menu are native modal `<dialog>`s.** A `close` event arrives a
  task after `close()`, so a handler must check `dialog.open` before acting on it (StrictMode's
  double effect otherwise closes the phone menu as it opens). The search dialog sits in
  `PageLayout`, outside the header, so hiding a header part at a breakpoint never hides it.
- **Aliases are a `<meta http-equiv="refresh">` page, not a server redirect.** The Popover island
  and old bookmarks fetch the alias URL and expect HTML.
- **Format dates in UTC** so the server and client render the same string.
- **The content build is heavy in tests.** `build-content.test.ts` runs it once in `beforeAll` with
  a long timeout, and site-kit's `describeSsrSmoke` builds with async `execFile`. A synchronous
  child build blocks the vitest worker until it misses its heartbeat ("Timeout calling
  onTaskUpdate").
