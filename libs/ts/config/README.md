# @astra/config — the TypeScript config loader, KDL decoder and SOPS secret resolver

`@astra/config` reads `ontology/ontology-config/config.kdl` into a typed, camelCase `Config`,
decodes any other KDL file, and resolves `ref="sops:KEY"` secrets on demand. Every TS
service, bot, frontend build and script reads config through it, and `@astra/observe` uses it
to name each Node service. It is the twin of the Python
[`astra-config`](../../py/config/README.md), and its schema is generated from the Pydantic
models there.

## Public surface

- `loadConfig(path?, secretsFile?)` returns `Config` for the namespaces TS reads
  (`TS_NAMESPACES` in `libs/py/config` `models.py`); other top-level blocks are dropped
  unvalidated. Data-path fields come back absolute, resolved against `data.root` or
  `data.contentRoot`; `ASTRA_DATA_ROOT` and `ASTRA_CONTENT_ROOT` override the two roots.
- `ConfigSchema` (Zod) lives in `src/config.gen.ts`, which `just ontology-gen` writes.
- `SecretRef`: `.require()` returns the value or throws `SecretUnsetError` naming the config
  key; `.optional()` returns `undefined` when unset or blank. The env var named like the SOPS
  key, upper-cased, wins over `deploy/sops/secrets.enc.yaml`; a blank value counts as unset.
- `loadKdl(path)`, `parseKdl(text)` and `decodeKdl(schema, node)` map KDL onto a Zod object
  schema. Fields are child nodes by default; mark the rest with `kdl.arg`, `kdl.prop`,
  `kdl.child` or `kdl.children`. A missing required field throws `KdlDecodeError` naming the
  node path.
- `kdlQuote(s)` escapes a KDL string. Browser code imports it from `@astra/config/kdl-quote`,
  which pulls in nothing else.
- `findRepoRoot(startDir?)` finds the checkout; `findPackageRoot(startDir)` finds the nearest
  `package.json`. A server locates its own files (`dist/`, `migrations/`) from
  `findPackageRoot(import.meta.dirname)`, because the bundle runs from `dist-server/`, not
  `src/`.

There is no build step: the package exports its TypeScript source.

## Testing

```sh
pnpm --filter @astra/config test
```

## Traps

- **Never edit `src/config.gen.ts`.** Change `libs/py/config` `models.py`, run
  `just ontology-gen`, and commit both; `just ontology-check` fails CI when they disagree.
- **A marker must wrap the outermost schema:** `kdl.arg(z.string().min(1))`, not
  `kdl.arg(z.string()).min(1)`. Each Zod method returns a new schema, so the marker is lost.
- **Don't import the main entry from browser code.** It reads files and runs `sops`; use
  `@astra/config/kdl-quote` for the one browser-safe helper.
- **Containers read the baked-in file** at `/repo/ontology/ontology-config/config.kdl`, so a
  config change reaches a service only when its image is rebuilt (`just deploy <service>`).
