# Extra Motivation

## Header block

- **Rank:** 9 (store: `system.level.value = 9`)
- **Routing:** ledger:utility — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "excluded 1 self-directed damage dice from EV (4d6 void) — a cost paid by the caster, not the spell's output"
- **Traits:** concentrate, fortune, manipulate, mercuromancy
- **Traditions:** arcane, divine, occult, primal
- **Rarity:** uncommon
- **Cast:** time.value = "2" (2-action spell)
- **Range:** self
- **Target:** "you"
- **Defense:** `system.defense = null` (no save)
- **Duration:** "" (instantaneous, not sustained)
- **Damage:** `system.damage = {}` — empty (the 4d6 void self-damage exists only in prose; see adapter warning and Open Flags)
- **Heightening:** no `heightening` key in the store JSON (consistent — this is a non-scaling rank-9 spell with no heighten text either)

## The 5e original

- **Level:** 9th
- **School:** Mercuromancy
- **Casting time:** 1 action
- **Range:** Self
- **Components:** V, S (no material)
- **Duration:** Instantaneous
- **Classes:** Bard, Druid, Seeker, Sorcerer, Warlock, Wizard

> You ask fate to grant you just a little more energy, and your wish is granted. You regain 4 spell slots of 5th level or lower.
>
> When you cast this spell, you can choose take more than is offered, rejuvenating yourself even more greatly for a price. You may willingly take necrotic damage equal to half your current hit points. This damage ignores both damage resistance and damage immunity. If you do so, you regain the expended uses of up to three abilities which normally recover when you take a rest.
>
> Once you cast this spell, you cannot cast this spell again for 24 hours, even if you have an available 9th level spell slot.

No entriesHigherLevel; the 5e original has no upcast/heightening text.

## The conversion (canonical store)

> You bend fate for a final surge of magical energy, recovering expended spells and resources. You recover up to 3 expended spell slots of rank 5 or lower. You may immediately prepare them as if you had just completed your daily preparations for those specific slots (the spells in those slots must be spells you have already prepared or have in your repertoire).
>
> **Greater Surge (optional, decided at casting):** You may choose to also deal 4d6 void damage to yourself (this damage ignores resistance and immunity and cannot be reduced in any way). If you do, you additionally recover the expended uses of up to 2 class abilities that normally recharge on a daily rest (choose abilities you have used since your last daily preparation). You cannot benefit from Greater Surge if this casting would reduce you below 1 HP (the offer evaporates).
>
> Once you Cast this Spell, you cannot Cast it again until your next daily preparation, even if you have an available rank-9 slot.

No `@UUID` links present. No success-tier structure (no save, so no degrees of success) — consistent with `system.defense = null`.

## What changed, plain English

The core resource-recovery fiction is preserved: self-targeted, instantaneous, recovers expended spell slots, an optional "greater" mode that costs self-damage (ignoring resistance/immunity) in exchange for recovering class-ability uses, and a once-per-day cooldown gate.

