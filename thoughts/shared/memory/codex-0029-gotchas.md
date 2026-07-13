---
name: codex-0029-gotchas
description: codex (0029) — public-but-noindexed PF2e reference site (codex.iridi.cc, AoN breadth × 5etools structure × gothic) — 2026-07-13 P1 ingest BUILT (S1–S4 committed, all gates green, corpus 50,952 entities); ▶ P1 exit = stakeholder review of report.md (9 STOP categories) then spec P2 against the real corpus; the verified corpus facts + join/grammar gotchas a fresh session must not re-derive
metadata:
  type: project
---

**codex (0029)** — a PF2e rules-reference site: AoN content breadth × 5etools structure × gothic,
flat TS member `apps/codex` on the strider/site-kit SSR template, **port 10374**, public-but-
NOINDEXED (C-1..C-8 in the scope doc). Per-phase specs: **P1 ingest COMPLETE-pending-review** →
P2 entity pages → P3 faceted browse+search → P4 rules browser → P5 deploy. P2+ get specced
against the REAL corpus P1 produced.

**P1 BUILT 2026-07-13** (spec `thoughts/astra/specs/0029-codex-p1-ingest-spec.md`, status FINAL →
all four slices committed same-day by staff-orchestrator + sonnet engineers): S1 `108571d`
(member + fetchers + real snapshots) · S2 `40b2447` (CodexNode/CodexEntity schema, sluggify port,
enricher grammar, HTML parser, assembly+journals — 25,781 Foundry entities) · S3 `8465625` (AoN
markup grammar 29 tags, link table, 243-book licenseMap, facets — 43,631 metas) · S4 `8d66293`
(join + emit + report + 1.8 MB asserted-coverage fixture + `just codex-refresh` + README). Plus
`98bbef9` fix(ontology): main was red pre-existing — the heartwood apply had not re-seeded
entity.kdl (311→313). 503 hermetic tests; CI green.

**The corpus (gitignored `apps/codex/data/`):** 50,952 entities / 97 categories / **656 MB**
(spec estimated 100–200 MB — the P5 COPY-vs-bind-mount decision must use the real number).
Transform = 15.4 s wall. Determinism gate proven (three runs, `diff -r` empty). Corpus layout per
D29-3; `corpus/report.{json,md}` is THE acceptance artifact.

**▶ NEXT: stakeholder review of `apps/codex/data/corpus/report.md` (the P1 exit gate)**, esp.
the **9 both-source categories <50% joined (spec §6 STOP condition — re-decide join keys with
Josh BEFORE P2, no fuzzy-matching):** `domain` 0% (systematic: Foundry "X Domain" vs AoN "X" —
one new normalization rule would fix it); `armor` 18%/`weapon` 27%/`shield` 14% (Foundry ships
named tiered magic-item variants AoN doesn't split); `class-feature` 41%/`creature-ability` 9%
(granularity mismatch — AoN generic names vs Foundry per-creature docs); `hazard` 43%,
`action` 44% (AoN glossary fragments), `warfare-army` 32%. Creature overall 57.6% despite the
dragon-family proof (raw 13.8% → **98.1%** post-normalization); spells 91.7%.

**THE load-bearing empirical finds (don't re-derive):**
- **Packs carry NO `system.slug`** — the pack file basename IS the slug; the ported `sluggify`
  agrees on **28,636/28,636** real docs (154 committed vectors).
- **AoN urls are NOT unique** — 2,269 collision groups (tiered items, class/class-feature
  twins); canonical pick via `_id == {category}-{urlQueryId}`, 62 ambiguous residue.
- **licenseMap = zero unknown residue**: rule = title ends "(Remastered)" → ORC (load-bearing —
  reprints keep ORIGINAL release dates), else earliest `release_date >= 2023-11-15` → ORC else
  OGL; 91 ORC / 152 OGL books, machine-verified transcription.
- AoN `<traits>` blocks DROPPED (53,255): 98.8% duplicate the structured fields; facets win the
  653 disagreements. `<title right=…>` → heading meta. row/column ~187k pairs flattened (far
  above the scope-doc sample); `<image>` 3,193 dropped (not 22).
- `localizedBoilerplate` needed recursive `children` (69/200 real @Localize keys resolve to
  block HTML); lang merge: `en ∪ re-en` covers all 200 keys, re-en wins collisions.
- **Plain crossref targets can't disambiguate renamed collision ids** (`{category}/{slug}`
  carries no provenance) — only `embed` nodes (real uuid/aonId) resolve to `@legacy`/`-2`
  members; 890 crossrefs downgraded brokenRef, report-visible. 9,994 collisions resolved:
  7,367 `@legacy` + 2,494 `-2` residual (mostly creature — partly an artifact of the AoN
  slug-index one-winner dedup, flagged for P2) + 133 same-edition anomalies.
- Emit-time Zod validation caught 3 real-corpus bugs no unit fixture hit: mid-string `<p>`
  reopen (HTML5 implicit close), actor-relative `@Check dc:@self.level` (NaN), literal JSON
  `null`s needing a `present()` guard — acceptance C's gate earns its keep.
- **Dockerfile manifest ripple = 13 sibling Dockerfiles** (the old "21" was COPY-lines-per-file);
  vp discovers new members automatically, CI needs no edit. `**/codex/data/**` AND
  `**/codex/fixtures/**` are in BOTH `.oxlintrc.json`/`.oxfmtrc.json` ignores (`**/tests/
  fixtures/**` does NOT match `apps/codex/fixtures/`).
- AoN fetch: `search_after` on `name.keyword`+`url` (cluster rejects `_id` sort), per-category
  term queries, ≤4 req/s, UA w/ contact email; snapshot-once. Foundry: blobless sparse clone of
  the pinned tag, `packs/pf2e` ONLY (sf2e out of scope) + ALL `static/lang/*.json` +
  `system.pf2e.json` (repo root) + `src/util/misc.ts`.
- `just codex-refresh` refuses on a dirty `apps/codex` index; refresh is the ONLY corpus-refetch
  path; the committed `corpus-manifest.json` diff is the reviewable event.
- Ops: two background engineer agents were killed mid-S3 by a session usage limit —
  `SendMessage` resume-from-transcript continued them cleanly (files already on disk survive;
  re-establish state by re-reading own files).

Docs: viability `…/research/2026-07-12-codex-0029-viability-thoughts.md` + scope
`…/research/2026-07-12-codex-0029-thoughts.md`. Builds on [[portal-0023-gotchas]] (pf2e document
model) + [[akasha-frontend-0011-gotchas]] + [[strider-0016-gotchas]] (template) +
[[config-single-source]] + [[no-silent-scope-cuts]].
