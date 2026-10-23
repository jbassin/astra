# Phlogistic Shield

## Header block

- **Rank:** 4
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual supplied in the chunk-10 triage list (ledger-routed utility item; not quantitatively scored in the provided data)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "area text not structurally parseable, left unmapped (effective-target classification falls back to the description's own target-count heuristic): '10-foot-wide, 10-foot-tall wall section (up to 3 contiguous sections forming a shape)'"
  2. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** antillurgy, concentrate, force, manipulate (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** 30 feet
- **Target:** `system.target.value = ""` (empty; targeting is prose-only — see "What changed")
- **Area:** `system.area = null` (structurally unset; adapter warning #1 explains why)
- **Defense:** `system.defense = null` (no save)
- **Duration:** sustained, "1 minute"
- **Damage:** none (`system.damage = {}`)
- **Seeded from:** convertedName "Phlogistic Shield" / originalName "Phlogistic Shield" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 4th
- **School:** Antillurgy (homebrew school)
- **Casting time:** 1 action
- **Range:** Point, 30 feet
- **Components:** V, S, M (a glass lens)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Sorcerer, Warlock, Wizard
- **Ritual:** No

> You conjure a thin lens of gaseous phlogiston, 10 feet wide, within 30 feet of you. The lens protects those behind it from magic; any spell of 4th level or lower that requires a clear path through the lens is stopped entirely. The lens doesn't interfere with spells you cast, and it doesn't block area effects. For example, a fireball couldn't be aimed directly through the lens, but if it was set off immediately in front of the lens, the blast would still affect people on the other side of the lens and within the fireball's radius. You can spend a bonus action to move the lens to any point within 30 feet of you.

**At Higher Levels:** If phlogistic shield is cast using a spell slot higher than 4th level, the lens protects against spells of equal or lower level than the spell slot you used.

## The conversion (canonical store)

You conjure a shimmering, lens-shaped barrier of condensed phlogiston within 30 feet of you. The lens is 10 feet wide and 10 feet tall. Any spell of rank 4 or lower that is targeted directly through the lens (requiring line of effect through the lens to reach its target) is completely blocked and negated — the spell is lost and its slot is expended normally. Spells you cast are not blocked by your own Phlogistic Shield.

Area effects are not blocked: if a spell's area originates outside the lens and overlaps with the area on the other side, the overlapping area still affects creatures normally. The lens only blocks spells that have a point of origin or target on one side and a target or trajectory through the lens.

As a single action (which has the concentrate trait), you can move the lens to any unoccupied space within 30 feet of you.

---

**Heightened (+1)** The maximum rank of spells blocked increases by 1 (rank 5 at 5th, rank 6 at 6th, and so on).

**Structured-field disagreement:** the prose describes a physical 10-ft-wide × 10-ft-tall lens (and jmnario's intermediate version further specified "up to 3 contiguous sections forming a shape" in its `area` string), but `system.area` is `null` and `system.target.value` is `""` in the store — none of this shape/size data is structurally represented, only in prose (per adapter warning #1).

## What changed, plain English

The core spell-blocking-lens concept, its 10-foot width, its 30-foot placement/movement range, the "doesn't block your own spells" carve-out, and the "doesn't block area effects" carve-out are all preserved essentially verbatim from the 5e text into the store's prose.

- **Numbers:** 5e's "4th level or lower" blocking threshold becomes "rank 4 or lower" (1:1 level→rank mapping). 5e's bonus-action reposition becomes a PF2e single (concentrate) action. Concentration up to 1 minute becomes sustained up to 1 minute (direct PF2e equivalent).
- **Structure:** 5e's upcast rule ("protects against spells of equal or lower level than the slot used") becomes a PF2e heighten-by-rank rule (+1 blocked rank per +1 rank heightened, i.e., rank 5 at 5th, rank 6 at 6th). No save either version — the lens either blocks or doesn't. The store adds a height dimension not stated in 5e ("10 feet wide" only in 5e; the store specifies "10 feet wide and 10 feet tall"), formalizing the lens into a 2D wall-like shape.
- **Content added:** the "targeted directly through the lens (requiring line of effect...)" clause and the "point of origin or target on one side and a target or trajectory through the lens" clarifying sentence are new precision-language not present in the terser 5e text — they don't change the spell's function, they sharpen the ruling for edge cases (a common PF2e-conversion move for a rules-heavy 5e ability).
- **Content dropped:** nothing substantive; the "For example, a fireball couldn't be aimed directly through the lens..." illustrative example from 5e is dropped from the store prose (compressed into the general area-effects carve-out sentence instead).
- **Material component:** the 5e "M (a glass lens)" component is dropped entirely — the store has no cost/material field populated (`system.cost.value = ""`), and jmnario's intermediate version listed a non-consumed glass lens cost that never made it into the store.

## Converter's notes

**Anchor:** "no clean analog — closest is Globe of Invulnerability (rank 4 in 5e; PF2e has no exact equivalent); Phlogistic Shield is a mobile anti-spell barrier unique in PF2e homebrew"

**Archetype:** abjuration/control

**Balance bullets:**
- "Blocking spells of rank ≤ its own rank (rank 4 at base) is the core mechanic; the mobility (1-action concentrate to reposition) is the spell's value proposition over a static wall"
- "Does not block area effects (fireball can still splash through) — this is the critical limitation that prevents Phlogistic Shield from being a 'make spells irrelevant' button"
- "Does not block the caster's own spells — necessary to prevent self-counter; this is in the 5e text and preserved"
- "Sustained up to 1 minute (not permanent) caps the anti-spell zone to combat duration"

**Overridable:**
- "'+1 blocked rank per +1 rank heightened' is a linear scaling choice; GM may prefer a step-function (e.g., only increases at rank 6 and rank 8) to prevent a rank 10 cast from blocking everything"
- "The physical dimensions (10×10 lens section) are derived from the 5e '10 feet wide' description; GM may want to define a more complex geometry (e.g., a hemisphere or true wall shape)"

**Checklist failures:** none.

## Similar official spells

- **Dispelling Globe** (rank 4) — creates an immobile globe around the caster that counteracts (Dispel Magic 1 rank lower) any spell whose area/target crosses into the globe; the closest official structural analog (rank-4 anti-spell field), but it counteracts probabilistically rather than auto-blocking, and it's self-centered/immobile rather than a placeable, mobile lens.
- **Antimagic Field** (rank 8) — flatly suppresses all magic (spells can't penetrate, items shut off, no one inside can cast) in an area; shows what a true no-save, no-roll magic-negation effect costs in PF2e (rank 8) versus Phlogistic Shield's much narrower rank-4 version (only blocks spells ≤ its own rank, only through a fixed lens, not an aura).
- **Spell Immunity** (rank 4) — counteracts (again probabilistically) a single named spell against a single warded creature; same rank, same "ward against magic via counteract" design pattern, but single-target/single-spell rather than area/all-spells-below-rank.

## Prior astra touches

None found — no `phlogistic-shield` entries in `revisions.md` (spell matches the fresh baseline re-conversion exactly; not among the 52 hand-edited deviations).

## Open flags

- No structural `area`/`target` field represents the lens's 10×10 shape or its placement mechanic — both adapter warnings flag this; the spell's core "wall section" geometry lives only in prose.
- `system.cost.value` is empty even though the 5e original had a material component (a glass lens) and jmnario's intermediate conversion carried it forward as "a glass lens (not consumed)" — the store drops this without an explicit note.
- Heightening is text-only (description appendix), not structurally represented in `system.heightening`, per adapter warning #2 — the store has no `heightening` key at all for this spell (contrast with e.g. Preserve Foodstuffs/Raise Island, which do have a `heightening.levels` structured field for their fixed-rank triggers).
