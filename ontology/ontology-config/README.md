# astra-ontology-config — `config.kdl`, the one config file

`config.kdl` holds every config value in astra: ports, paths, model pins, tuning constants
and the `ref="sops:KEY"` pointers to secrets. Nothing else in the repo holds a config value,
and nothing in it is a plaintext secret. Each top-level block is a namespace (`data`, `llm`,
`telemetry`, one per app). This package pins the file's path for Python; the loaders and
schemas live in [`libs/py/config`](../../libs/py/config/README.md) (Pydantic, the one schema)
and [`libs/ts/config`](../../libs/ts/config/README.md) (Zod, generated from it).

## Public surface

- `load()` returns the typed `Config` (the Python-read namespaces) from this package's
  `config.kdl`; `CONFIG_KDL_PATH` is its path. Python code calls either this or
  `astra_config.load_config()`, which finds the same file from the repo root.
- `python -m astra_ontology_config <namespace.field> ...` prints values, one per line, for
  shell recipes; data paths print resolved to absolute paths. Example:
  `uv run python -m astra_ontology_config data.akasha-content`.

## Editing `config.kdl`

- **Every plaintext key is required and has no code default.** Adding a key means adding it to
  the namespace model in `libs/py/config` `models.py` and to `fixtures/config/config.kdl`;
  removing one means deleting it from all three, together with its last reader.
- **A TS-read namespace** needs `just ontology-gen` afterwards (it regenerates
  `libs/ts/config/src/config.gen.ts`); commit the result. The `models.py` docstring lists which
  language reads which namespace.
- **Data paths.** Fields typed as data paths are relative to `data.root`
  (`/ruby/data/astra-state`), and the published datasets to `data.content-root` (the astra-data
  clone). The comment on the `data` block lists the layout of the data root; keep it, and
  `deploy/deploy.sh` `init_artifacts`, in step when you add a directory.
- **Secrets** are `ref="sops:KEY"`. The value lives in `deploy/sops/secrets.enc.yaml`; a
  container gets it as the env var named like the key, upper-cased, injected by `just deploy`.

## Testing

`uv run pytest libs/py/config` validates the real file against every namespace
(`test_whole_config_kdl_validates`) and fails on a field nothing reads
(`test_config_readers.py`).

## Traps

- **Each process validates only its own language's namespaces.** A bad value in a TS-only
  block does not stop a Python process, and the reverse; only the CI test sees every block.
- **The file is baked into every image.** Containers read
  `/repo/ontology/ontology-config/config.kdl` at runtime, so a change goes live only when the
  affected services are rebuilt with `just deploy <service>`.
- **The env var of a secret is the SOPS key upper-cased** (`portal_mcp_api_key` becomes
  `PORTAL_MCP_API_KEY`), not the config field name.
