# 0020 — heartwood Phase 1 (ontology infra: `world` field + entity registry) — NLSpec

- **Status:** SPEC (pre-implementation) — **0 of 5 slices built**; ready to implement **S1** (the `world`
  field). Question-free (built on a question-free scope).
- **Scope doc:** `thoughts/shared/research/2026-06-27-heartwood-0020-phase1-registry-thoughts.md` (verified)
- **Umbrella scope:** `thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md`
- **Date:** 2026-06-27
- **Subsystem slug:** `heartwood` · **Phase:** 1 of 5

## 1. Overview

Phase 1 of **heartwood** (the system that maintains the akasha setting wiki from transcripts). This phase
is **pure `ontology/` + `libs/` data infrastructure — no transcript ingestion, no LLM, no frontend.** It
delivers the foundation every later phase resolves against, plus the schema change that scopes ingestion:

- **A. `world` field** on campaigns → heartwood will ingest only `world == "faerrin"` sessions.
- **B. `astra-lexicon`** — a new shared lib holding the canonical-names vocabulary (`defs.kdl`) + phonetic
  matchers + corrections, lifted out of linguist so both linguist and heartwood consume it.
- **C. `ontology-entity`** — a typed KDL registry of in-world nouns, **seeded (not forked)** from the
  existing corpus + vocabulary + PCs.
- **D. resolution API** — `resolve(messy name) → typed entity + page`, the seam the Phase-2/3 proposer calls.

This NLSpec assumes the verified facts and resolved decisions (P1.1–P1.8) in the scope doc. **There are no
open questions.**

## 2. Actors / components

- **The maintainer** — runs the one-time `world` tagging + the registry seed/regen on the host.
- **linguist** (existing app) — refactored onto `astra-lexicon`; behavior unchanged.
- **heartwood** (Phase 2+, not built here) — the future consumer of `faerrin_campaign_slugs()` + `resolve()`.
- **The registry seed entry-point** — reads three committed data files → writes `entity.kdl`.

## 3. Deliverable A — the `world` field

### 3.1 Schema change (the 6-file ripple)
Add a **required, free-form** `world: str` to `Campaign` (every campaign must declare its world — no
default; this forces future campaigns to tag too):

| # | File | Change |
|---|---|---|
| 1 | `libs/py/ontology/src/astra_ontology/models.py` | add `world: str` to `Campaign` (extra=forbid model) |
| 2 | `libs/py/ontology/src/astra_ontology/__init__.py` | in `_campaign()` (~L74): `world=_scalar(node, "world")` |
| 3 | `libs/ts/ontology/src/models.ts` | add `world: z.string()` to `CampaignSchema` (`.strict()`) |
| 4 | `libs/ts/ontology/src/index.ts` | in `toCampaign()` (~L80): `world: String(scalar(node, "world"))` |
| 5 | `ontology/ontology-being/being.kdl` | author `world "<value>"` on all 7 campaign nodes (§3.2) |
| 6 | `ontology/ontology-being/being.canonical.json` | **regenerate** (`model_dump`, sorted) so both parity tests pass |

`world` is snake_case in both schemas (the both-schemas rule) so `canonicalJson()` stays byte-identical;
the Py + TS parity tests gate it. Update the campaign assertions in
`libs/py/ontology/tests/test_ontology.py` + `libs/ts/ontology/src/ontology.test.ts` to include `world`.

### 3.2 The world mapping (P1.2)
| campaign slug | `world` |
|---|---|
| `through-a-song-darkly` | `faerrin` |
| `a-hunt-of-metal-and-vine` | `faerrin` |
| `the-first-spark` | `faerrin` |
| `interred-in-iomenei` | `faerrin` |
| `fae-and-forest` | `faerrin` |
| `fey-in-the-mists` | `finnegan's ring` |
| `observatory-slipped` | `sedecium` |

### 3.3 The filter helper
Add to `astra_ontology` (alongside `Being`):
```
faerrin_campaign_slugs(being: Being) -> set[str]
    = {c.slug for c in being.campaigns if c.world == "faerrin"}
```
Returns the 5 faerrin slugs. **Behavioral note for Phase 2 (documented here, used later):** session→campaign
matching must **skip session slugs absent from being.kdl** (real per `EXCLUDED_DATES`/the "Argyle"
false-match) — an unmapped slug is *not* faerrin, never a crash.

