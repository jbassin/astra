---
name: ledger-0018-gotchas
description: PROJECT 0018 — built `ledger`, the astra landing page (a backend-less SSR frontend that links to all the other sites); the cross-site config-origin registry pattern + deploy notes
metadata:
  type: project
---

PROJECT 2026-06-26 **COMPLETE + LIVE on `https://ledger.iridi.cc`**: built **ledger
(0018)**, a net-new **astra landing page** — one homepage with a gothic card grid
linking the five player-facing sites (strider/akasha/mouthpiece/harrow/vellum). A
**backend-less SSR frontend on the strider template** (port **10370**,
`service.name=astra.ledger`), the **simplest frontend in the repo** — a sibling of
harrow but even smaller (no content files, one route). 3 CI-green slices
(`e6aeaea` config → `cab6ebe` app → `ae8b27e` deploy), pushed + deployed +
edge-reloaded + live-verified. Spec `thoughts/astra/specs/0018-ledger-spec.md`. Built
on [[migration-guide]] + `apps/strider/README.md` + [[harrow-0017-gotchas]].

**Decisions (user-chosen):** host = a new subdomain `ledger.iridi.cc` (not the apex
`iridi.cc`); links = player-facing sites only (orator/weal-overlay/signoz/dagster
excluded); design = a clean gothic card grid (not a bespoke motion/starfield landing,
so **no pixi** — simpler than harrow). Full deploy incl. the public edge.

**THE load-bearing pattern — config-single-source for a cross-site link registry.**
ledger hardcodes **no URLs**. `scripts/build-content.ts` reads each linked site's own
`public-origin` from `config.kdl` (via `@astra/config` `loadConfig()` at build time —
build-content runs under bun, so importing config is fine) and joins it to a small
ledger-owned registry (key + title + blurb + order) → `src/generated/sites.ts`
(`SITES: SiteLink[]`, each `href` = that site's config origin). A `key→namespace`
`originFor(cfg, key)` switch maps `strider→cfg.strider`, `akasha→cfg.akashaFrontend`,
`mouthpiece→cfg.mouthpieceFrontend`, `harrow→cfg.harrow`, `vellum→cfg.vellumFrontend`.
To complete the registry I **added `public-origin "https://strider.iridi.cc"` to
strider's config block** (it only had service-name + port; the other four frontends
already had a public-origin) — mirrored in both Zod + Pydantic + their tests. The
`sites.test.ts` gate asserts the 5 keys in order, each href `^https://[a-z-]+\.iridi\.cc$`,
and `host.startsWith(key)`.

**Mechanics that are pure template (copy as-is from harrow):** the shell —
server.ts/vite.config.ts/vitest/tsconfig/router.tsx/observe (rum + the
`getRumConfig` createServerFn, MUST stay in app source)/ssrSmoke/globals.css; `vite
--configLoader runner` in dev/build; `@layer base` reset; SSR-only (commit
`routeTree.gen.ts`); fonts self-serve via `gothicFontsPlugin`; the contentWatchPlugin
runs build-content at buildStart (ledger has **no content files** — `content/.gitkeep`
keeps the dir; the "content" is config + the inline registry; `invalidate:
["site.ts","sites.ts"]`). `src/generated/` is gitignored (only `.gitignore` tracked).

**Deploy gotchas:** (1) the **new-member Dockerfile manifest ripple** — every frontend
Dockerfile COPYs the FULL workspace manifest set for `bun install --frozen-lockfile`,
so adding ledger means inserting `COPY apps/ledger/package.json apps/ledger/` into the
**9 sibling** Dockerfiles + ledger's own (alphabetical, after harrow). (2) **uv
exclude** `apps/ledger` (bun-only member; uv hard-errors on a manifest-less glob hit).
(3) **Backend-less → no SOPS** → a targeted `docker compose up -d --build ledger` is
safe (the silent-MOCK/SOPS-env-drop trap from [[deploy-sops-injection]] only bites
secret-needing services; same as harrow's starfield deploy).

**Edge — the new subdomain JUST WORKED.** Prior frontends *deferred* the
`<host>.iridi.cc` DNS as a "manual record." But `*.iridi.cc` is a **wildcard** (→
`iridi.cc` → the host IP), so `ledger.iridi.cc` resolved **immediately with no manual
record**, and Caddy's ACME-**DNS** (cloudflare) challenge provisioned a real Let's
Encrypt cert (`CN=ledger.iridi.cc`). `just caddy-validate` (the merged parent edge) →
`just caddy-reload` → **public HTTP/2 200 over TLS**, all 5 cards with resolved
origins, `astra.ledger` SSR spans in SigNoz (0 errors). So future astra subdomains
likely don't need a manual DNS step either — try the wildcard first. Per
[[deploy-apply-with-just]] the container/edge aren't live until `up` + `caddy-reload`.
