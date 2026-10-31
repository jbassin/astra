# @astra/vellum-lang — the vellum parser

`@astra/vellum-lang` is the reference parser for vellum, the markdown dialect the akasha wiki
and the vellum editor are written in. It turns source into a `VellumDocument` AST
(frontmatter, theme mode, and an ordered list of prose runs and `:::kind` blocks). The React
renderer is in `@astra/gothic`. akasha-frontend, strider, vellum-frontend, vellum-render and
gothic import it. The dialect itself is specified in [`MARKDOWN.md`](./MARKDOWN.md).

The Python [`astra-vellum-lang`](../../py/vellum-lang/README.md) extracts only the metadata
(frontmatter and cross-references) for akasha-backend; the two must produce the same metadata.

## Public surface

- `parseDocument(source, { mode? })` returns the `VellumDocument`; `parseMarkdown(source)`
  returns the mdast tree after the source passes (`compileVss` and the surface sigils).
- `extractMetadata(source)` and `canonicalMetaJson(source)`: the `{frontmatter, crossrefs}`
  subset and its byte-stable JSON, the parity surface with Python. `canonicalAstJson(doc)`
  serializes the full AST without positions, for the `.ast.json` fixtures.
- Images: `collectImages(doc)` (every Markdown image in a document), `isAssetPath`,
  `imageSrcProblem(src, assets)` and `IMAGE_EXTENSIONS` (`images.ts`). They define the one
  path form a wiki image may use: relative to astra-data's `akasha/assets/`, no leading slash,
  segments of letters, digits, `.`, `_` and `-`, ending in png, jpg, jpeg, webp or gif:
  `![Map of Althane](maps/althane.png "Optional caption")`. akasha-frontend serves those files
  from its own origin; anything else (an `https://` URL, `/x.png`, a missing file) is never
  fetched. Only the inline form works: a reference-style image (`![alt][ref]`) renders as
  error chips, and the validator does not yet flag it.
- Constructs: `parseFrontmatter`, `splitFrontmatter`, `CROSSREF_RE`, `collectCrossRefs`,
  `splitCrossRefs`, `transformCrossRefs` (cross-references are parsed, not resolved),
  `parseFields` (`:::fields`), `parseTimeline` (`:::timeline`), and the model types and
  constants in `model.ts` (`DOCUMENT_KINDS`, `DEFAULT_MODE_BY_KIND`).

## Scripts

Run from the repo root with `node --import tsx libs/ts/vellum-lang/scripts/<name>.ts`.

- `validate-corpus.ts --dir <corpus> [--assets <dir>] [--allow-sigils]`: parses every
  `.vellum` page and fails on error chips (where gothic would render a visible `?`), on bad
  images and on accidental sigil collisions in prose. A bad image is external, not in the asset
  path form, missing from the assets folder or without alt text; it fails like an error chip
  because the reader would see a hole and the files alone show the fix. (Unresolved wiki links
  are not checked here: their resolution needs the whole snapshot.) `--assets` defaults to the
  `assets` folder beside the corpus; heartwood's per-page check, which runs in a temp dir,
  passes the real one (config `data.akasha-assets`). `just corpus-validate` (a CI job) runs it over the fixture wiki; heartwood's
  `write_page` and `akasha-snapshot` run it over the real wiki.
- `gen-fixtures.ts`: regenerates `fixtures/vellum/<name>.ast.json` and `.meta.json` from the
  `.vellum` files. Run it after an intentional grammar or AST change and review the diff.
- `dump-meta.ts`: the TS half of `just vellum-parity` (reads a JSON list of paths on stdin).

It reads no config; `@astra/config` is a dev dependency of the scripts and tests only.

## Testing

```sh
pnpm --filter @astra/vellum-lang test
just vellum-parity
```

`corpus.test.ts` asserts every fixture's `.ast.json` and `.meta.json`.

## Traps

- **A grammar change is a cross-language change.** Regenerate the fixtures, make the Python
  extractor match the new `.meta.json`, and run `just vellum-parity`.
- **The source passes run before remark and never throw.** `compileVss` (the brace syntax) and
  the surface sigils (`@2`, `||hidden||`, `#trait`) only rewrite what they recognize and leave
  canonical directive markdown untouched.
- **Sigils collide with prose.** `@2`, `@free` and the other action tokens, `#word` (a `#`
  followed by a letter) and `||…||` in ordinary wiki text become card markup, even inside code
  spans; `validate-corpus.ts` reports them so they can be escaped or reworded.
