# Astra Sub-plan 0007 — akasha-backend (content store + wiki→vellum conversion)

**Status:** Plan (pre-implementation). **Phase:** 3 (pipeline). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** C = full vellum; D = build-time snapshot; D2 = metadata-only Python (0004).
**Depends-on:** `0004` vellum-lang (the format + parsers), `0003` gothic, Phase 1 (ontology-being, libs).
**Blocks:** `0011` akasha-frontend. **Critical path** — the actual long pole lives here (the converter).

> Goal: turn faerrin's Obsidian wiki into astra's **akasha content store** — the SSOT setting corpus
> **in full-vellum** — and emit the build-time snapshot akasha-frontend consumes. akasha-backend is a
> Python/Dagster subsystem that **owns the corpus, converts it, validates it, and indexes its
> metadata/links**. It does **not** reimplement aether's Quartz-faithful graph/slug logic — that lifts
> to TS (see §4).

---

## 1. The de-risking finding (read first)

"Convert 100+ pages" overstated the work. Survey of `content/wiki` (excl. `Script/`):

| Signal | Count | Conversion needed |
|---|---|---|
| Content pages (.md, excl Script/) | **141** | — |
| `Script/` pages | 76 | **excluded** (transcripts ≠ vellum, 0004 §2) |
| Pages with YAML frontmatter | ~all | **pass through** (D1: vellum uses YAML) |
| Pages with `[[wikilinks]]` | 199 | **pass through** (0004 parses `[[…]]` natively — ~zero rewriting) |
| Pages using `**Term** :: value` | **9** | → `:::fields` (scripted + hand-check) |
| Pages embedding raw HTML (`<ul>/<div>/<pre>`) | **13** (Timeline.md + ~12 index/flavor pages) | → `:::timeline` / HTML→markdown (hand-check) |
| Pages with Obsidian callouts (`> [!quote]/[!tip]`) | **~19** prose (excl Script) | → `:::handout`/`:::edict` (scripted; no new vellum construct) |

So **the corpus mostly migrates by passing through**; real *structural* conversion is **~22 pages**
(+ ~19 callout→handout mappings, scripted).
The genuine per-page risk is not rewriting — it's **accidental vellum-sigil collisions** in existing
prose (`#word`, `@token`, `||…||`, `:word` triggering trait/action/redact/directive parsing). That's a
**collision scan across all 141 pages** (caught by the TS validator → error chips), with targeted
escapes. Honest long-pole = the converter + the collision scan + crossref resolution, not a 100-page rewrite.

## 2. Current state (faerrin)

- **`content/wiki/`** — 5 domains (`Divinity`, `Geography`, `Org`, `Phenomena`, `Rules`) + `Timeline.md`
  + `index.md`; max folder depth 5; folder `index.md` pages drive folder titles.
- **`aether/src/lib/site.ts`** — the build-time index: per-page `{rel, slug, title (fm.title ?? folder
  name ?? stem), tags, aliases (+ folder name), img, links (resolved edges), git date}`; a **backlink**
  reverse index; **breadcrumbs**; **folder listing** pages; **tags** (hierarchical); the **Explorer
  tree**. Link edges via `extractTargets` (wikilink + md-link regex) → `resolveEdge` using **slug.ts**
  `transformLink` ("shortest"). Git "modified" date from `git log` over `content/`.
- **`aether/src/lib/slug.ts`** — the **byte-faithful Quartz** URL-slug resolver (isomorphic TS). The
  comment in `site.ts:8-9` notes the edge derivation is "proven byte-faithful to Quartz by
  parity-graph.ts." **Reimplementing this in Python = high parity risk.**

## 3. What akasha-backend IS (and isn't)

**IS** (Python / uv / a Dagster asset):
1. The **SSOT vellum corpus** — the converted wiki lives in-repo at `apps/akasha-backend/content/`
   (akasha owns it; authored directly in vellum going forward).
2. The one-time **converter** (migration script): faerrin wiki → full-vellum (§5).
3. **Structural validation** — runs the **TS** vellum parser (0004) over the whole corpus asserting
   **zero error chips** (a Node step in the Dagster asset; D2 made TS the structural authority).
4. The **metadata index** — via `libs/py/vellum-lang` (metadata-only): per page `{frontmatter,
   crossref targets}`; plus git-modified dates **baked into frontmatter at conversion** (see §5/risk).
5. **Crossref resolution** — resolve each crossref target to an akasha **page-path** (§6), producing the
   link-graph edge data. (ontology-being is META, not setting — meta-citation links deferred, E4.)
6. The **build-time snapshot** (§7) for akasha-frontend; also the corpus mouthpiece-backend reads for grounding.

