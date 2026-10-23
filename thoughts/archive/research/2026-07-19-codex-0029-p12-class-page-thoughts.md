# codex 0029 P12 — bespoke class page (5e.tools-style) — scoping thoughts

**Date:** 2026-07-19 · **Status:** SCOPED — decisions R1–R4 stakeholder-RESOLVED same day
**Provenance:** stakeholder: "build a special interface for some of the data types, instead of
using the generic one we have now. look at how the 5e.tools pages for classes look."
**Verification basis:** live inspection of 5e.tools (local serve of `5etools-mirror-3/5etools-src`
shallow clone, `python3 -m http.server` — the live site is CF-challenged from this host, same
recipe as the P8 comparison doc) + two exploration agents verified against the real repo, the
real corpus (`apps/codex/data/corpus`, 44,808 entities), and the raw snapshots
(`data/snapshots/foundry/pf2e-8.3.0`, `data/snapshots/aon/2026-07-17`) + orchestrator spot-checks.

---

## 1. The model: 5e.tools class page anatomy (verified live, Barbarian)

1. **Class progression table** — one row per level 1–20: Level · Proficiency Bonus ·
   **Features** (each an anchor link into the prose stream below) · per-class resource columns
   (Rages, Rage Damage, Weapon Mastery).
2. **Core Traits box** — primary ability, hit die + HP formula, saving throws, skill choices,
   weapon/armor training, starting equipment, multiclassing.
3. **Sticky Outline (ToC)** — every feature in level order; subclass features nest under the
   subclass heading when toggled.
4. **Feature stream** — `Level N: Feature Name` headings w/ source + page ref, full prose,
   strictly level-ordered.
5. **Subclass toggle pills** — toggling (e.g. Berserker) *interleaves* that subclass's features
   into the stream at the right level positions and persists in the URL
   (`#barbarian_xphb,state:sub_berserker_xphb=b1`).
6. **Narrow class-list rail** on the left — just names + source; the class page owns the width.
   (5e.tools has no "generic browse" for classes at all — R4 adopts this.)

## 2. Architecture facts (agent-verified, file:line)

- **Generic page composition:** route `src/routes/$category/$slug.tsx` → loader
  `memoizedEntity` → `EntityRenderPane` (`src/domain/render/EntityRenderPane.tsx:37-77`, the ONE
  seam both the standalone route and the split-view pane funnel through) → `EntityPage`
  (`src/domain/render/entityPage.tsx:90-197`) → `renderNodes` (`src/domain/render/nodes.tsx`,
  total renderer over the 19 `CodexNode` kinds).
- **The per-category dispatch precedent:** `categoryGroupOf()`
  (`src/domain/render/categoryGroup.ts:18-25`) → 6 groups; `entityPage.tsx:159-171` fans out to
  `CreatureStatblock`/`HazardStatblock`/`SpellFacetHeader`/`EquipmentFacetHeader`/
  `FeatFacetHeader`/`GenericFacetLine`. `class` is `generic` today. The route already does one
  per-category *layout* switch (`rulesNav` → `RulesLayout`, `$slug.tsx:91-102`).
- **Loader projection:** `EntityPageData` (`src/server/entityPageData.ts:77-108`) prefetches
  depth-0 embed targets (`EMBED_INLINE_CAP=100`), trait index, `attachedSidebars`, rules nav.
  **No related-doc projection exists** beyond these — a class page needing its granted features
  + subclass docs needs new (precedented) projection work.
- **Pinned contracts a bespoke page must honor:** the `class/investigator@legacy` byte-exact
  golden (`src/domain/render/goldens.test.tsx:99` — regen + review on any class-render change);
  the `standalone` sr-only-h1 / `HeaderTitle` / popover-clone interlock (`entityPage.tsx:113-119`,
  P11 B1); the hydration nesting guards (`nodes.tsx:102-111,221-226`); ssrSmoke against the
  built server.