### 3.4 Optional (nice-to-have, not required)
ontology-being has no canonical-JSON regen script. A tiny `astra_ontology_being` regen entry-point would
remove the hand-regen step, but is **out of scope** for Phase 1 (hand-regen + the parity tests suffice).

## 4. Deliverable B — the `astra-lexicon` shared lib (P1.3 + P1.6)

### 4.1 The lib
New `libs/py/lexicon` (package **`astra-lexicon`**, importable module `astra_lexicon`), a uv workspace
member (auto-claimed by `libs/py/*`). Declares deps `metaphone`, `rapidfuzz`, `astra-config` (for KDL
loading). It holds, lifted ~verbatim from linguist:
- `phonetics.py` — `ensemble_sim(a_fold, b_fold)` (`WEIGHTS={"edit":.3,"jaro":.3,"phonetic":.3,"dice":.1}`)
  + `phonetic_codes`, `edit_sim`, `jaro_sim`, `dice_sim`, `phonetic_sim`.
- `lexicon.py` — `Lexicon` (`.has`, `.is_token`, `.nearest(fold, k=5, floor=.5)`), `build_lexicon(...)`,
  `load_canonical_forms(...)`, `LexEntry`, `Hypothesis`. The `extra_names` union hook stays — now actually
  fed by registry names.
- `corrections.py` — `load_corrections`, `build_replacer`, `add_correction`, `Replacer` — retargeted to
  `defs.kdl`.
