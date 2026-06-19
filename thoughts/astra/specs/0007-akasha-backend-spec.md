# NLSpec 0007 — akasha-backend (content store + wiki→vellum conversion)

**Status:** **in progress.** ✅ TS conversion machinery (`convert-wiki.ts` + `validate-corpus.ts`) +
**all 141 pages converted** to full-vellum, **zero error chips + zero sigil collisions** (gates A, B, E;
C green for `:::fields` (9) + `:::timeline` (Timeline.md → 47 entries)); uv app scaffolded; uv+bun+py CI
lanes green. ⏳ **Remaining:** ~8 raw-HTML *flavor* pages hand-pass (gate C tail); the **Python runtime
side** — metadata index + page→page crossref resolver + Dagster snapshot asset + mouthpiece loader (gates
D, F, G); the `corpus-validate` CI job (M9). **Phase:** 3 (pipeline). **Source plan:**
[`../plans/0007-akasha-backend.md`](../plans/0007-akasha-backend.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-19-akasha-backend-0007-thoughts.md`](../../shared/research/2026-06-19-akasha-backend-0007-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (persona subagents — python-pro, code-reviewer),
per astra `CLAUDE.md`. **Depends-on:** `0004` vellum-lang (format + both parsers), `0003` gothic (the
renderer 0011 hands the corpus to), Phase 1 (ontology-being, `libs/{py,ts}` observe/config). **Blocks:**
`0011` akasha-frontend. **Critical path** — the long pole (the converter) lives here.

## Goal

Convert faerrin's Obsidian wiki (`pkg/content/wiki`, 141 content pages) into astra's **akasha content
store** — the SSOT setting corpus **in full-vellum**, owned + validated + indexed by a Python/Dagster
subsystem — and emit a build-time **snapshot** (validated corpus + metadata JSON) that akasha-frontend
(0011) builds the site from and mouthpiece-backend reads for grounding. akasha-backend does **not** compute
slugs/backlinks/graph (that lifts `slug.ts`+`site.ts` to TS at 0011, preserving faerrin URLs).

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| E1 | Graph computation | **akasha-frontend build (TS)** — snapshot = corpus + metadata, not a pre-computed graph. |
| E2 | Corpus location | **`apps/akasha-backend/content/`** — akasha owns the SSOT. |
| E3 | Converter re-runnability | **One-shot + archived** — vellum authored directly post-cutover; script kept for reference. |
| E4 | Crossref → ontology-being | **Page→page only (v1)** — ontology-being is META, not setting; meta-citation linkage deferred. |
| F1 | Session scope | **Full end-to-end** — all 141 converted, hand-reviewed, **zero error chips**, snapshot + crossref + mouthpiece, this phase. |
| F2 | Converter language | **TypeScript** — co-located with the validator (shares the 0004 reference parser). |
| F3 | TS validator home | **`libs/ts/vellum-lang/scripts/validate-corpus.ts`** — existing bun member; CI job + `bun run` subprocess from akasha-backend. |
| F4 | Snapshot format | **Committed metadata JSON** (`being.canonical.json` pattern); Dagster asset regenerates it; CI diffs it. |

**Resulting toolchain split:** one-shot **TS** (`libs/ts/vellum-lang/scripts/`) = convert + validate
(build-time, reference parser); runtime **Python/Dagster** (`apps/akasha-backend`) = metadata index (py
vellum-lang) + page→page crossref resolution + snapshot asset + mouthpiece read path (honors D2).

## Scope (in)

- **`apps/akasha-backend`** (uv app): Dagster asset defs (loaded by `dagster/definitions.py`); OTel via
  `libs/py/observe`. Owns the converted corpus under `content/`.
- **The converter** (`libs/ts/vellum-lang/scripts/convert-wiki.ts`, one-shot): faerrin wiki →
  full-vellum into `apps/akasha-backend/content/`, idempotent, with a per-page conversion report. Per-page
  rules in §"Converter rules" below.
- **The validator** (`libs/ts/vellum-lang/scripts/validate-corpus.ts`): runs the 0004 TS parser over the
  whole corpus, lists every error chip / unintended directive per page, exits non-zero on any. The
  structural gate (D2: TS is the structural authority).
- **Metadata index** (Python, `libs/py/vellum-lang` metadata-only): per page `{frontmatter, date,
  crossref targets}`; faerrin git-modified dates **baked into frontmatter `date:` at conversion**.
- **Crossref resolution** (Python): page index (path-key → page) → resolve each `[[target]]` **page→page**
  within akasha; emit the edge list + an explicit unresolved-link report (E4: meta-citation deferred).
- **Snapshot asset** (Dagster): on corpus change → validate (TS Node step) + emit corpus + metadata JSON.
- **mouthpiece read path**: expose the corpus (replaces caster's `loadWiki("../content/wiki")`).
- **Hand-off doc** for 0011: snapshot schema + the lifted `slug.ts`/`site.ts` contract.

### Converter rules (per page)

1. **Frontmatter** — keep YAML (D1); normalize to vellum `Frontmatter` (`title/tags/aliases/img` + `extra`).
   **Bake the faerrin `git log`-modified date into `date:`** (history doesn't move — Risk 1).
2. **Prose / `[[wikilinks]]` / md + AON links** — **pass through** (CommonMark+ parses `[[…]]` natively).
3. **Obsidian callouts** (~19, `> [!quote]`/`> [!tip]`) → vellum `:::handout`/`:::edict` prose cards
   (scripted; no new construct). Includes `index.md`'s `<pre>` CIC log → fenced code + sigil escapes.
4. **`**Term** :: value <br />`** (9 deity pages) → `:::fields`. Tolerate real-world mess: single colon
   (`** :`), typos (`** L:`), **wikilink terms** (`**[[X]]** ::`), AON links in values, `<br/>`, and a
   `###` heading splitting one page into **two** `:::fields` groups. Scripted, then hand-checked.
5. **Raw HTML** (~14) — `Timeline.md`'s nested `<ul><li style><span small-caps>era</span>…[[ref]]` →
   `:::timeline` `{era}` entries (dedicated parse); the ~12 index/flavor pages' `<ul>/<div>/<pre>` →
   markdown lists / fenced code / `:::fields`. Hand-rewrite (small set).
6. **Sigil-collision scan (all 141)** — prose that mis-parses as a vellum sigil/directive (`#word`,
   `@token`, `||…||`, leading `:word`) → escape or reword. **The validator surfaces these** (error chips);
   fix per page until zero.

## Scope (out)

- **Slugs / backlinks / folder-index / breadcrumbs / tags / Explorer tree** → **0011** (lifts `slug.ts` +
  `site.ts` verbatim — byte-faithful Quartz; preserves faerrin URLs). akasha-backend provides only the
  inputs (corpus + frontmatter/crossref metadata + git dates).
- **Crossref → ontology-being entity resolution** (E4) — deferred; v1 is page→page within akasha.
- **`Script/` transcripts** (76 pages) — NOT vellum (D4); akasha-frontend renders them from linguist.
- **Rendering** — gothic (0003) renders at 0011; akasha-backend never renders.
- **Re-runnable importer** (E3) — one-shot; archived after cutover.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| M1 | Converter + validator home | `libs/ts/vellum-lang/scripts/` (bun member; reuse the reference parser; no dual-manifest in the uv app). One-shot, archived (E3). |
| M2 | Validation authority | the **TS** parser asserts zero error chips (D2). Python never structurally validates. |
| M3 | Git-date bake | read `git -C <faerrin> log -1 --format=%cI <page>` per source page → frontmatter `date:` at conversion (Risk 1); run before faerrin history is gone. |
| M4 | Metadata extraction | Python `libs/py/vellum-lang.extract_metadata` over the converted corpus (frontmatter + crossref targets) — the same total scan 0004 ships. |
| M5 | Crossref resolution | Python; build a path-key page index; match `[[target]]` page→page (Quartz "shortest"-equivalent **by page path**, not slug — slug is 0011's job); unresolved → report, never fatal. |
| M6 | Snapshot artifact | corpus committed under `apps/akasha-backend/content/`; metadata JSON committed (`being.canonical.json` pattern) + regenerated by the Dagster asset; CI diffs both. |
| M7 | Dagster asset | a corpus-snapshot asset in `apps/akasha-backend` loaded by `dagster/definitions.py`; materialization = validate (TS subprocess) → extract metadata → resolve crossrefs → write snapshot. |
| M8 | mouthpiece read path | a small typed corpus loader in akasha-backend exposing pages+metadata (replaces the faerrin `../content/wiki` filesystem read). |
| M9 | CI | new **py** member auto-covered; **new CI job** `corpus-validate` (bun runs `validate-corpus.ts`) path-filtered on `apps/akasha-backend/content/**` + `libs/ts/vellum-lang/**`. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | All 141 pages converted into `apps/akasha-backend/content/` as full-vellum | converter run + git |
| B | **`validate-corpus.ts` reports zero error chips** over the whole corpus | TS validator (CI job) |
| C | The 9 `::` pages render as `:::fields`; `Timeline.md` + the ~12 HTML pages as `:::timeline`/markdown — hand-verified against originals | hand-review + spot stories in gothic |
| D | `[[wikilinks]]` pass through unchanged; crossref **edge list** resolves page→page within akasha, with an explicit unresolved-link report | py crossref resolver + report |
| E | Faerrin git-modified dates baked into frontmatter `date:` (modified dates survive the repo move) | converter + frontmatter check |
| F | Snapshot (corpus + metadata JSON) emitted as a **Dagster asset**; committed snapshot matches a fresh materialization | `dagster asset materialize` + CI diff |
| G | mouthpiece-backend can read the corpus for grounding (the loader replaces `loadWiki`) | py loader + test |
| H | uv + bun + the new `corpus-validate` CI lanes green; ruff/format/ty/pytest over akasha-backend | run locally |

## Risks

1. **Git history doesn't move** — bake the faerrin date into frontmatter `date:` at conversion (M3), before faerrin's wiki history is gone.
2. **Sigil collisions in prose** (the real per-page work) — `#`/`@`/`||`/`:` across 141 pages; the validator (B) is the gate; budget per-page escapes. `index.md`'s CIC log is the worst case.
3. **`:::fields`/`:::timeline` edge cases** — `<br/>`, wikilink terms, inconsistent separators, nested `[[refs]]`, inline styles. Small set (≤22) → hand-check feasible; encode the tricky ones as 0004 conformance fixtures.
4. **URL parity** — slugs must match faerrin; the graph/slug stays the lifted byte-faithful `slug.ts` (0011 verifies the slug set). akasha-backend matches **by page path**, never invents slugs.
5. **Scope drift (ontology vs akasha)** — ontology-being is META; akasha is the setting. `[[refs]]` resolve to akasha pages; never leak setting content into ontology-being (E4).

## Hand-off to 0011 (akasha-frontend)

0007 ships: the validated vellum corpus (zero error chips), the metadata/edge snapshot, the conversion +
unresolved-link reports, and the `slug.ts`/`site.ts` lift contract. 0011 then lifts `slug.ts`+`site.ts`
verbatim (preserving URLs), computes slugs/backlinks/folder-index/breadcrumbs/tags/Explorer from the
snapshot, renders vellum via gothic, re-integrates Pagefind, and surfaces weal roll-insights. The
build-time snapshot boundary (Decision D) keeps akasha-frontend a pure consumer.
