# Hardlight Bridge

## Header block

- **Rank:** 3 (store `system.level.value = 3`)
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual figure supplied in the chunk 6 manifest for this spell — only routing/pool-reason.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, light, manipulate, planara (custom trait) — rarity common
- **Traditions:** arcane, divine, occult, primal (all four)
- **Cast:** `2` actions
- **Range:** 120 feet
- **Targets:** none specified (`system.target.value = ""`)
- **Defense:** none
- **Duration:** "10 minutes", `sustained: false`
- **Cost:** `system.cost.value = ""` (empty — no material cost recorded in the store)
- **Heightening:** fixed-rank, at 5th and 7th

## The 5e original

- **Level:** 3 · **School:** planara (source: `tfc`) · **Ritual:** true
- **Casting time:** 1 action
- **Range:** 120 feet
- **Components:** V, S, M — "a tiny model bridge" (no gp cost given, not marked consumed)
- **Duration:** 10 minutes, non-concentration
- **Classes:** Ranger, Seeker (SW), Warlock, Wizard

**Entries:**

> You summon a sliver of the crystal sphere between two points. The sliver forms a bridge that is up to 60 feet long and 10 feet wide. Both ends of the bridge must be within the spell's range, and both must be solid objects that can support the weight of whatever physical objects cross the bridge. The bridge itself has no weight.

**At Higher Levels:** "When you cast air bridge using a slot of 5th level or higher, the bridge is substantial only to those you nominate; to all others, it does not exist. This is also true if you cast the spell as a ritual and are capable of casting 5th level spells." (Note: the 5e higher-levels text refers to the spell as "air bridge," not "Hardlight Bridge" — an internal naming inconsistency in the source itself.)

## The conversion (canonical store)

> You summon a sliver of the crystal sphere that separates planes and shape it into a solid bridge of brilliant, translucent hardlight. The bridge is up to 60 feet long and 10 feet wide; both anchor points must be within range and must rest on solid objects capable of bearing weight. The bridge itself is weightless but can bear up to 1,000 pounds distributed across its surface.
>
> The bridge is composed of crystallized planar light: AC 10, Hardness 8, 40 HP per 10-foot section. Creatures can walk across it normally. The bridge sheds bright light in a 10-foot radius and dim light in a 20-foot radius for its duration.
>
> You can choose whether the bridge is visible to all creatures or only to creatures you designate when you cast the spell. Creatures for whom the bridge is invisible cannot see it, but can still stand and walk on it (they feel solid ground beneath their feet without being able to see it).
>
> **Heightened (5th)** The bridge length increases to 120 feet and it can bear up to 5,000 pounds. The Hardness increases to 12 and HP increases to 60 per 10-foot section. The selective-visibility option from this spell is now available at base rank without requiring a heightened slot.
>
> **Heightened (7th)** The bridge is permanent until destroyed or dispelled. The caster may designate any number of creatures as 'bridge-approved' at any time as a single action.

Structured fields agree with the prose (60 ft / 10 ft dimensions, 120 ft range, 10-minute non-sustained duration); the `system.cost.value` is empty, which disagrees with jmnario's own conversion notes (see below) that recorded a "tiny model bridge (not consumed)" material cost.

## What changed, plain English

- **Physical object stats ADDED:** the 5e text gives the bridge no combat stats at all — it's purely "supports weight, has no weight of its own." The store ADDS a full object-stat block with no 5e basis: AC 10, Hardness 8, 40 HP per 10-ft section (scaling to Hardness 12/60 HP at rank 5).
- **Weight capacity ADDED:** the 5e text never specifies a load limit. The store adds a concrete "1,000 pounds" (5,000 lbs at rank 5) figure with no 5e source.
- **Light emission ADDED:** the store adds bright light 10 ft / dim light 20 ft. Nothing in the 5e entries mentions light at all — this is invented flavor/mechanic tied to the "hardlight" name, not a 5e-sourced feature.
- **Selective visibility, moved earlier:** 5e's higher-level text gates selective-visibility behind a 5th-level-or-higher slot (or ritual casting at 5th-level-capable). The store's rank-3 base version does NOT include selective visibility at all; it's introduced as a heightened(5th) feature — same rank-gate concept, but reworded into PF2e's heightened-tier structure rather than 5e's slot-level clause.
- **Permanence ADDED at heightened(7th):** the store adds an entirely new top heightened tier (permanent bridge, "bridge-approved" creature designation) that has no counterpart anywhere in the 5e entries or entriesHigherLevel — the 5e original only ever defines ONE higher-level tier (the 5th-level selective-visibility clause).
- **Ritual flag DROPPED:** the 5e original is `"ritual": true`; PF2e has no equivalent ritual-casting mode represented in the store (no ritual-cast alternative is offered).
- **Material component DROPPED:** 5e requires "a tiny model bridge" (M component). The store's `system.cost.value` is empty — no material component is represented in the structured field (see Open flags; this conflicts with jmnario's own conversion notes, which did carry the material forward).
- **Traditions widened:** 5e's class list (Ranger/Seeker/Warlock/Wizard) does not span all four traditions directly, but the store assigns all four (arcane, divine, occult, primal) rather than a narrower subset.

