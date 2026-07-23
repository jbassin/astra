# Arcane Tattoo

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** ledger:long-cast — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics
- **Traditions:** arcane, occult
- **Cast:** time.value = "10 minutes"
- **Cost:** "special ink worth 15 gp (consumed)"
- **Range:** touch
- **Target:** "1 willing creature"
- **Defense:** none structured (`system.defense = null`)
- **Duration:** "permanent until activated", not sustained
- **Heightening:** fixed, level "5" (empty object — appendix-only text)

## The 5e original

- **Level:** 3rd
- **School:** Memetics
- **Casting time:** 10 minutes
- **Range:** Touch
- **Components:** V, S, M (special ink worth 200 gp)
- **Duration:** Permanent (until activated/dispelled)
- **Classes:** Bard, Seeker, Wizard
- **Ritual:** Yes

> You scribe a tattoo on a willing creature's skin that holds a portion of magical essence. A creature can only hold one arcane tattoo at a time; scribing another eliminates the previous one.
>
> The recipient of the tattoo can activate the tattoo's effect as a bonus action. Once the tattoo is scribed, it remains until the effect is activated.
>
> The tattoo types are as follows:
>
> **Red:** The recipient goes into a battle frenzy, gaining advantage on melee attacks for 1 minute.
>
> **Yellow:** The recipient's Strength score increases to 19 for 10 minutes.
>
> **Green:** The recipient's speed increases to 60 feet for 1 minute, and opportunity attacks against the recipient have disadvantage.
>
> **Purple:** The recipient gains advantage on Stealth checks for 10 minutes.

No `entriesHigherLevel` block in the 5e original. Notably, the 5e original is flagged `"ritual": true`.

## The conversion (canonical store)

> You spend 10 minutes scribing a magical tattoo onto a willing creature's skin, binding a reservoir of arcane energy into the design. A creature can hold only one Arcane Tattoo at a time; scribing a new one immediately dissolves any previous one. The tattoo type determines its effect when activated.
>
> The recipient can activate the tattoo as a single action. Once activated, the tattoo vanishes and the spell ends. The tattoo can be removed early by a dispel magic of rank 3 or higher, or by the recipient willingly choosing to dissolve it (requiring 1 minute of concentration).
>
> Choose one of the following tattoo types when scribing:
>
> **Red:** The recipient enters a battle frenzy. For 1 minute, they gain a +1 status bonus to melee attack rolls and a +2 status bonus to melee damage rolls, but all melee attack rolls against them gain a +1 circumstance bonus.
>
> **Yellow:** The recipient's Strength score temporarily surges. They gain a +4 item bonus to Strength-based skill checks and Athletics for 10 minutes, and can lift and carry twice their normal bulk capacity.
>
> **Green:** The recipient's movement quickens to supernatural speed. They gain a +20-foot status bonus to their Speed for 1 minute. Opportunity attacks against the recipient are made with a –2 circumstance penalty.
>
> **Purple:** The recipient fades into the background. They gain a +3 status bonus to Stealth checks for 10 minutes, and can attempt to Hide even while observed, though the usual –2 penalty for observed creatures still applies.
>
> ---
> **Heightened (5th)** The ink cost increases to 30 gp. The effects of each tattoo are enhanced: Red grants an additional +1 to melee damage; Yellow grants +6 item bonus; Green grants +30-foot speed bonus; Purple grants +4 status bonus to Stealth and removes the –2 penalty for being observed.

## What changed, plain English

The core fiction (a 10-minute ritual-like tattoo scribing, one-tattoo-at-a-time cap, four color-coded stored effects activated later) is preserved, and each of the four tattoo colors/themes carries over: Red (battle frenzy), Yellow (Strength surge), Green (speed boost), Purple (Stealth boost).

