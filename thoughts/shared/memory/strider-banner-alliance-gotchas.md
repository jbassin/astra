---
name: strider-banner-alliance-gotchas
description: strider banner/alliance layer change — the pseudo-faction rendering pattern + the new banner-form/banner-dissolve Change ops (COMPLETE + LIVE)
metadata:
  type: project
---

The strider "factions ally and combine their land under one banner" feature
(2026-06-23, COMPLETE + pushed + deployed live on `astra-strider`/10360,
`strider.iridi.cc`). A net-new product feature, NOT a port — verified absent in
faerrin's `pkg/strider` (the `Change` union is byte-identical there). Scope:
`thoughts/shared/research/2026-06-23-strider-banner-alliance-thoughts.md`.

**Model (the two new `Change` ops, `src/domain/lib/regions.ts`):**
`banner-form { slug, name, color, symbol?, members[] }` + `banner-dissolve { slug }`,
mirroring `skein-connect`/`skein-disconnect`. `foldBanners(layers)` → the *active*
banner set (validates ≥2 members, ≤1 active banner per faction, dissolve-targets-
active). **Reversibility is free:** assignment reads only the *active* set, so
dissolve just drops the banner and members repaint themselves — no snapshot
bookkeeping. Membership is **dynamic** — a hex a member gains *after* forming
still joins the banner. `computeBannerAssignments` (hexUtils) pulls member-faction
hexes into one group while retaining each hex's constituent faction.

**THE load-bearing pattern — banners render as synthetic "pseudo-factions".**
Instead of a parallel banner render layer, `MapView`'s `renderState` memo appends
one pseudo-faction per active banner to the faction list (banner color, member
hexes merged into one group) and recomputes borders over the combined array. Then
**everything reuses the existing pixi machinery untouched**: per-hex fill paints
the banner color, the combined-border pass dissolves inner seams into one outer
border (because same-group hex edges aren't borders — that's just what
`computeAssignmentBorders` does), hover/click route through `onFactionHover`/
`onFactionClick`, and **even the timeline flip animation (slice 4) works for free**
— a `banner-form` flip is just a `FactionFlipAnim` whose member hexes flip from
their old faction color to the banner color (the merged snapshot hex already shows
the banner color). HexMap/pixiScene needed **zero** changes. A future banner-like
"merge N entities into one painted bloc" feature should copy this.

**Gotchas / decisions:**
- The pseudo-faction's index is `factions.length + i`; detect a banner click by
  `renderState.activeBanners.has(faction.slug)` (banner slugs are a distinct
  namespace). Banners have **no `/factions/$slug` route**, so a banner click always
  opens the desktop Modal (never the mobile nav) — else 404.
- `CURRENT_FACTION_HEXES` (generated) stays the **pre-banner** faction assignment —
  it feeds only the **editor** (`editorHelpers.hexFactionMap` + `EditorHexMap`),
  which wants raw faction territory. The live home map recomputes its own
  per-cursor state in `MapView` and does NOT consume it. Banners are emitted
  separately as `CURRENT_BANNERS` (the active set) for the editor's dissolve list.
- `Modal` was generalized to a discriminated `content: {kind:"faction"} | {kind:
  "banner"}` prop (single consumer = MapView); `BannerDetail` lists constituents as
  click-through buttons (user wanted "reference to the original factions" under the
  solid color). `FactionSymbol` works on a banner pseudo-faction (no symbol →
  initials placeholder in the banner color).
- Editor: a new `banner` kind with `banner-form` (members = distinct owner factions
  of the selected hexes; reuses `toggleHex`, no single-faction lock) + `banner-
  dissolve` (a dropdown fed by `CURRENT_BANNERS` via the route — not a map click).
  Reuses `regionName`/`regionSlug`, adds a `bannerColor` reducer field, reuses
  `targetFaction` as the picked-banner slug for dissolve.
- A seed layer `content/layers/0863-07-19T120000-tri-faction-concord-forms.md`
  (solari + protectorate + ministry — consecutive ring factions → a contiguous
  bloc) is committed + LIVE as the worked example.
- Verify the pixi render with the bundled playwright-core
  (`node_modules/.bun/playwright-core@1.61.1`) + chromium at
  `~/.cache/ms-playwright` — `?seen=true` jumps the timeline to the end; assert the
  `[data-testid="faction-hex"][data-faction-slug="<banner>"]` hook + the modal.
  The prod `dist/server/server.js` ignores `PORT` (binds the config port 10360);
  for a sandbox run use `vite dev --configLoader runner --port <free>`. Hitting
  `localhost:10360` directly logs a CORS error for the RUM OTLP export to
  `otel.iridi.cc` (origin not `*.iridi.cc`) — NOT a regression; fine via the edge.

Related: [[strider-0016-gotchas]], [[deploy-apply-with-just]].
