# astra-ontology — typed models over the ontology files

`astra_ontology` holds the Pydantic models and parsers for the three ontology files: `being.kdl`
(who plays whom), `sessions.kdl` (the GM's per-session overrides) and `entity.kdl` (the
in-world noun registry), plus the entity resolver. The data files themselves live in the
`ontology/` packages, which pin their paths and call into this library:
[`ontology-being`](../../../ontology/ontology-being/README.md) and
[`ontology-entity`](../../../ontology/ontology-entity/README.md). scribe, linguist, mouthpiece,
heartwood, akasha-backend, assay and the mouthpiece tools import it.

## Public surface

- **Being.** `load_being(path)` returns the validated `Being`: `players` (`Player` with the
  `player_id` dice key, Discord snowflakes, recording aliases, colour), `campaigns` (`Campaign`
  with `Role` seats), `weal_hosts` (`WealHost` with its `HostLines` banks), `podcast_personas`
  `guest_color` and `astra_worlds`. `canonical_json(being)` is the stable JSON TS reads.
  `astra_campaign_slugs(being)` gives the campaigns set in a world of the Astra
  (`astra_worlds`), the only ones heartwood ingests.
- **Sessions** (`astra_ontology.sessions`). `load_session_overrides(path)` returns
  `SessionOverrides`: `get(key)`, `for_episode(episode_id)`, `skipped(key)`, `skipped_keys()`.
  Each `SessionOverride` carries `skip`, `kind` (`session`, `recap` or `special`), `title` and a
  `note`.
- **Entities.** `parse_entities(path)` and `serialize_entities(entities)` read and write
  `entity.kdl`. `seed_entities(snapshot, defs, being)` derives entities from the akasha
  snapshot, `defs.kdl` and the Astra-world player characters, merging only names that fold to the
  same string; `merge_seed(fresh, existing)` merges a fresh seed over the existing registry.
- **Resolution.** `Resolver(entities).resolve(name, kind_hint=None)` returns a `Resolution` with
  status `resolved`, `ambiguous` or `unknown`, a confidence and up to `RESOLVE_K` candidates. An
  exact folded match wins outright; otherwise `astra_lexicon.ensemble_sim` ranks canonicals and
  aliases, with `RESOLVE_FLOOR` (0.6) and `RESOLVE_GAP` (0.08) separating a hit from ambiguity.
  The traced, cached wrapper over the committed registry is `astra_ontology_entity.resolve`.

## Testing

```sh
uv run pytest libs/py/ontology
```

`test_ontology.py` round-trips the real `being.kdl` against the committed
`being.canonical.json`.

## Traps

- **This is the one `being.kdl` parser.** TS (`@astra/ontology`) reads only
  `being.canonical.json`. After changing `being.kdl` or the `Being` models, run
  `just ontology-gen` and commit the JSON; update `libs/ts/ontology/src/models.ts` to the same
  field set, or its strict schema fails.
- **`player_id` is a foreign key** into the dice history. Carry it verbatim; never renumber.
- **Re-seeding never loses a human edit.** An entity with `source "manual"` keeps its identity
  and only gains auto-derived aliases and sources; a manual entity that no source produces any
  more is kept. An entity without `source "manual"` disappears when its source stops producing
  it, so mark a hand-curated entity manual.
- **Session keys are `YYYY-M-D`, not zero-padded.** `sessions.kdl` rejects a malformed or
  repeated key and any unknown property, so a typo fails the load instead of doing nothing.
