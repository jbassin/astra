# astra-ontology-being — who plays whom

This package owns three files:

- `being.kdl`: the hand-edited roster. `player` nodes are the real people (name, the
  `player-id` dice key, Discord snowflakes, recording aliases, DM and admin flags, colour);
  `campaign` nodes list each show's world, edition and `role` seats (player to character);
  `astra-worlds` lists the worlds of the Astra, the only campaigns heartwood ingests;
  `weal-host` nodes are weal-bot's Discord send identities with their flavour lines;
  `podcast-persona` nodes are mouthpiece's roundtable hosts with their ElevenLabs voices; and
  `guest-color` is the colour for an unknown speaker. In-world characters are not here; they
  live in the akasha wiki and the entity registry.
- `being.canonical.json`: generated from `being.kdl` by `just ontology-gen`. TypeScript
  (`@astra/ontology`: weal-bot, orator-backend, akasha-frontend) reads only this file.
- `sessions.kdl`: the GM's per-session overrides. `skip=#true` leaves a session out of every
  show (no chronicle entry, heartwood ingest or mouthpiece episode; its transcripts are still
  written), `kind` sets the episode kind, `title` sets the published podcast title, and a
  `note` child says why.

The models and parsers are in [`libs/py/ontology`](../../libs/py/ontology/README.md); this
package pins the paths.

## Public surface

- `load()` returns the typed `Being` from `being.kdl`.
- `session_overrides()` returns `sessions.kdl` as `SessionOverrides`, parsed once per process.
- `BEING_KDL_PATH`, `CANONICAL_JSON_PATH`, `SESSIONS_KDL_PATH`.

Python readers: scribe, linguist, mouthpiece, heartwood, akasha-backend, assay, the mouthpiece
tools and the entity seed.

## Testing

The tests live in `libs/py/ontology` (`uv run pytest libs/py/ontology`). `just ontology-check`
(in `just check` and CI) fails when `being.canonical.json` is stale.

## Traps

- **After editing `being.kdl`, run `just ontology-gen`** and commit the JSON and the
  regenerated fixture entity registry. Never edit the JSON by hand.
- **`player-id` values are foreign keys** into the dice history. Never renumber them.
- **Both files are baked into images.** A `sessions.kdl` edit is live after
  `just deploy dagster-code dagster-daemon`; a `being.kdl` change reaches a Node service only
  when its image is rebuilt with `just deploy <service>`.
- **A `being.kdl` change also stales the real entity registry** in astra-data until the next
  heartwood run reseeds it (see [`ontology-entity`](../ontology-entity/README.md)).
- **Some tests pin the roster.** The substrate smoke test asserts five players.
- **Append new campaigns at the end.** A campaign's position in the list is its transcript
  filename prefix (`<0 main | 1 other><idx>.<slug>.<date>.txt`), so inserting one renames the
  later files. weal's roster takes the first `main` campaign, so an earlier campaign is
  `main #false`.