**ISN'T:** it does **not** compute slugs, backlinks, folder-index, breadcrumbs, or the Explorer tree in
Python. That graph build **lifts to TS** (§4).

## 4. The graph/slug split (key decision)

`slug.ts` + `site.ts` are a proven byte-faithful Quartz port. **Lift them verbatim to TS** and run them
at **akasha-frontend build** (0011), which is TS and already must lift `slug.ts` to **preserve faerrin
URLs**. akasha-backend provides the *inputs* (corpus + frontmatter/crossref metadata + git dates); the
graph (slugs, backlinks, folder-index, breadcrumbs, tags, Explorer) is computed in TS from those.

- **Why:** zero Python reimplementation of the Quartz logic → no parity risk on URLs/backlinks; reuses
  the code that already exists; consistent with D2 (metadata-only Python).
- **Snapshot = corpus + metadata** (not a pre-computed graph). akasha-frontend's build turns it into the
  site — exactly as aether does today from `content/wiki` + `site.ts`.
- → **Open decision E1:** graph computed at *akasha-frontend build* (recommended, simplest) **vs** as a
  *Node step inside akasha-backend's Dagster asset* (so the snapshot ships a pre-computed graph for other
  consumers). Recommend frontend-build for v1; revisit if a non-frontend consumer needs the graph.

## 5. The converter (the heavy part) — per-page rules

A Python migration script (`apps/akasha-backend/migrate/`), run once at cutover, idempotent, with a
hand-review pass. Per page:

