# @astra/ontology — the typed roster for TypeScript

`@astra/ontology` gives TS code the `Being` roster: players, campaigns, weal-bot's hosts and
mouthpiece's podcast personas. weal-bot, orator-backend and akasha-frontend's content build use
it. Python owns the roster: [`ontology-being`](../../../ontology/ontology-being/README.md) holds
`being.kdl`, and `just ontology-gen` writes `being.canonical.json` from it. This package reads
only that JSON.

## Public surface

- `loadBeing(path?)` reads `being.canonical.json` (default `defaultBeingFile()`, found from the
  repo root) and validates it with `BeingSchema`.
- The types `Being`, `Player`, `Campaign`, `Role`, `WealHost`, `HostLines` and
  `PodcastPersona`.

## Testing

```sh
pnpm --filter @astra/ontology test
```

`ontology.test.ts` parses the committed JSON, so a field Python adds or drops fails here.

## Traps

- **Keys are snake_case** (`player_id`, `is_dm`, `guest_color`): they are Python's
  `model_dump()` keys, not the usual camelCase.
- **Every object is `.strict()` and every field required.** When the Python `Being` models
  change, change `src/models.ts` to the same field set in the same commit.
- **`player_id` is a foreign key** into the dice history; carry it verbatim.
- **Services read the JSON at runtime** from `/repo/ontology/ontology-being` in their image, so a
  roster change reaches a service only when its image is rebuilt (`just deploy <service>`).
