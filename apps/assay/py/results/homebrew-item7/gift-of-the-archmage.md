# Gift of the Archmage

## Header block

- **Rank:** 5 (store `system.level.value = 5`)
- **Routing:** ledger:long-cast
- **Pool reason:** ledger
- **Current assay line (chunk list):** no verdict/range/residual figure supplied for this spell in the chunk 6 manifest — only routing/pool-reason.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, mercuromancy (custom trait) — rarity common
- **Traditions:** arcane
- **Cast:** `1 minute` (system.time.value; no separate discrete action-count field in the store)
- **Range:** touch
- **Targets:** 1 willing creature
- **Defense:** none (`system.defense = null`)
- **Duration:** "until used or next daily preparations" — `sustained: false`
- **Cost:** "a palm-sized chunk of unrefined Orichalcum ore worth at least 500 gp, which is consumed"
- **Heightening:** fixed-rank, at 7th and 9th

## The 5e original

- **Level:** 5 · **School:** mercuromancy (source: `tfc`)
- **Casting time:** 1 minute
- **Range:** touch
- **Components:** V, S, M — "a palm sized chunk of unrefined Orichalcum ore worth at least 1000gp" (cost 1000 gp)
- **Duration:** 8 hours, timed, non-concentration
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

**Entries:**

> You use the stone in your hand as a conduit for fate, causing it to emit a blue glow. Using the stone, you sketch out complicated arcane sigil in the air. Once fully drawn, the sigil will shrink into a tiny sphere, changing in color to pure white. This singularity will go into a willing creature, imbuing the creature with distilled energy from weave.
>
> This creature will gain the ability to cast a 4th level spell or lower that is known to you, and in the wizard spell book. This spell will use the creature's Intelligence modifier, and can only be cast once. The caster can only bestow one gift per spell slot level at a time.
>
> The strain of distilling a spell into a gift will cause the original spell caster to lose the ability to cast the distilled spell until the gift is used. The caster can chose cancel the gift early, but will suffer one point of exhaustion since the caster has to forcibly rip part of their essence out the recipient.

**At Higher Levels:** "When you cast this spell using a spell slot of 6th level or higher, the distilled spell singularity can hold a greater spell level for each slot level above 5th." (i.e., a continuous, per-slot-level escalation of the cap.)

## The conversion (canonical store)

> You compress one of your own prepared or known spells of rank 4 or lower into a shimmering arcane singularity and transfer it into a willing creature. The spell must be one you have prepared (if you prepare spells) or one you know (if you have a spell repertoire); it must be rank 4 or lower. You lose access to that spell until the gift is used or the duration ends: if you prepared the spell, the slot is expended; if you know it via a repertoire, you treat yourself as having one fewer spell slot of that rank for the duration.
>
> The recipient gains the ability to cast the gifted spell exactly once, using your spell DC and spell attack modifier. The recipient must supply any material components or costs the spell normally requires. When the recipient casts the spell, it uses their actions and their position (not yours). The recipient must use the gifted spell by the end of their next daily preparations or the gift fades unused.
>
> **Heightened (7th)** The maximum rank of the spell you can gift increases to 6.
>
> **Heightened (9th)** The maximum rank of the spell you can gift increases to 8.

Structured fields agree with the prose (rank-4 cap, touch/willing-creature target, 500 gp consumed material, non-sustained until-used-or-next-prep duration).

## What changed, plain English

