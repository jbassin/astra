# 0007 akasha-backend — pre-implementation thoughts

**Date:** 2026-06-19. **Author:** Claude (session resume). **Status:** analysis → awaiting fork
confirmation before NLSpec (octo:spec). **Plan:** [`thoughts/astra/plans/0007-akasha-backend.md`](../../astra/plans/0007-akasha-backend.md).
**Consumes:** `@astra/vellum-lang` (0004, the format + parsers), `@astra/gothic` (0003, the renderer it
hands off to 0011), ontology-being (Phase 1). **Critical path** — the long pole lives here.

## What 0007 is

Turn faerrin's Obsidian wiki (`pkg/content/wiki`) into astra's **akasha content store** — the SSOT
setting corpus **in full-vellum**, under `apps/akasha-backend/content/` — plus a Dagster asset that
validates it and emits a build-time **snapshot** (corpus + metadata JSON) for akasha-frontend (0011) and
mouthpiece-backend grounding. akasha-backend **owns + converts + validates + indexes** the corpus; it does
**NOT** compute slugs/backlinks/folder-index/breadcrumbs/Explorer (that lifts `slug.ts`+`site.ts` to TS at
0011 — preserving faerrin URLs, zero Python parity risk).

## Grounded corpus survey (matches the plan §1 exactly)

| Signal | Count | Action |
|---|---|---|
| Content pages (excl `Script/`) | **141** | converted into the corpus |
| `Script/` pages | 76 | **excluded** (transcripts ≠ vellum, D4) |
| frontmatter / `[[wikilinks]]` | 75 / 126 | **pass through** (YAML + native `[[…]]`) |
| `**Term** :: value` deity pages | **9** | → `:::fields` (scripted + hand-check) |
| raw-HTML pages | **~14** | → `:::timeline` / markdown / `:::fields` (hand) |
| Obsidian callouts (`> [!quote]`) | **19** | → `:::handout`/`:::edict` (scripted) |

**The mess is real (why hand-review is needed):**
- Deity pages use *inconsistent* separators — `**Category** :` (single colon), `**Edicts** L:` (typo),
  `**Anathema** ::` (correct) — plus **wikilinks as terms** (`**[[Divine Raiment]]** ::`), AON md-links in
  values, `<br />` terminators, and a `### Devotee Benefits` heading **splitting** one page into two
  `:::fields` groups. The `::`→`:::fields` script must tolerate all of this, then be hand-checked.
- `Timeline.md` = deeply-nested styled HTML (`<ul><li style><div style><span small-caps>era</span><br/>…
  [[ref]]</li>`), tabs+spaces — a dedicated one-off parse → `:::timeline` `{era}` entries.
- `index.md` = a `> [!quote]` callout wrapping a `<pre>` **CIC signal log** containing `#L #C #R`,
  `@ts000.01…`, `p<em>…</em>`, `Γ ⊢ t : T` — i.e. a **sigil-collision minefield** (`#word`→trait,
  `@token`→action, `:word`→directive). This single page needs callout→handout + pre→fenced-code + a pile
  of escapes. It's the canonical example of the real per-page work: **the collision scan, not rewriting.**

## The seams (who does what)

- **akasha-backend (py/uv/Dagster):** owns the corpus; the one-shot converter (`migrate/`); the metadata
  index (via `libs/py/vellum-lang`, metadata-only); page→page crossref resolution; the snapshot asset;
  the mouthpiece read path.
- **TS (a Node step):** structural validation — runs the **0004 TS parser** over the whole corpus
  asserting **zero error chips** (D2 made TS the structural authority). Also 0011 lifts `slug.ts`(240 LOC)
  + `site.ts`(436 LOC) to build the graph.
- **vellum-lang (0004):** the format + both parsers. **gothic (0003):** renders the corpus at 0011.
- **ontology-being:** META (players/PCs/campaigns/colors/hosts), **not** setting → crossrefs resolve
  page→page within akasha; meta-citation linkage deferred (E4).

## Decided already (plan §8): E1 graph@frontend-build · E2 corpus under akasha-backend · E3 one-shot
converter then author-in-vellum · E4 page→page crossrefs only (ontology linkage deferred).

## Forks — DECIDED (2026-06-19, with Josh)

- **F1 → Full end-to-end now** — converter + all 141 pages converted + hand-review every exotic/structural
  page + **literal zero error chips** + crossref edges + snapshot asset + mouthpiece path, this session.
- **F2 → TypeScript converter.** Consequence: since `apps/akasha-backend` is a uv app (no dual manifest),
  the **TS converter co-locates with the TS validator in `libs/ts/vellum-lang/scripts/`** (the parser's
  home + an existing bun member; `gen-fixtures.ts` precedent). Convert + validate share the 0004 parser.
