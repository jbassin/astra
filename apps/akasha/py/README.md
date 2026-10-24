# akasha-backend — the akasha wiki's content store and snapshot

The akasha wiki is a corpus of vellum pages in the astra-data clone, at `data.akasha-content`
(`/ruby/data/astra-state/astra-data/akasha/content`). This package loads that corpus
(`astra_akasha_backend.corpus.load_corpus`), validates it with the TypeScript validator,
resolves crossrefs, and writes `akasha/snapshot/akasha-snapshot.json`
(`uv run akasha-snapshot`). akasha-frontend bakes the content and snapshot at build time;
mouthpiece's producer and grounding read the content live; heartwood edits it. The snapshot
is not a Dagster asset: the validator needs node, which the Dagster image lacks, so the
heartwood recipes run it on the host.

## Operations

**Edit the wiki by hand** (in the astra-data clone, on `main`):

1. Edit the `.vellum` pages under `akasha/content/`.
2. From a code checkout, validate the corpus, rebuild the snapshot and reseed the entity
   registry:

   ```sh
   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
     libs/ts/vellum-lang/scripts/validate-corpus.ts --dir /ruby/data/astra-state/astra-data/akasha/content
   uv run akasha-snapshot
   uv run astra-ontology-entity-seed
   ```

3. Commit and push in the clone, then `just deploy akasha-frontend`. linguist-commit
   redeploys akasha only when linguist data changes, so a hand edit waits otherwise. Commit
   before the next heartwood run: heartwood refuses to start on a dirty corpus (exit 6).

**Session audio.** The transcript pages play the combined session recording, served by
akasha-frontend at `/audio/<date>.mp3` (Range requests, 206) from
`/ruby/data/astra-state/audio/akasha`. `just akasha-seed` copies each
`scribe/data/saved/<date>/audio.mp3` there as `<date>.mp3`, overwriting live sessions and
adding historical ones only when absent. linguist-commit runs it before each akasha redeploy.
Most of these recordings exist nowhere else; the nightly backup covers the dir, so never
delete it.

## Traps

- **URLs replace spaces with dashes and keep case:** `/Divinity/Ashen-Pact/Regent`. A `%20`
  URL returns 404.
- **Only committed content ships.** deploy.sh bakes the clone's committed `HEAD`; uncommitted
  edits never reach the site.
- **The entity registry can drift.** `entity/entity.kdl` is reseeded from the snapshot by the
  heartwood recipes, but nothing checks it when `defs.kdl` or `being.kdl` change in the code
  repo. `uv run python -m astra_ontology_entity.seed --check` reports drift.
