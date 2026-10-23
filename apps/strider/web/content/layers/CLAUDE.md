# `content/layers/` — authoring layer files

Each file is one event in the timeline, written in **KDL** (`.kdl`). Filename order = chronological order; the build sorts by `timestamp` first, then by slug.

## Filename

Strict regex (enforced by `scripts/writeLayer.ts`, the server function's writer, and also validated at parse time in `scripts/build-content.ts`):

```
^\d{4}-\d{2}-\d{2}T\d{6}-[a-z0-9-]+\.kdl$
```

i.e. `0863-07-18T200001-garrick-textiles-falls-fallow.kdl`. Lowercase kebab-case slug, six-digit `HHMMSS` (no colons). The in-world year is 4-digit (e.g. `0863`) — keep zero-padding.

Don't hand-write a colliding filename — the writer rejects existing files with HTTP 409.

## File shape (flat KDL)

`timestamp` / `message` are top-level nodes; **every other top-level node is a change, and its node name is the op**. Coordinates are `hex q r` child nodes; banner members are `member "slug"` child nodes.

```kdl
timestamp "0863-07-18T04:14:00Z"   // ISO-ish; the build only requires it be a string
message "Radiant Arms Base established."

add "radiant-arms-base" name="Radiant Arms Base" faction="radiant-arms" {
    hex -23 5
    hex -22 4
}

skein-add "final-caliber" name="Final Caliber" faction="radiant-arms" symbol="symbols/final-caliber.svg" {
    hex -22 5
}

skein-connect from="final-caliber" to="ears-that-hear-the-truth"
```

`message` may be the empty string (`message ""`); the build defaults a missing one to `""`.

## `Change` op cheat sheet

The node **name** is the op. `slug` is the first positional arg; scalar fields are `key="value"` props; `hex q r` / `member "x"` are children. See `src/domain/lib/regions.ts` for the exact union; `parseChange` in `scripts/build-content.ts` is the source of truth for required fields.

| op                 | shape                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `add`              | `add "slug" name="…" faction="…" { hex q r; … }`                   |
| `update`           | `update "slug" [name="…"] [faction="…"] [{ hex q r; … }]`          |
| `remove`           | `remove "slug"`                                                    |
| `claim`            | `claim faction="slug"\|#null { hex q r; … }`                       |
| `skein-add`        | `skein-add "slug" name="…" faction="…" symbol="…" { hex q r }`     |
| `skein-update`     | `skein-update "slug" [name=…] [faction=…] [symbol=…] [{ hex q r }]`|
| `skein-remove`     | `skein-remove "slug"`                                              |
| `skein-connect`    | `skein-connect from="slug" to="slug"`                             |
| `skein-disconnect` | `skein-disconnect from="slug" to="slug"`                          |
| `banner-form`      | `banner-form "slug" name="…" color="#hex" [symbol="…"] { member "slug"; … }` |
| `banner-dissolve`  | `banner-dissolve "slug"`                                           |
| `tithe`            | `tithe` (a bare node — no fields)                                  |

Notes:

- `hex q r` uses **axial `[q, r]` coords** (two positional numbers). Typos silently render to the wrong tile — there's no schema check for "is this hex in-grid."
- `claim faction=#null` means _explicitly unowned_ (KDL keywords need the `#` prefix — `#null`, not `null`). Absence of a claim means _whatever the base map said_.
- `skein-connect`/`-disconnect` are validated: self-connecting throws, disconnecting a non-existent edge throws. Removing a node leaves its edges dangling (skipped at render), matching the existing convention.

## How a layer file becomes pixels

`scripts/build-content.ts` reads every `*.kdl` here, parses each KDL node into a plain change record, runs `parseChange` per change (strict — typos throw the build), then folds the whole list via `foldRegions` / `foldFactionOverrides` / `foldSkein` / `foldBanners` to produce the `CURRENT_*` snapshots in `src/generated/layers.ts`. At runtime, the app uses the snapshots for the "now" view and the raw `LAYERS` array for timeline scrubbing. KDL is parsed only at build time (via `@bgotink/kdl`); the runtime bundle ships no parser.

## Writing layers via `/editor`

`pnpm --filter @astra/strider dev` exposes a client-only `/editor` UI (`ssr: false`) whose save calls the `writeLayerFn` **server function** (TanStack Start, same origin — no sidecar), which writes the `.kdl` file into this directory via `scripts/writeLayer.ts` (filename regex, 64 KB cap, no overwrite). The editor serializes via `serializeLayer` in `src/domain/lib/editorHelpers.ts` — the exact inverse of the build's parser. After the file lands, `contentWatchPlugin` re-runs `build-content` and Vite full-reloads.
