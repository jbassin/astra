# astra-config — the Python config loader, KDL decoder and SOPS secret resolver

`astra_config` reads `ontology/ontology-config/config.kdl` into typed Pydantic models, decodes
any other KDL file astra reads, and resolves `ref="sops:KEY"` secrets on demand. Every Python
app, library, Dagster asset and host tool reads config through it. It also owns the Pydantic
models that the TypeScript config schema (`libs/ts/config`) is generated from, so Pydantic is
the one config schema for both languages.

## Public surface

- `load_config(path=None)` returns `Config`: only the namespaces Python reads. Unknown
  top-level blocks (the TS-only ones) are ignored; each namespace still forbids unknown keys.
  `load_whole_config()` returns `WholeConfig`, every namespace; only the CI test uses it.
- Data paths: a field typed `DataPath` is resolved against `data.root`, a `ContentPath`
  against `data.content-root` (the astra-data clone), so code only sees absolute paths.
  `ASTRA_DATA_ROOT` and `ASTRA_CONTENT_ROOT` override the two roots; the repo-root
  `conftest.py` sets them so pytest never touches `/ruby/data/astra-state`.
- `SecretRef`: `.require()` returns the value or raises `SecretUnsetError` naming the config
  key; `.optional()` returns `None` when unset or blank. The env var named like the SOPS key,
  upper-cased, wins over `deploy/sops/secrets.enc.yaml` (`$ASTRA_SOPS_FILE` overrides the file).
  A blank value counts as unset at both steps.
- `astra_config.kdl`: `load_kdl(path)` and `decode(Model, node)` map KDL onto a Pydantic model.
  Fields are child nodes by default; mark the rest with `Arg`, `Prop`, `Child` or `Children`
  in `Annotated[...]`. `kdl_quote` is the one escaper for hand-written KDL.
- `find_repo_root()`: the one checkout finder (the nearest ancestor holding
  `ontology/ontology-config`).
- `astra_config.zodgen`: writes `libs/ts/config/src/config.gen.ts` from the models for the
  namespaces in `TS_NAMESPACES`. `just ontology-gen` runs it; `just ontology-check` fails when
  the committed file is stale.

The `models.py` docstring lists which language reads which namespace.

## Testing

```sh
uv run pytest libs/py/config
```

- `test_whole_config_kdl_validates` checks the real `config.kdl` against `WholeConfig`.
- `test_config_readers.py` fails on a config field that nothing outside the config libraries
  names. Delete a field with its last reader; a field read only through a computed name goes in
  its `ALLOWLIST` with the reason.
- Loader tests use `fixtures/config/config.kdl`, not the real file.

## Adding or changing a field

1. Add it to `config.kdl`, to the namespace model in `models.py`, and to
   `fixtures/config/config.kdl`. Every plaintext field is required with no default; a secret is
   `Secret | None = None`.
2. A new namespace goes in `Config` if Python reads it, else in `WholeConfig`. A namespace TS
   reads also goes in `TS_NAMESPACES`; update the ownership list in the `models.py` docstring.
3. Run `just ontology-gen` and commit the regenerated `config.gen.ts`.

## Traps

- **Only the config libraries read the environment.** App code never reads a secret's env var
  or calls `resolve()` itself.
- **`optional()` still raises when `sops -d` fails.** A broken age key is not an unset secret.
- **Tests run without the age key.** CI has no `sops` key, so a test that really decrypts must
  skip without it, or it passes locally and fails in CI.
