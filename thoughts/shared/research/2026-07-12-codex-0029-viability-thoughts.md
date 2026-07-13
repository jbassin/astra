# codex (0029) — PF2e reference site: viability check

**Date:** 2026-07-12 · **Status:** VIABILITY ASSESSED — verdict GREEN; all 5 pre-scope
decisions RESOLVED by the stakeholder same day (§6); NOT yet scoped/specced · **Stakeholder ask:** a static-feeling website for quickly looking up
Pathfinder 2e info — the content breadth of Archives of Nethys (2e.aonprd.com), the data/UX
structure of 5e.tools, styled with gothic/vellum. Explicitly flagged as very large; this doc is
the pre-scope viability check (5 parallel research agents, 2026-07-12).

---

## Verdict

**Viable — GREEN on every axis, with one legal gray zone that is a scoping decision, not a
blocker.** The two hard questions a project like this usually dies on — "where does the data
come from" and "will the rights-holder object" — both came back better than expected:

1. **Data:** there are TWO complete, machine-readable corpora, and they complement each other.
2. **Legal:** Paizo is tolerant-by-default with an explicit open license (ORC) covering the
   mechanical core; the risk boundary is well-understood and avoidable.
3. **Stack:** gothic was built with PF2e vocabulary already in it (trait pills, action-cost
   glyphs, statblock document kinds); the scale problem (30–50k pages) has a proven in-repo
   solution shape (akasha's transcript lazy-load pattern).

The honest cost: this is the largest frontend astra would have built — multi-phase, with a real
data-engineering component (corpus ingestion + enricher transform) before any page renders.

---

## 1. Data acquisition — GREEN, two sources

### Source A: the AoN Elasticsearch endpoint (verified live 2026-07-12)

`https://elasticsearch.aonprd.com/aon/_search` (alias `aon`, physical index `aon81`) is
**publicly queryable with no auth** — confirmed by direct curl. **43,686 documents.** Each doc
carries BOTH a full rendered statblock (`markdown` field, custom BBCode-ish markup; `text`
plaintext sibling) AND per-field mechanical breakouts (level, traits, saves, traditions,
rarity, `remaster_id` cross-links, canonical AoN `url`, …) — i.e. it is a complete corpus
source *and* facet-ready, not just a search index.

- Category counts: equipment 8,642 · feat 8,460 · creature 4,714 · action 3,979 · **rules
  3,645** · spell 2,461 · class-feature 1,254 · trait 907 · deity 717 · hazard 634 ·
  background 612 · heritage 436 · archetype 336 · + ~70 long-tail categories.
- **Access constraint:** Origin-allowlisted (server-side/build-time fetch = unrestricted 200;
  browser JS from a non-allowlisted origin = 403). Fits our build-time-content pattern exactly.
  Page cap 10,000 docs/query → page per-category or `search_after` (community scrapers do this).
- **Etiquette/risk:** no staff statement found either way; the AoN developer (galdiuz) publishes
  the production Elm search client as MIT open source (`github.com/galdiuz/nethys-search`), and
  public scrapers (LukasParke, bLittle1996) have operated openly for years without takedown. But
  it's undocumented infra that could be locked down any time → **snapshot the corpus, don't
  live-depend** on the endpoint.

### Source B: `github.com/foundryvtt/pf2e` packs (sparse clone inspected)

**28,646 documents across 96 packs**, plain hand-maintained JSON committed to git (the build
step only injects slugs/ids — content passes through untouched). feats 6,045 · equipment 5,672 ·
spells 1,803 · 58 bestiary packs (~8.5k monsters — every published bestiary + per-AP packs) ·
deities 481 · backgrounds 502 · etc. Active cadence (~one minor release / 3–5 weeks; 8.3.0 on
2026-07-06). **Every document carries `system.publication.{license: ORC|OGL, remaster, title}`**
— per-doc license labeling, gold for a compliant public site.

Transform gotchas (verified against the clone, kept at
`<scratchpad>/pf2e` this session):
- Descriptions are HTML with **six enricher forms** to parse: `@UUID` (92,788 uses), `@Check`
  (16,994), `@Damage` (14,998 — formulas can reference actor/item data; PEG grammar at repo root
  `roll-grammar.peggy`), `@Localize` (7,525 — indirection into `static/lang/en.json`),
  `@Template` (4,825), `@Embed` (2,715), plus Foundry core inline rolls.
- **`@UUID` pack segments are the registered compendium names, NOT directory names**
  (`spells`→`spells-srd`, `actions`→`actionspf2e`, `conditions`→`conditionitems`, …) — resolve
  via `system.pf2e.json`'s name→path map. Refs are often name-based, not id-based.
- No persisted slug — computed `sluggify(name)` at build (deterministic, reproducible).
- Trait descriptions live in `en.json`, not a pack. Legacy pre-remaster content that was
  *removed* lives in an external community module; the repo is forward-only with a
  `remaster-changes` journal (a ready-made redirect table).

### What each source lacks

| | AoN ES | foundryvtt/pf2e |
|---|---|---|
| Mechanical entities (feats/spells/monsters/items) | ✅ full | ✅ full, better-structured |
| Rules prose / setting articles / sidebars | ✅ (rules 3,645 + article + sidebar cats) | ❌ (7 journal docs only) |
| Per-page book citations + canonical URLs | ✅ | ❌ (book title only) |
| Per-doc license labels | ❌ | ✅ ORC/OGL per doc |
| Stable/versioned (git) | ❌ snapshot ourselves | ✅ |
| Clean-room licensing posture | ⚠️ includes AoN's commercially-licensed material | ⚠️ Foundry's Paizo deal doesn't flow downstream; OGL/ORC subset does |

**Recommendation:** hybrid — Foundry packs as the *structured mechanical* source of truth
(license-labeled, git-tracked, diffable), AoN ES as the *prose/lore/rules-text + citation*
overlay, joined on name/slug (+ AoN's `remaster_id` for edition mapping). Either alone is
viable; AoN-alone is the fastest path to "everything on AoN", Foundry-alone is the cleanest
public-legal path.

## 2. Legal — YELLOW, navigable; scoping decision not blocker

- **Three instruments:** ORC (remaster: mechanics open, verbatim reproduction fine; **proper
  nouns/lore = Reserved Material**), OGL 1.0a (pre-remaster, unrevoked; Product Identity
  excluded), Paizo **Community Use Policy** (the only cover for Golarion proper nouns — but its
  FAQ nominally treats "rules compendium" projects as outside intended scope; a documented gap
  between written policy and practice).
- **No verified Paizo enforcement against any PF2e fan compendium.** The famous DMCA was
  **WotC vs 5etools (Aug 2024)** — different company, harsher license, and triggered by
  wholesale reproduction of entire published books. Pf2eTools C&D = folklore, not verified
  (it's alive, states "official Paizo data only", runs on OGL+CUP). Wanderer's Guide / pf2easy /
  Pathbuilder all operate publicly on OGL/ORC+CUP; Pathbuilder genericizes reserved names.
- **AoN's own content is partially under a bespoke commercial license** (their Licenses page
  says so explicitly) — that layer (art, AP narrative, some lore presentation) does NOT flow to
  us even though the ES endpoint serves it.
- **Risk ladder for codex:** personal/non-public → negligible. Public free site on ORC/OGL
  mechanics with proper nouns genericized → the safe tier (what pf2easy does). Public with
  Golarion nouns + statblock flavor via CUP → gray tier occupied by many tools for years without
  incident (stay free, no endorsement claims, don't reproduce AP narrative wholesale, don't
  mirror AoN presentation). Wholesale book text → the actual danger zone (the 5etools trigger).

## 3. The 5etools model — keep the data shape, replace the delivery

- **Keep:** structured JSON entities with **filter metadata baked on every entity** (their
  facets never parse prose at query time — a data-modeling decision, not UI); the recursive
  typed rich-text node format (give it a Zod discriminated union instead of string dispatch);
  `{@tag …}`-style inline cross-refs (ours: the enricher transform output); **prebuilt search
  index as a build artifact** (their 17,874-entity index is 2 MB static JSON); tri-state facet
  pills; hover-tooltip cross-refs; source + remaster/legacy toggles; URL round-tripping of
  entity + filter state.
- **Replace:** client-only SPA shells with hash routing (zero SEO, MB-scale JSON per category
  page) → real per-entity SSR routes (our stack's strength). Skip: dice roller, encounter
  builder mini-apps, their 608 KB single-file string-concat renderer.
- Scale calibration: 5etools = ~17.9k entities / 111.6 MB JSON. PF2e is bigger where it counts
  (feats 6,045 vs their 276) → **30–50k pages is the right planning number.**

## 4. astra stack fit — GREEN with two adaptations, two new builds

- **gothic already speaks PF2e**: `DOCUMENT_KINDS` includes statblock/hazard/item/spell/deity;
  `TraitPill` (comment literally says "PF2e-style trait pill"), `ActionGlyph` renders the
  ⬥/⬥⬥/⬥⬥⬥/reaction/free pips, `StatCard` is the stat-card header shape, `Fields`/`FieldRun`
  handles Range/Duration/Prerequisites lines. Missing: ability-score grid, AC/save summary
  line, Strike-line — small new components in the same idiom.
- **Storage: JSON, not `.vellum`** — vellum is the right *renderer* family but wrong *storage*
  for 30–50k machine-generated docs (generate→serialize→reparse is pure loss; gothic components
  are plain React, callable directly from a `{ac,hp,saves,…}` JSON shape). Reserve vellum for
  any hand-written prose pages.
- **Scale:** akasha's monolithic `bodies.ts`/`site.ts` bake breaks at ~200× (35–80 MB modules);
  the fix is already in-repo — the transcript shard + lazy-thunk + `createServerFn` pattern
  (built because 76×1MB "would blow up the bundle"), applied to *all* entities, plus a sharded
  slim index. `site-kit`/`content-build` primitives are page-count-agnostic and reusable as-is.
- **Search:** Pagefind comfortable at 30–50k pages (auto-chunked index; ~100k proven in the
  wild) via the existing NodeJS-API in-memory pattern (`build-search.ts`). **Faceted category
  browsing is net-new** (no astra precedent): compact per-category JSON (id/name/level/traits/
  source) + client-side tri-state filtering, the 5etools way.
- **SSR stands (Decision I):** "static website" is achieved user-visibly via SSR + per-entity
  file loads; true prerender would breach the repo-wide convention for zero benefit (TanStack
  supports it, but nothing else in astra does — large cross-cutting change, not recommended).

## 5. Shape of the build (pre-scope sketch — sizes are relative to portal 0023)

1. **P1 — corpus + canonical schema (the real project):** snapshot both sources; enricher/
   markup transform (both grammars) → one canonical Zod-typed entity schema with license labels
   + filter metadata + cross-ref graph; committed snapshot artifact. **Largest phase, all new.**
2. **P2 — entity render layer:** JSON→gothic React components (statblock/spell/feat/item/deity
   cards + the few new sub-components); per-entity SSR routes on the strider/site-kit template
   with sharded lazy bodies. Medium.
3. **P3 — browse + search:** faceted category pages (net-new facet UI) + Pagefind full-text +
   hover-tooltip cross-refs. Medium.
4. **P4 — prose/lore layer (scope-dependent on the legal decision):** rules articles, setting
   pages from the AoN overlay. Medium, deferrable.
5. **P5 — deploy:** Compose unit + Caddy + wildcard cert; smallest phase, fully paved.

## 6. Pre-scope decisions — ALL RESOLVED (stakeholder, 2026-07-12)

1. **Audience/exposure — RESOLVED: personal/party only.** Served on the edge but for Josh +
   the table (obscure/unlisted or auth-gated — the exact mechanism is a scoping question).
   Legal exposure is negligible at this tier, which de-risks decisions 2 and 5.
2. **Content tier — RESOLVED: CUP gray tier.** Full mechanical content WITH Golarion proper
   nouns, deities, and statblock flavor (the Pf2eTools/Wanderer's Guide posture). Mitigations
   still apply: free, no endorsement claims, no wholesale AP narrative reproduction.
3. **Primary corpus — RESOLVED: hybrid.** foundryvtt/pf2e packs = structured mechanical source
   of truth; AoN ES = prose/citation/lore overlay, joined on slug + `remaster_id`. Two
   transforms to build; both grammars are cataloged in §1.
4. **Remaster stance — RESOLVED: remaster-primary + legacy toggle** (the 5etools 2014/2024
   pattern). Legacy↔remaster pairs modeled via AoN `remaster_id` + the Foundry
   `remaster-changes` journal redirect table.
5. **v1 scope — RESOLVED: ALL categories** — core lookup set (monsters/spells/feats/items/
   conditions/actions/traits) + character-build set (ancestries/heritages/backgrounds/classes/
   archetypes/deities) + GM set (hazards/vehicles/relics/rituals/creature families/familiars/
   companions) + **rules & lore prose**. Full breadth in v1 — nothing deferred. Sizing
   consequence: the P4 prose layer is NOT deferrable; the AoN overlay transform is in-scope
   from the start, and P1 (corpus + canonical schema) grows accordingly.

## Sources (agent reports, 2026-07-12)

AoN ES probe (endpoint live, schema, counts, CORS, community consumers) · licensing research
(ORC/OGL/CUP texts, AoN Licenses.aspx, 5etools DMCA record, tool-by-tool license posture) ·
foundryvtt/pf2e sparse-clone inventory (pack counts, enricher census, build-pipeline read) ·
5etools repo analysis (data files, renderer, omnidexer, filter system, jq-verified counts) ·
astra stack-fit audit (site-kit/content-build/gothic/vellum-lang/akasha build scripts).