## Converter's notes

- **Anchor:** "Wall of Stone (rank 5, permanent stone barrier) — Hardlight Bridge is rank 3, lighter (Hardness 8), non-permanent (10 min), and spans gaps rather than blocking them"
- **Archetype:** utility/creation (physical bridge from interplanar material)
- **Balance bullets:**
  - "Wall of Stone (rank 5) is a permanent Hardness-14 barrier; Hardlight Bridge (rank 3) is a temporary Hardness-8 span. The 2-rank difference reflects the permanent vs. 10-minute duration and the structural purpose (crossing gaps vs. creating obstacles)."
  - "AC 10 / Hardness 8 / 40 HP per section is derived from the Wall template table: Wall of Stone is Hardness 14/50 HP at rank 5; scaling back 2 ranks gives Hardness 10 approximately, rounded to 8 for the less-durable hardlight material."
  - "10-minute duration is exploration-tier appropriate for a utility bridge; the non-combat application doesn't need combat-capping."
  - "Selective visibility (at rank 5 heightened) is the most powerful aspect: a bridge only some creatures can see is a battlefield-control tool. Gated to rank 5 prevents abuse at rank 3."
  - "Light emission (10-ft bright / 20-ft dim) is a minor ambient benefit fitting the 'hardlight' name; no combat impact."
- **Overridable:**
  - "The selective visibility option could be included at base rank (rank 3) if the GM prefers the spell to have a unique combat application from the start rather than only at rank 5."
  - "Weight capacity (1,000 lbs) is an interpretive addition; the GM may want to adjust based on the specific campaign context (e.g., horses crossing the bridge, wagons, etc.)."
- **Checklist failures:** none recorded.
- Note: jmnario's own conversion recorded `cost: "a tiny model bridge (not consumed)"` and traits including `creation` (not `planara`/`light` as currently in the store) — the store's current traits/cost fields diverge from jmnario's hand-authored conversion (see Open flags).

## Similar official spells

- **Wall of Stone (rank 5)** — jmnario's own cited anchor. Permanent Hardness-14/50-HP-per-section stone wall, explicitly notes in its own text that it "doesn't need to stand vertically, so you can use it to form a bridge or set of stairs." Two ranks above Hardlight Bridge and far tougher/permanent, but the official spell most directly capable of the same "bridge" application.
- **Air Walk (rank 4)** — different mechanism (personal flight-like walking on air at up to 45°) but competes in the same "cross a gap/chasm" utility niche, one rank above Hardlight Bridge.
- **Rope Trick (rank 4)** — different mechanism (extradimensional pocket reached by climbing a rope) but a same-rank-class travel/utility spell for the same general "get past terrain" niche.

## Prior astra touches

None found — `Hardlight Bridge` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly, per the revisions tool's determinism check).

## Open flags

- **Structured/prose disagreement:** `system.cost.value` is empty (no material component recorded), but the prose text never mentions a material component either — however jmnario's own hand-authored conversion (`all_spells_pf2e.json`) DID carry forward the 5e "tiny model bridge" material as `cost: "a tiny model bridge (not consumed)"`. The current store silently dropped this material component relative to jmnario's own conversion, with no note in the store's description explaining the change.
- **Trait/tradition divergence from jmnario's conversion:** jmnario's hand conversion used traits `concentrate, creation, light, manipulate`; the store instead uses `concentrate, light, manipulate, planara`. The `creation` trait was dropped and a custom `planara` (school-name) trait was substituted.
- The `planara` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set.
- The 5e original's `"ritual": true` flag has no represented PF2e ritual-cast alternative in the store.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose.
