# strider — the astra SSR frontend template

strider is the reference **TanStack Start SSR frontend** (roadmap Decision I): an SSR
process deployed as a Compose service behind Caddy, with build-time content →
generated TS modules → route loaders, server-side OTel, and browser RUM. Frontends
**0011–0013** (akasha-fe, mouthpiece-fe, vellum-fe) are produced by copying this app
and replacing its domain — not by reinventing the wiring.

The reusable spine lives in two shared libs so it is **not** re-copied per app:

- **`@astra/site-kit`** — the frontend preset: the whole `vite.config.ts` (`/vite`) and
  `vitest.config.ts` (`/vitest`), the router options (`/router`), the root document with RUM
  (`/document`), the fonts and theme CSS (`/theme`) and the SSR smoke test (`/ssrSmoke`); plus
  `createSsrServer` (the srvx + `send` SSR entry on Node 24) and `generateRouteTree`. See its
  README.
- **`@astra/content-build`** — the generic markdown→generated-modules pipeline
  primitives (`markdownToHtml`, `parseFrontmatter`, `emitModule`, …).

## Shell vs domain

```
apps/<domain>/web/
  server.ts          SHELL  thin createSsrServer caller (config-driven)
  vite.config.ts     SHELL  defineSiteConfig({ root, generated }) from @astra/site-kit/vite
  vitest.config.ts   SHELL  defineSiteVitestConfig({ root }) from @astra/site-kit/vitest
  scripts/
    build-content.ts  DOMAIN  registers this app's content sources
    writeLayer.ts     ~shell  generic guarded fs write (strider's editor uses it)
  src/
    router.tsx        SHELL  getRouter(): createRouter + siteRouterOptions({ notFound })
    ssrSmoke.test.ts  SHELL  describeSsrSmoke({ appRoot, routes })
    routes/           MIXED  thin route files; bodies wire in domain (replace per app);
                             __root.tsx renders <SiteDocument> with siteHead()
    observe/          SHELL  rumConfig.ts (the per-app RUM server function)
    components/        SHELL  ClientOnly, PixiHost, SiteHeader (a pattern — edit branding)
    lib/               SHELL  generic hooks: useIsMobile, useFocusTrap
    styles/, generated/ SHELL / content output (gitignored, regenerated)
    domain/           DOMAIN  EVERYTHING app-specific:
      lib/             faction/hex/skein/timeline/memoriam/editor logic + tests
      components/      HexMap, Editor, FactionDetail, FactionSymbol, MapView, Modal
```