Numbers changed:
- 5e "regain 4 spell slots of 5th level or lower" → PF2e "recover up to 3 expended spell slots of rank 5 or lower" (4 → 3).
- 5e "necrotic damage equal to half your current hit points" (a **percentage-of-current-HP** cost, scaling with the caster's remaining HP) → PF2e "4d6 void damage" (a **fixed dice** cost, average ~14, not tied to current HP at all). This is a structurally different cost model, not just a relabeling — half-current-HP scales with the caster's health total and gets *more* punishing as HP drops (approaching a death spiral), while 4d6 is flat regardless of current HP.
- 5e "recover expended uses of up to three abilities" → PF2e "up to 2 class abilities" (3 → 2).
- 5e 24-hour cooldown → PF2e "until your next daily preparation" (functionally similar, PF2e's native cooldown idiom).
- 5e necrotic damage type → PF2e void (standard 5e-necrotic → PF2e-void type mapping).

Structure/mechanics:
- 5e binary "choose to take more damage" clause → PF2e adds an explicit safety clause with no 5e basis: "You cannot benefit from Greater Surge if this casting would reduce you below 1 HP (the offer evaporates)." The 5e original has no such floor — a low-HP caster taking half-current-HP necrotic damage could in principle drop themselves further under 5e's text (5e doesn't state a 1-HP floor either).
- Traits added with no direct 5e basis: fortune, mercuromancy (school-as-trait replacing the 5e "Mercuromancy" school field), concentrate/manipulate. Traditions arcane+divine+occult+primal replace the 5e Bard/Druid/Seeker/Sorcerer/Warlock/Wizard class list. Uncommon rarity is new (5e original has no rarity concept).
- `system.damage = {}` is empty despite the 4d6 void self-damage appearing in prose — per the adapter warning, self-directed cost damage is deliberately excluded from the structured damage field (it's a cost paid by the caster, not the spell's offensive output).

## Converter's notes

- **Anchor:** "no close analog — unique resource-recovery spell; nearest published effect is Quickened Casting or class feat abilities; designed from the rank-9 utility budget"
- **Archetype:** utility/buff — self resource recovery
- **Balance bullets:**
  - "3 spell slots rank 5 or lower (down from 5e's 4) keeps this from being too close to a full long rest; at rank 9, a typical wizard has 3 rank-5 slots total — recovering all three is significant but bounded by the 'rank 5 or lower' cap"
  - "Greater Surge void self-damage (4d6, ignores immunity) is a meaningful cost: at level 17 a full caster has ~200 HP, so 4d6 (~14 avg) is ~7% of max HP — symbolic cost rather than prohibitive"
  - "Once-per-daily-prep restriction is the hard cap — cannot be recovered by recovering other resources (prevents infinite loops)"
  - "Uncommon rarity gates this from being a standard pick; GMs who want it freely available can lower to common"
- **Overridable:**
  - "Slot count: 5e recovered 4 slots; PF2e version recovers 3; GM may restore to 4 if they prefer full fidelity"
  - "Greater Surge class ability count: 5e recovered 3 class abilities; PF2e version recovers 2; GM may restore to 3 if they prefer"
  - "Void vs necrotic self-damage: 5e necrotic → PF2e void per standard conversion; GM may use untyped self-damage if void flavor feels wrong for a luck/fate spell"
- **Checklist failures:**
  - "No published PF2e spell recovers expended spell slots mid-combat; this is a bespoke resource-recovery mechanic. The 'once per daily prep' restriction is the primary balance lever and must not be removed."

## Similar official spells

- **Divine Inspiration (rank 8)** — a direct official analog the converter's own notes did not surface: touch a willing creature, it recovers one 6th-rank-or-lower spell it already cast today (or a spontaneous slot of the same cap), or regains its full Focus Pool. One rank below Extra Motivation, single spell/slot recovery only (vs. Extra Motivation's up to 3 slots), no self-damage option, and it can target *another* creature rather than only self.
- **Shock to the System (rank 7)** — resource-recovery-adjacent: revives a recent corpse or heals a living target 8d8 HP and grants a temporary Quickened buff with a bonus spell cast; different axis (healing/combat-buff, not spell-slot recovery) but a useful rank-7 scale reference for "big self/ally payoff spell."
- No exact "recover multiple expended spell slots at will, self-targeted" analog exists in the sampled official spell/ritual/focus folders — this partially contradicts the converter's own "no close analog" note, since Divine Inspiration (rank 8) is a legitimate single-slot-recovery precedent.

No scorer comparables were supplied for this spell in the routing brief (routed via ledger, not the comparables pool).

## Prior astra touches

None found in `revisions.md` — Extra Motivation matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- `system.damage = {}` is empty while the description prose specifies "4d6 void damage" as an optional self-cost; the adapter warning documents this exclusion is deliberate policy (self-directed cost damage isn't counted as spell output), but the structured field carries no trace of the 4d6 figure at all.
- The 5e cost model ("necrotic damage equal to half your current hit points," a percentage-of-current-HP cost) was replaced with a **flat 4d6 void** cost in the conversion — a structurally different scaling behavior (percentage-of-current-HP vs. fixed dice), not merely a damage-type relabel. This is called out narratively in the converter's balance bullets ("4d6 avg ~14 is ~7% of max HP") but the underlying cost *mechanism* changed from "scales with remaining HP" to "fixed regardless of HP."
- The converter's own anchor claims "no close analog," but Divine Inspiration (rank 8) is an official single-slot spell-recovery precedent not referenced in the notes.
- No PF2e Wish/Miracle-style safety-valve language (e.g., GM adjudication of consequences) is present — not applicable to this spell's function, noted only for completeness since Wish exists as a rank-10 ritual in the same snapshot.

## Options & staff lean (enrichment, 2026-07-23)

The dossier's key catch is the COST MECHANISM swap: 5e's Greater Surge cost was void
damage equal to HALF YOUR CURRENT HP (brutal, scales toward a death spiral — a true
bargain with fate); the conversion flattened it to 4d6 (~14, which the converter's own
bullet admits is ~7% of a level-17 caster's HP — symbolic). The recovery payload was
deliberately trimmed (4→3 slots, 3→2 abilities; keep), and Divine Inspiration r8 (one
6th-or-lower slot) brackets the pricing — three rank-5 slots for a rank-9 slot + 1/day
is strong but rank-appropriate. The safety floor ("offer evaporates below 1 HP") is a
good invention; keep it with either cost.

- **A. Restore the 5e cost: "void damage equal to half your current Hit Points
  (unreducible)"** — PF2e-expressible, restores the drama that justified the spell, and
  the 1-HP-floor clause already guards the edge.
- **B. Keep flat 4d6** — Greater Surge stays a near-free rider at the levels that cast
  rank 9.
- **C. A plus restore 5e's 4-slot/3-ability counts** — double-buffing; his trims were
  sound calibration.

**Lean: A.**