1. **Frontmatter** — keep YAML (D1). Normalize keys to the vellum `Frontmatter` schema
   (`title/tags/aliases/img` + `extra`). **Bake the faerrin git-modified date into `date:`** (the wiki
   history doesn't move to astra — risk §8.1).
2. **Prose / `[[wikilinks]]` / md + AON links** — **pass through** (vellum is CommonMark+ and parses
   `[[…]]`). No rewriting. **Exception — callouts:** ~19 prose pages use Obsidian `> [!quote]`/`> [!tip]`
   (mostly in-world document excerpts) → map to vellum **`:::handout`/`:::edict`** prose cards (scripted;
   no new vellum-lang construct — they're semantically the same diegetic card).
3. **`**Term** :: value <br />` (9 deity/stat pages)** → `:::fields` blocks (0004 §3.3). Scripted
   (`**X** :: Y <br/>` → `X :: Y` lines inside a `:::fields` fence), then hand-checked (only 9).
4. **Raw HTML (13 pages)** → vellum constructs (HTML is inert in vellum):
   - `Timeline.md`'s `<ul><li><span small-caps>era</span> … [[ref]]</li>` → `:::timeline` entries
     (0004 §3.4). A dedicated one-off HTML parse.
   - The ~12 index/flavor pages with `<ul>/<div>/<pre>` → markdown lists / fenced code / `:::fields` as
     appropriate. Hand-rewrite (small set).
5. **Sigil-collision scan (all 141)** — detect prose that would mis-parse as a vellum
   directive/sigil (`#word`, `@token`, `||…||`, leading `:word`); escape or reword. **This is what the
   TS validator surfaces** (error chips); fix per page until the corpus is clean.

## 6. Crossref resolution (Python, metadata-only)

Using `libs/py/vellum-lang`'s crossref extraction:
- Build the **page index** (path/slug-key → page) from the corpus.
- Resolve each crossref target **page→page within akasha** (Quartz "shortest"-equivalent path match;
  matching is by page path — the *slug* form is TS's job). The wiki's setting characters, deities,
  places, and orgs are all **akasha pages**, so `[[ref]]` is almost always an akasha→akasha edge.
- **ontology-being is META, not setting:** it holds real players, the PCs they play, campaigns, colors,
  host identities — *not* in-world character/lore info (that's akasha). A crossref to an ontology-being
  entity is therefore a **narrow case** (a page citing a PC/player/campaign). **v1 resolves page→page;
  ontology-being linkage is deferred** to a small later pass (E4) if/when content cites meta.
- Unresolved targets are reported (not fatal). Emit the **edge list** (page → target) as snapshot
  metadata; akasha-frontend's lifted `site.ts` turns edges into the backlink index + graph using
  `slug.ts` (so URL semantics stay byte-faithful).

## 7. The snapshot artifact (Decision D)

`akasha-backend` emits (as a Dagster asset output) a build-time snapshot = **the validated vellum
corpus** + **a metadata JSON** (`{ page: {frontmatter, date, crossref-edges, resolved-entities} }`).
akasha-frontend (0011) consumes corpus + metadata at build, lifts `slug.ts`/`site.ts` to compute
slugs/backlinks/folder-index/breadcrumbs/tags/Explorer, and renders via gothic. mouthpiece-backend reads
the corpus for grounding (replacing caster's `../content/wiki` read).

## 8. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| E1 | Where the graph is computed | akasha-frontend build (TS) vs a Node step in akasha-backend's asset | **DECIDED: akasha-frontend build** (simplest; only consumer in v1). Snapshot = corpus + metadata. |
| E2 | Corpus location | `apps/akasha-backend/content/` vs a top-level `content/` | **DECIDED: under akasha-backend** (it owns the SSOT). |
| E3 | Converter re-runnability | one-shot migration vs kept as a reusable importer | **DECIDED: one-shot + archived** — vellum is authored directly post-cutover; keep the script for reference. |
| E4 | Crossref → ontology-being | resolve to entities now vs page→page only | **DECIDED: page→page only (v1).** ontology-being is META (players/PCs/campaigns/colors/hosts), **not** setting; wiki refs target akasha pages. Defer the narrow meta-citation case. |

## 9. Work items

1. **Scaffold** `apps/akasha-backend` (uv app; Dagster asset definitions; OTel via `libs/py/observe`).
2. **Converter** (`migrate/`): frontmatter normalize + git-date bake; pass-through prose/links;
   `::`→`:::fields` (9); HTML→`:::timeline`/markdown (13). Idempotent; emits the corpus + a per-page
   conversion report.
3. **Collision scan**: run the **TS** vellum parser over the converted corpus; list error chips /
   unintended directives; fix per page until zero. (Node step; the validation gate.)
4. **Metadata index**: `libs/py/vellum-lang` over the corpus → frontmatter + crossref targets per page.
5. **Crossref resolution** (§6): build the page index → resolve `[[refs]]` **page→page** within akasha;
   emit the edge list + an unresolved-link report. (ontology-being meta-citation linkage deferred, E4.)
6. **Snapshot asset**: a Dagster asset that (on corpus change) validates + emits corpus + metadata JSON.
7. **mouthpiece read path**: expose the corpus to mouthpiece-backend grounding (replace the faerrin
   `../content/wiki` filesystem read).
8. **Hand-off doc** for 0011: snapshot schema + the lifted-`site.ts`/`slug.ts` contract.

## 10. Exit criteria

- [ ] All 141 pages converted; the **TS validator reports zero error chips** over the whole corpus.
- [ ] The 9 `::` pages render as `:::fields`; `Timeline.md` + the 12 HTML pages render as
      `:::timeline`/markdown — verified by hand against the originals.
- [ ] `[[wikilinks]]` pass through unchanged; the crossref **edge list** resolves **page→page** within
      akasha (with an explicit unresolved-link report).
- [ ] Faerrin git-modified dates are baked into frontmatter (modified dates survive the repo move).
- [ ] Snapshot (corpus + metadata) emitted as a Dagster asset; akasha-frontend can build from it (0011
      smoke); mouthpiece-backend can read the corpus for grounding.

## 11. Risks

1. **Git history doesn't move** — faerrin's `git log`-derived modified dates vanish in astra. Mitigation:
   bake the faerrin date into frontmatter `date:` at conversion (work item 2). Do this *before* the wiki
   stops being touched in faerrin.
2. **Sigil collisions in prose** (the real per-page work) — `#`, `@`, `||`, `:` in 141 pages of prose
   may mis-parse. Mitigation: the TS validator scan (work item 3) is the gate; budget per-page fixes.
3. **`:::fields`/`:::timeline` edge cases** — `<br/>`, nested `[[refs]]`, inline styles in the HTML
   pages. Small set (≤22), so hand-check is feasible; encode the tricky ones as 0004 conformance fixtures.
4. **URL parity** — slugs must match faerrin (inbound links/bookmarks). Mitigation: graph/slug stays the
   lifted byte-faithful `slug.ts` (§4); 0011 verifies the slug set against faerrin.
5. **Scope drift (ontology vs akasha)** — ontology-being is META (players/PCs/campaigns/colors/hosts);
   akasha is the setting (NPCs/deities/places/lore). Keep them distinct — `[[refs]]` resolve to akasha
   pages; never leak setting content into ontology-being. (Shapes 0002.)

## 12. Hand-off to 0011 (akasha-frontend)

0007 ships: the vellum corpus (validated, zero error chips), the metadata/edge snapshot, the lifted
`slug.ts`/`site.ts` contract, and the conversion/unresolved reports. 0011 then: lifts `slug.ts` +
`site.ts` verbatim (preserving URLs), computes slugs/backlinks/folder-index/breadcrumbs/tags/Explorer
from the snapshot, renders vellum via gothic's React renderer, re-integrates Pagefind search, and
surfaces weal roll-insights. The "build-time snapshot" boundary (Decision D) keeps akasha-frontend a
pure consumer.
