# Raise Island

## Header block

- **Rank:** 7
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual supplied in the chunk-10 triage list (ledger-routed, not quantitatively scored)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "area text not structurally parseable, left unmapped (effective-target classification falls back to the description's own target-count heuristic): '100-foot-by-100-foot slab of rock, 10 feet thick'"
  2. "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, earth, kosmoturgy, manipulate (rarity: common)
- **Traditions:** arcane, primal
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** 300 feet
- **Target:** `system.target.value = ""` (empty; see adapter warning #1)
- **Area:** `system.area = null` (structurally unset)
- **Defense:** `system.defense = null` (no structured save, despite a DC 25 Reflex save being described in prose — see Open flags)
- **Duration:** not sustained, "permanent"
- **Damage:** none
- **Heightening (structured):** `system.heightening = {"levels": {"9": {}}, "type": "fixed"}` — fixed-rank trigger at rank 9 with an empty payload
- **Seeded from:** convertedName "Raise Island" / originalName "Raise Island" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 7th
- **School:** Kosmoturgy (homebrew school)
- **Casting time:** 1 action
- **Range:** Point, 300 feet
- **Components:** V, S, M (a 5-foot cube of granite, consumed by the spell)
- **Duration:** Permanent
- **Classes:** Cleric, Paladin
- **Ritual:** No

> You rip a slab of bare rock 100 feet to a side and 10 feet thick that floats 10 feet off the ground. As an action, you may direct the slab to move in any direction, including up. It moves at a rate of 10 feet per round, and will continue to move in the direction you give it until you command it to stop.

No "At Higher Levels" entry in the 5e original — the base version has no explicit upcast text.

## The conversion (canonical store)

You rip a massive slab of bare rock from the ground (or from beneath a body of water) and levitate it 10 feet above the terrain. The slab is 100 feet to a side and 10 feet thick; creatures or objects standing on the ground where it rises must succeed at a DC 25 Reflex save or be carried aloft. The slab floats at a height of 10 feet. As a 2-action activity (concentrate, manipulate) you can issue a movement command; the slab moves up to 10 feet in any direction you specify, continuing in that direction each round at the same speed until you command it to stop or it reaches a barrier. The slab has AC 10, Hardness 14, and 300 HP per 10×10-foot section. The effect is permanent — the slab remains floating until destroyed.

---

**Heightened (9th)** The slab is 200 feet to a side and can be commanded to move at 20 feet per round.

**Structured-field disagreement:** the prose describes a DC 25 Reflex save for creatures/objects caught under the rising slab, but `system.defense` is `null` — no structured save exists anywhere in the JSON. The structured `system.heightening.levels["9"]` is an empty object even though the rank-9 heighten has real mechanical content (100-ft→200-ft slab, move rate 10→20 ft/round) that lives only in prose.

## What changed, plain English

The massive-floating-rock-slab fiction, the 100×100-foot / 10-foot-thick dimensions, the 10-foot floating height, the 300-foot casting range, the directed-movement-command mechanic (moves until told to stop), and the permanent duration are all preserved.

- **Numbers:** casting time is unchanged (1 action in 5e's text; note the store's movement-command action is a *separate* 2-action activity, distinct from the 1-action initial cast — the store's `system.time.value = "2"` refers to the spell's own cast, matching neither the 5e 1-action cast nor clearly distinguishing itself from the movement-command's own 2-action cost in the structured field; both actions are 2-action per the store's prose for the *movement command specifically*, while the initial cast is separately recorded as 2 actions in `system.time`). Movement rate is unchanged at base (10 feet/round) but the movement-command action cost changes from 5e's implicit 1 action to PF2e's explicit 2-action activity.
- **Content added — the Reflex save:** the DC 25 Reflex save for creatures/objects on the ground where the slab rises is entirely new; the 5e original has no such save at all — it simply states the slab rises, with no rule for what happens to anyone standing where it appears. jmnario's own notes flag this explicitly as a necessary addition, not a 5e-derived rule.
- **Content added — wall stats:** the "AC 10, Hardness 14, 300 HP per 10×10-foot section" defensive stat block is entirely new; 5e's original has no stats for the slab's durability at all (permanent + indestructible-by-default in 5e's terse text). jmnario's notes benchmark this against Wall of Stone's AC 10/Hardness 14/50 HP per section — Raise Island's HP-per-section is 6× that baseline.
- **Content added — heightening:** the rank-9 heighten (100 ft → 200 ft per side, 10 ft/round → 20 ft/round movement) is entirely new; 5e's original has no "At Higher Levels" text at all.
- **Material component:** the 5e "M (a 5-foot cube of granite, consumed by the spell)" component is dropped from the store's structured fields (`system.cost.value = ""`), though jmnario's intermediate conversion did carry it forward as "a 5-foot cube of granite (consumed)."

## Converter's notes

**Anchor:** "Wall of Stone (rank 5) — permanent stone structure; Raise Island is a mobile floating platform at rank 7"

**Archetype:** utility/terrain control (permanent floating platform)

**Balance bullets:**
- "Wall of Stone at rank 5 creates a permanent barrier; Raise Island at rank 7 creates a mobile 100×100 ft permanent floating platform — the mobility and scale justify the 2-rank difference."
- "Movement rate (10 ft/round, must be commanded) prevents the slab from being an offensive weapon that trivially crushes enemies."
- "Wall stats (Hardness 14, 300 HP per section) are above Wall of Stone (50 HP) reflecting the massive scale of a 100×100 ft slab."
- "Reflex save for creatures caught under the rising slab is necessary — without it the spell could function as an AoE damage effect at rank 7 with no save."
- "Permanent duration is appropriate for a terrain-altering effect at this scale — Wall of Stone is also permanent when fully sustained."

**Overridable:**
- "Movement rate could be increased to 30 ft/round if the GM wants a more mobile platform — this would enable offensive ram-style use."
- "The 100×100 ft size could be adjusted down to 50×50 ft for balance, with heightening unlocking larger sizes."
- "Could be reclassified as a PF2e downtime ritual if the GM prefers permanent terrain changes to require ritual-level investment."

**Checklist failures:** none.

## Similar official spells

- **Wall of Stone** (rank 5) — permanent 1-inch-thick stone wall, up to 120 ft long/20 ft high, AC 10/Hardness 14/50 HP per 10×10-foot section. The converter's own anchor and stat-block source; two ranks below Raise Island, directly confirms the Hardness-14 baseline and shows the HP-per-section scaling (50 → 300, a 6× multiplier for Raise Island's larger scale).
- **Heaving Earth** (rank 7) — Reflex save, pushes creatures in a line via a tremor wave that travels through solid surfaces. Same rank, same "ground-based kinetic force with a Reflex save" family, useful same-rank comparison for what a rank-7 earth-manipulation spell with a save typically does (single burst vs. Raise Island's sustained permanent terrain feature).
- **Earthquake** (rank 8) — mass ground-shaking effect with multiple simultaneous hazard effects (difficult terrain, status penalties, structure collapse, fissures). One rank above Raise Island; useful as an upper-bound reference for what "reshape a huge chunk of terrain" spells cost when they add active battlefield hazards rather than a static/movable platform.

## Prior astra touches

None found — no `raise-island` entries in `revisions.md` (matches the fresh baseline re-conversion exactly).

## Open flags

- The prose-described DC 25 Reflex save has no structured `system.defense` entry — the spell's only save (for creatures caught under the rising slab) is entirely unstructured text.
- `system.heightening.levels["9"]` is an empty object despite the rank-9 heighten having real mechanical content (slab size 100→200 ft, move rate 10→20 ft/round) — the mechanical substance only exists in the description-text appendix.
- `system.area` is `null` and `system.target.value` is empty for a spell whose entire function is "conjure a 100×100×10-foot object at a location" — per adapter warning #1, none of the slab's footprint is structurally represented.
- The store's cast-action field (`system.time.value = "2"`) sits alongside a prose-described *separate* 2-action movement-command activity; the relationship between the initial-cast action cost and the movement-command action cost isn't disambiguated by the structured fields — both are "2," which could read as the same action or as two independent 2-action costs depending on interpretation.
- The DC 25 Reflex save, the AC/Hardness/HP stat block, and the entire rank-9 heighten are all net-new content invented during conversion with no 5e-source basis — flagged here as the largest "added, not adapted" content block in this spell-chunk.
