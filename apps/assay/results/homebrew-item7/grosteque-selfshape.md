# Grosteque Selfshape

## Header block

- **Rank:** 4 (store `system.level.value = 4`)
- **Routing:** quantitative
- **Pool reason:** reclassified-out
- **Current assay line:** verdict **−2.85 ranks COLD**; residual **−2.85 ranks**
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt (custom trait), manipulate, morph — rarity common
- **Traditions:** primal
- **Cast:** `2` actions (system.time.value = "2")
- **Range:** self
- **Targets:** you
- **Defense:** none
- **Duration:** "1 minute", `sustained: true`
- **Structured damage field:** `system.damage["0"]` = `2d6` untyped, kind `damage`, `applyMod: false`, no category/materials
- **Heightening:** fixed-rank, at 6th

## The 5e original

- **Level:** 4 · **School:** gestalt (source: `tfc`)
- **Casting time:** 1 action
- **Range:** self
- **Components:** V, S (no material)
- **Duration:** up to 1 minute, concentration
- **Classes:** Druid

**Entries:**

> You channel your wildshaping energy into your body, distorting and enlarging your normal form past its natural limits. Your size increases to Large and your equipment grows to suit your expanded form. If there is insufficient space, you grow as large as you safely can. While in this form, your weapon attacks inflict an additional {@damage 2d8} damage of their normal type and you gain temporary hit points equal to twice your spellcasting modifier at the start of each of your turns. You cannot wildshape while this spell is active.

No `entriesHigherLevel` block in the 5e original — the 5e version has no upcast/heightening text at all.

## The conversion (canonical store)

> You funnel your gestalt wildshaping energy outward rather than inward, distorting and massively enlarging your form beyond its natural limits. Your size becomes Large (or as large as the available space safely allows if insufficient room exists). Your equipment and worn items grow proportionally with you. You gain 15 temporary hit points when you Cast the Spell, and you gain 5 temporary hit points at the start of each of your turns while this spell is sustained (these do not stack with the initial grant; only the highest current value applies).
>
> While in this form, your unarmed Strikes and weapon Strikes deal an additional 2d6 damage of the damage type appropriate to the weapon or unarmed attack. Your reach increases by 5 feet. You are unable to use the Wildshape action or cast polymorph spells while Grosteque Selfshape is active.
>
> **Heightened (6th)** Your size becomes Huge (or as large as space allows), the additional Strike damage increases to 3d6, you gain 20 temporary hit points on cast, and 10 temporary hit points at the start of each of your turns.

The structured damage field (`2d6` untyped) captures only the base-rank bonus-Strike-damage number; the prose's temp-HP figures (15 on cast / 5/turn) and the rank-6 heightened numbers are not present in any structured field — text-only.

## What changed, plain English

- **Damage die:** 5e's flat `2d8` bonus weapon-attack damage becomes `2d6` in the store — a smaller die (2d6 avg 7 vs 2d8 avg 9), not a straight port.
- **Temp HP source:** 5e ties per-turn temp HP to "twice your spellcasting modifier" (scales with the caster's own ability score, roughly +8 to +12 at the levels this spell is available). The store replaces this with a flat, non-scaling 15 temp HP on cast + 5/turn (non-stacking, highest-value-only) — a structural swap from ability-scaling to a fixed rank-based number.
- **Reach:** the store ADDS "your reach increases by 5 feet," which has no 5e basis at all — the 5e entries never mention reach.
- **Cast time / duration framing:** 5e is 1 action + concentration up to 1 minute; the store is 2 actions + `sustained` up to 1 minute (PF2e's structural analog of concentration, but at 2 actions rather than a 1:1 action-cost port).
- **Restriction scope:** 5e forbids Wildshape while active; the store extends this to ALSO forbid casting polymorph spells while active — an ADDED restriction beyond the 5e text's single "cannot wildshape" clause.
- **Heightening:** the 5e original has NO upcast/heightening text whatsoever. The store ADDS an entire rank-6 heightened tier (size to Huge, damage to 3d6, temp HP to 20 on cast / 10 per turn) with no 5e basis — this is new content invented for the PF2e conversion, not carried over from anywhere in the source.
- **Traits:** 5e school "gestalt" (Druid-only class list) becomes traditions `primal` in the store, plus added PF2e traits (`concentrate`, `manipulate`, `morph`) that have no direct 5e equivalent (5e's V/S components map to concentrate/manipulate by convention; `morph` is a PF2e-native trait choice with no 5e counterpart).

## Converter's notes

- **Anchor:** "Animal Form (rank 4 tier: Large, +16 atk mod, +9 bonus damage, 15 temp HP) — Grosteque Selfshape is a non-standard morph that preserves the caster's own attacks rather than replacing them"
- **Archetype:** polymorph/self-buff
- **Balance bullets:**
  - "Morph (not polymorph) trait: the spell adds +2d6 to existing attacks rather than replacing attack/AC values; this is the critical design distinction — polymorph would suppress the caster's own built-up attack bonuses"
  - "15 temp HP on cast + 5 per turn is equivalent to ~20 sustained temp HP at rank 4 (target: 5×rank = 20 at rank 4); within range"
  - "+2d6 additional damage to all weapon/unarmed attacks at rank 4 is significant but gated behind the 'cannot wildshape' restriction, which is meaningful for Druid players"
  - "Sustained duration (not 1 minute flat) creates action economy cost: must spend 1 action per round to maintain, preventing this from being a free always-on damage boost"
- **Overridable:**
  - "Reach increase by 5 feet is a design addition (Large creatures normally get +5 ft reach in PF2e); GM may prefer to gate this behind the spell's Large-size increase only if the caster's native size is Medium"
  - "+5 temp HP per turn: GM may prefer the 5e's 'twice spellcasting modifier' formula instead for more variability"
- **Checklist failures:** none recorded.

## Similar official spells

- **Enlarge (rank 2)** — the closest official baseline for "grow to Large, gain +2 status bonus to melee damage, +5 ft reach, Clumsy 1 as a drawback." Two ranks below Grosteque Selfshape but shares the size+reach+melee-damage-bonus shape; notably includes a real drawback (Clumsy 1) that Grosteque Selfshape's prose does not.
- **Moon Frenzy (rank 5)** — same `morph` trait (not `polymorph`), grants 5 temp HP plus new unarmed natural attacks (fangs 2d8, claws 2d6) layered onto the target's existing kit rather than replacing it, at one rank above Grosteque Selfshape.
- **Dinosaur Form (rank 4)** — same rank, but a full `polymorph` battle-form spell (replaces attacks/AC/statistics entirely rather than adding a rider bonus) — useful as a contrast case for what a "real" rank-4 self-transformation package looks like when it fully replaces the caster's kit instead of layering onto it.

## Prior astra touches

None found — `Grosteque Selfshape` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly).

## Open flags

- The store's rank-6 heightened tier (Huge size, 3d6 damage, 20/10 temp HP) has no 5e source text at all — it is new content invented during conversion, not ported from anywhere in the 5e original.
- The `gestalt` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set.
- 5e's ability-modifier-scaling temp HP ("twice your spellcasting modifier") was replaced with a flat non-scaling number; this is a structural design swap, not a straight numeric port.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose.