The boundary is mechanical: **`src/domain/` + `content/` + the route bodies** are what
a new frontend replaces; everything else is copy-as-is infra. (A literal `rm -rf
src/domain content/*` won't compile until you also replace the route bodies that import
domain modules — routes are the wiring seam, so they're edited, not deleted.)

## Port recipe (new frontend `apps/<domain>/web`)

1. **Scaffold** with `just new-frontend <domain>`: it writes `apps/<domain>/web/` on the
   site-kit preset and adds the config block (config.kdl, the fixture, Pydantic, the Zod
   schema), the compose service and the Caddy stanza (see `libs/ts/site-kit/README.md`).
2. **Add your domain**: `src/domain/`, the routes, and from strider whatever shell pieces you
   need (`src/components/{ClientOnly,PixiHost,SiteHeader}`, `src/lib/`, `scripts/writeLayer.ts`
   for an editor).
3. **Register content sources**, if the app has build-time content: `scripts/build-content.ts`
   via `@astra/content-build` (`defineContentSource`/`buildContent`) emits the generated modules
   into `src/generated/`; name them in `vite.config.ts`'s `generated`, drop `generatedContent:
   false` from `vitest.config.ts`, and depend on `@astra/content-build`.
4. **Deploy**: commit, merge, `just deploy <domain>` and `just caddy-reload`. No Docker file
   lists workspace members, so the new app needs no other Docker change (see
   `docs/development.md`, "Adding an app").

## Load-bearing gotchas (inherit these)

- **`vite --configLoader runner`** is REQUIRED (in `dev`/`build` scripts): importing a
  workspace TS package (`@astra/site-kit`) from `vite.config.ts` fails under vite's
  default Node-externalizing loader; `runner` loads the config through vite's own TS
  pipeline. This is the real shape of "vite.config can't import @astra/config".
  Verified again on Rolldown-vite 8.
- **`vite` is exact-pinned (no caret), currently `8.1.6`.** Every vite-using member in
  the workspace moves in lockstep — a partial bump silently installs a duplicate
  `vite` (two resolved versions in the lockfile), which is the actual trigger behind
  the once-presumed TanStack/router#7614 blocker. Bump `vite` only as one atomic
  change across all 13 vite-using members, re-verify the lockfile resolves exactly one
  `vite` version, and don't caret it until TanStack officially certifies the major.
  `vitest` tracks the matching major (`^4.1` alongside vite 8) — `vitest` staying
  green on an older major is a false signal, since its `vite-node` dep can pin a
  private vite internally.
- **`createServerFn` stays in app source** (`src/observe/rumConfig.ts`) — the
  tanstackStart vite plugin only transforms server fns it finds in the app, not in a
  lib. `@astra/site-kit/web`'s `startRum` consumes the app's tiny server fn.
- **Wire `@tailwindcss/vite`** in `vite.config.ts` and ship `public/` (favicon,
  symbols), or gothic's `@theme`/`@apply` styling ships raw (black text, no panels).
- **Layer your CSS reset** — wrap any `*{margin:0;padding:0}` reset in `@layer base`.
  Unlayered it outranks gothic's `@layer components` content styles and silently
  zeroes every rendered-vellum margin/padding (paragraph spacing, list indents,
  trait-pill + code-block padding). Only frontends that render gothic `DocumentView`
  (akasha, strider factions, the vellum editor preview) are affected — but layering
  is free, so do it everywhere. See the 2026-06-24 design audit.
- **Cap the reading measure** — if a route renders long-form vellum prose, cap the
  reading column at ~42rem/68ch; gothic's content base is sized for cards, and an
  un-capped grid column runs prose to 100+ chars/line.
- **Fonts self-serve**: `gothicFontsPlugin({ clientOutDir })` copies gothic fonts into
  `dist/client/fonts` at build; the SSR server static-serves them. No Caddy
  `gothic_fonts` import, no vendored copy in git.
- **SSR bundle imports only the app's own deps**: `ssrExternalsPlugin({ root: ROOT })` inlines
  everything else, because the image installs only the app's production dependencies.
  `just ts-build` fails on a bundle that imports anything else (`just ssr-externals-check`).
- **SSR only** — no `prerender` block. Commit `src/routeTree.gen.ts` (oxlint/oxfmt-ignored).
  Pixi behind `lazy()` + `<ClientOnly>`. `/editor`-style routes use `ssr: false`.
- **The editor is dev-only.** `src/routes/editor.tsx` loads the editor through a dynamic import
  behind `import.meta.env.DEV`, so a production build drops the editor and its write server
  function and answers `/editor` with a 404 (the SSR smoke checks it). The route file stays, so
  the committed route tree is the same in dev and build.
- **Telemetry** lands only from in-cluster: config `telemetry.otlp-endpoint` is the
  collector's name on the `telemetry` network (`http://signoz-otel-collector:4318`), not `localhost`.

The cross-app frontend traps (TanStack Start, running TS under tsx, SSR smoke tests, CSS
layering, the gothic theme import) are in `libs/ts/site-kit/README.md` and
`libs/ts/gothic/README.md`. Background (archived): `thoughts/archive/specs/0014-strider-spec.md`
(original lift) and `0016-strider-hardening-spec.md` (template hardening).

## strider itself: the faction map

strider is also a live product: the campaign's faction map at `https://strider.iridi.cc`
(Compose service `strider`, port 10360, `service.name=astra.strider`). Content is
`content/factions/*.vellum` (one vellum document per faction, frontmatter `name`/`color`/`symbol`)
and `content/layers/*.kdl` (one timestamped change set per file, folded in `timestamp` order).

### Operations

- **Author layers in dev:** `just dev strider/web`, open `/editor`, save, then commit the new `.kdl`
  and `just deploy strider`. The editor exists only under `vite dev`; production answers
  `/editor` with a 404.
- Layer format (`scripts/build-content.ts` parses it, `serializeLayer` in
  `src/domain/lib/editorHelpers.ts` writes it; they are exact inverses): `timestamp` and
  `message` are top-level nodes; every other top-level node is a change whose node name is the op;
  `slug` is the first argument, scalars are props, coordinates are `hex q r` children, banner
  members are `member "slug"` children.

```kdl
timestamp "0863-07-18T04:14:00Z"
message "Radiant Arms Base established."
add "radiant-arms-base" name="Radiant Arms Base" faction="radiant-arms" {
    hex -23 5
}
claim faction=#null { hex -7 -9 }   // unowned
```

### Traps

- **KDL keywords need `#`.** An unowned claim is `faction=#null`; bare `null` is a parse error.
- **Prove a layer-format change by regenerating.** Same layers in must give a byte-identical
  `src/generated/layers.ts`.
- **Don't import `scripts/build-content.ts` from a `src/` test.** It pulls the script into the
  `tsc` program; parse/serialize round-trip tests live in `scripts/build-content.test.ts`.
- **Faction bodies render through gothic `DocumentView` at build time** (no wiki-link resolver).
  Plain prose renders in gothic's mechanical mode (teal headings). The output isn't byte-stable
  across gothic changes, so check faction pages by eye.
- **Pixi filters and masks don't compose.** A filtered object that is masked (directly or via a
  parent) renders nothing.
