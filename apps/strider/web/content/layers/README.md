# Layers

Layers are timestamped deltas describing how the map's named sub-regions
(bases, buildings, landmarks), faction territory, the Skein overlay, and
banners change over time. They are folded in chronological order to produce
the current map state. Each layer is one **KDL** file (`.kdl`).

## File naming

`content/layers/{YYYY}-{MM}-{DD}T{HHMMSS}-{slug}.kdl` — the prefix is the
layer's timestamp, year zero-padded to 4 digits, time as `HHMMSS` (no
colons). Example: `0863-07-13T142100-hildebrant-base.kdl`. This keeps the
on-disk file order in chronological order automatically — adding an
earlier-dated layer just sorts in front without renumbering anything.

The `timestamp` node is still the canonical source for the fold's sort key;
the filename prefix is a redundant copy chosen so that `ls content/layers/`
and the fold agree.

## Format

The file is **flat KDL**: `timestamp` / `message` are top-level metadata nodes,
and **every other top-level node is a change whose node name is the op**. The
first positional argument is the `slug` (where the op has one); scalar fields are
`key="value"` properties; coordinates are `hex q r` child nodes; banner members
are `member "slug"` child nodes.

```kdl
timestamp "2026-05-22T14:30:00Z"   // required, string
message "Short log line for this event."

add "alkahest-hq" name="Alkahest HQ" faction="alkahest-freight" {
    hex 16 -27
    hex 17 -27
}

update "tinkers-row" name="Tinker's Row (Expanded)"   // any subset of name/faction/hexes

remove "old-warehouse"
```

KDL keywords need a `#` prefix — an unowned claim is `claim faction=#null { … }`
(not `null`). All validation errors throw at build time so authoring mistakes
fail loudly.

## Region ops

- `add "slug" name="…" faction="…" { hex q r; … }` — introduce a named multi-hex region. Errors if the slug already exists.
- `update "slug" [name="…"] [faction="…"] [{ hex q r; … }]` — any provided field replaces that field; omitted fields stay unchanged. Errors if the slug is missing.
- `remove "slug"` — delete a region. Errors if the slug is missing.
- `claim faction="slug"|#null { hex q r; … }` — per-hex territory ownership, overriding the base map. `#null` means explicitly unowned. (See `foldFactionOverrides` in `src/domain/lib/regions.ts`.)

## Skein ops

The Skein is a separate overlay (toggleable via the auspex strip) whose
"regions" are single hexes carrying a symbol, optionally joined by amber
network lines. Skein regions are distinct from the regions above — they share
the layer file but never collide with region slugs.

- `skein-add "slug" name="…" faction="…" symbol="symbols/foo.svg" { hex q r }` — a single-hex skein node (one `hex` child). Errors if the slug already exists.
- `skein-update "slug" [name="…"] [faction="…"] [symbol="…"] [{ hex q r }]` — any provided field replaces that field. Errors if the slug is missing.
- `skein-remove "slug"` — delete a node. Connections referencing the removed slug remain but are skipped at render time.
- `skein-connect from="slug" to="slug"` — add an undirected edge. The pair is canonicalized (`a↔b` and `b↔a` dedupe). Errors if `from === to`.
- `skein-disconnect from="slug" to="slug"` — remove an edge. Errors if the pair isn't currently connected.

```kdl
skein-add "signal-relay" name="Signal Relay" faction="alkahest-freight" symbol="symbols/signal-relay.svg" {
    hex 16 -27
}

skein-add "dead-drop" name="Dead Drop" faction="necrolog" symbol="symbols/dead-drop.svg" {
    hex -12 22
}

skein-connect from="signal-relay" to="dead-drop"
```

## Banner ops

A banner merges several factions' territory into one painted bloc (rendered as
a synthetic pseudo-faction, so all the fill/hover/click machinery applies).

- `banner-form "slug" name="…" color="#hex" [symbol="…"] { member "slug"; … }` — ≥2 member faction slugs. Members are validated against the real factions at build time.
- `banner-dissolve "slug"` — revert a banner (members return to their own colors).

```kdl
banner-form "tri-faction-concord" name="The Tri-Faction Concord" color="#c9a24b" {
    member "solari-sub-surface"
    member "protectorate"
    member "ministry-of-cultural-progress"
}
```

## Event ops

- `tithe` — a bare node (no fields). Fires a one-shot map-wide visual wave; changes no persistent state (every fold ignores it).

## Authoring with the editor

The `/editor` page provides a click-to-pick UI that writes a new `.kdl` layer
file for you. strider runs as a TanStack Start **SSR** server (Decision I), so
the save goes through a **server function** (`writeLayerFn` →
`scripts/writeLayer.ts`) on the same origin — there is no sidecar process. The
`/editor` route is client-only (`ssr: false`) and gated to the local network at
the Caddy edge.

Just run the dev server:

```bash
pnpm --filter @astra/strider dev
```

Then open <http://localhost:10360/editor>. Saving a layer calls the server
function, which validates (filename regex, 64 KB cap, no overwrite) and writes
the new file under `content/layers/`. After the file lands,
`contentWatchPlugin` re-runs `build-content` and Vite full-reloads. To revise a
layer, edit the KDL directly or write a follow-up layer with an `update` /
`remove` change.

## Hex ownership

The Voronoi assignment in `src/domain/lib/hexUtils.ts` is the **base** map — for
the ring factions that base territory is unowned, and only the Harlequins start
with held hexes. The `claim` op (above) layers on top of it: `claim` with a
faction slug marks those hexes owned, and `faction=#null` marks them explicitly
unowned. Absent a `claim`, a hex keeps whatever the base map said.