- **`defs.kdl`** — `defs.yaml` converted to KDL (§4.2).
A `__init__.py` re-exports the public surface (unlike linguist's empty `surface/__init__`), so consumers
import `from astra_lexicon import Lexicon, ensemble_sim, build_lexicon, load_corrections, ...`.
Ship `astra_lexicon`'s own unit tests (the lifted matcher/lexicon/corrections behaviors).

### 4.2 `defs.yaml → defs.kdl`
The 232 canonical→garble entries become KDL, loaded via `astra_config.kdl.load_document`. Format
(garbles are intentionally-unescaped regex fragments, stored verbatim as strings):
```kdl
entry "Ichel" {
    variant "Eshell"
    variant "Michelle"
    variant "Ixchel"
    variant "Y'shell"
    variant "Ischel"
}
```
- `load_corrections` walks `entry` nodes → `dict[canonical, list[variant]]`; `build_replacer` is unchanged
  (operates on that dict).
- `add_correction(canonical, span)` appends a `variant` child to the matching `entry` (or creates the
  `entry`), **minimal-diff, idempotent** — must preserve file formatting. **Risk/impl note:** confirm a
  Python KDL serializer exists (via `astra_config.kdl`); if write-back isn't supported, `add_correction`
  does a targeted text-insert (as today's YAML version does). Either way the round-trip must be stable.

### 4.3 Linguist refactor (the ONLY working-code change — keep green)
Retarget every linguist importer to `astra_lexicon` (remove the local `surface/{phonetics,lexicon}.py` +
top-level `corrections.py` + `defs.yaml`):
- `surface/{known,judge,goldset,optimize}.py`, `dspy_judge.py` — import matchers/lexicon from the lib.
- `ingest.py` — `replace=load_corrections()` (now KDL).
- `apply.py` + `review_tui.py` — the human-gated accept→`add_correction` loop now writes `defs.kdl`.
- `goldset.py` — builds confirm examples from `defs.kdl` pairs.
- `apps/linguist/pyproject.toml` — add `astra-lexicon` dep.
**Invariant: no behavior change.** Only the defs *format* and the module *home* change, never the matching
or judging logic. The existing surface / judge / `correction_candidates` / goldset tests are the regression
gate and must stay green (the dspy judge stays compiled; CI never runs it live).

## 5. Deliverable C — the `ontology-entity` registry

### 5.1 Package + code layout
- `ontology/ontology-entity/` — member dir: `pyproject.toml` (package `astra-ontology-entity`, dep
  `astra-ontology`), the committed **`entity.kdl`** (the registry data), and the regen entry-point
  (`python -m astra_ontology_entity.seed` or a console script). Auto-claimed by `ontology/*`. **Do not
  create the dir without its manifest** (uv hard-errors on an empty member).
- **Models + seeding + resolution live in `libs/py/ontology` (extend `astra_ontology`)**, which gains a
  dep on `astra-lexicon`. The `astra_ontology_entity` package is a thin shim (path pins + the IO
  entry-point), mirroring how `astra_ontology_being` shims `astra_ontology`.
- **Python-only** (P1: no Zod twin, no committed canonical JSON). A **Python round-trip test** (parse
  `entity.kdl` → model → serialize → byte-equal) + a **seed test** (seed from fixtures → expected entries)
  replace the cross-lang parity gate.

### 5.2 The `Entity` schema (one KDL node per entity)
```kdl
entity "Ichel" kind="person" page="Org/Radiant Arms/People/Ichel" {
    alias "Y'shell"
    alias "Eshell"
    source "akasha"
    source "defs"
}
```
| field | type | notes |
|---|---|---|
| canonical | `str` (node arg0) | the canonical display name; the entity's identity |
| `kind` | `person\|place\|org\|deity\|phenomenon\|creature\|item` **or null** | null when unclassifiable (e.g. a defs-only entry with no page); fillable by hand / Phase 2-3 |
| `page` | `str \| null` (prop) | akasha path-key if a page exists, else null (known-but-unwritten) |
| `being` | `str \| null` (prop) | ontology-being PC slug if this is a player character (boundary marker) |
| `alias` | `list[str]` (child nodes) | alternate names + known ASR garbles |
| `source` | `list[str]` (child nodes) | provenance: which seed source(s) — `akasha` / `defs` / `being` / `manual` |

`extra=forbid` on the Pydantic model. Entities sorted deterministically (by canonical) for a stable
committed file.

### 5.3 Seeding (pure function in the lib + IO entry-point in the package)
A **pure** `seed_entities(snapshot, defs, being) -> list[Entity]` in `astra_ontology` (testable with
fixtures, no file IO), wired by the entry-point that reads three **committed data files** (no app code
imports):
1. **akasha-snapshot** (`apps/akasha-backend/snapshot/akasha-snapshot.json`, 121 pages) — per page:
   canonical = **display name from the path's last segment** (`title` is null, do not use it); `page` =
   path-key; `alias` ⊇ frontmatter `aliases`; **`kind` from the top folder** — `Divinity→deity`,
   `Geography→place`, `Phenomena→phenomenon`, `Org/<X>/People/<Y>→person`, `Org/<X>/…(non-People)→org`,
   `Bestiary→creature` (none today); **`Rules/*` pages are NOT seeded as entities** (mechanical, not nouns);
   `source=akasha`.
2. **defs.kdl** (232 canonicals) — each canonical → an entity (`alias` ⊇ its variants; `source=defs`);
   `kind`/`page` null unless unified with an akasha page in step 4.
3. **being.kdl PCs** (`role.character` where `character != "Gamemaster"`, for `world=="faerrin"` campaigns)
   → entity with `being=<player-or-pc slug>`, `kind=person`, `page=null`, `source=being` (the boundary set).
4. **Cross-source unify by canonical** using `astra-lexicon` with a **strict (near-exact) threshold** —
   only unify names that are essentially the same (so `Ichel` from defs unifies with an `Ichel` page);
   **never merge distinct entities** (the loose `resolve()` floor is for query-time, NOT seed-dedup).
   Unified entity = page+kind from akasha, `alias` union, `source` union.

### 5.4 Re-seed is a MERGE (non-clobbering)
Re-running the seed must **preserve curated state**: any entity or field marked `source=manual` (a
hand-set `kind`/`page`/`alias`) or added by a future Phase-2/3 approval is **never overwritten** by
seed-derived values. Initial seed (Phase 1) has no curation, so it writes clean; the merge policy exists
for re-runs: union by canonical; for an existing entity, refresh only auto-derived fields and keep any
`manual` overrides. (Exact merge mechanics are an implementation detail; the invariant is "re-seed never
loses a human edit.")

### 5.5 Regen entry-point + telemetry
`python -m astra_ontology_entity.seed` (host-runnable, template = akasha's `write_snapshot()`/`main()`):
`init_telemetry("astra.heartwood")` → seed/merge → write `entity.kdl` → emit metrics
`astra.heartwood.entities_seeded` (tagged by `kind`) + `pages_linked` / `pages_unlinked` counts. Prints a
per-kind summary. CI gates `entity.kdl` against a fresh seed of the committed sources (a drift check, like
akasha's snapshot CI diff) **modulo curated fields**.

## 6. Deliverable D — the resolution API

### 6.1 Signature + result
```python
resolve(name: str, *, kind_hint: str | None = None) -> Resolution

@dataclass
class EntityRef:    # a thin view of an Entity
    canonical: str; kind: str | None; page: str | None; being: str | None

@dataclass
class Resolution:
    status: Literal["resolved", "ambiguous", "unknown"]
    entity: EntityRef | None                 # set iff resolved
    candidates: list[tuple[EntityRef, float]]  # ranked (entity, score); for ambiguous/unknown context
    confidence: float                        # the winning/top score (1.0 for exact)
```

### 6.2 Algorithm
1. `fold(name)` (the same fold used by the lexicon).
2. **Exact** fold-match on any entity's canonical or `alias` → `resolved`, confidence 1.0.
3. Else `Lexicon.nearest(fold, k, floor)` built over **registry canonicals ∪ aliases** (via
   `astra-lexicon`):
   - top score ≥ `RESOLVE_FLOOR` **and** (only one above floor, or gap to #2 ≥ `RESOLVE_GAP`) → `resolved`;
   - ≥2 close above floor → `ambiguous` (return ranked `candidates`);
   - nothing above floor → `unknown` (return top-k as `candidates` for context — a likely new entity).
4. `kind_hint`, when given, breaks ties toward a matching-`kind` candidate.
5. **PC boundary:** a resolved entity with `being` set is returned normally; the *consumer* (Phase-2/3
   proposer) checks `being` and skips writing PCs into the wiki. (No 4th status — keeps the enum at three.)

### 6.3 Thresholds (single source)
`RESOLVE_FLOOR`, `RESOLVE_GAP`, `k` are defined in **one** place in `astra_ontology` (documented defaults,
e.g. floor ≈ 0.6, gap ≈ 0.08, k = 5). Config-single-source: if tuning proves necessary they move to a
`config.kdl` node, not scattered literals. The **seed-dedup** strict threshold (§5.3.4) is a *separate*,
higher constant — query recall vs seed precision are different jobs.

## 7. Telemetry (from day one)

- `init_telemetry("astra.heartwood")` in the seed entry-point (the only Phase-1 runtime).
- Metrics: `astra.heartwood.entities_seeded{kind}`, `astra.heartwood.pages_linked|pages_unlinked`.
- `astra.heartwood.resolve` span/metric on `resolve()` calls (attrs: `status`, `confidence`,
  `kind_hint`). Per `telemetry-built-in`, wiring it in the runtime (not just importing observe) is the bar.
- No LLM telemetry (Phase 1 makes no LLM calls). Host-run telemetry depends on OTLP collector
  reachability from the host (note, not a blocker).

## 8. Acceptance criteria (Phase-1 gate)

1. **`world`** is on all 7 campaigns (both schemas + `being.canonical.json` regenerated; **both parity
   tests green**); `faerrin_campaign_slugs(load())` returns exactly the 5 faerrin slugs.
2. **`astra-lexicon`** exists (matchers + `Lexicon` + `corrections` + `defs.kdl`) with its own tests;
   **linguist refactored onto it with NO behavior change** — the full linguist suite
   (surface/judge/`correction_candidates`/goldset) is green; `defs.yaml` is gone; `add_correction` writes
   `defs.kdl` round-trip-stably.
3. **`ontology-entity`** seeds from the three committed sources (121 pages minus Rules ∪ 232 `defs.kdl`
   canonicals ∪ faerrin PCs), strict-deduped; `entity.kdl` committed; round-trip + seed tests green;
   regen entry-point runs on host and is idempotent (re-run = no diff, modulo curation); **hand
   spot-check** of counts + a handful of entries against the corpus.
4. **`resolve("Y'shael")` → `resolved`, entity `Ichel`** (the canonical fuzzy case — note `Y'shael` is
   *not* a listed alias, so this exercises phonetic `nearest()`, not exact match); an exact name →
   confidence 1.0; an invented name → `unknown`; a PC name → resolves with `being` set (boundary).
   Resolve telemetry visible in SigNoz.
5. **CI green both lanes locally before push** (`uv run ruff check && ruff format --check && ty check &&
   pytest`; `bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && build`); commit per
   CI-green slice; push on Phase-1 completion (no GHA-watching).

## 9. Slice plan (each independently CI-green)

- **S1 — `world` field (A).** Schema ripple (6 files), tag 7 campaigns, regen canonical.json, helper +
  test updates. Self-contained.
- **S2a — `astra-lexicon` (lift).** Create the lib by lifting `phonetics.py` + `lexicon.py`; refactor
  linguist's matcher importers onto it. **No defs change yet.** Linguist tests green.
- **S2b — defs → KDL + corrections move.** Move `corrections.py` + convert `defs.yaml→defs.kdl` into the
  lib; retarget `ingest`/`apply`/`review_tui`/`goldset`; KDL `add_correction`. Linguist tests green.
- **S3 — `ontology-entity` registry (C).** Package + `Entity` model + pure `seed_entities` + IO
  entry-point + tests; commit the initial seeded `entity.kdl`.
- **S4 — resolution API + telemetry (D).** `resolve()` + thresholds + the Y'shael→Ichel acceptance test +
  resolve span/metric.

## 10. Out of scope (later phases)

Transcript ingestion, the OOC/combat filter, fact extraction, prose, change-sets, the review surface,
write-back, backfill, **discovery of new entities** (Phase 2-3 proposes registry additions; applied on
review-approval in Phase 4), wiring the seed as a **Dagster asset** (Phase 1 ships a script; assetize when
heartwood's pipeline exists), a **per-entity `world`** field (deferred, P1.7), a **TS/Zod twin** of the
registry (add only when a frontend needs direct KDL access).

## 11. Risks / notes

- **The linguist refactor (B) is the only change to working code.** The surface/judge/goldset tests are
  the safety net; any behavior drift is a bug. KDL `add_correction` write-back is the trickiest bit —
  verify round-trip serialization early.
- **Seeding quality bounds everything downstream.** A missing or mis-`kind`ed entity → bad Phase-2
  resolution. Hence the hand spot-check in the gate, and `kind=null` (not a guess) when unclassifiable.
- **Strict seed-dedup vs loose resolve-floor** are deliberately different thresholds — conflating them
  either merges distinct entities or fails to resolve garbles.
- **defs may contain non-entity corrections** (it's a flat correction list, not a pure noun registry) →
  some seeded entities will be junk/`kind=null`; acceptable (curatable; the registry is hand-editable KDL).
- **Don't pre-create `ontology/ontology-entity/` without its manifest** (uv hard-errors). KDL files aren't
  touched by biome/ruff (no pre-commit-gate concern).

## 12. Adversarial completeness pass

Checked for gaps a second look should catch:
- **`world` required breaks Campaign construction in tests/fixtures** → S1 must update every `Campaign(...)`
  construction + the canonical fixtures (covered by "update test assertions").
- **A PC canonical colliding with an akasha NPC of the same name** → the `being` marker wins for that
  entity; if a genuinely distinct NPC page exists, they are two entities (strict dedup won't merge unless
  near-identical) — acceptable; the consumer skips only the `being`-marked one.
- **`Org` vs `faction`** — folded into `org` (P1 taxonomy); no `faction` kind. Fine per the resolved
  taxonomy.
- **Empty/stub akasha pages** (Godhome, Firmament, Stillness) → still seed as entities with `page` set
  (known, link target) — correct.
- **Non-ASCII / apostrophe canonicals** (`Anaïs`, `Y'shael`, `finnegan's ring`) → folding + KDL quoting
  must handle them; the lexicon already folds Unicode, KDL quotes arbitrary strings.
- **Re-seed idempotence** is an explicit gate item (S3) so the merge policy is exercised, not assumed.
- **Telemetry on a host script** may not reach the in-cluster collector → noted as non-blocking; the
  resolve metric matters more (it'll fire under the Phase-2 pipeline runtime).
