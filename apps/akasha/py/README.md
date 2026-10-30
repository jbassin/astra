# akasha-backend — the akasha wiki's content store and snapshot

The akasha wiki is a corpus of vellum pages in the astra-data clone, at `data.akasha-content`
(`/ruby/data/astra-state/astra-data/akasha/content`). This package loads that corpus
(`astra_akasha_backend.corpus.load_corpus`), validates it with the TypeScript validator,
resolves crossrefs, and writes `akasha/snapshot/akasha-snapshot.json`
(`uv run akasha-snapshot`). akasha-frontend bakes the content and snapshot at build time;
mouthpiece's producer and grounding read the content live; heartwood edits it. The snapshot
is not a Dagster asset: the validator needs node, which the Dagster image lacks, so the
heartwood recipes run it on the host.

Page frontmatter has one field with a fixed meaning beyond `title`, `tags`, `aliases` and
`img`: `campaigns`, the list of campaign slugs (`ontology/ontology-being/being.kdl`) a page's
content came from, oldest first, repeats dropped. vellum-lang parses it in both languages,
and the snapshot carries it as `frontmatter.campaigns` (`[]` when absent). heartwood sets it
(see its README); set it by hand only with slugs from `being.kdl`.

## Operations

**Edit the wiki by hand** (in the astra-data clone, on `main`):

1. Edit the `.vellum` pages under `akasha/content/`.
2. From a code checkout, validate the corpus, rebuild the snapshot and reseed the entity
   registry:

   ```sh
   node --import tsx \
     libs/ts/vellum-lang/scripts/validate-corpus.ts --dir /ruby/data/astra-state/astra-data/akasha/content
   uv run akasha-snapshot
   uv run astra-ontology-entity-seed
   ```

   The snapshot reads metadata through the Python vellum-lang, a regex twin of the TS
   parser. `just vellum-parity-live` checks that the two agree on every page of the real
   wiki (daily, through `astra-vellum-parity.timer`, which pages on a failure); CI runs the same
   check (`just vellum-parity`) on the committed vellum files only.

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
