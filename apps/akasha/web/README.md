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

`pnpm run build` then runs `scripts/build-search.ts`, which feeds the rendered HTML to Pagefind's
Node indexing API and writes `dist/client/pagefind/`.

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
  module per session and reach a page only through the `transcriptBody` server function
  (`transcriptBodyFn.ts`), which keeps them out of the client bundle. Inlining them into
  `bodies.ts` makes vitest run out of memory and ships them to every browser.
- **Don't run two build-content passes at once** (for example typecheck and test in parallel).
  Both delete and rewrite `src/generated/transcripts/`, and the race fails with `ENOTEMPTY`.
- **`<body data-slug>` is a contract.** The Graph and TranscriptPlayer islands read it, so every
  route loader must return `slug`.
- **TranscriptPlayer renders nothing.** It attaches imperatively to the SSR transcript markup
  (delegated click, binary search over line times). Keep it non-reactive: a transcript page has
  thousands of lines.
- **Navigation is full-page `<a href>`** (gothic wiki links are plain links), so route loaders run
  on the server. Islands still tear down their listeners in the effect cleanup.
- **Campaign routing is a heuristic.** `matchCampaign` (`campaigns.ts`) files a transcript under
  the first campaign, in `being.kdl` order, whose character names appear at least 15 times; else
  `Unsorted`. Reordering campaigns in `being.kdl` can move transcript URLs.
- **Speaker colours come from `being.kdl`.** linguist writes `user.color` as a CSS variable name
  (`--textJorge`); build-content generates those variables from the player colours.
- **Graph colours must be concrete hex.** The force graph reads Quartz-style variables
  (`--secondary`, `--gray`, …) with `getComputedStyle`. Define them in `globals.css` as hex, not
  `var(--color-*)`: some browsers return the unresolved `var()` text, which pixi can't parse.
- **No pixi backdrop here.** The force graph already owns a pixi Application, so akasha uses the
  CSS nebula (`.site-backdrop` in `globals.css`) instead of `@astra/backdrop`.
- **Read localStorage only in effects.** The Explorer seeds its open folders from the current slug
  during render and applies saved state in an effect; reading storage during render causes a
  hydration mismatch.
- **Aliases are a `<meta http-equiv="refresh">` page, not a server redirect.** The Popover island
  and old bookmarks fetch the alias URL and expect HTML.
- **Format dates in UTC** so the server and client render the same string.
- **The content build is heavy in tests.** `build-content.test.ts` runs it once in `beforeAll` with
  a long timeout, and `ssrSmoke.test.ts` builds with async `execFile`. A synchronous child build
  blocks the vitest worker until it misses its heartbeat ("Timeout calling onTaskUpdate").
