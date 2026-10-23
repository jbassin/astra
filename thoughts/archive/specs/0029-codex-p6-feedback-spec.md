# 0029 — codex P6: gate-H feedback round — spec

**Status:** BUILT (2026-07-15, same day as the spec — all 4 parallel tracks + integration landed,
`codex.iridi.cc` + `2e.iridi.cc` LIVE at `ac1a3cc`; gates A–G met, §8 build record carries the
per-gate evidence incl. the implementation-time R4/R8 pin corrections; ▶ open: gate H only) —
was: FINAL (2026-07-15) — **adversarially reviewed ×2 same day** (two independent reviewers,
a data/transform lens + a tracks/UI lens): **5 blockers + 8 minors/nits, all repo-evidence-verified,
all folded in.** The blockers: (1) ritual post-move count 114→**113** + the previously undocumented
**fresh-slug mover** pattern (9 of the 55 movers land on fresh slugs with NO `@legacy` collision —
now a required regression-test case, D29-59); (2) R9 affected-entity count 8→**10**, ids now named
(D29-61a); (3) R9(b)'s `hasValue` blast radius escaped Track C's ownership row (`urlState.ts` range
codec + `activeFilterPills.ts`) — ownership map amended + the `!`-bang URL forever-decode contract
pinned (D29-61d, D29-71); (4) R10's 7-site wiring had NO data path as spec'd (`sources-index.json`
is server-only, `/sources`-consumed) — **mechanism changed** to a client-safe pure module (D29-68);
(5) Track B's all-5-glyph gate was unsatisfiable fixture-only (the fixture corpus has zero
free-action entities) — gate re-based on a synthetic-cost unit test + Track A's fixture-regen
selection list widened (D29-65, §4).
**Scope doc:** `thoughts/shared/research/2026-07-15-codex-0029-p6-feedback-thoughts.md` — 11 items
(R1–R11), each root-caused against the real repo/corpus by four parallel research agents, all
decisions stakeholder-RESOLVED via two same-day `AskUserQuestion` rounds. This spec elaborates,
never reopens, those resolutions — every R-decision below is binding as given; where this spec's
own re-verification against the real repo/corpus **refines or corrects** a scope-doc claim (never a
decision), that correction is called out explicitly with its evidence, per the repo's "verify before
pinning" convention.
**Prerequisite:** this phase **is** the output of gate H at the end of P5 — the 2026-07-15
consolidated P2+P3+P4+P4.5 stakeholder review on live `codex.iridi.cc` (D29-58) came back a
**REDIRECT**, the same shape P4.5 itself was born from. 0029 does not close until this round's own
H re-run signs off.
**Prior specs:** P1 `0029-codex-p1-ingest-spec.md` (D29-1..21) · P2
`0029-codex-p2-entity-pages-spec.md` (D29-22..31) · P3 `0029-codex-p3-browse-search-spec.md`
(D29-32..38) · P4 `0029-codex-p4-rules-browser-spec.md` (D29-39..45) · P4.5
`0029-codex-p45-ux-restyle-spec.md` (D29-46..52, **R11 below amends its D29-48/R3 search carve-out**)
· P5 `0029-codex-p5-deploy-spec.md` (D29-53..58, deploy mechanics carried unchanged into this
phase's own deploy tail).
**Phase context:** P6 of 0029 (the phase count is now open-ended — gate-H feedback rounds repeat
until sign-off, per the P4→P4.5 precedent). Full-stack: ingest/transform, render/CSS, client
filter/search logic, and one edge stanza — the first P6-scale phase to touch every layer of the app
at once.

## 1. Overview

Eleven independently-landable items, three of them genuine bugs (R1/R2/R8-shaped-as-a-gap), the
rest deliberate re-decisions or net-new asks. Structured for **parallel implementation** (a
stakeholder-requested restructure, relayed by the orchestrator mid-draft): **four parallel tracks
— one on the main tree, three in git worktrees — plus one serial integration slice** (D29-71, §4).
The grouping is by file ownership and data dependency, not R-number order: all corpus-regenerating
work concentrates in the ONE track that has the gitignored `data/` tree (a `git worktree add`
materializes tracked files only — worktrees physically have no corpus, no snapshots, no search
index, so they cannot run a transform or a Pagefind build even by accident); render/CSS,
search/filter, and abbreviations are disjoint-enough file sets to run concurrently, with the two
known file overlaps resolved by a pinned merge order.

**This spec's own verification pass corrected three scope-doc claims and refined a fourth design
before any code was written** (the repo's "verify before pinning" convention applied to the spec
itself, not just to the scope doc that fed it):

1. **R8's field-ownership direction was inverted in the scope doc's literal wording, and following
   it as written would have been a regression.** The scope doc says "AoN `item_category`/
   `item_subcategory` … Foundry `system.category` as fallback." Directly inspecting the real AoN
   snapshots (`data/snapshots/aon/2026-07-13/{weapon,armor,shield,equipment}.json`) shows
   `item_category` is a **trivial, zero-information constant** for the weapon/armor/shield AoN
   category files — `item_category: "Weapons"` on **all 614** weapon hits, `"Armor"` on all 75 armor
   hits, `"Shields"` on all 32 shield hits (`item_subcategory` similarly collapses to "Base Weapons"/
   "Base Armor"/"Base Shields" for ordinary items) — while Foundry's `system.category` on those same
   corpus categories already carries real, useful, per-item mechanical tier data (`martial`/`simple`/
   `advanced` on weapons, confirmed live on `weapon/chakri-lost-omens`: `facets.itemCategory:
   "advanced"`, AoN's own value for that exact item is the useless `"Weapons"`/`"Base Weapons"`).
   Making AoN primary would silently clobber that tier data for the ~2,000+ weapon/armor/shield
   entities that already carry it. The rich, genuinely-missing taxonomy (`"Runes"`, `"Consumables"`,
   `"Wands"`, `"Weapon Property Runes"`, …) lives **only** in AoN's own `equipment` category file
   (verified: 36 distinct `item_category` values there, incl. **323 items tagged `"Runes"`**) — i.e.
   exactly the corpus category (`equipment`, not `weapon`/`armor`/`shield`) where Foundry's
   `system.category` is sparsest (1,572/7,295 = 21.6% coverage today, verified) and AoN's taxonomy is
   richest. **Corrected design (D29-60): restore the repo's own already-documented D29-7 doctrine —
   "Foundry wins mechanics, AoN wins prose/citations" — literally: Foundry's `system.category` stays
   primary wherever present; AoN's `item_category`/`item_subcategory` fill the gap only when Foundry
   is silent**, scoped to the `equipment` corpus category (where the AoN taxonomy is non-trivial).
   This still fully fixes the Runes complaint (rune items have **zero** Foundry `system.category`
   today — confirmed, `EquipmentFacetHeader`'s itemCategory slot already renders nothing for them)
   with zero regression risk for weapon/armor/shield.
2. **R4's ritual-superseded count is right (58 total, 56 superseded, 2 never-remastered:
   `rite-of-the-blood-crown`, `wish` — verified exactly via `remasteredAs` field presence across
   every `ritual/*.json`), but the "→ ~2,548" spell-count ripple is off by one and hides a real
   many-to-one edge case.** Exactly **55** (not 56) `spell/*` entities carry `legacyOf` pointing at a
   `ritual/*` id — because two distinct legacy rituals, `ritual/commune` and
   `ritual/commune-with-nature`, both carry `remasteredAs: ["spell/commune"]` (AoN's own real
   many-to-one remaster; `spell/commune.json`'s `legacyOf` correctly lists both). `spell/` therefore
   moves from **2,604 → 2,549** post-move, not "~2,548" — and the move must preserve this
   many-to-one shape (both legacy rituals point at the SAME renamed `ritual/commune`, not a
   collision) rather than "fixing" it as if it were corpus noise. §4 Track A pins the regression test.
3. **R9's ingest default ("missing level → 0") cannot apply uniformly — most of the corpus has no
   level concept at all, and one category is a genuine judgment call the scope doc didn't surface.**
   A full per-category level-coverage sweep (`python3` over every `data/corpus/<cat>/*.json`, all 88
   categories) shows a clean bimodal split: **19 categories at exactly 100%** coverage, **4 more at
   97.7–99.97%** (`equipment` 99.97%, `creature` 99.93%, `curse` 97.83%, `disease` 97.73% — these are
   the genuine "1-2 items missing a key" gaps R9 targets), and **64 categories at flat 0%** (level is
   not a concept there — `deity`, `language`, `rules`, …). One category sits in between:
   **`archetype` at 26.06%** (92/353) — most archetypes carry no level at all; defaulting the other
   261 to `0` would fabricate a false "level 0" for a category where level mostly isn't a real
   attribute, not fix a data gap. **Corrected scope (D29-61): "level-bearing category" = ≥40%
   real-corpus level coverage — reusing the repo's own existing precedent threshold** (`facetKeys.ts`
   already gates `itemCategory`/other facets on "the 40% floor," quoted verbatim in that file's own
   comments) rather than inventing a new one. This yields exactly **23** level-bearing categories
   (the 19-at-100% + the 4 near-100%), cleanly excluding `archetype` and all 64 zero-coverage
   categories. Full list in §2 D29-61(a).
4. **R3's masthead-shape survey (mandated by the scope doc before pinning a strip rule) shows the
   naive "strip everything before the first divider" rule is unsafe — one sampled category group has
   no divider at all, and would lose its entire body.** Six real samples across the categories R3
   names (`spell/heal`, `feat/chromotherapy`, `equipment/adventurers-pack`, `armor/breastplate`,
   `weapon/longsword`, `shield/steel-shield`, `ritual/wish`, `ancestry/human`) show the divider lands
   anywhere from **6 nodes in** (spell) to **11 nodes in** (armor: Source/Price/AC Bonus/Dex Cap/
   Check Penalty/Speed Penalty/Strength/Bulk/Category/Group, ten labeled lines) — and
   **`ancestry/human` has NO divider in its first 13 body nodes at all**; its masthead is just an H1 +
   one `Source` paragraph, straight into prose. A blind "strip to first divider" would delete the
   entire ancestry article. The real, general, structural signal (verified on raw node JSON) is
   **bold-marking**: every masthead label paragraph's first child is a `text` node with
   `marks.bold === true` (`"Source"`, `"Traditions"`, `"AC Bonus"`, …); ordinary body prose never
   starts this way (`ancestry/human`'s first prose paragraph starts `marks.italic === true`, not
   bold). §2 D29-62 pins the exact structural algorithm this funds — it needs no divider and no
   per-category field enumeration.

No other scope-doc claim needed correction; R1/R2/R5/R6/R7/R10/R11's stated facts (line numbers,
counts, mechanisms) were independently re-verified against the real repo/corpus and hold as given —
citations below are this spec's own, not restated from the scope doc.

## 2. Locked decisions

Carried unchanged: **C-1** public-noindexed · **C-6/C-7/C-8** deploy posture · **Decision I** SSR
Compose service · **D29-30** meta-noindex + telemetry · **D29-53..57** deploy mechanics (identical-
path bind mounts, heartwood-minimal image, compose unit, noindex's three layers, refresh-then-
restart) · every P1–P5 rendering/routing convention this phase doesn't name below.

Continuing the ledger from P5's D29-58:

- **D29-59 — R4: ritual re-categorization.** Ritual-derived merged entities (the 55 `spell/*`
  entities carrying `legacyOf: ["ritual/*", ...]`) move to `category: "ritual"`, retaining their
  slug (`spell/atone` → `ritual/atone`). Mechanism: `join.ts`'s existing `CATEGORY_EQUIVALENCE`
  table (`spell → [{category: "ritual"}]`, join.ts:229, D29-15(5)) currently lets a Foundry `spell`
  entity match an AoN `ritual` doc, with the Foundry-derived id (`spell/<slug>`, since Foundry files
  rituals inside its `spells` pack) winning per D29-16's general "Foundry-category-wins" posture.
  This decision adds a **targeted, ritual-specific override** to pass 2 (`buildDrafts`): when the
  matched AoN doc's own category is `"ritual"` (i.e., matched via this ONE equivalence rule, not the
  other four in the table — weapon/armor/shield→equipment, class-feature→subsystem, action→
  relic/tactic/feat all keep Foundry-wins unchanged, D29-16 stands for them), the draft's
  pre-collision id uses the AoN category (`ritual/<slug>`) instead of the Foundry one
  (`spell/<slug>`). **The existing `repointByAonId` link-repoint machinery (join.ts:686-691, built
  for exactly this class of problem — an AoN doc's own pre-join id stops naming a live entity once
  the join lands somewhere else) needs NO new mechanism**: it's driven purely off wherever
  `basePreId` lands, so once the override changes `basePreId` to `ritual/<slug>`, `createLinkResolver`
  automatically repoints inbound crossrefs correctly — verified by reading the mechanism, not
  assumed. **Collision resolution (pass 3, D29-1's existing `@legacy`-suffix machinery) then does
  its job unchanged**: the genuinely-legacy `ritual/atone` (edition: legacy, already on disk) and the
  newly-arrived `ritual/atone` (moved from `spell/atone`, edition: remaster) collide on the same
  slug and resolve to `ritual/atone` (current) + `ritual/atone@legacy` — the exact worked example the
  scope doc itself names, now traced through the real collision-resolution code path rather than
  asserted. **The one many-to-one edge case (§1.2): `ritual/commune` and `ritual/commune-with-nature`
  both remaster into the single `spell/commune`** — post-move this must read
  `ritual/commune-with-nature.remasteredAs === ["ritual/commune"]` (the id-rewrite applies to the
  `remasteredAs`/`legacyOf` arrays too, set at pass 4/finalize from the aonId graph using the
  now-overridden finalId — this should fall out of the existing finalize logic automatically once the
  override lands, but is NOT assumed; §4 Track A pins it as an explicit regression-test case).
  **The SECOND edge pattern (adversarial data-lens blocker, the more common of the two — 9 cases vs
  the commune pair's 1): fresh-slug movers.** Of the 55 movers, **46 collide same-slug** with an
  existing ritual file (→ that sibling renames to `@legacy`, the atone worked example), but **9 are
  renamed-on-remaster movers landing on FRESH slugs with NO `@legacy` collision at all**:
  `binding-circle`, `collective-memories`, `demonic-pact`, `diabolic-pact`, `fortifying-brew`,
  `gathering-call`, `phantasmal-custodians`, `planar-servitor`, `shadow-double` — their legacy
  counterparts keep their OLD names untouched (e.g. `ritual/simulacrum` stays unsuffixed while
  `spell/shadow-double` moves in as `ritual/shadow-double`). 10 existing ritual slugs receive no
  incoming mover; +2 never-remastered. **A required regression-test case covers the fresh-slug
  pattern (`shadow-double`/`simulacrum`) alongside the commune many-to-one case** — an
  implementation that assumes every mover collides (or that every unsuffixed legacy ritual gains a
  sibling) fails on 9 of 55. Ripple:
  `spell/` 2,604 → **2,549** (verified count, corrects the scope doc's "~2,548"); `ritual/` 58 →
  **113** (adversarially corrected from this spec's first-draft "114" — the count is 58 unchanged
  existing files + 55 movers; the earlier "56 restored ⇒ 56 legacy twins" model was wrong on both
  sides, per the collision/fresh-slug breakdown above). Nav/listing counts, Pagefind rebuild, and
  the default-hidden-superseded
  browse view (which will now show ~58 current rituals, not 2) all fall out of this move with no
  separate code change (they're computed from `category`/`remasteredAs` at read time, not stored
  redundantly).
  **IMPLEMENTATION-TIME CORRECTION (P6 Track A, 2026-07-15, against the real committed
  2026-07-13/pf2e-8.3.0 snapshots — the ABOVE "55 movers / spell 2,549 / ritual 113" figures are
  WRONG and superseded by this note; kept verbatim above only as the historical record of how the
  spec arrived at them).** Building the mechanism exactly as described two paragraphs up (override
  fires whenever `matchFoundryEntity` resolves a Foundry `spell` entity to an AoN doc whose own
  category is `"ritual"`, full stop) and running it against the real snapshots moves **143** spell
  entities, not 55 — a **wrong-population bug in the spec's own verification, not an implementation
  bug**: the adversarial review counted "spell/\* entities carrying `legacyOf` pointing at a
  ritual/\* id" (a grep over the ALREADY-EMITTED pre-P6 corpus), which only sees movers that ALSO
  carry an AoN legacy/remaster pairing. The mechanism's real trigger — "matched an AoN ritual doc at
  all" — is a strictly larger population. Root cause, verified independently against the raw
  snapshot (not just this module's own output): Foundry's own `pf2e-8.3.0` system snapshot already
  segregates rituals into their own subfolder, `packs/pf2e/spells/rituals/` (150 files, sibling to
  `spells/spells/` and `spells/focus/`) — a structural signal `categoryMap.ts` currently discards,
  flattening every file in the `spells` pack to the one category `"spell"`. Of those 150: **143**
  slug-match an AoN `ritual`-category doc (via the pre-existing, unmodified-by-P6
  `CATEGORY_EQUIVALENCE` rule) and move; the remaining **6** (`create-mycoguardian`,
  `rite-of-cleansing-flame`, `unfettered-mark`, `aspirational-state`, `destroy-mindscape`,
  `anima-invocation-modified`) match NOTHING at all (no AoN ritual doc, no AoN spell doc) and are
  already dropped by the pre-existing D29-14 AoN-primary-drop pass, both before and after this
  phase — verified absent from the corpus under every category; **left as-is, documented residue,
  out of scope for R4** (per the stakeholder's own P6 direction: extending the trigger to a
  Foundry-subfolder signal was considered and explicitly declined — these 6 are ambiguous
  Foundry-only content with no AoN counterpart to source prose/citation from, not a miscategorization
  R4 is meant to fix). Of the 143 real movers: **56** carry a `legacyOf` (not 55 — one of the 56,
  `ritual/rune-trap`, has `legacyOf: ["spell/glyph-of-warding"]`, a ritual whose LEGACY counterpart
  is itself a spell that never moves; the original grep, which searched specifically for "a
  `ritual/*` id" as the `legacyOf` TARGET, structurally cannot see a mover→spell-target pairing like
  this one — it's a real, correct, category-agnostic pass-4 resolution, not a new bug) and **87**
  carry none at all (single-edition rituals with no legacy/remaster counterpart in the snapshot,
  e.g. `ritual/unbearable-cacophony`, `ritual/divine-keystone`, `ritual/wild-allegiance` — real
  Foundry `rituals/`-subfolder content, real AoN ritual docs, just never paired). Collision/
  fresh-slug breakdown, re-run against the real 143-population (the spec's original 46/9 split was
  computed on the wrong 55-population and does not apply): **45** movers collide same-slug with an
  existing ritual file (→ that sibling renames to `@legacy`); **98** land on fresh slugs with no
  collision at all. The pre-existing 58 `ritual/*.json` files' own fates: 45 renamed to `@legacy`
  (the collision losers) + 11 stay unsuffixed while gaining a `remasteredAs` pointing at a mover
  (the `simulacrum`/`commune-with-nature` shape) + 2 never-remastered (`rite-of-the-blood-crown`,
  `wish`, unchanged) = 58, exactly — every pre-existing ritual's fate is now accounted for (the old
  55-population's "10 no-incoming-mover" bucket is empty at the real 143-population). **Corrected
  ripple: `spell/` 2,604 → 2,461; `ritual/` 58 → 201** (143 movers + 58 pre-existing, some renamed).
  **A third named regression-test case is added, alongside the commune many-to-one and
  shadow-double/simulacrum fresh-slug cases: `ritual/unbearable-cacophony`, a pairing-less mover
  (no `legacyOf`/`remasteredAs` at all) — an implementation that only handles paired movers fails on
  87 of 143.** §4 Track A's gate and §5A's gate A below are updated to these corrected numbers; the
  R8 gate below is also corrected (323 → 273, verified not just asserted — see its own note).
- **D29-60 — R8: AoN item_category/item_subcategory threading, Foundry-wins (corrected from the
  scope doc's literal AoN-primary wording, §1.1).** New optional schema field
  `facets.itemSubcategory: z.string().optional()` alongside the existing `facets.itemCategory`.
  Ingest (`foundryEntities.ts` or a join-time enrichment step, whichever already owns "equipment
  family" facet extraction) sets `facets.itemCategory`/`facets.itemSubcategory` from the matched AoN
  doc's `item_category`/`item_subcategory` **only when Foundry's own `system.category` produced no
  value AND the entity's corpus category is `"equipment"`** (weapon/armor/shield are excluded —
  their AoN `item_category` is a trivial category-name constant with zero discriminating value,
  verified §1.1; their existing Foundry-derived tier facets are untouched). Existing
  `EquipmentFacetHeader`'s itemCategory slot (`facetHeader.tsx:154-156`) and the `plainEnumDef`
  facet filter (`facetDefs.ts:199`) render/filter the new values for free — no UI change needed for
  the "Runes" complaint itself (a new `itemSubcategory` UI slot is optional polish, not required for
  the fix; if added, mirrors the itemCategory `Part` pattern verbatim). Ripple: **323** equipment
  entities gain `itemCategory: "Runes"` (verified count from the real AoN `equipment.json` snapshot);
  the remaining equipment-category entities lacking a Foundry value gain whichever of the 36 real
  AoN `item_category` values apply (`Consumables`, `Wands`, `Staves`, `Spellhearts`, … — incl. the
  legitimate "Weapons"/"Armor"/"Shields" values AoN's `equipment.json` puts on
  ammunition/accessories, 481/250/232 — expected on the `/equipment` Category facet, flagged for H,
  not a bug).
  **IMPLEMENTATION-TIME CORRECTION (P6 Track A, 2026-07-15):** the **323** figure is the RAW AoN
  `equipment.json` doc count tagged `item_category: "Runes"` — the FINAL EMITTED corpus (after the
  pre-existing D29-18 `aonDedup` pass, which collapses same-`(category,slug,url,edition)` duplicate
  raw docs — real-world Rune items are heavily reprinted/duplicated in the raw ES index, e.g. 4 raw
  docs for "Advancing" collapsing to 2 kept editions) carries **273** `equipment/*` entities with
  `itemCategory: "Runes"`, not 323. Verified clean (not asserted): 5 sampled raw doc groups
  (`advancing`/`advancing-greater`/`aim-aiding`/`anchoring`/`antimagic`, 14 raw docs across them)
  every one traces to a `aonDedup`-collapsed same-url/edition pair already correctly present in the
  corpus with `itemCategory: "Runes"` set — zero instances of a doc that should have been filled and
  wasn't. The fill-gap mechanism itself has zero regressions (weapon/armor/shield untouched,
  `weapon/chakri-lost-omens` keeps `itemCategory: "advanced"`). §5A gate A is updated to 273.
- **D29-61 — R9: level defaults, bounds-imply-hasValue, checkbox removal.** Three parts, landing in
  two DIFFERENT tracks (ingest default in Track A; engine semantics + UI removal in Track C, per
  §4's ownership map — this is the ONE R-item whose implementation spans two tracks, called out
  explicitly so it isn't missed; the A-before-C merge order covers the dependency, §6):
  (a) **Ingest (Track A):** missing `level` on an entity whose `category` is one of the **23
  level-bearing categories** (≥40% real-corpus coverage, the repo's own existing precedent floor,
  §1.3) — `animal-companion`, `armor`, `campsite-meal`, `class-feature`, `epithet`, `feat`, `hazard`,
  `item-bonus`, `kingdom-event`, `kingdom-structure`, `ritual`, `shield`, `siege-weapon`, `spell`,
  `vehicle`, `warfare-army`, `warfare-tactic`, `weapon`, `weather-hazard` (19 at exactly 100% today,
  so this default never actually fires for them outside future snapshot drift — kept in the list for
  forward-safety) plus `equipment`, `creature`, `curse`, `disease` (the 4 genuinely-affected
  categories) — defaults to `0` at ingest (`emit.ts` or wherever `level` is finalized). `archetype`
  (26.06%) and every 0%-coverage category are explicitly EXCLUDED — no default applied, `level`
  stays `undefined` for them, matching today's behavior exactly. Affects exactly **10** real
  entities at this snapshot (adversarially corrected from this spec's first-draft "8" — the
  first draft's own category sum, 2+5+2+1, already said 10; the reviewers resolved the ids):
  `equipment/adventurers-pack`, `equipment/cartographers-kit` · `creature/flappy`,
  `creature/daji-level-5`, `creature/daji-level-3`, `creature/twinsprout`, `creature/daji-level-1` ·
  `curse/grave-curse`, `curse/grave-curse@legacy` · `disease/addiction`.
  (b) **`filterEngine.ts`'s `matchesRange` (Track C):** currently `if (n === null || n === undefined)
  return !filter.hasValue` (filterEngine.ts:127-130) — a MISSING row passes unless the separate
  `hasValue` checkbox is explicitly checked. New rule: a missing row is excluded whenever the filter
  carries ANY typed bound (`filter.min !== undefined || filter.max !== undefined`), matching the
  intuitive "I typed a number, so I only want rows with a number" reading; `hasValue` as a
  SEPARATE explicit field is removed from `RangeFilter` entirely (not just hidden) since bound
  presence now IS the has-value signal.
  (c) **`FacetPanel.tsx`'s `RangeInputs` (Track C):** the "Must have a value" checkbox
  (FacetPanel.tsx:128-134) is deleted; its `missing > 0` counter text is folded into the min/max
  `Input` placeholders' existing pattern (no separate UI element needed — the missing-count context
  was informational, not actionable, once the checkbox itself is gone).
  (d) **The `hasValue` URL-codec contract (adversarial tracks-lens blocker — the removal's blast
  radius reaches `urlState.ts:163,171`, the range codec's `!` bang suffix, and
  `activeFilterPills.ts:43`, neither of which the first-draft ownership map assigned to Track C):**
  the range-param decoder **TOLERATES and IGNORES a trailing `!`** (never errors — it's now
  redundant, since any typed bound implies has-value under (b)); the encoder **NEVER emits it**.
  This is the repo's established forever-decode posture (the `?legacy=` alias precedent, P4.5
  D29-48) applied to the same class of problem: old shared links keep working, the canonical form
  migrates on the next in-app navigation. `urlState.test.ts` expectations update accordingly
  (decode-tolerant asserts added, emit asserts drop the bang). Ownership resolution is recorded in
  D29-71: `urlState.ts`+`urlState.test.ts` move INTO Track C's row (the browse URL codec is
  semantically C's filter-semantics work), and `activeFilterPills.ts` joins the SHARED C-first
  rebase set (C makes the one-line `hasValue` removal there; D rebases its abbreviation edits on
  top).
- **D29-62 — R3: structural masthead strip + facet-header enrichment (one change, ingest+render
  together, BOTH halves in Track A — one contract, one track; splitting the strip from its
  enrichment across owners would leave an interim state where content is stripped but not yet
  re-surfaced, §4).** Ingest-time
  strip (not render-skip — chosen because `apps/codex/scripts/build-search.ts:89`'s
  `collectText(entity.body)` walks
  the raw body tree directly for Pagefind excerpts, verified by reading the file; a render-skip
  would leave masthead text leaking into every search excerpt, reproducing the exact duplication bug
  one layer down). Algorithm (general across every category group, needs no per-category field
  enumeration and no divider dependency, §1.4):
  1. If `body[0]` is a `heading` at `level: 1` (the AoN masthead's title — verified present in every
     sample), drop it (it duplicates `entity.name`, already in the structured header).
  2. Walk forward from the new `body[0]`: while the current node is a `paragraph` whose first child
     is a `text` node with `marks.bold === true`, collect it as a `(label, valueInlineNodes)` pair
     (label = that bold `text.content`, trimmed; value = the remaining children) and advance. Stop at
     the first node that doesn't match this shape — a `divider`, a plain prose `paragraph`, a
     `heading`, a `list`, anything.
  3. If the node immediately after the collected run is a `divider`, drop it too (the masthead's own
     closing rule — redundant with the structured header's own hairline rule, D29-50). If no divider
     follows (the `ancestry/human` case), stop cleanly; nothing extra is consumed.
  4. Every collected pair whose label is **not** `"Source"` (already rendered via `Citation`,
     D29-24) becomes one entry in a new top-level `CodexEntity` field,
     **`mastheadExtra?: Array<{label: string; value: InlineNode[]}>`** (top-level, NOT under
     `facets` — `FacetsSchema`'s `FacetValue` union is `JsonScalar | JsonScalar[]`, which cannot hold
     rich inline content like the `[Arcana]`/`[Nature]` crossrefs `ritual/wish`'s `Primary Check`
     line carries; a top-level field sidesteps that type mismatch entirely rather than working around
     it). Ordered, preserving masthead order; absent (not `[]`) when the run collects zero
     non-Source pairs (e.g. every `feat` sample checked: `Source` + `Prerequisites`, and
     `Prerequisites` is already a typed facet — `mastheadExtra` is absent for ordinary feats).
  Render (Track A): each of the five category-group facet-header components
  (`SpellFacetHeader`/`EquipmentFacetHeader`/`FeatFacetHeader`/`GenericFacetLine`, plus a
  fifth call site for `creature`/`hazard` groups if `mastheadExtra` is ever non-empty there — not
  expected per R3's own scope, "spell/feat/equipment/generic-group pages," but the render function
  is written total, not category-gated, so nothing silently drops if it happens) appends
  `mastheadExtra`'s pairs as additional `Part`s after its own typed ones, reusing the existing
  `Part`/`PartsRow` components verbatim (same "bold label, plain value" grammar every other facet
  line already uses) — rendering `value` via the SAME `renderNodes`-family inline renderer the body
  already uses (so crossrefs like `ritual/wish`'s `[Arcana]`/`[Nature]` render as real links, not
  flattened text). No information loss for ANY sampled category (spell's `Target`/`Bloodline`,
  armor's `AC Bonus`/`Dex Cap`/`Check Penalty`/`Speed Penalty`/`Strength`/`Group`, weapon's
  `Favored Weapon`/`Damage`/`Type`/`Group`, shield's `Hardness`/`HP (BT)`, ritual's `Cost`/
  `Secondary Casters`/`Primary Check`/`Secondary Checks`/`Target(s)` — all fall out of the SAME
  generic mechanism with zero per-field code).
  **IMPLEMENTATION-TIME DEVIATION (P6 Track A, `b070592`):** D29-62's literal wording ("appends
  `mastheadExtra`'s pairs as additional `Part`s") appends unconditionally; built exactly that way
  first and verified live against 3 real entities, it produces a visible duplicate label wherever a
  masthead pair's label already names an already-typed `Facets` field the same header renders
  directly — `spell/heal` showed "Traditions" and "Range" twice, `armor/breastplate` showed "Price"
  and "Bulk" twice, `feat/camouflage-coat` showed "Prerequisites" twice. Fix (shipped, not deferred):
  each of the 4 typed headers now tracks the normalized labels its own typed parts already used and
  filters `mastheadExtra` against that set before appending — deduplicated by label TEXT (case/
  whitespace/trailing-colon-insensitive), not by field name, so it needs no per-category mapping and
  generalizes uniformly; fields with no typed-facet counterpart (Bloodline/Target/AC Bonus/Category/
  Group/Cost/Primary Check/...) are unaffected and still render as new information. Tested: all 4
  observed collision cases plus the non-colliding fields, both directions.
- **D29-63 — R1: table CSS.** Port gothic's table rule set (`libs/ts/gothic/src/theme.css:208-219`
  — `.gothic-content table` border-collapse/margin/font-size, `:is(th,td)` border+padding, `th`
  header styling, `tbody tr:nth-child(even)` zebra) into `.codex-content table`/`.codex-content
  :is(th,td)`/`.codex-content th`/`.codex-content tbody tr:nth-child(even)` in
  `apps/codex/src/styles/globals.css` (~line 630, alongside the existing `.codex-content p`/`ul`/`ol`
  rules), re-tokenized onto codex's own parchment custom properties (`--color-rule` for borders,
  `--color-heading-maroon`/`--font-heading` for the header row treatment matching `.codex-heading`'s
  own small-caps grammar, a parchment-appropriate zebra tint off `--color-callout-tan` or equivalent
  at low opacity — mirroring `/sources`'s own P4.5 zebra-table precedent, D29-50, rather than
  inventing a new tint). CSS-only, no renderer change (`nodes.tsx`'s classless `<table>` emission,
  nodes.tsx:384-402, is unchanged).
- **D29-64 — R2: white-space pre-line.** `white-space: pre-line` on `.codex-content p` (globals.css,
  same rule block as D29-63). Verified the underlying node shape is exactly as the scope doc
  describes: `aonMarkup.ts`'s `<br/>` handling (aonMarkup.ts:69-71, comment "does NOT open a markdown
  line") emits a literal `"\n"` inside a single `text` node within one `paragraph` — no renderer
  change needed, the CSS rule alone honors the existing `\n` while still collapsing incidental
  whitespace runs (the standard `pre-line` semantics). If a real-corpus spot check at the
  integration gate surfaces a genuine side effect (the spec's own named fallback), the renderer-split alternative
  (split on `\n` in `nodes.tsx`'s `case "text"`, emit real `<br/>`) is the documented fallback,
  touching the total renderer switch + one golden regen — not expected to be needed.
- **D29-65 — R5: exact-trace action glyphs.** Legal posture: stakeholder-cleared on the record
  ("I've checked with our lawyers and we have permission," scope doc R5) — not re-litigated here.
  Asset sourcing: the Foundry `pf2e` system's own action-icon font is the named carrier (our
  Foundry snapshot, `data/snapshots/foundry/pf2e-8.3.0/`, is packs+lang only — verified, no
  `styles`/`fonts`/`icons` tree present) — this is a **targeted, recorded-provenance fetch**, not
  part of the existing `fetch:foundry`/`fetch:aon` snapshot scripts (those pull the game-data ES
  index and the Foundry pack/lang files respectively; the icon font lives in the system's static
  asset bundle, a different fetch entirely). Provenance record (committed alongside the new asset,
  e.g. a short `ACTIONS-GLYPH-SOURCE.md` or a code comment on the new path constants): exact source
  URL/version/commit of the pf2e system release fetched, fetch date, and the specific glyph
  identifiers pulled (one-action/two-action/three-action/reaction/free — the 5 `ActionCost` values
  `apps/codex/src/ui/actionGlyph.tsx`'s type already names). Conversion: font glyph outlines → SVG
  `<path d="...">` data (a one-time offline conversion step, e.g. via a font-to-SVG tool — not a
  runtime dependency; the app keeps rendering plain inline SVG, D29-46's "SVG-not-font" mechanism is
  UNCHANGED, only the path data changes). Implementation: replace the **3** `<path>`-producing sites
  in `apps/codex/src/ui/actionGlyph.tsx` (verified via `grep -c "<path"` — the reaction hook, the
  free-action diamond outline, and the single reused `Pip` chevron drawn 1–3 times for the
  one/two/three-action counts; corrects the scope doc's "four `<path>` sets" — there are three
  distinct path-producing code sites, one of which repeats) with the real traced outlines, keeping
  every existing prop signature (`ActionGlyph({cost})`, `role="img"`/`aria-label`/`<title>`)
  byte-identical so no downstream call site (`statblock.tsx`, `facetHeader.tsx`'s
  `CodexActionGlyph`, `nodes.tsx`'s inline `actionGlyph` case, `text.ts`'s plain-text fallback)
  changes at all — a pure asset swap.
- **D29-66 — R6: footer deletion.** Delete `apps/codex/src/routes/__root.tsx`'s `<footer
  className="site-foot">` block (`__root.tsx:72-74`) outright — no replacement, the zero-global-
  disclaimer risk is stakeholder-accepted (scope doc R6). Verified `ssrSmoke.test.ts` carries no
  footer-text assertion today (grepped, zero hits) — no test update needed for the deletion itself.
  `EntityPage` goldens (`goldens.test.tsx`) render the bare `<EntityPage>` component via
  `renderToStaticMarkup`, never `__root.tsx`'s layout — confirmed the footer deletion cannot touch
  any golden. **Also deletes the orphaned `.site-foot` CSS** (`globals.css:315` + its references at
  `:205`/`:521`) — same track (B owns both `__root.tsx` and `globals.css`), no dangling dead rules.
- **D29-67 — R11: search hides superseded by default (amends P4.5's D29-48/R3 carve-out).** Re-add
  `superseded?: boolean` to `SearchPageSearch`/`SearchFilterState`
  (`apps/codex/src/domain/search/searchUrlState.ts:33-40,81-87` — both types currently have neither
  field, confirmed by reading the file; P4.5 S3 deleted it as "dead code" under the old
  always-both design). Default `false` (hide superseded) when absent, matching every other
  hide-by-default surface's convention (browse/rules/sidebars, D29-48). Wire the ALREADY-EXISTING,
  tested-but-unused `supersededFilter()` helper (`pagefindClient.ts:88-99`, confirmed unchanged
  since P4.5 — the file's own comment already documents it's called by neither surface "anymore")
  into both `Omnibar.tsx` and `SearchPage.tsx`'s Pagefind query calls. Add a visible reveal control
  on `/search` (a checkbox or toggle in the filter area, mirroring `/rules`'s own D29-48 inline-link
  idiom in spirit — "Include superseded content," same explicit-copy posture D29-48 already
  established, not a bare "Show legacy" checkbox). Honor `?superseded=` on `/search` (decode via the
  same `toBool` helper every other route already uses). The `edition` enum filter (an ordinary
  content facet, unrelated to the hide-by-default mechanism) is UNCHANGED. Every result row keeps
  its edition pill (unaffected — badging was never the P4.5 carve-out's target, only the default
  visibility was). **Never-remastered legacy content is unaffected** (its `superseded` computed
  field is `false` — `(entity.remasteredAs?.length ?? 0) > 0` — so it was never hidden and stays
  visible under the new default too, exactly like every other surface).
- **D29-68 — R10: source-name abbreviations, delivered as a client-safe pure module (MECHANISM
  CHANGED at adversarial review — the first draft's `sources-index.json` schema-field design had NO
  data path to 6 of its 7 display sites: the index is server-only, loaded at
  `corpusFs.ts:202-215` and consumed exclusively by `/sources`; threading `abbreviation` to the
  listing/pills/rules/search surfaces would have required edits to
  `src/server/{corpusFns,listingData,rulesTreeData}.ts` + `scripts/build-search.ts` — files no
  track owns).** The abbreviation is a pure function of the book-name string, so it ships as a
  **new client-safe pure module `src/domain/sources/abbreviations.ts`** exporting
  `abbreviateBook(book: string): string | undefined` — imported DIRECTLY by the display components
  at all 7 sites, zero server/scripts/index plumbing. **`sourcesIndexBuild.ts` and
  `sourcesIndex.ts` are UNTOUCHED** (no schema field, no build-step change). Inside the module,
  the curation content is unchanged from the original design: **two-tier** — (1) a hand-curated map
  for the **243** AoN-known (`productLine`-carrying) books, keyed on the exact normalized `book`
  string, community-convention codes (CRB/APG/SoM/G&G/…, curated by an engineer at implementation
  time, every entry hand-reviewable in the one committed module — a flat `Record<string,string>`,
  not generated, not inferred); (2) a **stopword-aware title-initialism generator** for the **253**
  "Other"-bucket books (verified: **145** are `Pathfinder Society Scenario #N-NN: <title>` —
  corrects the scope doc's "146" by one, re-counted directly off the real `sources-index.json`'s
  496 rows — the remaining 108 are numbered APs/Bounties/one-offs), in the stakeholder's named
  `PS:ATG`-style: product-line-prefix + colon + a stopword-filtered initialism of the title tokens
  after the `#N-NN:` numbering, with a **map-based override slot** for collisions/ugly generated
  results (same module, both tiers one artifact) — every generated entry hand-reviewed once, not
  shipped blind. `abbreviateBook` returns `undefined` for a book neither tier covers (display
  falls back to the full name, never a blank). **Collision test:** runs over a **committed fixture
  of the real 496 book names** (the book NAMES are not gitignored — only the built index is; the
  fixture is a small test asset) asserting no two books map to the same abbreviation;
  **Integration re-verifies the fixture still matches the freshly regenerated
  `sources-index.json`'s book list and fails loudly on drift** (so the fixture can't silently rot
  against future refreshes). **Accepted cost:** the module ships in the client bundle (~tens of
  KB for 496 entries + the generator) — recorded as an accepted trade for zero plumbing.
  **Compact-surface split (pinned exactly, per the scope doc's own instruction):** the **7
  distinct rendering components** confirmed via grep to read `source.book` for display
  (`BrowseListing.tsx` row + collision disambiguator, `FacetPanel.tsx`'s Source `CoreEnumSection`,
  `activeFilterPills.ts`'s Source pill, `RulesTree.tsx`/`RulesLayout.tsx`'s book section
  headers/breadcrumb, `Omnibar.tsx`/`SearchPage.tsx` result rows — `SearchPage.tsx`'s inline
  `· {item.book}` line included) call `abbreviateBook` and use its value when present, full name
  when `undefined`. **`citation.tsx` (the entity-page citation line) and `SourcesIndexView.tsx`'s
  book headings keep the FULL name** (scope doc's own pin) — `citation.tsx` is part of
  `EntityPage`, so this also means **R10 touches zero entity-page goldens** (verified: none of the
  6 flagship golden entities' Citation lines change). `SourcesIndexView` may ADDITIONALLY show the
  abbreviation as a small secondary label next to the full heading (implementer's call, not
  required) — the full name stays primary either way.
- **D29-69 — R7: `2e.iridi.cc` alias stanza.** Mirror `heart.iridi.cc`'s existing pattern
  (`sites.caddyfile:73-76`) exactly: `2e.iridi.cc { import astra_site; header X-Robots-Tag noindex;
  reverse_proxy localhost:10374 }` (the noindex header matches the existing `codex.iridi.cc` stanza's
  own D29-56 header verbatim — both hostnames serve the identical noindexed posture). **The
  `heart.iridi.cc` stanza's own comment ("Needs a heart.iridi.cc DNS record — manual") is STALE**
  — verified against P5's own live-proven finding (D29-53's context) and the ledger-0018 memory
  precedent: `*.iridi.cc` is a wildcard, no DNS record is needed, and the cert mints on first hit
  (~20–60s flap, the P5 S2 precedent). No config.kdl change — `codex.public-origin` (config.kdl:311,
  `"https://codex.iridi.cc"`) is confirmed (re-verified, zero `apps/codex/src` references) consumed
  nowhere in the app (no sitemap, no canonical tag), so leaving it pointed at `codex.iridi.cc` alone
  while `2e.iridi.cc` serves the identical content is safe by construction, not by omission.
- **D29-70 — Exit gate = technical gate A–H, per-R verification folded into the relevant letter (see
  §5), H = the consolidated stakeholder review re-run on the live site covering every P2–P5 carried
  item PLUS all 11 P6 items.**
- **D29-71 — Parallel-track implementation structure (stakeholder-requested restructure,
  orchestrator-relayed mid-draft).** Four parallel tracks + one serial integration slice, replacing
  the serial six-slice shape this spec was first drafted with. The binding rules:
  - **One engineer per track; a track touches ONLY the files in its §4 ownership row.** Any need to
    edit outside the row is surfaced to the orchestrator, never done quietly — the ownership map is
    what makes the parallelism safe, so violating it silently defeats the structure.
  - **Only Track A (main tree) and Integration (main tree) may run a corpus regen
    (`pnpm --filter @astra/codex transform`) or `just codex-search-index`.** Reason, stated as a
    physical constraint not a convention: `apps/codex/data/` (corpus 688 MB + snapshots 601 MB +
    search index 203 MB) is **gitignored** — a git worktree materializes only tracked files, so
    Tracks B/C/D have no `data/` at all. Their entire dev loop is fixture-driven (the committed
    `fixtures/entities/` corpus + `fixtures/raw/`), which is exactly the repo's standing D29-12
    hermeticity contract — the full codex suite already passes without `data/` present (the P4.5 S6
    proof: 73 files / 1,435 tests green on the fixture fallback), so a worktree track being CI-green
    is the SAME bar as the hermeticity gate, not a weaker one.
  - **Golden ownership: `goldens/*.html` belongs to Integration.** Two tracks knowingly drift them
    (Track A: the masthead strip changes all 6; Track B: the glyph swap changes the 3 SVG-bearing
    ones — `spell-heal.html`/`class-investigator.html`/`creature-dragon.html`, and those 3 overlap
    Track A's set, so NO track "wholly owns" any golden). A track MAY regenerate goldens locally to
    keep its own tree CI-green (`scripts/regen-goldens.ts` runs off the committed fixture corpus,
    available in every worktree) and MUST flag every golden it touched in its final commit message;
    Integration resolves any golden merge conflict by **re-running the regen script at merged HEAD
    and hand-reviewing the diff once** — never by hand-merging golden HTML.
  - **Pinned merge order: A → B → C → D, then Integration.** A first (C's R9(b) semantics depend on
    A's R9(a) ingest default, §6; A's fixture regen is the base every other track's tests should
    ultimately run against). C before D because they overlap on FOUR files (`FacetPanel.tsx`,
    `Omnibar.tsx`, `SearchPage.tsx`, `activeFilterPills.ts` — C changes their filter/search logic
    incl. the one-line `hasValue` removal in the pills helper, D adds abbreviation display to the
    same components); **D rebases onto the merged A+B+C result before its own merge** and resolves
    those four files' conflicts as the rebase's explicit charter. B is
    order-insensitive (zero file overlap with anyone) and slots second only for merge-log
    readability.
  - **Each track lands its own conventional commits, CI-green (fixture-only for B/C/D), BEFORE
    integration begins.** Integration is a serial, single-owner slice on the main tree — nothing
    merges during it.

## 3. Deliverables (by component)

| Component | Change |
|---|---|
| `apps/codex/src/ingest/join.ts` | R4 ritual-category override (pass 2) + regression tests for BOTH edge patterns (commune many-to-one; shadow-double/simulacrum fresh-slug) |
| `apps/codex/src/schema/entity.ts` | + `facets.itemSubcategory` (R8), + top-level `mastheadExtra` (R3) |
| `apps/codex/src/ingest/foundryEntities.ts` (or the join-time equipment-facet step, whichever owns it) | R8 AoN item_category/subcategory fill-gap threading |
| `apps/codex/src/ingest/emit.ts` (or wherever `level` is finalized) | R9(a) level→0 default for the 23 level-bearing categories |
| `apps/codex/src/ingest/aonMarkup.ts` (or a new post-parse pass in `join.ts`/`emit.ts`) | R3 structural masthead strip + `mastheadExtra` extraction |
| `apps/codex/src/domain/render/facetHeader.tsx` | R3 `mastheadExtra` rendering in all 4 header components |
| `apps/codex/src/styles/globals.css` | R1 table CSS, R2 `white-space: pre-line` |
| `apps/codex/src/ui/actionGlyph.tsx` | R5 real glyph SVG paths (asset swap, 3 sites) |
| `apps/codex/src/routes/__root.tsx` | R6 footer deletion (+ the orphaned `.site-foot` CSS in `globals.css`) |
| `apps/codex/src/domain/search/searchUrlState.ts` | R11 `superseded` field re-added |
| `apps/codex/src/domain/search/Omnibar.tsx`, `SearchPage.tsx` | R11 `supersededFilter()` wired in + reveal control |
| `apps/codex/src/domain/browse/filterEngine.ts` | R9(b) bounds-imply-hasValue, `hasValue` field removed |
| `apps/codex/src/domain/browse/FacetPanel.tsx` | R9(c) checkbox removed |
| `apps/codex/src/schema/sourcesIndex.ts`, `src/ingest/sourcesIndexBuild.ts` | **UNTOUCHED** (D29-68 mechanism change — no schema field, no build-step change) |
| `apps/codex/src/domain/sources/abbreviations.ts` (new, client-safe) | R10 `abbreviateBook()` — curated 243-map + PS:ATG generator + overrides + the committed 496-book-name test fixture |
| `apps/codex/src/domain/browse/urlState.ts` (+ test) | R9(d) `!`-bang decode-tolerant/never-emit codec contract |
| `apps/codex/src/domain/browse/BrowseListing.tsx`, `FacetPanel.tsx`, `activeFilterPills.ts`, `domain/rules/{RulesTree,RulesLayout}.tsx`, `domain/search/{Omnibar,SearchPage}.tsx` | R10 abbreviation display wiring (7 sites, direct `abbreviateBook` imports) |
| `apps/codex/fixtures/**` | corpus-shaped fixture regen (Track A: R4/R8/R9 + R3, one regen) |
| `apps/codex/goldens/*.html` | ONE authoritative regen at Integration (merged HEAD); track-local regens allowed-but-flagged (D29-71) |
| `sites.caddyfile` | + `2e.iridi.cc` stanza (R7) |
| `apps/codex/README.md` | P6 section: the 11 items, the 4 corrected-scope-doc findings (§1), the level-bearing-category list, the abbreviation curation file pointer |

## 4. Tracks (4 parallel + 1 serial integration; each track CI-green, committed, conventional — D29-71)

**File-ownership map (binding — one engineer per track, no edits outside the row; the four known
overlaps are D-rebases-onto-C's-result by construction, D29-71; amended at adversarial review —
`urlState.ts` into C, `activeFilterPills.ts` into the shared set, D's row rebuilt around the
D29-68 mechanism change):**

| Track | Tree | Files owned (exclusive unless noted) |
|---|---|---|
| **A** | **main tree** (the only tree with the gitignored `data/{corpus,snapshots,search}`) | `src/ingest/**` · `src/schema/**` (both wholly A's after the D29-68 mechanism change — `sourcesIndex.ts`/`sourcesIndexBuild.ts` are untouched by anyone this phase) · `src/domain/render/facetHeader.tsx` · `src/domain/render/entityPage.tsx` · `fixtures/**` · `data/**` (untracked; main-tree-only by construction) |
| **B** | worktree (fixture-only) | `src/styles/globals.css` · `src/ui/actionGlyph.tsx` + the new glyph-asset provenance record (D29-65) · `src/routes/__root.tsx` |
| **C** | worktree (fixture-only) | `src/domain/search/**` (searchUrlState/pagefindClient wiring, Omnibar/SearchPage filter logic) · `src/domain/browse/filterEngine.ts` · `src/domain/browse/FacetPanel.tsx` · `src/domain/browse/urlState.ts` + `urlState.test.ts` (the range codec's `!` bang, D29-61d — moved into C at adversarial review; the browse URL codec is semantically C's filter-semantics work) · the one-line `hasValue` removal in `activeFilterPills.ts` (SHARED, see D's row) |
| **D** | worktree (fixture-only) | NEW `src/domain/sources/abbreviations.ts` + its test + the committed 496-book-name fixture (D29-68's reviewed mechanism — `sourcesIndex.ts`/`sourcesIndexBuild.ts` are now UNTOUCHED and owned by no track) · `src/domain/browse/BrowseListing.tsx` · `src/domain/rules/{RulesTree,RulesLayout}.tsx` · **SHARED (rebase-resolved, C-first)**: the R10 display lines in `Omnibar.tsx`/`SearchPage.tsx`/`FacetPanel.tsx`/`activeFilterPills.ts` |
| **INT** | main tree, serial | `goldens/*.html` (authoritative) · `sites.caddyfile` · `apps/codex/README.md` · the merges themselves |

**Corpus/search-index restriction (D29-71, restated where implementers will read it):** only Track
A and Integration run `transform` or `just codex-search-index` — worktrees have **no `data/`**
(gitignored; a worktree materializes tracked files only). Tracks B/C/D develop and gate against the
committed fixture corpus exclusively, which is the SAME hermeticity bar the repo already enforces
(D29-12; the P4.5 S6 proof that the full suite passes fixture-only). Track D needs no index at all
under the reviewed D29-68 mechanism (`abbreviateBook` is a pure client-side function; its collision
test runs over the committed 496-book-name fixture) — Integration's only D-specific duty is the
fixture-vs-fresh-index drift re-verification (D29-68).

**Golden policy (D29-71, restated):** ONE authoritative golden regen at Integration, at merged
HEAD. Tracks A and B will each drift goldens (A: masthead strip, all 6; B: glyph swap, the 3
SVG-bearing ones — the sets overlap, so no track wholly owns any golden file); each may regen
locally to stay CI-green and flags what it touched; Integration re-runs `scripts/regen-goldens.ts`
once and hand-reviews the combined structural diff (masthead-strip + glyph paths + table/whitespace
CSS — and nothing else; anything else in that diff is a regression to chase, not accept).

- **TRACK A — ingest/transform, main tree (D29-59, D29-60, D29-61(a), D29-62).** R4's `join.ts`
  override + repoint verification + BOTH regression-test cases (the commune many-to-one AND the
  fresh-slug mover pattern, `shadow-double`/`simulacrum` — D29-59); R8's
  item_category/subcategory fill-gap threading (`equipment` category only) + `itemSubcategory`
  schema field; R9(a)'s level→0 default for the 23 level-bearing categories; R3's structural
  masthead strip + `mastheadExtra` schema field + its rendering in the facet-header components
  (both halves of the one R3 contract — strip and enrich land together, never separately). ONE
  corpus regen at the end covering all four items (`pnpm --filter @astra/codex transform` against
  the existing committed snapshots — no re-fetch, nothing upstream changed), determinism proven
  **3×** (three full transform runs, `diff -r` empty pairwise — the P1-established gate,
  `thoughts/shared/memory/codex-0029-gotchas.md`'s own "D-gate 3×" precedent), fixture regen
  (`scripts/extract-fixture.ts` off the fresh transform) — **whose selection list MUST explicitly
  pull in: a free-action-cost entity (the current fixture corpus has ZERO — Track B's glyph gate
  and Integration's checks need a real specimen), the commune many-to-one pair, a fresh-slug
  ritual mover (`shadow-double`/`simulacrum`), and (P6 Track A implementation-time addition, see
  D29-59's correction note) a pairing-less mover (`ritual/unbearable-cacophony`, no
  `legacyOf`/`remasteredAs` at all)** — named specimens, mirroring how R1's table
  samples are named, so the downstream tracks' deferred proofs have real material; then the
  host-only Pagefind rebuild
  (`just codex-search-index`) last — the R4 category move re-homes several thousand documents'
  index category AND the R3 strip changes every entity's excerpt text, so the index rebuild is
  doubly mandatory. Track-local golden regen allowed + flagged (all 6 will drift from the masthead
  strip). **Gate (CORRECTED at implementation time, P6 Track A, 2026-07-15 — see D29-59's own
  correction note for the full derivation; the ORIGINAL "2,549/113/46/9/10/323" numbers below this
  point were computed against the wrong population and do not hold):** `spell/` = **2,461** (not
  2,604); `ritual/` = **201** (58 pre-existing + **143** movers — 45 same-slug colliders →
  `@legacy` siblings, 98 fresh-slug movers; of the 58 pre-existing, 45 renamed to `@legacy`, 11 stay
  unsuffixed while gaining a `remasteredAs` pairing, 2 stay never-remastered); the THREE named
  regression cases hold: `ritual/commune-with-nature`'s `remasteredAs` reads `["ritual/commune"]`;
  `ritual/shadow-double` exists with NO `ritual/shadow-double@legacy` and `ritual/simulacrum` stays
  unsuffixed (the fresh-slug case); `ritual/unbearable-cacophony` exists with neither `legacyOf` nor
  `remasteredAs` at all (the pairing-less case); `equipment/` gains **273** (not 323 — the raw AoN
  doc count before `aonDedup` collapses same-url/edition duplicates, verified clean, D29-60's own
  correction note) `Runes`-tagged entities and
  zero weapon/armor/shield entities lose their existing `itemCategory`; **the R8 fill-gap will
  ALSO legitimately surface "Weapons" (481) / "Armor" (250) / "Shields" (232) as `/equipment`
  Category facet values** (AoN's `equipment.json` tags ammunition/accessories with those
  category-name values) alongside the separate weapon/armor/shield corpus categories — expected,
  real signal, not a bug; flagged forward to the H review so it isn't treated as a surprise; the
  10 R9-affected entities
  (§ D29-61a, named there) read `level: 0`; `archetype`'s 261 no-level entities UNCHANGED (still
  `undefined`);
  masthead spot checks — `spell/heal` + `armor/breastplate` (or equivalent) show non-Source
  masthead fields (Target/Bloodline; AC Bonus/Dex Cap/Check Penalty/Speed Penalty/Strength/Group)
  rendered ONCE in the structured facet header, not duplicated in the body, and `ancestry/human`
  (the no-divider case) keeps its full prose body intact; full Zod validity;
  `scripts/transform.test.ts`'s hermetic 2-run pipeline test green. Must NOT touch: CSS, glyphs,
  search state, browse-engine semantics, abbreviations.
- **TRACK B — render/CSS + glyphs + footer, worktree (D29-63, D29-64, D29-65, D29-66).** R1's
  table CSS + R2's white-space rule (`globals.css`); R5's asset fetch (recorded provenance) +
  outline-to-SVG-path conversion + the 3-site path swap in `src/ui/actionGlyph.tsx`; R6's footer
  deletion (`__root.tsx` + the orphaned `.site-foot` CSS at `globals.css:315` and its `:205`/`:521`
  references — both files are B's). Track-local golden regen allowed + flagged (the 3 SVG-bearing
  flagship
  goldens — `spell-heal.html`/`class-investigator.html`/`creature-dragon.html`, verified via
  `grep -l "svg\|<path"` — drift from the glyph swap; R1/R2 are pure CSS and R6 never touches
  `EntityPage`, so nothing else drifts). Gate (fixture-corpus + unit — **the glyph gate is a
  component UNIT test, adversarially corrected: the fixture corpus has NO free-action entity, so
  "all 5 costs on fixture entities" was unsatisfiable as first drafted**): a unit test renders
  `ActionGlyph` with all 5 synthetic `ActionCost` values
  (`1`/`2`/`3`/`reaction`/`free`) and asserts the real traced glyph shapes (no fixture entity
  needed), PLUS a visual spot check on whatever costs the fixture corpus does carry;
  `role="img"`/`aria-label`/`<title>` unchanged (accessibility parity); zero
  prop-signature changes at any of the 4 call sites (`statblock.tsx`, `facetHeader.tsx`,
  `nodes.tsx`, `text.ts`); a fixture table-bearing entity shows a bordered/zebra'd table; a
  fixture degree-of-success entity renders its blocks on separate visual lines; the footer element
  AND the `.site-foot` rules are wholly gone (grep-provable). The vellum-render PNG rasterization
  check +
  real-corpus spot checks (`spell/shining-starlight-attack`, `spell/nightmare`, and a real
  free-action entity — present in the regenerated fixture per Track A's selection list, and in the
  real corpus at Integration) defer to
  Integration (no real corpus in the worktree). Must NOT touch: ingest, schema, search, browse
  engine, abbreviations.
- **TRACK C — search + filter semantics, worktree (D29-61(b,c,d), D29-67).** R11: `superseded`
  field re-added to `SearchPageSearch`/`SearchFilterState`, `supersededFilter()` wired into
  `Omnibar.tsx`/`SearchPage.tsx`'s Pagefind calls, the `/search` reveal control, `?superseded=`
  decode. R9(b): `matchesRange`'s bounds-imply-hasValue rewrite, `hasValue` removed from
  `RangeFilter` entirely. R9(c): the "Must have a value" checkbox deleted from `FacetPanel.tsx`.
  R9(d): the `urlState.ts` range codec's `!`-bang handling (decode-tolerant forever, never emitted
  — D29-61d) + `urlState.test.ts` expectation updates; the one-line `hasValue` removal in
  `activeFilterPills.ts:43` (the shared-set file — C's edit is first, D rebases on top).
  Gate (fixture-corpus + unit): `supersededFilter` merge covered by unit tests over the Pagefind
  filter-object shape (the worktree has no real `/pagefind` bundle — the live "magic missile"
  proof defers to Integration); a fixture browse listing with a typed level bound excludes
  missing-level rows with no checkbox anywhere; the checkbox gone from every `FacetPanel` render
  (grep + DOM assert); zero `hasValue` references remain repo-wide incl. `urlState.ts` and
  `activeFilterPills.ts` (grep-provable — the adversarially-caught escape sites); a URL carrying a
  legacy `!` bang range param decodes identically to the bang-less form and the encoder never
  emits one (codec round-trip test); `?superseded=` decode
  round-trips on `/search`. Must NOT touch: ingest, schema (`searchUrlState`'s own types are C's),
  CSS, glyphs, the R10 display lines it will conflict with (that's D's
  rebase to resolve, not C's to pre-empt).
- **TRACK D — abbreviations, worktree (D29-68, the reviewed client-safe-module mechanism).** The
  new `src/domain/sources/abbreviations.ts` — `abbreviateBook(book: string): string | undefined`,
  the 243-entry hand-curated map + the PS:ATG-style stopword-aware initialism generator for the
  253 "Other" books (145 PS scenarios + 108 numbered APs/Bounties/one-offs), every generated entry
  hand-reviewed, map overrides for collisions/ugly cases — plus its test and the committed
  496-book-name test fixture; the 7-site display wiring
  (`BrowseListing`/`FacetPanel`/`activeFilterPills`/`RulesTree`/`RulesLayout`/`Omnibar`/
  `SearchPage`) importing `abbreviateBook` directly, full-name fallback on `undefined`. **NO
  server/scripts/index plumbing — `sourcesIndex.ts`/`sourcesIndexBuild.ts` untouched (D29-68's
  reviewed mechanism); the module's ~tens-of-KB client-bundle cost is the recorded accepted
  trade.** Gate (fixture/unit): the
  zero-collision test over the committed 496-book-name fixture (book NAMES are not gitignored,
  only the built index is); curated + generated entries reviewed in one module; compact surfaces
  render abbreviation-with-fallback; `citation.tsx`/`SourcesIndexView` headings untouched (full
  name).
  **D rebases onto merged A+B+C before its own merge** (the FOUR shared files —
  `FacetPanel.tsx`/`Omnibar.tsx`/`SearchPage.tsx`/`activeFilterPills.ts`, D29-71 — resolving their
  conflicts is the rebase's explicit charter). Must NOT
  touch: filter/search semantics (C's), ingest, schema, CSS, glyphs.
- **INTEGRATION — serial, main tree (D29-69, D29-70; merges per D29-71).** Merge order A → B → C →
  D (D rebasing first). Then, on the merged tree: ONE authoritative golden regen + hand-review
  (per the golden policy above); ONE final corpus regen + 3× determinism re-proof + fixture
  re-extract + `just codex-search-index` (this is the regen whose output actually ships — Track
  A's own regen was correctness-proving, this one is authoritative at merged HEAD); the D29-68
  drift re-verification (the committed 496-book-name fixture still matches the freshly
  regenerated `sources-index.json`'s book list, failing loudly on drift); the deferred
  real-corpus proofs from B/C
  (vellum-render PNG spot render; `spell/shining-starlight-attack` table + `spell/nightmare`
  line-break spot checks; a real free-action entity's glyph; the live "magic missile" search
  proof); full Playwright
  zero-hydration-error pass across every touched route; fresh weight/perf numbers vs the P4.5 S6
  baselines (a real increase from masthead-enrichment markup + table CSS is expected, reported not
  hidden); telemetry spot-check (local OTLP smoke, SigNoz MCP verification); hermeticity both
  lanes (`data/` renamed out of tree — the standing convention); README P6 section. Deploy tail:
  image rebuild if the dependency set changed (it shouldn't — the glyph-conversion tool is
  one-time/offline, not a runtime dep) + `just up`; `just codex-refresh`'s restart tail exercised
  for real (the corpus DID change this phase, unlike P5's drill-only F-gate); the R7
  `2e.iridi.cc` stanza — **flagged at execution** ([[flag-paid-live-actions]], a live edge
  change) — + `just caddy-reload`; the C-style real-corpus three-pronged assert (marker + full-
  scale listing count + zero fixture-fallback warns, never bare 200s) on BOTH `codex.iridi.cc` AND
  `2e.iridi.cc`. Then **H re-runs** — the consolidated stakeholder review, covering every P2–P5
  carried item plus all 11 P6 items, on the live site.

## 5. Acceptance criteria (P6 exit gate)

All measurements and smoke checks run against the production build (`pnpm build` + `pnpm start`,
or the live edge once redeployed) — never `vite dev` (the standing P3 finding, `/pagefind` and
`staticMounts` aren't served there).

- **A (Track A) — ingest correctness.** R4 (CORRECTED at implementation time, D29-59's own note):
  `spell/` = **2,461**, `ritual/` = **201** (143 movers — 45 same-slug colliders + 98 fresh-slug —
  over the 58 pre-existing files), THREE edge cases verified by id — the commune many-to-one, the
  fresh-slug mover (`ritual/shadow-double` exists with no `@legacy` sibling,
  `ritual/simulacrum` unsuffixed), and the pairing-less mover (`ritual/unbearable-cacophony` exists
  with neither `legacyOf` nor `remasteredAs`) — `ritual/commune`/`ritual/commune@legacy` collision
  resolved per D29-1's
  pattern, zero broken crossrefs into the moved entities (grep/report-provable via the existing
  `brokenRef` report field). R8 (CORRECTED, D29-60's own note): **273** `Runes`-tagged equipment
  entities (not 323 — the raw AoN doc count pre-`aonDedup`, verified clean), zero weapon/armor/shield
  regressions (spot-checked `weapon/chakri-lost-omens` keeps `itemCategory: "advanced"`); the
  expected "Weapons"/"Armor"/"Shields" facet values on `/equipment` (481/250/232 —
  ammunition/accessories, real signal) noted for H, not treated as a bug. R9(a):
  the 10 affected entities (named, D29-61a) read `level: 0`; `archetype` and every 0%-coverage
  category unchanged.
  3× determinism, full Zod validity, `scripts/transform.test.ts` green.
- **B (Track A render half + Track B CSS; real-corpus proofs at Integration) — R3/R1/R2.** Masthead
  fields render exactly once (no duplication) across the named
  spot-check categories incl. the no-divider `ancestry/human` case (body intact); tables styled
  (bordered/zebra'd, spot-checked on `spell/shining-starlight-attack`, `feat/chromotherapy`,
  `ritual/awaken-animal` — the scope doc's own named samples); degree-of-success blocks render on
  separate lines; goldens regenerated once at Integration and reviewed (masthead-strip + CSS +
  glyph diff, not a renderer regression); zero hydration errors.
- **C (Track B; PNG + real-specimen proofs at Integration) — R5.** All 5 `ActionCost` values
  render the real traced glyph shapes via the synthetic-cost component unit test (the fixture
  corpus carries no free-action entity — the adversarially-corrected gate basis) plus a real
  free-action specimen check at Integration; accessibility
  attributes unchanged; vellum-render PNG rasterization spot-checked; the 3 affected flagship
  goldens' diff is SVG path data, nothing else (reviewed within Integration's single regen).
- **D (Track C; live search proof at Integration) — R9(b,c)/R11.** A default "magic missile" search
  returns zero results; the same query
  widened (reveal control or `?superseded=1`) returns `spell/magic-missile` with its edition pill;
  a level-bound browse filter excludes level-missing rows with no checkbox present anywhere; zero
  `hasValue` references remain repo-wide incl. `urlState.ts`/`activeFilterPills.ts`
  (grep-provable); a `!`-bang-bearing legacy URL decodes identically to its bang-less form and the
  encoder never emits the bang (D29-61d).
- **E (Track D + Track B's footer + Integration's edge) — R10/R6/R7.** A compact surface shows an abbreviation for a known book; zero
  abbreviation collisions across the committed 496-book-name fixture (test-provable), and the
  fixture reconciles exactly against the freshly regenerated `sources-index.json` book list at
  Integration (loud failure on drift, D29-68); `citation.tsx`/`/sources` headings show
  full names; the footer element AND the `.site-foot` CSS are entirely absent (`grep -a` on
  rendered HTML + a source grep); through
  the public edge, `2e.iridi.cc` serves byte-identical SSR content to `codex.iridi.cc`,
  `X-Robots-Tag: noindex` present on both, TLS valid.
- **F.** Perf/weight recorded fresh, compared against the P4.5 S6 baselines (`/rules`, `/sources`,
  the heaviest attached-sidebar host, row-click-to-paint, filter-interaction latency — same named
  figures P4.5 S6 recorded). A real increase from R3's markup + R1's table CSS + R10's per-row
  abbreviation lookups is expected; disproportionate (order-of-magnitude) is a stop, incremental is
  reported not hidden.
- **G.** Telemetry + hermeticity: `astra.codex` spans healthy on every reworked route via a local
  OTLP smoke (SigNoz MCP tools per [[signoz-mcp]]); fresh-clone hermeticity simulation green both
  lanes (`data/` renamed out of tree, codex's suite falls back to the fixture corpus cleanly); the
  real-corpus C-style three-pronged assert (a real-corpus marker, a full-scale listing count, ZERO
  fixture-fallback `console.warn` in container logs) re-run through BOTH live hostnames, never
  satisfied by bare 200s; `just codex-refresh`'s restart tail exercised for real this time (the
  corpus actually changed).
- **H.** THE consolidated stakeholder review on the live site, now covering: every carried-forward
  item from P2 (M7/M11 expected behaviors), P3 (the single-common-word Pagefind limitation,
  documented not a bug), P4/P4.5's surfaces in the parchment skin, P5's deploy posture, AND **all 11
  P6 items** — R1 (tables), R2 (line breaks), R3 (no duplicate masthead + enriched headers), R4
  (rituals show ~145 current, not 2 — corrected at implementation time from the spec's original
  ~58 estimate, D29-59's own note), R5 (real glyphs), R6 (no footer), R7 (`2e.iridi.cc` live), R8 (Runes
  filterable), R9 (level filter behaves), R10 (abbreviations visible), R11 (search hides superseded
  by default). Exit = sign-off → 0029 (if this is the last redirect) or a further feedback round
  (if not) — this spec does not presume which.

## 6. Risks / adversarial notes

- **The masthead-strip's structural rule (D29-62) is the single riskiest change this phase makes to
  ingest** — it touches EVERY entity with a body, not a scoped subset like R4/R8/R9. Its own
  survey covered 8 real samples across the category groups R3 names, but 88 categories exist; a
  category outside spell/feat/equipment/generic that happens to share the AoN masthead SHAPE
  (bold-label paragraphs before a divider or before plain prose) will ALSO get stripped — this is
  believed correct (the structural rule doesn't know or care about category), but Track A's gate
  should spot-check at least one entity OUTSIDE the four named groups (a `deity` or `hazard`
  sample) to catch a shape the 8-sample survey didn't anticipate.
- **R4's two edge patterns are where a naive per-slug rename silently breaks** — the
  commune/commune-with-nature many-to-one (1 case: an implementation assuming
  `remasteredAs.length === 1` fails) and the fresh-slug movers (9 cases, the adversarial review's
  find: an implementation assuming every mover collides — or that every unsuffixed legacy ritual
  gains an `@legacy` sibling — fails on 9 of 55). Both are real AoN data, not corpus bugs; Track
  A's two required regression tests are the guard. If further instances of either pattern exist
  that neither this spec's scan nor the review caught, the same test shapes generalize — re-run
  the duplicate-target and fresh-slug scans at implementation time, not just trust the counts.
- **Corpus fail-soft (carried from P5's own memory, still the #1 deploy risk):** a mis-mounted
  refresh serves the small fixture corpus with a healthy-looking 200 — Integration's gate must
  assert a real-corpus marker (the R4 ritual count is a NEW, phase-specific version of this check —
  the fixture corpus's own `ritual/` count won't match 113 post-move unless the fixture regen
  actually landed).
- **Pagefind `writeFiles` non-idempotence (carried):** `build-search.ts:26` already `rm -rf`s
  first — confirmed unchanged — so Track A's and Integration's index rebuilds are each clean, but a
  manual re-run outside `just codex-search-index` must not skip that step.
- **The linguist-commit timer around commit windows (carried, sharper under parallel tracks):**
  stop it across every commit window — Track A's AND Integration's especially (both sit on the
  main tree, where the timer runs; the worktree tracks are outside its sweep by construction, one
  incidental benefit of the structure). Track A's fixture regen and Integration's merge window
  produce exactly the large staged-diff shape the timer has swept into mislabeled auto-commits
  twice before (the P4 S3 incident + 0021).
- **`routeTree.gen.ts` flap (carried):** restore from HEAD if a `vp run` invocation touches it
  incidentally mid-phase, not a codex change.
- **`@legacy`/`?legacy=` alias byte-identical decode must survive R4's category move.** R4 changes
  WHICH category some `@legacy`-suffixed ids live under (`ritual/atone@legacy` is new; the entity
  used to be reachable only as the un-suffixed `ritual/atone`, edition:legacy, before this move).
  The `?legacy=`/`?superseded=` alias-decode mechanism itself (`urlState.ts`, pure client-side,
  P5's own "no 307 exists" finding) is UNCHANGED by this phase and doesn't care which category an
  id lives in — but Track A's gate should include one direct check that an old bookmarked
  `ritual/atone?legacy=true`-shaped link (if any existed pre-move — unlikely since the pre-move
  legacy ritual had no un-suffixed collision to disambiguate) still resolves sanely post-move,
  since this is exactly the kind of link-stability question a category rename can quietly break.
- **R9's two-track split (D29-61 spanning Tracks A and C) is a real dependency risk, not just an
  organizational choice** — Track C's `matchesRange`/checkbox changes assume Track A's ingest
  default has already landed at merge time (otherwise the "no checkbox, bounds imply has-value" UI
  would exclude MORE rows than intended, since level-bearing-but-still-genuinely-missing entities
  wouldn't have been defaulted to 0 yet). Track C develops in parallel against the OLD fixture
  corpus, which is fine for its unit/DOM gates — but its merged behavior is only correct once A's
  fixture regen is in; D29-71's A-before-C merge order exists for exactly this, and Integration's
  gate D re-proof at merged HEAD is the backstop. Called out explicitly since the two R9 halves
  are otherwise easy to treat as independent.
- **Worktree drift against Track A's fixture regen (new, parallel-structure-specific):** Tracks
  B/C/D branch from pre-A HEAD and run against the OLD fixture corpus for their whole life; Track
  A's regen changes fixture entity shapes (masthead-stripped bodies, moved ritual ids, new
  `level: 0`s). Any B/C/D test that unknowingly depends on a pre-regen fixture detail (a body node
  index, a ritual id, a missing-level row count) will pass in its worktree and fail at merge. The
  mitigation is structural (B/C/D's gates are deliberately pinned to unit/DOM-level asserts, not
  fixture-content asserts) plus Integration's full-suite re-run at merged HEAD — treat a
  merge-time test failure in a B/C/D file as "stale fixture assumption" FIRST, regression second.
- **R10's curation labor is the phase's real timeline risk, not its code.** 243 hand-curated
  entries + review of ~253 generated ones is real, non-automatable labor; the code-level work
  (the pure module, 7-site wiring, collision test — even smaller after the D29-68 mechanism
  change removed all server/index plumbing) is Size S on its own — which
  is exactly why R10 got its own dedicated track (D). If Track D's timeline is tight, the scope
  doc sanctions no partial-curation fallback — ship the full 496 or flag the trade-off explicitly
  (per [[no-silent-scope-cuts]]), don't quietly ship a partial map.
- **Standing (carried from every prior phase):** never watch the GHA run to completion after
  pushing; reproduce both CI lanes locally before every push.

## 7. Out of scope (P6)

A new `rune` category or trait (R8 stays a facet/filter fix, not a taxonomy addition — scope doc's
own line). A listing-row "Runes" badge (R8's header + facet filter suffice). Alegreya SC or any
art-plate component (still deferred, P4.5 D29-46, no consuming feature exists). A persisted
cross-page edition preference of any kind (still deleted-not-replaced, D29-48, R11 only changes
search's OWN default, not the mechanism). i18n. A sitemap or SEO change beyond the existing
three-layer noindex (R7 adds a second noindexed hostname, nothing else). Font/theme changes beyond
what R1/R3's CSS work touches incidentally (no P4.5-style restyle sweep this phase). Any change to
`/rules`'s dedicated tree browser mechanics beyond what R11's superseded-default already covers via
the existing shared mechanism (P4.5 D29-49's split-view exclusion for `/rules` stands unchanged).
Runtime font-conversion tooling as a permanent dependency (R5's outline-to-SVG step is one-time and
offline, not shipped).

## 8. Build record

_(Populated per-track + at integration during implementation — empty at FINAL.)_

- **Track A, 2026-07-15:** R8/R9(a)/R3 built + TS-green (typecheck/lint/format/tests/build) against
  the real snapshots; R4's mechanism built exactly as D29-59 describes it, which surfaced a
  wrong-population bug in the spec's OWN verification (55 vs the real 143 movers) — orchestrator
  decision: OPTION 1, ship the mechanism as-written, amend the pinned numbers (D29-59's own
  correction note, above, has the full derivation + root cause). R8's 323→273 gap independently
  verified clean (5 sampled raw-doc groups, all trace to the pre-existing `aonDedup` collapse, zero
  missed fills). Proceeding to the fresh transform / 3× determinism / fixture regen / Pagefind
  rebuild / commits per the corrected numbers above.
- **Track B, 2026-07-15:** R1/R2/R5/R6 built + TS-green in the worktree. The adversarially-corrected
  glyph gate (synthetic-cost unit test over all 5 `ActionCost` values, the fixture corpus carrying
  none) passed; the 3 SVG-bearing flagship goldens regenerated locally and flagged, drift confirmed
  to be glyph path data only. Real-corpus free-action specimen + vellum-render PNG rasterization
  proof deferred to Integration per plan (no real corpus in the worktree).
- **Track C, 2026-07-15:** R9(b,c)/R11/D29-61d built + TS-green in the worktree. `hasValue` removed
  repo-wide incl. the adversarially-caught escape sites (`urlState.ts`'s range codec, `activeFilterPills.ts:43`);
  the `!`-bang decode-tolerant/never-emit contract unit-tested via a codec round-trip. Live
  "magic missile" search proof deferred to Integration (no real `/pagefind` bundle in the worktree).
- **Track D, 2026-07-15:** D29-68 built + TS-green in the worktree. 243 hand-curated + ~253 generated
  (PS:ATG-style initialism) entries, all hand-reviewed; zero-collision test over the committed
  496-book-name fixture green. 7-site wiring landed; `sourcesIndex.ts`/`sourcesIndexBuild.ts`
  untouched per the reviewed D29-68 mechanism. Drift re-verification against a freshly regenerated
  `sources-index.json` deferred to Integration (mechanism needs the real corpus).
- **Integration, 2026-07-15:** Merges A→B→C→D (D rebased first) — B conflicted only on the 3
  SVG-bearing goldens (the golden policy's own predicted overlap), C merged clean, D's rebase onto
  the 4 shared files was conflict-free (verified-disjoint as spec'd). Full `vp run -r typecheck`
  green across all 32 members immediately after, zero cross-track drift. ONE authoritative golden
  regen: 2 files drift (`creature-dragon.html`, `spell-heal.html`), pure SVG path-data diffs. ONE
  authoritative corpus regen (transform against the committed snapshots, no fetch), 3× determinism
  proven (`diff -r` empty pairwise all three runs), fixture re-extract byte-identical to Track A's
  own, host Pagefind rebuild (46,192 pages indexed). Verified against the corrected gate numbers:
  `spell/` 2,461, `ritual/` 201 (143 movers: 45 same-slug + 98 fresh-slug), `equipment/` Runes 273,
  the three named R4 regression cases by id, the 10 named R9(a) level:0 entities, archetype's 261
  no-level entities unchanged. D29-68 drift re-verification: 0 drift, the committed 496-book-name
  fixture matches the freshly rebuilt `sources-index.json` exactly. Full codex suite: 1,533 tests
  green. Two review minors folded: D29-62's own amendment section now records the mastheadExtra
  label-dedup deviation Track A shipped in `b070592`; `FacetPanel.tsx`'s `RangeInputs` missing-count
  note now appears in both min/max placeholders. Real-corpus proofs (production build): tables
  bordered/zebra'd on all 3 named specimens; `spell/nightmare`'s degree-of-success block renders on
  separate lines; a real free-action specimen (`feat/high-speed-regeneration`) renders the traced
  diamond glyph with accessibility parity intact; the "magic missile" search proof holds (0 hits
  default, 1 hit + edition pill widened via checkbox or `?superseded=1`); abbreviations visible with
  full-name hover; zero footer anywhere; `armor/breastplate`/`spell/heal` show every masthead field
  once (confirming the dedup fix); `ancestry/human`'s no-divider case keeps its body intact. Full
  sweep: Playwright zero-hydration pass across 20 routes; weights vs the P4.5 S6 baselines move by
  low single digits (several shrink under gzip), interaction latency moved more (~1.5–2×, real but
  same-order-of-magnitude, not a stop, attributed to R10's new per-row abbreviation lookups);
  hermeticity both lanes green with `data/` renamed out of tree; telemetry confirmed via the SigNoz
  MCP tools (7 reworked routes, healthy `astra.codex` spans, 200/no-error). Both CI lanes reproduced
  green (`ruff check`/`format --check`/`ty check`/`pytest`; `vp run -r typecheck`/`oxlint
  --threads=4`/`format:check`/`vp run -r test`/`vp run -r build`; the `routeTree.gen.ts` flap hit
  `heartwood-frontend` mid-build, restored from HEAD per the standing gotcha). Deploy tail: `just up`
  recreated only `astra-codex` (no ripple); the container-recreate served as the restart-tail proof
  (deliberately not re-running `just codex-refresh` itself, which would re-fetch from the network
  against the spec's own "no re-fetch" corpus posture) — real-corpus three-pronged assert green on
  both `codex.iridi.cc` and the newly live `2e.iridi.cc` (145/145 default, 201/201 widened, zero
  fixture-fallback warns, byte-identical SSR payload modulo a per-request hydration timestamp);
  `2e.iridi.cc` Caddy stanza added (R7, flagged per [[flag-paid-live-actions]] — the live edge
  go-live for the new hostname), noindex + TLS confirmed on both hosts.
