# Festering Slick

## Header block

- **Rank:** 3 · **Routing:** `quantitative` · **Pool reason:** reclassified-out
- **Current assay line:** verdict = "-1.78 ranks COLD" · rankRange = none (quantitative kind, no comparables range) · residualRanks = -1.7795447568271219 (queue.json/scores.json: `budget≈27.97`, `ev=10.5`, `actionBucket="1"`)
- **Adapter warnings:** "mixed '+N' and fixed-rank heightening triggers on the same spell — Foundry heightening is one shape per spell, not structurally represented (kept as a description appendix only)"
- **Traits:** antillurgy, concentrate, void · **Rarity:** common
- **Traditions:** arcane, divine, occult
- **Cast:** 1 action · **Range:** touch · **Target:** 1 melee weapon you are holding
- **Defense:** none (`system.defense = null`)
- **Duration:** sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)
- **Damage entry:** `system.damage.0` = 3d6 void, kind `damage`, no `applyMod`, no `category`

## The 5e original

- **Name:** Festering Slick · **Source:** tfc (homebrew) · **Level:** 3 · **School:** antillurgy
- **Casting time:** 1 bonus action
- **Range:** touch (point)
- **Components:** V only (S: false, M: null)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Sorcerer, Warlock, Wizard

> You touch a melee weapon and imbue it with slick, antillurgic energy. The first time that weapon successfully hits during this spell's duration, the slick creeps off the weapon and into its target's wounds. The attack deals an extra 3d6 necrotic damage to the target. Additionally its flesh festers and refuses to repair. Until the spell ends, the target cannot regain hit points.

**At Higher Levels:** "When you cast this spell using a spell slot of 4th level or higher, the necrotic damage increases by 1d6 per spell slot level above 3rd" (a `@scaledice` 3d6|3-9|1d6 tag in source).

## The conversion (canonical store)

You speak a word of antillurgic power and coat a melee weapon you are holding with a slick of festering void energy. For the duration of the spell, the weapon has the following property:

**On the first time the weapon hits a living creature**, the slick creeps from the blade into the wound. The creature takes an additional 3d6 void damage. Additionally, it becomes afflicted with festering corruption — it cannot regain Hit Points (from any source: spells, abilities, potions, natural healing) until the start of your next turn after the spell ends. Once the slick has triggered against a creature, it cannot trigger against any creature again (the slick is expended).

After the slick triggers, the spell continues to suppress healing on the affected creature until the duration expires, even if the weapon is dropped or you stop sustaining the spell. You can sustain the spell to maintain the healing suppression; if you stop sustaining, the healing suppression on the affected creature ends immediately.

---

**Heightened (+1)** The void damage on trigger increases by 1d6.

**Heightened (5th)** The slick can trigger twice (once per hit, up to two separate creatures) before it is expended.

No `@UUID` references. No `successTiers`/degree-of-success structure (no save at all — this is a no-save weapon-delivery damage rider, matching the 5e original). The structured `system.damage.0` field (3d6 void) matches the prose exactly; `system.heightening` key is entirely absent from the store (no scaffold at all — see Open Flags), despite both a `+1`-per-rank line and a `5th`-fixed-rank line appearing in the description appendix.

## What changed, plain English

