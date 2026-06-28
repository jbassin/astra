---
date: 2026-06-27
subsystem: heartwood
slot: "0020"
phase: 1
kind: scope (phase)
status: scope COMPLETE — question-free (all §10 decisions resolved); ready for the NLSpec
parent: 2026-06-27-heartwood-0020-thoughts.md
---

# heartwood Phase 1 — ontology infra: the `world` field + the typed entity registry

Phase 1 of heartwood (umbrella: `2026-06-27-heartwood-0020-thoughts.md`). **Pure `ontology/` + `libs/`
data infra — no transcript ingestion, no LLM.** It lays the foundation everything downstream resolves
against, and the schema change that scopes ingestion. Four deliverables:

- **A.** Add a `world` field to campaigns (ontology-being) so heartwood ingests only `world == "faerrin"`.
- **B.** Lift linguist's matchers + names-vocabulary into a shared lib (`astra-lexicon`) so the registry can reuse them.
- **C.** Build `ontology-entity` — a typed KDL registry of in-world nouns, seeded (not forked) from existing sources.
- **D.** Ship a resolution API (`messy name → typed entity + page`) the Phase-2/3 proposer will call.

## 1. Scope

**In:** the four deliverables above + telemetry + the acceptance gate (§9). **Out (later phases):**
transcript ingestion, the OOC/combat filter, fact extraction, prose, change-sets, the review surface,
write-back, backfill, discovery of *new* entities (the proposer proposes registry additions in Phase
2–3; they're applied on review-approval in Phase 4). Phase 1 builds the **seed + the API**, populated
from what already exists.

## 2. Settled decisions (this session)

| # | Decision | Choice |
|---|---|---|
| P1.1 | `world` field type | **Free-form string** (already 3 distinct values, more one-shot worlds expected; a new world = a new string, no schema churn). |
| P1.2 | Campaign → world mapping | **faerrin:** `through-a-song-darkly`, `a-hunt-of-metal-and-vine`, `the-first-spark`, `interred-in-iomenei`, `fae-and-forest`. **`finnegan's ring`:** `fey-in-the-mists`. **`sedecium`:** `observatory-slipped`. heartwood ingests `world == "faerrin"` → those 5 campaigns. (NB the "Astra meta-setting" is not among these — finnegan's ring + sedecium are their own worlds.) |
| P1.3 | Matcher reuse | **Lift into a shared lib** (refactor linguist onto it); registry depends on it. Avoids app→app coupling. **Expanded (P1.6):** the lib also absorbs `defs` + `corrections.py`, with `defs.yaml → defs.kdl`. So the lib is the shared **canonical-names vocabulary + phonetic matching + correction** layer, consumed by both linguist (ASR correction) and heartwood (entity resolution). Lib name reconsidered → see §10 (now broader than "phonetics"). |
| P1.4 | Registry name | **`ontology-entity`** (package `astra-ontology-entity`), the in-world counterpart to META `ontology-being`. |
| P1.5 | Resolution output | **Rich** — `resolve()` returns `{status: resolved\|ambiguous\|unknown, entity, ranked candidates, confidence}` (§7). |
| P1.6 | `defs` home + format | **Move `defs` + `corrections.py` into the shared lib; convert `defs.yaml → defs.kdl`.** It's the shared canonical-names vocabulary, not linguist-specific. linguist imports the loader/replacer/`add_correction` from the lib; the registry seeds aliases from the same `defs.kdl`. |
| P1.7 | Entity `world` field | **Defer** — all seeded entities are faerrin; add per-entity `world` only if multi-world akasha emerges. |
| P1.8 | Shared lib name | **`astra-lexicon`** (`libs/py/lexicon`) — centers on the names-vocabulary it owns, not the matching algorithms. |

## 3. Verified current state (file-exact; from the Phase-1 verification pass)

- **`Campaign` has no setting field**, and being.kdl declares itself setting-agnostic META. Every
  ontology model is `extra="forbid"`, so the KDL and both schemas must change together. **The `world`
  ripple = 6 files:** `libs/py/ontology/src/astra_ontology/models.py` (`Campaign` field),
  `libs/py/ontology/src/astra_ontology/__init__.py` (`_campaign()` read ~L74),
  `libs/ts/ontology/src/models.ts` (`CampaignSchema` field), `libs/ts/ontology/src/index.ts`
  (`toCampaign()` read ~L80), `ontology/ontology-being/being.kdl` (author `world` on 7 nodes), and the
  **hand-regenerated** `ontology/ontology-being/being.canonical.json`. Optionally the campaign
  assertions in `libs/py/ontology/tests/test_ontology.py` + `libs/ts/ontology/src/ontology.test.ts`.
- **Both-schemas rule confirmed:** TS re-parses `being.kdl` (not the canonical JSON) and keeps the same
  snake_case field set; `canonicalJson()` must stay byte-identical (parity tests gate it, Py + TS).
- **⚠️ `being.canonical.json` has no regen script** — only assertion tests. So I regen it by hand for
  the `world` edit; and **`ontology-entity` should ship a real regen entry-point** (akasha's
  `write_snapshot()` + `main()` at `apps/akasha-backend/.../snapshot.py` is the template, *not*
  ontology-being).
- **⚠️ The matchers are deep-imports from the linguist *app*, not a lib** —
  `astra_linguist.surface.{phonetics,lexicon}` + top-level `astra_linguist.corrections`. `surface/`
  re-exports nothing (`__all__ = []`). Public surface to lift (verbatim sigs):
  - `phonetics.ensemble_sim(a_fold, b_fold) -> float` (`WEIGHTS = {"edit":.3,"jaro":.3,"phonetic":.3,"dice":.1}`),
    plus `phonetic_codes`, `edit_sim`, `jaro_sim`, `dice_sim`, `phonetic_sim`.
  - `lexicon.Lexicon(entries)`: `.has(fold)`, `.is_token(fold)`, `.nearest(fold, k=5, floor=.5) -> list[Hypothesis]`;
    `build_lexicon(defs_path=DEFS_PATH, extra_names=()) -> Lexicon`; `load_canonical_forms(defs_path, extra_names=())`;
    dataclasses `LexEntry`, `Hypothesis`. **The `extra_names` union hook is the designed-but-unwired seam
    for akasha/registry names** (lexicon docstring: "takes the akasha union as a later wiring step").
  - `corrections.{DEFS_PATH, load_corrections, build_replacer, add_correction}` (defs.yaml = 232 canonical keys ↔ garbles).
  Deps: `metaphone`, `rapidfuzz` (already declared by linguist).
- **akasha snapshot gives the registry what it needs without a raw-corpus read:** committed
  `apps/akasha-backend/snapshot/akasha-snapshot.json` (121 pages); each page = `{path, date, frontmatter:
  {aliases, extra, img, tags, title}, crossrefs}`. **`path` is the path-key (page identity); frontmatter
  `aliases` are present.** ⚠️ `title` is almost always `null` → **derive the display name from the
  path's last segment** (as the frontend's `slug.ts`/`site.ts` do). Body is *not* in the snapshot (don't
  need it for seeding). Folder path encodes section + hierarchy (e.g. `Org/<Org>/People/<Person>`).
- **The campaign list isn't exhaustive of sessions** (`EXCLUDED_DATES` / the "Argyle" false-match prove
  sessions exist whose campaign isn't in being.kdl) → the faerrin filter must **skip unmapped slugs**, not
  assume every session maps to a known campaign.
- **New `ontology/` member is auto-claimed** by the root `pyproject.toml` `members = [..., "ontology/*"]`
  (and pytest `testpaths` includes `ontology`); create the dir only with its manifest (uv errors on an
  empty member). Template: `ontology-being` (data + canonical + models-in-`libs/py/ontology` + thin shim
  package) or `ontology-config` (local loader).

## 4. Deliverable A — the `world` field

Add `world: str` to `Campaign` (both schemas + both KDL loaders), author it on all 7 campaign nodes per
the P1.2 mapping, regenerate `being.canonical.json`, update the test assertions, confirm both parity
tests green. Add a small **faerrin-filter helper** (in `astra_ontology` or a heartwood-facing util):
`faerrin_campaign_slugs(being) -> set[str]` = `{c.slug for c in being.campaigns if c.world == "faerrin"}`,
which the Phase-2 ingestion uses to select sessions (skipping slugs absent from being.kdl). `chronicle.py`'s
`ShowInfo`/`show_index` ignore unknown fields → no change needed unless we later want `world` on a show.

## 5. Deliverable B — the shared names+matching lib (P1.3 + P1.6)

A new `libs/py/lexicon` lib (package **`astra-lexicon`**, P1.8) that becomes the **shared
canonical-names + matching + correction layer**, consumed by both linguist and the registry. It holds:
- `phonetics.py` + `lexicon.py` ~verbatim (the fuzzy/phonetic ensemble + `Lexicon`);
- **`corrections.py`** (the defs loader / regex replacer / `add_correction` writer) — moved out of linguist;
- **`defs.kdl`** — `defs.yaml` converted to KDL (232 canonical → garble-fragment entries; loaded via
  `astra_config.kdl.load_document`, as the other KDL stores are).

**Linguist refactor (the only change to *working* code — keep green):**
- `surface/{known,judge,goldset,optimize}` + `ingest.py` import the matchers/lexicon/corrections from
  the lib instead of `astra_linguist.surface.*` / `astra_linguist.corrections`.
- `ingest.py`'s `replace=load_corrections()` and the human-gated `apply.py`/`review_tui` loop now load +
  write `defs.kdl` via the lib (the `add_correction` minimal-diff writer must emit KDL, not YAML).
- `goldset.py` builds confirms from `defs.kdl` pairs.
- Regression gate: the existing surface/judge/`correction_candidates`/goldset tests stay green with **no
  behavior change** (only the defs *format* + module *home* change, not the matching logic).

The registry (Deliverable C/D) then builds a `Lexicon` over **registry entity names ∪ `defs.kdl`
canonicals** via the same lib — finally wiring the `extra_names` union the lexicon docstring anticipated.

**Scope flag:** the `defs.yaml→defs.kdl` conversion + the `add_correction` KDL writer + retargeting
`goldset`/`apply`/`ingest` make B noticeably larger than a pure module move. Worth its own CI-green
slice(s) within Phase 1.

## 6. Deliverable C — the `ontology-entity` registry

A typed KDL registry of in-world nouns. **It is a new SSOT** for the net-new facts (kind, page link,
curated aliases) — *seeded* from existing sources but **not a blind cache** (kind can't be regenerated
from anything). Hand-editable (KDL) + machine-maintained (Phase-2/3 proposals).

**Entry schema (per node):**
- `canonical` — the canonical display name (e.g. `Ichel`).
- `kind` — one of a **closed taxonomy** (CONFIRM, §10): `person | place | org | deity | phenomenon |
  creature | item`. Derived from / aligned to the akasha sections (deity→Divinity, place→Geography,
  org→Org, phenomenon→Phenomena, person→`Org/.../People`, creature/item→Bestiary). Rules pages are
  mechanical, not entities.
- `page` — the akasha path-key if a page exists (e.g. `Divinity/Outer Gods/Iridescent Host`), else null
  (entity known but unwritten).
- `aliases` — alternate names + known ASR garbles (seeded from defs.yaml + frontmatter aliases).
- `being-ref` — the ontology-being PC slug if this is a player character (boundary marker; PCs live in
  being.kdl, *not* the akasha wiki).
- `world` — (FUTURE, deferred) which world; for now all seeded entities are faerrin. Left out of Phase 1
  unless cheap to include.
- provenance: optional `source` note (which seed source(s) it came from).

**Seeding (a regen entry-point, host-runnable, like akasha's `write_snapshot`):** reads three **committed
data files** (no app imports needed) — `akasha-snapshot.json` (121 page path-keys + frontmatter aliases;
display name from path tail; kind inferred from the top folder), **`defs.kdl`** (the 232 canonical↔garble
entries, now in the shared lib per P1.6 → canonical entries + aliases), `being.kdl` (PCs → `being-ref`
entries). Cross-source merge by canonical
name (fuzzy-dedup via `astra-lexicon` so `Ichel` from defs.kdl unifies with an `Ichel` page).
**Re-seed is a MERGE that preserves curated/heartwood-added fields** (never clobbers a hand-set `kind`
or a Phase-3 correction). Ships the parity test + the both-(if TS)… (see §10 py-only) regen recipe.

**Package layout:** `ontology/ontology-entity/` (manifest + `entity.kdl` + committed
`entity.canonical.json` + regen entry-point) with models/seeding/resolution in `libs/py/ontology`
(extend `astra_ontology`) or a new `libs/py/ontology-entity` lib — recommendation: **extend
`astra_ontology`** (one ontology lib, already the home for Being models), depending on `astra-lexicon`.

## 7. Deliverable D — the resolution API

The thin API the proposer calls. Proposed shape (CONFIRM output, §10):
```
resolve(name: str, *, kind_hint: str | None = None) -> Resolution
Resolution = { status: "resolved" | "ambiguous" | "unknown",
               entity: EntityRef | None,        # set when resolved
               candidates: list[(EntityRef, score)],  # ranked, for ambiguous/unknown
               confidence: float }
```
- exact fold-match on canonical or alias → `resolved`;
- else `Lexicon.nearest()` (built over registry names via `astra-lexicon`) → one clear winner above a
  floor → `resolved`; several close → `ambiguous`; nothing above floor → `unknown` (a new entity).
- `kind_hint` (when the proposer knows context) biases ties.
The proposer maps `resolved`→update existing page, `unknown`→propose new page + new registry entry,
`ambiguous`→flag for the human. PC matches (`being-ref` set) → skip (akasha boundary).

## 8. Telemetry

`init_telemetry` in the seeding/regen entry-point + any Dagster asset; emit counts (entities seeded by
kind, pages-linked vs unlinked) + a `astra.heartwood.resolve` span/metric (status, confidence) on
resolution calls. (LLM cost telemetry is N/A here — Phase 1 makes no LLM calls.)

## 9. Acceptance gate

1. `world` on all 7 campaigns (both schemas, canonical.json regenerated, both parity tests green);
   `faerrin_campaign_slugs()` returns the 5 faerrin slugs.
2. The shared lib exists holding matchers + `Lexicon` + `corrections` + **`defs.kdl`** (converted from
   YAML); linguist refactored onto it (ingest correction, the `apply.py`/`review_tui` human loop now
   read+write `defs.kdl`, goldset reads it); **all linguist tests green, no behavior change** —
   surface/judge/`correction_candidates`/goldset only change defs *format* + module *home*, not logic.
3. `ontology-entity` seeds from the 3 committed sources (121 pages ∪ 232 `defs.kdl` canonicals ∪ being PCs),
   fuzzy-deduped; spot-checked against the corpus (counts + a few entries by hand); regen entry-point +
   parity test in place.
4. `resolve()` returns the right typed entity + page for known cases — **`Y'shael → Ichel`** (the canonical
   example), exact + fuzzy; an unknown name → `unknown`; a PC name → boundary-skip. Telemetry visible in SigNoz.
5. CI green both lanes locally before push; commit per CI-green slice; push on Phase-1 completion.

## 10. Decisions (per `resolve-open-questions-before-next-stage`)

**RESOLVED this session:**
- **Kind taxonomy** → `person | place | org | deity | phenomenon | creature | item` (akasha-section-aligned). ✓
- **Python-only registry** → yes; skip the Zod mirror + committed canonical JSON (plain regen + a Python
  round-trip test). Add a TS twin later only if a frontend needs direct KDL access. ✓
- **Resolution output** → **rich** `{status, entity, candidates, confidence}` (P1.5). ✓
- **Entity `world`** → **defer** (P1.7). ✓
- **`defs` home/format** → **move `defs` + `corrections.py` into the shared lib; `defs.yaml → defs.kdl`**
  (P1.6); the lib is the shared canonical-names vocabulary, linguist + registry both consume it. ✓
- **Shared lib name** → **`astra-lexicon`** (P1.8) — it owns the lexicon vocabulary, so the name centers
  on that, not the matching algorithms. ✓

**No open questions remain — this scope doc is ready to advance to the NLSpec.**

## 11. Risks / notes

- The faerrin filter must tolerate **unmapped session slugs** (skip, don't crash) — real per `EXCLUDED_DATES`.
- The linguist refactor (B) is the only change touching *working* code; the surface/judge tests are the
  safety net — keep them green, no behavior drift.
- Seeding quality bounds everything downstream: a missing/mis-kinded entity → bad Phase-2 resolution.
  Hence the hand spot-check in the gate.
- Don't pre-create the `ontology/ontology-entity` dir without its manifest (uv hard-errors).