- **Browse side:** `columnDefs.tsx` puts class in the `fallback` column set; the split-view pane
  (`BrowseListing.tsx`) renders `EntityRenderPane` at ~42% width.

## 3. Data facts (agent-verified + spot-checked)

### 3a. Corpus class docs today: prose-only

49 docs under `corpus/class/` = **28 Foundry-merged** (have `facets.keyAbility`; raw Foundry pack
has 27 classes) + **20 `@legacy`** (AoN-only, no typed facets) + **2 miscategorized AoN docs**
(`draconic-connections`, `draconic-sorcerer-bloodlines` — not classes; P12 cleanup candidates).
A class doc's only structured fields: `facets = {hp, keyAbility}` (`foundryEntities.ts:353-358`;
`facetKeys.ts:157`). Everything else — initial proficiencies, class features, progression — is
prose. The AoN body DOES include the level-progression table as a parsed `table` node with
text-only cells, plus ~15 `crossref` nodes to `class-feature/*` (machine-linkable, not
level-bucketed).

### 3b. Raw Foundry snapshot: the complete structured model, currently dropped

Verified on `packs/pf2e/classes/fighter.json` (`system.*`), present for all 27 classes:

| Raw field | Example (fighter) | UI use |
|---|---|---|
| `items` (granted features) | 16 × `{name, level, uuid}` — L1 Reactive Strike … L19 Versatile Legend | progression-table spine + feature stream |
| `classFeatLevels/ancestryFeatLevels/skillFeatLevels/generalFeatLevels/skillIncreaseLevels` | `[1,2,4,…]` etc. | cadence rows ("L3: general feat, skill increase") |
| `perception, savingThrows, defenses, attacks` | proficiency ranks (0–4) | Core Traits box |
| `trainedSkills` | `{additional:3, value:[]}` | Core Traits box |
| `spellcasting` | `0`/`1` | Core Traits box |

Only `hp` + `keyAbility.value` survive today. AoN's `_source` carries parallel prose-string
proficiency fields (`attack_proficiency[]` etc.) — redundant with Foundry's typed ranks; Foundry
is the extraction source of truth.

### 3c. class-feature linkage: two paths, both real

1,500 `class-feature/` docs, **all with top-level `level`**; 546 carry a class-slug trait
(covers all 27 classes). Foundry `system.items[].uuid` → resolvable through the existing
`uuidResolve` seam to corpus ids. So granted features can be emitted as typed
`{level, name, targetId}` at transform time.

### 3d. Subclass association: NO machine linkage exists (the scoping find)

Subclass option docs live as **18 separate AoN-only categories** (instinct 15 (incl. @legacy),
bloodline 28, doctrine 2, muse 4, racket 4, hunters-edge 4, methodology 9, research-field 4,
way 5, style 5, conscious-mind 6, subconscious-mind 4, lesson 13, patron 11, mystery 12,
innovation 7, cause 6, draconic-exemplar 44). Verified: their `traits` and `facets` are EMPTY;
raw AoN `_source` has no `class` field; the barbarian class body has **zero** crossrefs into
`instinct/` (only rules/trait/action/category-page/skill). The Foundry grant chain points at the
umbrella feature (`class-feature/instinct`, L1, trait `barbarian`), not the options.
**→ Mechanism: a curated `classSlug → subclassCategory[]` map** (~20 entries, stable; note
psychic and witch each map to TWO categories) with a conformance test (every mapped category
exists; every doc in it renders; no category claimed twice). Same curation pattern as P11's
28-item nav. `draconic-exemplar` needs a triage look at spec time (44 docs — likely not a
class-subclass category in the same sense).

## 4. Stakeholder decisions (RESOLVED 2026-07-19)

- **R1 — scope: class only.** Template round (the strider precedent); ancestry/others are
  fast-follows reusing the pattern. Creature is already fully structured; ancestry+heritage is
  the next-best latent candidate; spell heightening / deity edicts / archetype are prose-only.
