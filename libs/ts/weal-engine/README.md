# @astra/weal-engine — the TypeScript wrapper over the weal dice engine

`@astra/weal-engine` loads the committed WebAssembly build of the Rust crate
[`libs/rust/weal-engine`](../../rust/weal-engine/README.md) and gives it a typed ESM API.
weal-bot (`apps/weal/bot`) is its consumer. The crate's README covers the language, the
build and the hash check; this file covers only the wrapper.

## Public surface

- `evaluate(source, saves, seed, budget, mode)` runs one weal source (`mode: "run"`) or only
  parses and type-checks it (`"check"`) against the saves list (`[name, source]` pairs in id
  order), with 32 bytes of host entropy. It returns a `WealResult`; an error's `stage` is
  `parse`, `type`, `eval`, `fuel` or `prelude` for the player's input, and `internal` for the
  engine's own fault.
- `reinstantiate()` reloads the wasm from the committed bytes.
- `BUILTINS` (from `gen/weal_builtins.json`) and `isBuiltin(name)`.
- The result types (`WealResult`, `WealOk`, `WealErr`, `WealDisplay`, `WealValue`, …), generated
  from the Rust into `gen/weal_api.d.ts`.

## `gen/`

`gen/` is a committed build product: the wasm-bindgen CommonJS glue, the optimized wasm, the
generated types and builtins list, and `SOURCE_SHA256`. Rebuild it only with
`just weal-engine-build`; never edit it. `just weal-engine-hash-check` (in `just check` and CI)
fails when it is stale against the Rust sources.

## Testing

```sh
pnpm --filter @astra/weal-engine test
```

The tests load the real wasm, so they need no Rust toolchain.

## Traps

- **The wrapper contains wasm traps.** A Rust panic or stack overflow is caught, the instance is
  re-created, and the call returns `{ok: false, stage: "internal"}` with a message starting
  `engine trap:`. The next call runs on the fresh instance; `evaluate` throws only if the glue
  cannot load at all.
- **Load the glue by package name** (`@astra/weal-engine/gen/weal_engine.js`), never by a
  relative path: in an app's bundled `dist-server/` the wrapper no longer sits beside `gen/`.
- **`gen/package.json` must stay `{"type": "commonjs"}`.** The build writes it; it is what lets
  the ESM wrapper `createRequire` the glue.
- **Saves share the builtins' namespace.** A save named like a builtin shadows it for every
  later roll; check with `isBuiltin`.