- **Duration:** 5e is a flat 8-hour timer, non-concentration. The PF2e store version has no fixed hour count at all — it lasts "until used or next daily preparations," an open-ended, condition-bound duration rather than an enumerable one.
- **Whose stat block casts it:** 5e explicitly gives the recipient's own Intelligence modifier. The store version instead has the recipient cast using the *original caster's* spell DC and spell attack modifier — a full swap of whose statistics are used.
- **Rank cap escalation:** 5e increases the cap by 1 for *every* slot level above 5th (a continuous per-level progression: 6th→5th-rank cap, 7th→6th, 8th→7th, 9th→8th). The store version only defines two discrete heightened breakpoints (7th→rank 6, 9th→rank 8) and has no effect at 6th or 8th — a coarser, skip-a-level heightening structure than the source.
- **Material cost:** 5e's 1,000 gp is halved to 500 gp in the store.
- **Base rank-cap:** 5e "4th level spell" maps 1:1 to store "rank 4 or lower."
- **Traditions:** 5e's class list (Bard/Druid/Seeker/Sorcerer/Warlock/Wizard) spans all four traditions; the store assigns arcane only.
- **DROPPED from 5e:** the early-cancellation option and its cost. 5e explicitly lets the caster cancel the gift early at the cost of one point of exhaustion. The store's description never mentions voluntary early cancellation at all — there's no PF2e replacement mechanic for it (PF2e has no exhaustion condition, and no other cancellation clause was substituted).
- **DROPPED from 5e:** "one gift per spell slot level at a time" — the per-slot-level stacking limit from 5e isn't reproduced in the store text at all (recipient/gift-count limits go unaddressed).
- **ADDED, no 5e basis:** "The recipient must supply any material components or costs the spell normally requires." 5e's text is silent on who pays for the gifted spell's own components.
- **ADDED, no 5e basis:** "it uses their actions and their position (not yours)" — an explicit clarifying mechanic not present in the 5e entries.

## Converter's notes

- **Anchor:** "Scroll (item equivalent) — the spell creates a one-use spell transfer; analogous to a targeted Tattoo of the Wizard's Grip or Scroll-in-a-body"
- **Archetype:** utility / buff (spell transfer)
- **Balance bullets:**
  - "Rank 5 cost (500 gp material + rank-5 slot) to grant one use of a rank-4 or lower spell — slightly weaker than writing a scroll (which is permanent) but the 'embedded in a creature' delivery is unique"
  - "Caster loses the gifted spell slot immediately, so this trades one slot for another — power-neutral if the recipient's use is guaranteed; a loss if the gift is wasted"
  - "3-action + 1-minute cast time strongly limits combat use; this is an exploration/prep spell"
  - "Until-next-daily-prep duration caps the gift; it cannot be stockpiled across adventuring days"
- **Overridable:**
  - "The 500 gp material cost could be removed if the author wants this to be slot-cost-only (making it an at-will party-optimization tool between fights)"
  - "The gifted spell could use the recipient's own spell DC rather than the caster's — both interpretations have merit"
- **Checklist failures:**
  - "Tradition check: the 5e class list (Bard/Druid/Seeker/Sorcerer/Warlock/Wizard) spans all four traditions. Assigned arcane only, because the core mechanic (spell-distillation via Orichalcum) is matter+mind (arcane). If the author wants it on divine or primal, the essence reasoning is weak — flagged as overridable."

Note: jmnario's own conversion recorded a 3-action cast at "1 minute"; the store's `system.time` carries only the string "1 minute" with no separate discrete action count.

## Similar official spells

- **Contingency (rank 7)** — also pre-loads a lower-rank spell (rank 4 or lower, ≤3 actions, must be able to affect the caster) to trigger later on a chosen condition. Self-only, and the stored spell auto-fires rather than being handed to a second creature to cast. The rank-4-or-lower cap coincides with Gift of the Archmage's base cap.
- **Temporary Glyph (rank 5)** — binds a hostile, ≤2-action, lower-rank spell into a trap glyph that fires when triggered by a target entering its area. Same "cast now, deploy the stored spell's effect later via a delivery mechanism" shape, but restricted to hostile/targeted spells and area triggers rather than a willing recipient casting it themselves.
- No official spell hands a fully-intact casting of one of the caster's own prepared/known spells to a *second creature* to cast on their own turn using the caster's statistics — jmnario's own notes flag the closest real-world analog as the Scroll item (a permanent, transferable one-use casting), not a spell.

## Prior astra touches

None found — `Gift of the Archmage` does not appear in `revisions.md`'s deviation list, meaning the store currently matches a fresh re-conversion of the adapter's own baseline output exactly (no hand-edits recorded).

## Open flags

- The `mercuromancy` trait is a custom, non-canonical PF2e trait that mirrors the 5e school name verbatim — this pattern (school name reused as a bespoke trait) recurs across the whole homebrew set, not unique to this spell.
- The duration string "until used or next daily preparations" is a condition-bound end state rather than an enumerable PF2e duration value; `system.duration.sustained` is `false`.
- No Remaster-era 5e-isms (death saves, bonus-action language, legacy condition names) are present in the prose.
- No curse-removal language present.