- **R2 — subclasses: pills → inline render.** 5e.tools-style toggle pills; selecting renders the
  subclass doc's content on the class page, URL-persisted. Via the curated map (§3d).
- **R3 — feature prose: inline full.** The class page is the one-stop read; progression-table
  rows anchor-scroll to the feature text. ~15–20 features per class through the embed-prefetch
  machinery (cap 100 holds). Weights recorded at sweep.
- **R4 — surfaces: `/class` itself becomes the bespoke surface.** A narrow 5e.tools-style
  class-list rail (names + source; superseded hidden per site convention) + the full class page
  as the main pane. `/class/{slug}` standalone = same layout. The generic 42% split-view browse
  for the class category dies. **Mobile fallback sanctioned by the stakeholder** ("if that
  doesn't work for mobile then that's fine") — rail can collapse to a picker/drawer or the page
  can stack.

## 5. Proposed slice plan (for the spec)

1. **S1 — transform:** `class` branch in the extractor (the `extractCreatureStats` precedent)
   emitting typed `stats: {kind:"class", keyAbility, hp, perception, savingThrows, defenses,
   attacks, trainedSkills, spellcasting, featLevels{class,ancestry,skill,general,skillIncrease},
   grantedFeatures: [{level, name, targetId}]}` with uuids resolved via `uuidResolve`. Schema v5.
   Fixture regen + determinism ×3. **Fail-soft:** only Foundry-merged docs get stats; `@legacy` +
   AoN-only classes keep the generic page.
2. **S2 — projection:** class-page loader payload — granted-feature docs (embed-prefetch
   precedent), subclass docs per the curated map, the class-list rail data.
3. **S3 — `ClassPage`:** progression table 1–20 (features anchor-linked, cadence rows merged
   in), Core Traits box, level-ordered inline feature stream, subclass pills (URL-persisted
   param, forever-decode conventions), ToC integration, rail layout for `/class` + `/class/{slug}`,
   honoring the golden/h1/popover/hydration contracts.
4. **S4 — sweep + deploy:** goldens regen + review, ssrSmoke, weights, staged deploy (D29-97
   order), SigNoz check.

Adversarial review ×2 before build. **Every pin must come from running the real transform**
(the proxy-pin class has struck in P6/P8/P10 — §3 counts here are corpus-verified but the spec's
expected-diff lists must be regenerated, not derived).

## 6. Known risks / spec attention points

- **The golden:** `class/investigator@legacy` is a *legacy* class → stays generic under the
  fail-soft, so the golden may survive unchanged — verify, don't assume.
- **Subclass features vs subclass docs:** PF2e subclass docs are self-contained prose (unlike
  5e.tools' per-level subclass features) — the interleave model simplifies to "render the
  chosen subclass doc(s) in place at the subclass-choice position"; no per-level splicing.
- **`?superseded=` interplay:** the rail and pills must respect the site-wide superseded
  convention (legacy classes/instincts hidden by default, reveal control).
- **Weight:** inline feature prose + subclass docs will make class pages the heaviest
  entity pages; measure at sweep (P3/P8 weight-acceptance precedent), `content-visibility`
  tools available.
- **Route shape:** R4 makes `/class` a bespoke route (like `/rules`); the `$category/index.tsx`
  generic route needs a class carve-out, and `columnDefs`/listing code paths for class die —
  check for tests pinning them.
- **Oddballs:** `class/draconic-connections` + `class/draconic-sorcerer-bloodlines`
  miscategorized; `draconic-exemplar` category triage; 4 malformed-name action entities from
  P11 ride as separate P12 cleanup candidates if a cleanup slice happens.

## 7. Next

`octo:spec` → `thoughts/astra/specs/0029-codex-p12-class-page-spec.md` on the back of this doc.
Gate H (the consolidated P2–P11 review) remains open and separate.
