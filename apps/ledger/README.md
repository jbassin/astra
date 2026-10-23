# ledger — the astra landing page

ledger is one page of cards linking the campaign's player-facing sites (strider, akasha,
mouthpiece, harrow, vellum), at `https://ledger.iridi.cc`. It is the smallest app on the strider
template (see `apps/strider/README.md`): backend-less TanStack Start SSR, Compose service
`ledger`, port 10370, `service.name=astra.ledger`, no content files (`content/.gitkeep` keeps the
directory). The background is `@astra/backdrop`'s `ledgerAurora`.

## Adding or changing a card

The card list is the `REGISTRY` array in `scripts/build-content.ts` (key, title, blurb, order).
Each card's URL is **not** written there: `originFor(cfg, key)` reads that site's own
`public-origin` from `config.kdl`, and build-content emits the joined list to
`src/generated/sites.ts`. To add a site:

1. Make sure the site has a `public-origin` in its `config.kdl` block (mirrored in both config
   schemas).
2. Add a `REGISTRY` entry and a `case` in `originFor`.
3. Update `src/domain/lib/sites.test.ts`, which pins the keys, their order, and that each href is
   an `https://<name>.iridi.cc` origin starting with its key.
4. `just deploy ledger`.

## Traps

- **Never hardcode a site URL here.** The config origin is the single source; a hardcoded URL
  silently drifts when a host moves.
- **A new `*.iridi.cc` host needs no manual DNS record.** `*.iridi.cc` is a wildcard and Caddy
  issues the certificate through the DNS challenge on the first request (expect a short failure
  window while it does). Add the site block to `sites.caddyfile`, deploy, then
  `just caddy-validate` and `just caddy-reload`.