- **Damage type:** 5e necrotic → PF2e void (standard Remaster equivalence for life-draining/anti-life damage).
- **Action cost:** 5e 1 bonus action → PF2e 1 action to cast (weaker economically than a 2-action spell, consistent with a weapon-prime effect rather than a direct blast).
- **Targeting language:** 5e "touch a melee weapon" (no living-creature qualifier on the hit trigger) → PF2e explicitly requires the trigger to be against "a living creature." This is an added qualifier with no 5e-text basis (the 5e original just says "the first time that weapon successfully hits" — no living/undead distinction).
- **Healing suppression, added mechanical texture:** 5e says simply "until the spell ends, the target cannot regain hit points" (a blanket duration-bound suppression). The conversion adds two new clauses with no 5e basis: (1) suppression extends "until the start of your next turn after the spell ends" (a grace-period beyond the spell's nominal end), and (2) suppression is tied to Sustain — stopping Sustain ends the suppression early even if the spell's duration hasn't expired. This is a structural rework of when healing suppression turns off, not present in the source text.
- **Heightening structure:** 5e has one linear at-higher-levels clause (+1d6 per slot level above 3rd, i.e., every casting level up). The conversion splits this into two different heightening shapes on the same spell: a linear "+1 rank → +1d6" line (matching the 5e cadence) AND a separate fixed-rank-5 clause letting the slick trigger twice instead of once — a wholly new capability with no 5e basis (the 5e version never gains a second trigger, only more damage on the single trigger).
- **Traditions:** 5e class list (Sorcerer/Warlock/Wizard) → arcane + divine + occult (per converter's notes, matter+mind / spirit+life / mind+spirit domains for void/antillurgy).

## Converter's notes

- **Anchor:** "Acid Grip (rank 2, non-basic, 2d8 + 1d6 persistent acid) — both are single-target condition-rider spells; Festering Slick is rank 3 and adds healing suppression"
- **Archetype:** weapon buff / conditional debuff (void + healing suppression)
- **Balance bullets:**
  - "3d6 void + healing suppression is priced below Fireball's 6d6 baseline: the void damage (3d6 ≈ 10.5 average) plus healing suppression equals roughly 2 separate effects. The damage is ~2 rows below the rank-3 AoE baseline, which is the correct adjustment for a strong condition rider."
  - "1-action cast (from 5e bonus action) is correctly weaker than 2-action: the spell primes a weapon rather than directly dealing damage. The one-trigger limit means total output is bounded."
  - "Sustained requirement on the healing-suppression rider gives a meaningful 'keep concentrating or the target can heal' decision each round, which is the critical action-economy tax."
  - "Void pricing (1.10×) and the no-save weapon-delivery model make the damage feel appropriately punishing on the one hit while not being area-of-effect."
  - "Heightening +1d6/+1 rank is slower than AoE (+2d6) because the single-target weapon model limits total output."
- **Overridable:**
  - "The healing suppression duration 'ends when you stop sustaining' could instead be 'lasts until end of your next turn after sustain ends' — gives the caster a 1-round grace period to stop sustaining without the target immediately healing."
  - "Could add a Fortitude save for the struck target to resist the healing suppression (not the damage) — this would weaken the spell but add the standard save structure for a condition effect."
- **Checklist failures:** none recorded.

## Similar official spells

- **Bone Flense (rank 3)** — imbues a weapon; each Strike (repeatable, not one-shot) against a creature with a skeleton/exoskeleton adds 1d6 persistent bleed and unlocks a reaction. Same "weapon-imbue rider" archetype at the same rank, but Bone Flense procs on every qualifying hit rather than once, and its rider (1d6 persistent bleed) is much smaller than Festering Slick's 3d6 flat + indefinite healing-suppression.
- **Conductive Weapon (rank 1)** — turns the held weapon into a permanent +1 shock weapon (1d6 electricity, 1d12 vs. metal targets) for the duration, unlimited triggers, no save. Two ranks below Festering Slick; illustrates the low end of the "weapon rune-like buff" budget with no rider beyond flat extra damage.
- **Fireball (rank 3)** — the converter's own baseline for the rank-3 damage budget: 6d6 fire, no save-immune single target restriction, area, no condition rider. Direct comparison point for the "3d6 + healing suppression is ~half of Fireball's dice" bullet in the balance notes.
- **Weapon Storm (rank 4)** — a weapon-based area Strike (four weapon dice in a cone/emanation), one rank above; shows how a weapon-fiction spell scales when it stays purely offensive rather than adding a rider like Festering Slick's healing suppression.

## Prior astra touches

None. `revisions.md` has no entry for Festering Slick.

## Open flags

- `system.heightening` is entirely absent (no key at all) despite the description carrying both a "Heightened (+1)" line and a "Heightened (5th)" line — two different heightening shapes coexist only in prose, with zero structured representation (not even an empty scaffold), consistent with the adapter warning.
- The conversion's "living creature" qualifier on the trigger condition has no 5e-text basis — the 5e original's trigger is "the first time that weapon successfully hits," with no living/undead distinction; the added qualifier narrows applicability (e.g., against constructs/undead) without an explicit design note addressing it.
- The healing-suppression-tied-to-Sustain mechanic (early termination if you stop sustaining, extension to "start of your next turn after the spell ends" if you do sustain) is new structure not present in the 5e source and not called out in `balanceBullets`, only in the `overridable` list as something that *could* be changed — i.e., the shipped text already contains the overridable-listed variant rather than the plain "ends when spell ends" version described in `preservedElements`.
- The rank-5 "trigger twice" heightening is a capability add (not a numeric damage bump) layered onto a spell whose 5e original only ever gains more damage per upcast — no discussion of this specific design choice appears in the converter's notes.

## Options & staff lean (enrichment, 2026-07-23)

The −1.78 COLD decomposes cleanly: one-trigger boundedness + the healing-suppression
rider ≈ the GM Core −1-rank rider exchange, i.e. the §4a weapon-rider artifact — pricing
is fine. The shipped sustain-tied suppression (stop sustaining → target can heal) is a
good action-economy tax; keep it even though it's technically the overridable variant.

The real delta: the conversion added a **"living creature" qualifier** to the trigger
with no 5e basis. It quietly kills the spell's best tactical use — suppressing an
undead's void/negative healing — and narrows it against constructs, without a design
note anywhere.

- **A. Record artifact + drop the living-creature qualifier** — restores 5e's
  any-target trigger; the fiction ("flesh festers") reads fine as corrupting energy on
  any body. Text-only.
- **B. Keep as-is** — accept the narrowing as flavor-driven.
- **C. Converter's Fort-save overridable** — an unmotivated nerf; skip.

**Lean: A.**
