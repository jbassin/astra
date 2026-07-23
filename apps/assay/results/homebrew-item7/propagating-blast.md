# Propagating Blast

## Header block

- **Rank:** 2
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual supplied in the chunk-10 triage list (ledger-routed, not quantitatively scored)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "mixed '+N' and fixed-rank heightening triggers on the same spell — Foundry heightening is one shape per spell, not structurally represented (kept as a description appendix only)"
- **Traits:** concentrate, force, kosmoturgy, manipulate (rarity: common)
- **Traditions:** arcane, divine, occult
- **Cast:** 1 action (`system.time.value = "1"`)
- **Range:** 30 feet
- **Target:** `system.target.value = ""` (empty — targeting is the whole line's creatures, described in the area/prose)
- **Area:** line, 30 feet
- **Defense:** basic Reflex save
- **Duration:** instantaneous
- **Damage:** none structurally represented (`system.damage = {}` — damage is stated only in prose, "Damage: 2d8 force")
- **Requirements:** "You are wielding or holding a melee weapon" (see Prior astra touches — this is a hand-added field)
- **Seeded from:** convertedName "Propagating Blast" / originalName "Propagating Blast" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 2nd
- **School:** Kosmoturgy (homebrew school)
- **Casting time:** 1 bonus action
- **Range:** Line, 30 feet
- **Components:** V, S, M (any melee weapon)
- **Duration:** Instantaneous
- **Classes:** Cleric, Paladin
- **Ritual:** No

> When you cast this spell, your weapon hums with violent energy. The first time you could make a melee weapon attack before the end of your current turn, you can launch a pulsing ball of force from your weapon instead. This force travels in a straight line for 30 feet, splitting space apart as it travels.
>
> Each creature within a line 5 feet wide and 30 feet long must make a Dexterity saving throw, starting from the creature closest to you. The first creature that fails takes 2d8 force damage and suffers damage and effects as though you had hit them with a successful attack using that weapon.

**At Higher Levels:**
- When you cast this spell using a spell slot of 3rd level or higher, the force damage increases by 1d8 per slot level above 2nd.
- Additionally, when you cast this spell using a spell slot of 4th level or higher, the penetrating power of the force increases. The force may continue through an additional creature for each spell level expended above 3rd.

## The conversion (canonical store)

You channel violent force through your melee weapon and launch a pulsing bolt that tears a line through space. The bolt travels in a 5-foot-wide, 30-foot-long line originating from your space, passing through all creatures in the area.

Each creature in the line must attempt a basic Reflex save. The first creature that critically fails or fails its save also suffers the effects of a successful melee Strike from the weapon used to cast this spell (apply all weapon properties, traits, and any rune effects; this does not consume an additional action). Only one such weapon-effect trigger occurs per casting, applied to the first eligible creature in the line starting from you.

Damage: 2d8 force.

**Critical Success** The creature takes no damage.
**Success** The creature takes half damage.
**Failure** The creature takes full damage. If it is the first failing creature in the line, it also suffers the effects of a successful melee Strike from the casting weapon.
**Critical Failure** The creature takes double damage. If it is the first failing creature in the line, it also suffers the effects of a successful melee Strike from the casting weapon.

---

**Heightened (+1)** The force damage increases by 1d8.
**Heightened (4th)** The weapon-effect trigger can apply to the first two failing creatures in the line rather than only one.
**Heightened (6th)** The weapon-effect trigger applies to the first three failing creatures in the line.

**Structured-field disagreement:** `system.damage` is an empty object even though the prose has an explicit "Damage: 2d8 force" line — the damage is not structurally represented at all, only stated in text. `system.target.value` is empty since targeting is entirely area-driven (the line).

## What changed, plain English

The weapon-channeled force-bolt-in-a-line concept, the 30-foot line / 5-foot width, the basic-save-per-creature structure, the "first failing creature also eats a weapon Strike's effects" rider, and the 2d8 base force damage are all preserved.

- **Numbers:** casting time changes from 5e's bonus action to PF2e's 1 action (a 1-action spell is the closest PF2e mapping for a bonus-action effect, and is explicitly weaker than a 2-action spell per PF2e convention). Base damage (2d8 force) is unchanged. Range/area (30-foot line) is unchanged.
- **Structure:** 5e's Dexterity save becomes PF2e basic Reflex — but PF2e's basic-save structure means *every* creature in the line now takes damage (scaled by degree of success), whereas 5e's original text describes an odd, narrower rule: only "the first creature that fails" takes damage at all (later creatures in the line who also fail apparently take nothing per the RAW 5e text as excerpted, though this reads as likely a 5e-homebrew wording quirk rather than intended design). The store's PF2e version is functionally broader — a full-line basic-Reflex AoE — with the weapon-Strike rider narrowed back down to "only the first eligible failure," which is the one piece of 5e's "only the first creature" restriction that survives.
- **Heightening restructured:** 5e's two separate upcast clauses (slot 3+: +1d8 force; slot 4+: force "continues through an additional creature" per level above 3rd) become three separate PF2e heighten triggers — a `+1` interval rule (+1d8 force per rank), plus two fixed-rank triggers at 4th and 6th that change how many of the first *failing* creatures get the weapon-Strike rider (2 at rank 4, 3 at rank 6). This reframes 5e's "force keeps traveling through more bodies" penetration mechanic as "more creatures get the weapon-rider," which is a different (though related) axis — 5e's upcast makes the line hit more targets with base force damage as it "continues through" them; the store's upcast instead keeps the AoE fixed (already hits everyone via basic Reflex) and extends only the weapon-Strike bonus effect to more of the failing creatures.
- **Cost/component:** 5e's "M (any melee weapon)" material component becomes the store's `requirements` field text ("You are wielding or holding a melee weapon") rather than a `cost` field — see Prior astra touches, this was a hand-edit after initial seeding (baseline conversion had it empty).

## Converter's notes

**Anchor:** "Lightning Bolt (rank 3) — 120-ft line, basic Reflex, 4d12 electricity; Propagating Blast is rank 2, 30-ft line, 2d8 force, weaker but adds weapon-strike rider"

**Archetype:** area damage (line, basic Reflex) + weapon rider

**Balance bullets:**
- "2d8 force at rank 2 on a 30-ft basic Reflex line is below the rank-2 AoE norm (4d6 / ~14 avg). Force pricing at 0.80× means 2d8 (~9) effectively costs like 2d8/0.80 ≈ 11.25, still below 4d6. This is correct: the weapon-strike rider compensates."
- "Weapon-strike rider on first failure is the spell's signature flourish — it extends weapon rune effects, damage types, and traits into a ranged line, which has no published precedent at rank 2."
- "1-action cast (from 5e bonus action): strictly weaker than a 2-action spell per PF2e rules — this is exactly the constraint for 1-action spells. The reduced damage vs a 2-action fireball-pattern spell is correct."
- "Heightening +1d8/+1 rank (slower than AoE +2d6) justified by force pricing + weapon-rider: the spell has two outputs per cast, so the damage increment is slower."
- "Line shape (30 ft) is within rank-2 norms (benchmark shows rank 2 lines at 30-60 ft)."

**Overridable:**
- "Could raise to 3d8 base if the weapon-strike rider is considered a rider cost (subtract ~1 damage row) rather than an additive feature — the GM's call on how much the rider is worth."
- "Could add the weapon's damage type as an additional trait on the spell at cast time rather than just the force damage — thematically richer but complicates the trait line dynamically."

**Checklist failures:** none.

## Similar official spells

- **Inner Radiance Torrent** (rank 2) — 4d4 force, basic Reflex, 60-foot line (scalable by action count), blinds on critical failure. Same rank, same damage type, same basic-Reflex-line shape; a very close direct comparable for the base-damage math the balance bullets are working from (4d4 ≈ 10 avg vs Propagating Blast's 2d8 ≈ 9 avg, with Inner Radiance Torrent's blind rider vs Propagating Blast's weapon-Strike rider).
- **Lightning Bolt** (rank 3) — 4d12 electricity, basic Reflex, 120-foot line. The converter's own stated anchor; one rank up, shows what a "pure damage, no rider" line spell costs at the next tier for contrast against Propagating Blast's lower damage + weapon-rider trade.

## Prior astra touches

**`propagating-blast`** has one recorded deviation in `revisions.md`:

- `requirements: '' -> 'You are wielding or holding a melee weapon'`

Per the file's documented diff direction (baseline-fresh-reconversion value → current hand-edited store value), this means the fresh re-conversion of the vendored baseline produces an empty `requirements` field, while the current store has this requirement text added by hand — a targeted astra edit that formalizes the 5e material-component ("any melee weapon") into a PF2e `requirements` gate rather than a `cost` field.

## Open flags

- `system.damage` is a structurally empty object despite the description prose stating "Damage: 2d8 force" plainly — the spell's core damage value exists only as free text, not as a parseable damage entry, which is unusual relative to sibling spells in this batch (e.g., Planar Pyre, Planar Shield both have populated `system.damage`).
- The 5e source text's "only the first creature that fails takes damage" line reads ambiguously (as excerpted, it appears to gate *all* damage, not just the weapon rider, behind being the first failure) — the store's conversion resolves this ambiguity by giving basic-Reflex damage to every creature in the line and reserving only the weapon-Strike rider for the first failure; this resolution is not explicitly called out as an ambiguity-resolution in jmnario's `changedElements`, though it is functionally described there ("PF2e basic Reflex affects all creatures; the weapon-rider still only triggers on the first eligible failure").
- Heightening mixes a `+1` interval trigger with two fixed-rank triggers (4th, 6th) on the same spell, per the adapter warning — not structurally representable in the current Foundry heightening schema; `system.heightening` is absent entirely and all three heighten rules live only in the description-text appendix.
