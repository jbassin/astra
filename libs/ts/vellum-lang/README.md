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
- Constructs: `parseFrontmatter`, `splitFrontmatter`, `CROSSREF_RE`, `collectCrossRefs`,
  `splitCrossRefs`, `transformCrossRefs` (cross-references are parsed, not resolved),
  `parseFields` (`:::fields`), `parseTimeline` (`:::timeline`), and the model types and
  constants in `model.ts` (`DOCUMENT_KINDS`, `DEFAULT_MODE_BY_KIND`).

## Scripts

Run from the repo root with `node --import tsx libs/ts/vellum-lang/scripts/<name>.ts`.

- `validate-corpus.ts --dir <corpus> [--allow-sigils]`: parses every `.vellum` page and fails
  on error chips (where gothic would render a visible `?`) and on accidental sigil collisions
  in prose. `just corpus-validate` (a CI job) runs it over the fixture wiki; heartwood's
  `write_page` and `akasha-snapshot` run it over the real wiki.
- `gen-fixtures.ts`: regenerates `fixtures/vellum/<name>.ast.json` and `.meta.json` from the
  `.vellum` files. Run it after an intentional grammar or AST change and review the diff.
- `dump-meta.ts`: the TS half of `just vellum-parity` (reads a JSON list of paths on stdin).
- `convert-wiki.ts --dest <corpus> [--src <wiki>]`: the one-shot converter from the old
  Obsidian wiki to vellum. The corpus it writes lives in the astra-data clone.

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