Structure/mechanics:
- 5e "advantage on melee attacks" (Red) → PF2e "+1 status bonus to melee attack rolls and +2 status bonus to melee damage rolls" — advantage has no direct PF2e equivalent, so it becomes a status bonus; the PF2e version additionally introduces a melee *damage* bonus that has no 5e counterpart at all (the 5e Red tattoo only affects attack rolls, not damage).
- 5e "attacks against the recipient are not otherwise penalized" (5e Red is silent on this) → PF2e explicitly adds "all melee attack rolls against them gain a +1 circumstance bonus," a drawback with no 5e basis for this specific tattoo (the 5e text never mentions a downside to Red).
- 5e "Strength score increases to 19" (Yellow, an ability-score-replacement mechanic) → PF2e "+4 item bonus to Strength-based skill checks and Athletics... can lift and carry twice their normal bulk capacity" — PF2e has no ability-score-replacement mechanic, so this becomes an item bonus plus an explicit carry-capacity clause (the "double bulk capacity" line is new; the 5e text only ever mentions the flat Strength score change, from which carrying capacity would be derived indirectly).
- 5e "60 ft speed, disadvantage on opportunity attacks against you" (Green) → PF2e "+20-foot status bonus to Speed... opportunity attacks... –2 circumstance penalty" — disadvantage becomes a flat penalty.
- 5e "advantage on Stealth checks" (Purple) → PF2e "+3 status bonus to Stealth checks... can attempt to Hide even while observed" — the "can Hide while observed" clause is content ADDED with no 5e basis (the 5e Purple tattoo only grants advantage on Stealth checks, nothing about bypassing the observed-creature restriction).
- 5e "activate as a bonus action" → PF2e "activate as a single action" (no bonus-action concept in PF2e).
- 5e "permanent (until activated/dispelled)" with no explicit removal method stated beyond activation/dispel → PF2e adds two explicit early-removal methods with no clean 5e counterpart: "dispel magic of rank 3 or higher" (the 5e text never specifies a spell level for dispelling) and "the recipient willingly choosing to dissolve it (requiring 1 minute of concentration)" — this self-dissolve option is entirely new.
- 5e material cost 200 gp → PF2e 15 gp (roughly 10× economy scaling per the converter's notes), and heightened to 30 gp at rank 5.
- 5e ritual flag (`"ritual": true`, meaning it's cast via the 5e ritual-casting rules) is NOT preserved as a PF2e ritual — it remains a standard spell with a 10-minute cast time; PF2e's formal ritual category is not used.
- Traits: PF2e drops jmnario's "transmutation" trait in favor of "memetics" (school-as-trait pattern — see Open flags).

## Converter's notes

- **Anchor:** "Heroism (rank 3, +1 status bonus 10 min) — Arcane Tattoo stores Heroism-tier effects permanently until activated, which justifies rank 3"
- **Archetype:** utility/buff (stored-effect tattoo ritual)
- **Balance bullets:**
  - "The permanent-until-activated storage is the spell's power: it can be applied out of combat and activated as a 1-action during combat. This is stronger than a 2-action cast in the moment, justified by the 10-minute casting time and 15 gp material cost."
  - "Each tattoo effect is roughly equivalent to one rank-3 buff: Red ≈ Haste partial; Yellow ≈ Bull's Strength; Green ≈ Haste (speed only); Purple ≈ Invisibility partial. None are full-rank-3 buffs — they're each a partial effect, appropriate for the pre-loaded design."
  - "One-tattoo-at-a-time cap prevents stacking multiple stored buffs, keeping the spell from becoming a multi-buff economy exploit."
  - "The 5e 200 gp material cost → 15 gp in PF2e (approximately 10× economy scaling): appropriate for a rank-3 utility with permanent storage."
  - "Traditions arcane + occult: tattoos channel mental/material magic; primal and divine excluded as this is not nature or divine grace."
- **Overridable:**
  - "Could add divine and primal traditions if the GM wants tattoo magic to be accessible to more classes — thematically, runic tattoos exist in many cultural traditions including primal ones."
  - "The 5e ritual flag could be preserved as 'this spell can only be cast as a 10-minute downtime activity' rather than a castable exploration spell — would add ritual gating without requiring PF2e's formal ritual system."
- **Checklist failures:** none

## Similar official spells

- **Heroism (rank 3)** — the converter's own anchor; a plain +1 (scaling to +2/+3 on heighten) status bonus to attacks/Perception/saves/skills for a flat duration, cast in the moment. A useful baseline for what a "normal" rank-3 status buff looks like without the store-then-activate-later mechanic.
- **Tattoo Whispers (rank 3, ritual)** — the actual official PF2e tattoo-magic spell; links secondary casters via magically-bonded tattoos for telepathic communication. Different mechanic (communication, not combat buff) but the only other tattoo-themed spell in the compendium, and it IS cast as a formal PF2e ritual (unlike Arcane Tattoo, which is a standard 10-minute-cast spell).
- **Enlarge (rank 2)** — one rank below, a comparably-scoped single-recipient physical buff, useful for gauging how PF2e prices "you get bigger/stronger" effects independent of the store-and-activate design.

## Prior astra touches

None found in `revisions.md` — Arcane Tattoo matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.heightening.levels["5"]` is an empty object; the entire 5th-rank heighten effect (all four tattoo upgrades plus the ink cost increase) lives only in the description HTML per the adapter warning.
- The 5e original is flagged `"ritual": true` (cast via 5e's ritual-casting rules, no spell slot expended). The PF2e conversion does not use PF2e's formal ritual system at all — it remains a standard rank-3 spell with a 10-minute cast time. The converter's own "overridable" notes flag this as a design option that was not taken.
- Trait note: "memetics" (the 5e homebrew school name) replaces jmnario's "transmutation" trait (school-as-trait pattern, consistent with other spells in this chunk — see Almonk's Arcane Drain/Siphon, Arcane Interdiction, Artist's Rendition, Ashen Pack, Bestial Rage dossiers).
- The Red tattoo's melee-damage bonus (+2 status) and the "attacks against them gain +1 circumstance" penalty are both PF2e-side additions with no 5e textual basis (the 5e Red tattoo only grants advantage on attack rolls, with no stated downside).
