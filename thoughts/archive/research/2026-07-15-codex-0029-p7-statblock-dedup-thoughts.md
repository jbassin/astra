# codex 0029 — P7 scope: statblock dedup (keep AoN) + structured-statblock data bugs

**Date:** 2026-07-15 · **Status:** SCOPED — all decisions RESOLVED
**Provenance:** early gate-H feedback. The stakeholder reviewed the live
`codex.iridi.cc/creature/abberton-ruffian` page mid-gate-H and confirmed five items: the M11
double statblock (decision: **dedup, keeping the AoN side**) plus four bugs in the structured
statblock render. This scope doc covers all five as P7. The rest of gate H is still in
progress; further redirect items (if any) would extend or follow P7.

Every claim below was verified against the REAL repo + corpus by three investigation agents
(render-seam map, bug root-cause with corpus prevalence, full 89-category population sweep) —
per the P6 lesson, no proxy populations: all counts are live sweeps over
`apps/codex/data/corpus/` run 2026-07-15.

---

## 1. The five items

- **I1 — M11 dedup.** AoN-joined creatures/hazards render their statblock twice (structured
  header + AoN prose body). Suppress the structured side when an AoN body is present.
- **I2 — empty item stubs.** Embedded items with no traits/description render as bare headings
  ("Bottle"). 7,907 stubs / 88,177 embedded items (~9%) corpus-wide.
- **I3 — lore skills render as item headings.** `type:"lore"` embedded items land in the
  generic abilities bucket ("Gambling Lore" as a bare heading). 1,728 lore items / 1,479
  creature+hazard entities.
- **I4 — Skills line omits lore skills.** The lore bonus (`item.system.mod.value`) is never
  extracted — the structured Skills row can't show it. Same population as I3.
- **I5 — strike range dropped.** `system.range.{increment,max}` on melee-typed strike items is
  never read (only the `thrown-N` **trait** encoding survives). **1,723 strikes / 1,636
  entities** lose their range — includes true ranged weapons (Crossbow 120 ft) and hurled
  attacks. Highest-blast-radius transform gap of the four.

## 2. Decisions — all RESOLVED (stakeholder, 2026-07-15)

- **R1 — dedup direction: KEEP THE AON SIDE.** When an entity has a non-empty AoN body, the
  AoN prose is the statblock of record; the structured render is suppressed. Foundry-only
  entities (no body) keep the structured render unchanged. Closes M11.
- **R2 — dedup scope: EVERYWHERE BOTH EXIST.** Suppression covers BOTH mechanisms — the
  statblock header cards (`CreatureStatblock`/`HazardStatblock` + `MastheadExtraFallback`)
  AND `EmbeddedItemSections` — on every entity with a non-empty body. That's creature 3,672 +
  hazard 506 + vehicle 83 + warfare-army 7 (the only 4 categories with any struct+body
  overlap; all other 85 swept = 0). Accepted trade-off (explicitly presented): embedded
  weapon/spell/equipment full rules text leaves the joined pages — the AoN body crossref-links
  item names, full text is one click away on the item's own page. Spell LISTS survive (AoN's
  own linked lists, verified on balor).
- **R3 — the four bugs are fixed regardless of dedup** (they remain fully visible on the
  Foundry-only population that keeps the structured render: creature 2,582 + hazard 675).

## 3. The seam (verified)

- **One conditional site:** `apps/codex/src/domain/render/entityPage.tsx:79-91` — statblock
  cards at 79-83, `EmbeddedItemSections` at 89-91, body render at 93. Both the standalone
  `$category/$slug` route and the split-view pane render through the shared
  `EntityRenderPane.tsx` ("byte-identical by construction") — one seam fixes both surfaces.
- **Predicate: `entity.body.length > 0`** — NOT `aonUrl` presence. Empirically airtight:
  every joined creature has a non-empty body (3,969/3,969 checked), every Foundry-only one has
  `body: []` (Foundry Actor descriptions are essentially always empty). `join.ts:421` makes a
  no-markdown join theoretically able to set `aonUrl` with a Foundry body fallback, so
  body-presence is the honest signal; the spec may note `aonUrl` as intent documentation only.
- **The Recall Knowledge DC block is INSIDE the AoN body** (stripMasthead breaks on the
  crossref-first RK paragraph; creature/hazard mastheadExtra census = 545 "Complexity" + a few
  "Nethys Note", zero "Recall Knowledge") — keeping AoN keeps RK. Present in 3,646/3,672
  (99.3%) of joined creature bodies.
- **Masthead** (name/level/traits/edition pill/citation/AoN link) is a sibling `<header>`
  block above the seam — unaffected.
- **Content-loss analysis:** header cards are strict re-derivations — zero loss. AoN body
  additionally carries flavor prose + full ability text the cards never had. Embedded-item
  full rules text (spell/weapon/armor/equipment descriptions: 0% verbatim presence in AoN
  bodies over a 40-creature sample) is the only real loss under R2 — accepted above.

