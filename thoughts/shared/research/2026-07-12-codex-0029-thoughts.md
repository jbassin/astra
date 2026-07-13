# codex (0029) — PF2e reference site: scoping

**Date:** 2026-07-12 · **Status:** SCOPED — all decisions resolved, ready for `octo:spec` ·
**Builds on:** `2026-07-12-codex-0029-viability-thoughts.md` (verdict GREEN; data/legal/
5etools/stack-fit evidence lives there — this doc doesn't repeat it) · **Stakeholder:** Josh.

**What codex is:** a public, free PF2e reference site at `codex.iridi.cc` — the content breadth
of Archives of Nethys, the data/UX structure of 5e.tools (faceted browse + instant search +
per-entity pages), rendered with gothic. A new TS frontend `apps/codex` on the strider/site-kit
SSR template (Decision I intact), fed by a build-time ingest pipeline that joins two corpora:
the foundryvtt/pf2e packs (structured mechanics, per-doc ORC/OGL labels) and the AoN
Elasticsearch index (prose, citations, rules/sidebar text).

---

## Decisions ledger (all RESOLVED, stakeholder, 2026-07-12)

| # | Decision | Resolution |
|---|---|---|
| C-1 | Exposure | **Publicly reachable, personal-use posture, NOT search-indexed** — *revised twice during scoping* (party-only → public → this). Stakeholder call 2026-07-12: no CUP-mitigation requirements; the site is for personal use, just without an auth gate. **The one build requirement this adds: noindex** — `robots.txt` (Disallow all) + `X-Robots-Tag: noindex` at the Caddy block + no sitemap; keep it off the ledger landing-page card grid. (For the record: noindex affects discoverability, not legal status — accepted; the practical delta is near-zero since the site is free anyway and neither corpus contains AP narrative prose, the one risky tier.) |
| C-2 | Content tier | **CUP gray tier** — full Golarion proper nouns, deities, statblock flavor (the Pf2eTools/Wanderer's Guide posture, years of precedent). |
| C-3 | Corpus | **Hybrid** — Foundry packs = mechanical source of truth; AoN ES = prose/citation/rules overlay. Join on sluggified name + category map + AoN `remaster_id`. |
| C-4 | Remaster | **Remaster-primary + legacy toggle** (5etools 2014/2024 pattern); pairs via AoN `remaster_id` + Foundry's `remaster-changes` redirect journal. |
| C-5 | v1 categories | **Everything** — core lookup + character-build + GM sets + rules/sidebar prose. Nothing deferred. |
| C-6 | Corpus storage | **Gitignored + committed fixture** — snapshots + canonical corpus in gitignored dirs, refreshed by a `just` recipe; a small committed fixture corpus (~200 entities spanning every category/shape) keeps CI hermetic. Host image builds bind-mount/COPY the full corpus. |
| C-7 | Ingest lane | **TypeScript, no Dagster** — scripts inside `apps/codex` (akasha build-content precedent); the Zod entity schema is shared verbatim between transform and frontend. Corpus refresh is on-demand (`just codex-refresh`), not scheduled. |
| C-8 | Access gate | None (follows C-1). No local_only/basic_auth block; standard `astra_site` Caddy block. |

## Verified repo facts (checked this session, not assumed)

- **Port: 10374 is next free** (10373 = portal-headless, `config.kdl:289`; nothing above it).
- **Layout: `apps/codex`, single flat pnpm member** (`package.json` manifest → pnpm lane;
  matched by the existing `apps/*` glob — no `pnpm-workspace.yaml` edit, no uv `exclude`
  needed; those were only required for portal's *nested* members). No empty-dir pre-creation
  (uv gotcha n/a — flat member created with its manifest).
- **Dockerfile ripple: 21 sibling `COPY apps/...` lines** per frontend Dockerfile
  (counted in `apps/akasha-frontend/Dockerfile`) — adding the member touches every TS sibling
  Dockerfile, the known manifest-COPY ripple. Budget a slice-sized chore for it.
- **Edge:** new block in `sites.caddyfile` (`import astra_site`, reverse_proxy 10374);
  `*.iridi.cc` wildcard means DNS just works and the cert mints itself (ledger precedent,
  ~20-60s TLS flap on first hit). No auth matcher (C-8). `local_only` exists in the parent
  Caddyfile for reference but is unused here.
- **Config:** new `codex {}` block in `ontology/ontology-config/config.kdl` (port,
  public-origin, corpus paths) + BOTH schema mirrors (Pydantic + Zod) per config-single-source.
  No secrets — the AoN fetch needs no key; no SOPS entry.
- **Telemetry:** `astra.codex` service via `libs/ts/observe` before anything else; SSR spans
  per request (site-kit `createSsrServer` does this for free). Day-one per the standing
  principle. Note the heartwood lesson: pick ONE service name; frontend-only here so no
  backend/frontend name collision to de-collide.
- **No name collision:** no `codex` member/config/service exists anywhere in the repo.

## Verified data facts — AoN ES (live probes this session)

- Endpoint re-confirmed live + auth-free server-side (`elasticsearch.aonprd.com/aon/_search`).
- **Sizing (random-30 sample):** avg `_source` 5,443 B (min 1,444 / max 12,065) →
  **projected raw corpus ~226 MB** for 43,686 docs. Confirms C-6 (don't commit snapshots).
- **Prose-completeness matrix (the lore-layer reality check):**
  - `rules` (3,645 docs): **full text, section-granular**, with `breadcrumbs` (e.g.
    *Counteracting* under `['Chapter 9: Playing the Game','General Rules']` — 1,773 B md) —
    breadcrumbs give the rules-browser tree for free. Multiple same-name sections across books
    are distinct docs (4 × "Counteracting" verified) — disambiguate by breadcrumbs + source.
  - `sidebar` (694): full text (verified samples 611–918 B).
  - `article` (107): **CITATION STUBS ONLY** ("Learn about the history of Breachill…", 272 B) —
    AP backmatter teasers, not lore prose. **The v1 "lore" layer = rules + sidebars + the flavor
    already embedded in entity docs; full AP gazetteer prose was never in the corpus** (and
    reproducing it would be the one legally-dangerous tier anyway — happy alignment).
- Sort-by-`_id` is rejected by the cluster (fielddata disabled) — page with `search_after` on
  a sortable field or per-category `term` queries under the 10k cap (43,686 total; only
  `equipment` 8,642 and `feat` 8,460 approach it; all categories fit in one page each today,
  but the pager must handle >10k for future growth).

## Verified data facts — foundryvtt/pf2e (from this session's sparse clone)

Full inventory in the viability doc §1. The load-bearing transform facts:
- 28,646 docs / 96 packs; plain per-doc JSON; build step only injects slug/ids (content
  passes through) → track the repo, transform at ingest.
- **Enricher census** (what the parser must cover): `@UUID` 92,788 · `@Check` 16,994 ·
  `@Damage` 14,998 (formula grammar at repo root `roll-grammar.peggy`) · `@Localize` 7,525
  (indirection into `static/lang/en.json`) · `@Template` 4,825 · `@Embed` 2,715 · core
  inline-rolls. All six take `@Tag[pipe|args]{label}` form.
- **THE gotcha:** `@UUID` pack segments are *registered compendium names*, not directories
  (`spells`→`spells-srd`, `actions`→`actionspf2e`, `conditions`→`conditionitems` …) — resolve
  via `system.pf2e.json`'s `packs[].name→path` map. Refs are often name-based.
- Slug = `sluggify(name)` (build-injected, deterministic — we compute identically; it's also
  the AoN join key). Traits live in `en.json`, not a pack. Per-doc
  `system.publication.{license,remaster,title}`. `remaster-changes` journal = redirect table.
- Cadence ~3–5 weeks/minor (8.3.0 on 2026-07-06) → `just codex-refresh` re-pulls a pinned tag;
  pin the tag in config/manifest so refreshes are deliberate, diffable events.

## Canonical schema + join (sketch — spec pins the exact shape)

One Zod discriminated union over categories; every entity carries:
`{id, slug, category, name, level?, traits[], rarity, source{book, page?, license, remaster},
legacyPair?, facets{...per-category}, body: TypedNode[] | html, crossrefs[], aonUrl?}`.
- **Join:** Foundry doc ↔ AoN doc on `(categoryMap, slug)`; expect a residue of name mismatches
  → a committed exceptions/aliases file (small, hand-curated as they surface); AoN-only
  categories (rules, sidebars, sources) pass through solo; Foundry-only (effects packs —
  mechanical automation items, not reference content) are **excluded** from codex.
- **Conflict policy:** Foundry wins mechanics; AoN wins prose/citations/page numbers.
- **Filter metadata baked per entity at transform time** (the 5etools lesson) — facets never
  parse prose at query time.
- Cross-refs (`@UUID`, AoN link markup) both resolve to codex slugs at transform time; broken
  targets recorded in a transform report, not silently dropped (heartwood refine precedent).

## Phase plan (spec will slice; sizes relative to portal 0023 ≈ M)

- **P1 — ingest + canonical corpus (L, the real project):** `apps/codex/scripts/` — snapshot
  fetchers (AoN pager, Foundry tag pull) → both parsers (enricher grammar incl. `@Localize`/
  `@Embed` resolution + PEG damage formulas; AoN markdown markup) → join + canonicalize →
  gitignored corpus + committed fixture + transform report (counts, unjoined residue, broken
  refs). Gate: fixture round-trips; live corpus report reviewed by hand.
- **P2 — entity pages (M):** JSON→gothic render layer (StatCard/TraitPill/ActionGlyph/Fields
  reused; NEW: ability-grid, AC/save line, StrikeLine, spell-list block); per-entity SSR routes
  with sharded lazy bodies (transcript-pattern, applied universally); hover-tooltip cross-refs.
  Gate: golden renders for one entity per category vs hand-checked output.
- **P3 — browse + search (M):** per-category facet pages (net-new tri-state filter UI over
  compact per-category JSON) + Pagefind full-text (build-search NodeJS-API pattern) + remaster/
  legacy + source toggles; URL round-trips entity + filter state.
- **P4 — rules/lore browser (S-M):** rules tree from breadcrumbs + sidebar placement +
  sources index.
- **P5 — deploy (S):** Dockerfile (+21-sibling ripple) + compose unit (10374) + caddy block +
  `just codex-refresh` + live gate.

## Risks

- **AoN ES lockdown/change** — undocumented infra. Mitigated: snapshot-once posture (C-6);
  the site never depends on the endpoint at runtime; worst case codex continues Foundry-only
  with citations frozen.
- **Enricher/markup grammar drift** — Foundry minor releases can add enricher forms. Mitigated:
  transform hard-fails on unknown `@Tag` forms (report, don't guess); refresh is deliberate.
- **Join residue volume unknown** until P1 runs the real corpora — if slug matching misses at
  scale (>few %), the exceptions file grows or the join needs fuzzy assist; budgeted inside P1.
- **Public exposure (C-1)** — personal-use posture, noindex; no CUP-mitigation requirements
  (stakeholder call). Still keep the AoN `markdown` field as *transform input only* (render
  from the canonical schema — it's the better engineering anyway) and show per-entity source
  citations (useful at the table, and the community norm).
- **Corpus in the image** — full corpus (~100-200 MB canonical) baked via COPY would bloat the
  image; prefer the artifacts/ bind-mount pattern (mouthpiece episodes precedent) with the
  sharded corpus read at SSR time (transcript-pattern reads are per-entity, small). Spec pins
  this (D-candidate).
- **Scale unknowns at build** — 30-50k Pagefind pages + facet JSON size per category; measured
  in P3 with real corpus before tuning (Pagefind proven to ~100k pages in the wild).

## Deferred to spec (deliberate, not open questions)

Exact URL scheme (`/spells/fireball` + `?legacy` vs edition-suffixed slugs); facet set per
category; hover-tooltip scope (which link kinds pop cards); typed-node vs pre-rendered-HTML
body storage; fixture-corpus composition; transform-report format; whether P2/P3 interleave
per-category (ship monsters end-to-end first) or complete layers.

**▶ NEXT: `octo:spec` → `thoughts/astra/specs/0029-codex-spec.md`**, then `octo:embrace` P1.
