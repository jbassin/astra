# astra-ontology-entity — the entity registry's path, seed CLI and resolver

The entity registry, `entity.kdl`, lists the setting's in-world nouns (people, places,
organisations, deities, phenomena, creatures, items) with their aliases, wiki page and
sources. heartwood and the mouthpiece producer resolve transcript mentions against it. The
real registry is not in this repo: it lives in the astra-data clone at `data.entity-registry`
(`/ruby/data/astra-state/astra-data/entity/entity.kdl`), and heartwood commits it there. The
models and the seeding logic are in [`libs/py/ontology`](../../libs/py/ontology/README.md);
this package pins the paths, adds telemetry and provides the seed CLI.

## Public surface

- `ENTITY_KDL_PATH` (config `data.entity-registry`) and `SNAPSHOT_PATH` (the akasha snapshot,
  config `data.akasha-snapshot`).
- `load_entities()` parses the registry.
- `resolve(name, kind_hint=None)` resolves a mention against a cached `Resolver` and records an
  `astra.heartwood.resolve` span and counter. `reload_registry()` drops the cache after a
  reseed in a long-running process.
- `astra-ontology-entity-seed` (`seed.py`): rebuilds the registry from the akasha snapshot,
  `defs.kdl` and the faerrin player characters, merged over the existing file so curated
  (`source "manual"`) entities survive. `--check` writes nothing and exits 1 when the file is
  stale. It logs and counts under `astra.heartwood`.

## Where the registry is reseeded

- `just heartwood-agent` and `just heartwood-revert` reseed the real registry before every
  commit in the clone.
- `just ontology-gen` regenerates the test fixture, `fixtures/astra-data/entity/entity.kdl`;
  `just ontology-check` fails when it is stale.
- By hand: `uv run astra-ontology-entity-seed --check` reports drift in the real registry;
  without `--check` it rewrites it, and you commit the change in the astra-data clone.

## Testing

```sh
uv run pytest ontology/ontology-entity
```

The tests run over the fixture registry: the root `conftest.py` points `data.content-root` at
`fixtures/astra-data`.

## Traps

- **The paths are read from config at import time.** Set `ASTRA_CONTENT_ROOT` before importing
  this package to point it at another tree (`scripts/ontology_gen.py` does this for the fixture).
- **Running the seed without `--check` on the host writes the live clone.** That is the real
  registry the bots commit; review the diff there before committing.
- **A `defs.kdl` or `being.kdl` change in this repo leaves the real registry stale** until the
  next heartwood run or a manual reseed. The watchdog's entity.kdl drift check reports it.
