# 0018 — ledger (the astra landing page)

**Status:** in progress (2026-06-26)
**Kind:** net-new app (NOT a faerrin port — nothing to port; astra-specific).
**Template:** strider SSR frontend (Decision I), modeled on harrow (backend-less sibling).

## What

A single homepage at `ledger.iridi.cc` (host port **10370**) that links to the
player-facing astra sites in a gothic card grid. No backend, no DB, no volume — the
simplest frontend in the repo (simpler than harrow: no content-parsing pipeline, one
route).

## Locked decisions

- **Host:** `ledger.iridi.cc` (new subdomain, mirrors the other frontends). Needs a
  new DNS record (deferred/outward-facing, like the other frontends).
- **Linked sites (player-facing only):** strider, akasha, mouthpiece, harrow, vellum.
  Tools (orator, weal-overlay) and admin (signoz/dagster/otel) are out.
- **Design:** clean gothic card grid (title + blurb + link per site). Not a bespoke
  motion landing.
- **Config-single-source for URLs:** each linked site already declares its own
  `public-origin` in `config.kdl`; ledger's build reads those at build time and joins
  them with ledger-owned content (title + blurb + order) → `src/generated/sites.ts`.
  No hardcoded URLs. strider gained a `public-origin` to complete the registry.

## Scope

In: the `ledger` config namespace (both schemas), the SSR scaffold on the strider
template, `build-content` (config origins + registry → generated modules), the home
route + gothic card grid, a sites-registry test, the SSR smoke, deploy (Dockerfile +
the sibling manifest ripple, Compose @10370, Caddy block).

Out: any backend/DB/audio volume; multiple routes; search/graph/pixi; the apex
`iridi.cc` host (subdomain only).

## Slices

1. **Config + scaffold** — `ledger { service-name; port 10370; public-origin }` in
   `config.kdl` + Zod + Pydantic (+ tests); strider `public-origin`; uv `exclude`;
   shell copied from harrow (server/vite/tsconfig/router/observe/styles/ssr-smoke);
   placeholder home; SSR smoke green.
2. **Content + UI** — `build-content` reads the 5 origins from config + registry →
   `generated/{site,sites}.ts`; home route renders the gothic card grid; a test
   asserts all 5 sites resolve to a real `*.iridi.cc` origin.
3. **Deploy** — Dockerfile + the 9-sibling manifest ripple; Compose service @10370;
   Caddy block in `sites.caddyfile`; `docker compose build/up`; live-verify + SigNoz
   `astra.ledger` SSR spans. **DNS/edge cutover deferred to user go-ahead.**

## Acceptance

`/` SSRs 200 with all five site titles + resolved `https://<site>.iridi.cc` hrefs;
both CI lanes green; container healthy on 10370; `astra.ledger` SSR spans in SigNoz.
