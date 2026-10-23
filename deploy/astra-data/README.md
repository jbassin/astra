# astra-data

The published output of the [astra](https://github.com/jbassin/astra) campaign pipeline and
the campaign wiki. **A bot writes this repo**: the pipeline produces the files, and astra's
`linguist-commit` timer and heartwood recipes commit and push them. Hand edits are fine
for the wiki (`akasha/content/`), made in your own clone, never in the live clone at
`/ruby/data/astra-state/astra-data` (an uncommitted edit there makes heartwood refuse to run).
Pull first, keep the commit small, and push promptly, since a bot commit to the same lines
makes the bots' rebase fail. A pushed edit goes live with the next heartwood publish or
session, or with `just deploy akasha-frontend` once the linguist-commit timer has pulled it (it fetches
every 15 minutes). Don't hand-edit the generated
files; change the code in astra instead.

The history starts at a snapshot commit; older history of these files is in the astra repo,
where they lived until October 2026.

## Layout

| Path | What | Written by |
|---|---|---|
| `linguist/transcripts/` | Canonical session transcripts (`<NNN>.<show>.<date>.txt`) | linguist (Dagster) |
| `linguist/data/` | Per-session script JSON (`<date>.json`), corrections applied | linguist (Dagster) |
| `linguist/timeline/` | Chronicle: per-episode summaries and the season plan | linguist (Dagster) |
| `mouthpiece/snapshot/` | The podcast episode catalog (`episodes-index.json`) | `just mouthpiece-publish` |
| `akasha/content/` | The wiki pages (`.vellum`) | heartwood agent, or by hand here |
| `akasha/snapshot/` | The wiki graph snapshot (`akasha-snapshot.json`) | `akasha-snapshot` |
| `heartwood/agent-runs.jsonl` | heartwood's run ledger, one line per published or reverted session | heartwood |
| `entity/entity.kdl` | The in-world noun registry (seeded from the snapshot, defs and roster) | `astra-ontology-entity-seed` |

## Who reads it

astra's config (`ontology/ontology-config/config.kdl`, `data.content-root` and the `data.*`
dataset paths) points at the live clone. The Dagster pipeline reads and writes it through
bind mounts. The akasha and mouthpiece frontends bake it in at build time (`deploy.sh` passes
the clone's committed HEAD as the `astra-data` Docker build context). The wiki's transcript
pages, the podcast site and `api.akasha.iridi.cc/scripts/` all serve what is here.