- **F3 → TS validator = `libs/ts/vellum-lang/scripts/validate-corpus.ts`** (CI job + akasha-backend shells
  out via `bun run`).
- **Resulting split:** one-shot **TS** = convert + validate (build-time, uses the reference parser);
  runtime **Python/Dagster** (akasha-backend) = metadata index (py vellum-lang) + page→page crossref
  resolution + snapshot asset + mouthpiece read path (honors D2 metadata-only Python).
- **F4 → commit the metadata snapshot JSON** (the `being.canonical.json` pattern); the Dagster asset
  regenerates it; CI diffs it.

## Genuine forks to confirm (beyond E1–E4 — these change the work)

### F1 — Scope/appetite of THIS session (the big one)
0007's exit gate = **all 141 pages converted + TS validator at zero error chips** + crossref edges +
snapshot asset + mouthpiece path. The automated parts (frontmatter normalize, pass-through, `::`→fields,
HTML→timeline) are scriptable; the **hand-review + collision-fixing of the exotic pages** (the CIC log,
9 deity pages, Timeline, ~12 HTML pages, escapes across 141) is the genuine multi-hour long pole.
- **(a) Full end-to-end now** — converter + convert all 141 + hand-review every structural/exotic page +
  collision-fix to literal **zero error chips** + snapshot + crossref + mouthpiece, all this session.
- **(b) Machinery + automated conversion + structural pages, residual tracked** — build the full
  converter/validator/snapshot/crossref machinery, run it on all 141, hand-convert the ≤22 structural
  pages, and produce the **error-chip report**; drive the bulk to zero but allow a documented residual
  list (e.g. the CIC log) to finish in a follow-up. Same machinery, staged hand-review.

### F2 — Converter language: Python vs TS
Plan says a **Python** `migrate/` script (keeps akasha-backend self-contained; D2's metadata-only rule is
about the *runtime* parser, not a one-shot converter). TS would let the converter call the vellum parser
to validate-as-it-goes. **Lean Python** (plan default; validation is a separate TS Node step regardless).

### F3 — Where the TS corpus-validator lives + how CI/Dagster runs it
The "Node step" needs to run the 0004 TS parser over the corpus without creating a dual-manifest dir
(CLAUDE.md gotcha: a uv app dir must not also be a bun member). Options:
- **(a)** a CLI in `libs/ts/vellum-lang/scripts/validate-corpus.ts` (vellum-lang is the parser's home +
  already a bun member) — akasha-backend shells out via `bun run …`; a CI job runs it over the committed
  corpus. **Recommended** (reuses the bun member, no stray manifest).
- **(b)** a `.ts` inside `apps/akasha-backend/` — risks the dual-manifest gotcha + isn't typ\-checked/linted
  by the ts lane. Avoid.

### F4 — Snapshot/metadata format + CI (design detail; lean and proceed unless you object)
Corpus committed under `apps/akasha-backend/content/` (E2). The metadata JSON (`{page → {frontmatter,
date, crossref-edges, resolved-entities}}`): **lean = commit it** as the snapshot artifact (the
`being.canonical.json` pattern) so 0011/mouthpiece + CI can diff it; the Dagster asset regenerates it.

## Proposed work breakdown (post-confirm)
1. Scaffold `apps/akasha-backend` (uv app; Dagster asset defs loaded by `dagster/definitions.py`; OTel via
   `libs/py/observe`).
2. Converter (`migrate/`): frontmatter normalize + **bake faerrin git-modified date** into `date:`;
   pass-through prose/links; callouts→`:::handout`/`:::edict`; `**X**::Y`→`:::fields` (9);
   HTML→`:::timeline`/markdown (~14). Idempotent; emits a per-page conversion report.
3. TS validator (F3): `validate-corpus.ts` → zero error chips; collision-fix per page.
4. Metadata index (`libs/py/vellum-lang`): frontmatter + crossref targets per page.
5. Crossref resolution: page index → resolve `[[refs]]` page→page; edge list + unresolved report (E4).
6. Snapshot Dagster asset: on corpus change → validate + emit corpus + metadata JSON.
7. mouthpiece read path: expose the corpus (replace caster's `loadWiki("../content/wiki")`).
8. Hand-off doc for 0011 (snapshot schema + the lifted `slug.ts`/`site.ts` contract).

## CI / substrate notes
- New **uv** member `apps/akasha-backend` → py lane (ruff/format/ty/pytest) picks it up automatically.
- The TS validator is a **new CI job** (a Node step over the corpus) — confirm it fits the existing
  path-filtered `ci.yml` (likely a `corpus-validate` job gated on `apps/akasha-backend/content/**`).
- Dagster asset wiring goes through the existing `dagster/` defs (Phase 0 substrate).
- Baking git dates must read faerrin's `git log` over `pkg/content/wiki` **before** that history is gone.
