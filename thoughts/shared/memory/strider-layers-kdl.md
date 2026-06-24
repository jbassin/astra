---
name: strider-layers-kdl
description: strider layer files are KDL (not markdown) — the flat schema, the parse/serialize seam, and the migration's regression gate
metadata:
  type: project
---

strider's `content/layers/*` are **KDL** (`.kdl`), migrated from YAML-frontmatter
markdown on 2026-06-24 (`fe69136` infra + `1fdef3f` strider). Markdown bought
nothing there — the body was unused. **Layers are KDL; factions are vellum**
(`.vellum`, done `8161283` — see [[strider-factions-vellum]]) — two different
formats, by design.

**Flat schema** (user-chosen): `timestamp` / `message` / optional `body` are
top-level nodes; **every other top-level node is a change whose node NAME is the
op**. `slug` = first positional arg; scalar fields = `key="value"` props;
coordinates = `hex q r` children; banner members = `member "slug"` children. A
fieldless tithe is a bare `tithe` node.

```kdl
timestamp "0863-07-18T04:14:00Z"
message "Radiant Arms Base established."
add "radiant-arms-base" name="Radiant Arms Base" faction="radiant-arms" {
    hex -23 5
}
skein-connect from="final-caliber" to="ears-that-hear-the-truth"
claim faction=#null { hex -7 -9 }   // unowned
```

**Load-bearing facts:**
- KDL keywords need a `#` prefix — unowned claim is `faction=#null`, NOT `null`
  (`@bgotink/kdl` v2 throws `Invalid keyword "null"` otherwise). Only `#null`
  occurs in our content.
- The parse seam (`scripts/build-content.ts` `parseLayer`/`nodeToChangeRecord`)
  produces the **same plain change records** the YAML used to, so `parseChange`
  + all folds (`foldRegions/Skein/Banners/FactionOverrides`) are UNCHANGED. The
  serialize seam is `serializeLayer` in `src/domain/lib/editorHelpers.ts` (the
  editor's writer + the migration used it). They are exact inverses.
- **Regression gate that proved the migration:** the regenerated
  `src/generated/layers.ts` is byte-identical to the pre-migration snapshot. Use
  this when touching the format — same data in, same generated module out.
- `@bgotink/kdl` is a strider **devDependency** (build-time only; the runtime
  bundle ships no KDL parser). Dockerfile installs devDeps (`bun install
  --frozen-lockfile`, no `--production`), so the build-stage `build-content` run
  resolves it.
- **Don't import `scripts/build-content.ts` from a `src/` test** — strider's
  tsconfig `include` is `["src", ...]` (scripts/ is bun-run + vitest-only, with
  intentional `.ts`-extension imports + loose typing). Importing it from a
  typechecked `src` test drags it into the `tsc` program and reds typecheck. The
  serialize↔parse round-trip lives in `scripts/build-content.test.ts` instead.
- Filename regex is now `…\.kdl$` (writeLayer.ts, build-content, layerFilename);
  `@astra/content-build` gained `listFilesWithExtension`; site-kit's dev
  content-watch rebuilds on `.kdl` too. See [[strider-0016-gotchas]],
  [[strider-tithe-pixi-gotchas]].
