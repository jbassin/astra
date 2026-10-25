# @astra/content-build — the frontends' build-time content step

`@astra/content-build` holds the primitives the frontends' `build-content` scripts use to turn
files (markdown, KDL, the astra-data datasets) into generated TypeScript modules that the app
imports at runtime. The runtime app never reads the filesystem for content. akasha-frontend,
mouthpiece-frontend, strider, harrow and ledger use it, each with its own domain parsing.

## Public surface

- `astraContentRoot(fromDir)`: the astra-data tree a build reads. `$ASTRA_CONTENT_ROOT` when
  set (the production Docker build points it at the real clone's committed HEAD), else the
  checked-in fixture `fixtures/astra-data` (`fixtureContentRoot`), with a warning.
- `defineContentSource({ name, build })` and `buildContent(outDir, sources)`: run each source
  in order into `outDir` and return their one-line summaries. `buildContent` writes a
  `.gitignore` there, so generated output stays out of git.
- `emitModule(outDir, filename, body)` writes a module with the `AUTOGEN_HEADER` line.
- `markdownToHtml(md)` (remark), `parseFrontmatter(raw)` (gray-matter),
  `listMarkdownFiles(dir, exclude)`, `listFilesWithExtension(dir, ext, exclude)`.
- `hashFiles(files)`: an order-independent 16-character content digest, for cache busting.

It reads no `config.kdl` values; it uses `@astra/config` only to find the repo root.

## Testing

```sh
pnpm --filter @astra/content-build test
```

## Traps

- **Build-time only.** It imports `node:fs`, remark and gray-matter; never import it from code
  that ships to the browser.
- **An unset `ASTRA_CONTENT_ROOT` builds the fixture**, not the live data. A local build of a
  frontend shows fixture content unless you set it.
- **`listFilesWithExtension` matches the extension verbatim**: pass `".md"`, with the dot. It
  returns `[]` for a missing directory instead of failing.