## 4. Bug root causes (verified against raw Foundry snapshots)

| bug | class | root cause | fix shape |
|---|---|---|---|
| I2 empty stubs | RENDER | upstream Foundry data genuinely empty (388/388 sampled); renderer has no skip-guard | filter items with empty body + empty traits + no actionCost out of the `other` bucket, `statblock.tsx:264-266` |
| I3 lore-as-item | RENDER (documented gap) | `EmbeddedItemSections` `other` bucket has no lore carve-out (`statblock.tsx:249-266`, its own comment admits it) | exclude `type === "lore"` — **contingent on I4 landing first** (else the bonus vanishes entirely) |
| I4 skills omit lore | TRANSFORM (data loss) | lore bonus lives on the lore ITEM (`system.mod.value`); `extractSkills` (`foundryEntities.ts:480-487`) reads only the actor's `system.skills`; no code reads `item.system.mod`; `EmbeddedItemSchema` is `.strict()` with no `mod` field | transform-side: new lore extractor merges `sluggify(name) → mod.value` into the `stats.skills` record (same shape — `SkillsRow` untouched, no schema change needed for this one) |
| I5 range dropped | TRANSFORM (data loss) | `extractStrikeFields` (`foundryEntities.ts:645-654`) reads only bonus+damage; `system.range = {increment, max}` never read; no schema slot | new range extraction on melee-typed items → optional `range` field on `EmbeddedItemSchema` (schemaVersion bump per D29-20 precedent) → `StrikeRow` renders AoN-style ("range 10 feet" for max, "range increment 120 feet" for increment) |

Foundry-vs-trait encoding note (I5): melee-capable thrown weapons carry a `thrown-N` trait
(already captured → Dagger's "THROWN 10" pill works); ranged/hurled strikes carry the
`system.range` object (dropped). Both encodings verified in raw pack files
(`data/snapshots/foundry/pf2e-8.3.0/...`). Cross-checked on Foundry-only `creature/ailuran`
(Boomerang, `range.increment: 20`) — all four bugs manifest identically off-join.

## 5. Populations (spec pins — live sweeps, 89 category dirs)

| population | count |
|---|---|
| creature total / joined-both / Foundry-only / AoN-only-prose | 7,296 / **3,672** / **2,582** / 1,042 |
| hazard total / joined-both / Foundry-only / AoN-only-prose | 1,309 / **506** / **675** / 128 |
| vehicle both / warfare-army both (EmbeddedItemSections-only surface) | **83** / **7** |
| other categories with struct+body overlap | **0** |
| creature `@legacy` twins (ALL prose-only — never double-render) | 745 (742 of their base pages are joined-both) |
| hazard `@legacy` twins (same invariant) | 89 |
| I5 range-bearing strikes dropped / entities | 1,723 / 1,636 |
| I3/I4 lore items / entities (605 on Foundry-only) | 1,728 / 1,479 |
| I2 empty stubs / total embedded items | 7,907 / 88,177 |

**Correction to prior docs:** the "~2,242 Foundry-only creature carve-out" figure undercounts —
report.md's `unjoinedF=2,108` misses 474 `variantOf` variants whose own body is empty (they
render exactly like Foundry-only). Render-relevant Foundry-only = **2,582** creature / **675**
hazard (660 unjoined + 15 variantOf). `proseOnly:true` is an exact bijection with
"body present + no struct" (0 mismatches / 7,296).

## 6. Test/golden impact

- `goldens/creature-dragon.html` (fixture `adamantine-dragon-adult` is joined-both — currently
  contains `codex-statblock` + `codex-embedded-items` + `codex-body` together) must be
  regenerated + hand-reviewed; I5's range render may touch other goldens carrying strikes.
- `statblock.test.tsx` + `facetHeader.test.tsx` call components directly — unaffected by the
  entityPage-level suppression (I2/I3/I5 render changes will extend them).
- **No test today asserts the suppression either way** — new coverage needed: suppressed when
  body present (joined fixture) AND kept when Foundry-only (a `287s-ghost`-shaped fixture; the
  fixture corpus needs a Foundry-only creature if it lacks one).
- Transform changes (I4/I5) ⇒ real-corpus regen (`just codex-refresh` machinery) + fixture
  regen + determinism 3× + schemaVersion bump (I5).

## 7. Risks / notes for the spec

- I3 depends on I4 (fix order inside one slice, or same slice).
- The suppression must key on the render-layer group boundaries carefully: R2 extends beyond
  creature/hazard via the `EmbeddedItemSections` seam (any category), while the header cards
  stay creature/hazard-gated by construction — one predicate, two call sites.
- Vehicle nuance: 94 joined vehicles exist but only 83 have non-empty `embeddedItems`; the
  seam naturally handles the other 11 (nothing to suppress).
- Perf: strictly less rendering on 4,268 pages; goldens shrink. No new lookups.
- Deploy tail: corpus regen → `just codex-refresh` restart (corpusFs caches forever); gates
  should re-run the C-style real-corpus assert on both hostnames.