- **Rendering to a RenderTexture inside the ticker yields a blank texture.** For an animated
  shader clipped to shapes, put white shapes in a container, filter the container, and make the
  shader multiply its colour by the input alpha. Add an invisible full-grid rect so the filter
  bounds (and the screen-space pattern) stay put. The tithe wave and the faction tint both work
  this way.
- **Use one filter per layer, never one per hex.** The faction tint is a single
  `createBalatroFilter(palette, { tintFromTexture: true })` over `factionHexLayer`; it recovers
  each hex's colour from its own pixels.
- **Thin horizontal grid lines vanish under a filter** unless its offscreen texture renders at
  device resolution: keep `filter.resolution = app.renderer.resolution` and
  `filter.antialias = "on"` (`HexMap.tsx`). Faction borders sit unfiltered above the tint.
- **Only fresh Graphics play the flip animation.** `setFactionState` reuses Graphics for hexes
  whose owner didn't change and recreates the changed ones; don't reuse changed hexes.
- **One pixi Application per page.** `PixiHost` drops the page background on `/editor`, which
  owns its own Application. strider doesn't use `@astra/backdrop` for the same reason.
- **Banners render as pseudo-factions.** An active banner is appended to the faction list with
  its members' hexes merged, so fill, borders, hover, click and the flip animation need no banner
  code. Banners have no `/factions/$slug` page: a banner click must open the modal.
  `CURRENT_FACTION_HEXES` is pre-banner (editor only); active banners are `CURRENT_BANNERS`.
- **Timeline frames are precomputed.** `buildTimelineFrames` (`timelineFrames.ts`) folds every
  layer once; `MapView` reads `frames[layerIndex]`. Don't fold per render.
- **Playback reads localStorage only after mount.** `strider:vox-log-seen` holds the last-watched
  layer count; unseen layers replay once, capped at `MAX_PLAYBACK_LAYERS`. The first render always
  shows the current state, so SSR and hydration match. `?seen` forces the current state.
- **Verifying a pixi change:** canvas has no unit test, so look at it in a real browser. Headless
  Chromium throttles animation frames: lengthen a short animation temporarily and set
  `reducedMotion: "no-preference"`, or screenshots miss it.
