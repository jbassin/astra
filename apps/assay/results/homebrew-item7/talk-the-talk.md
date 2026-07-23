# Talk the Talk

## Header block

- **Rank:** 3 (store `system.level.value` = 3)
- **Routing:** ledger:no-comparable-profile
- **Pool reason:** ledger
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, memetics, subtle
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`time.value` = "2")
- **Range:** self
- **Targets:** you
- **Defense:** none (`system.defense` = null)
- **Duration:** 1 hour, not sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 3
- **School:** memetics
- **Casting time:** 1 action
- **Range:** Self
- **Components:** V only (no somatic); M (grease and a mockingbird's feather) is listed in the 5e text
- **Duration:** 1 hour (no concentration)
- **Classes:** Bard (PHB), Seeker (SW), Wizard (PHB)

> You are suddenly granted with the ability to say exactly the right thing in social situations. You know the most basic and pertinent information about people you've never met before, including their name, title, immediate relations, and publicly known interests — anything they would be happy to disclose in public. This allows you to blend in and appear as though you belong at any type of social gathering, whether it be a fancy ball at the palace surrounded by the social elite, or a clandestine meeting at a filthy tavern, surrounded by brigands and thieves. After an hour, you forget the information granted to you by the spell when it took effect, but retain any gleaned since the spell was cast. For example, the name of a nobleman you did not speak to would be forgotten, but the knowledge of the secret slaving ring run by Xanathar you ingratiated yourself with would still be known to you.

No `entriesHigherLevel`.

## The conversion (canonical store)

> You are suddenly granted the ability to say exactly the right thing in social situations. For the duration, you instinctively know basic public information about any person you can see and interact with: their name, title, immediate family relationships, and publicly known interests — anything they would freely disclose in a casual public setting. You don't need to make a Recall Knowledge or Society check to access this information; it simply surfaces in your mind as you engage.
>
> This grants you a +2 status bonus to Society and Diplomacy checks to blend into social gatherings you wouldn't normally belong to, as you can speak familiarly with strangers about themselves and the social context.
>
> When the spell ends, you forget any information that was granted to you magically at the start of the spell. Information you personally learned during the hour — names you heard people say aloud, secrets whispered in your presence — remains.
>
> ---
> **Heightened (5th)** The +2 status bonus increases to +3, and the information now includes private social affiliations, known enemies, and recent notable activities — anything the subject would discuss in a semi-private setting with peers.

Structured fields: `system.damage` = `{}` (correct — no damage effect). `system.heightening` = `{type: "fixed", levels: {"5": {}}}` — the single level-5 entry is an empty object; the +3/expanded-info deltas exist only in prose, per the adapter warning.

## What changed, plain English

The "instinctively know basic public info without a check," the "blend into any gathering" framing, and the forget-on-expiry / retain-personally-learned split are all preserved close to verbatim. The main changes are the added numeric bonus, the "you can see and interact with" scoping, and the trait tags.

- **Added mechanical bonus — no 5e basis:** 5e's spell is purely an automatic-knowledge effect with **no numeric bonus of any kind**. The PF2e conversion adds an entirely new "+2 status bonus to Society and Diplomacy checks to blend into social gatherings you wouldn't normally belong to" clause with no counterpart anywhere in the 5e text — this is invented mechanical content, not a translation.
- **Scoping tightened:** 5e grants knowledge about "people you've never met before" broadly; PF2e narrows this to "any person you can see and interact with," a more precise (and slightly more restrictive) targeting condition than the 5e original states.
- **Heighten — no 5e basis:** 5e has no upcast text at all. PF2e adds a rank-5 heighten step that both increases the new bonus (+2→+3) and expands the information scope to "private social affiliations, known enemies, and recent notable activities." Since the base-rank bonus itself was invented for the conversion, this entire heighten step is new content built on top of other new content.
- **Traits added:** "divination" (jmnario's intermediate conversion) was later replaced with "memetics" in the store (see Prior astra touches); "subtle" is new, explicitly justified by the converter as compensating for the loss of the material-component tell (see Converter's notes).
- **Material component dropped, undocumented:** the 5e original explicitly requires "grease and a mockingbird's feather" as a material component. This material was **already absent** from jmnario's intermediate conversion (`cost: null`) — it was dropped before the store stage, and jmnario's own conversion-notes bullets (`preservedElements`/`changedElements`) never mention the material at all, so its removal is undocumented in his balance rationale.
- **Action cost:** 5e 1 action → PF2e 2 actions.
- **Nothing else dropped:** the 1-hour duration and the exact wording pattern of the forget/retain split are preserved almost verbatim.

## Converter's notes

- **Anchor:** "Heroism (rank 3, +1 status to skills for 10 min) — Talk the Talk gives +2 status to two skills for 1 hour; the narrower scope (Society/Diplomacy only, and only for blending into unfamiliar gatherings) justifies the higher status number and longer duration"
- **Archetype:** utility/divination (social intelligence, self-buff)
- **Balance bullets:**
  - "The +2 status bonus to Society/Diplomacy is higher than Heroism's +1 but narrowed to social gathering infiltration scenarios only — not combat, not all skills."
  - "The automatic-knowledge feature (no Recall Knowledge check) is the primary power; the bonus is secondary. This makes the spell valuable specifically for social intrigue play."
  - "The forgetting-on-expiry mechanic is a meaningful cost: the spell doesn't grant permanent knowledge of people's secrets — only temporary working knowledge."
  - "Subtle trait (verbal-only in 5e; no somatic) means this can be cast without triggering Reactive Strikes, appropriate for a social-stealth spell."
- **Overridable:** "The +2 status bonus could be removed entirely to make the spell purely an 'automatic knowledge' utility without a numerical bonus — keeping the rank-3 cost for the knowledge feature alone." / "Could add a Deception check bonus as well (to lie convincingly using the granted knowledge), bringing it to three Social skills."
- **Checklist failures:** none recorded.

## Similar official spells

- **Heroism** (rank 3) — the converter's own explicit anchor; grants a flat +1 status bonus (scaling to +2/+3 on heighten) to attack rolls, Perception, saves, AND skill checks broadly, for 10 minutes, non-sustained. Same rank; the direct numeric/scope contrast the converter's own bullets are built around.
- **Mind Reading** (rank 3) — a same-rank single-target Will-save divination spell for extracting information from a specific person, contrasted against Talk the Talk's no-save, broad-audience, self-targeted "ambient knowledge" approach.
- **Read Omens** (rank 4) — a general-purpose divination utility spell one rank up, useful as a same-tradition-family comparable for a rank-adjacent "gain useful information via magic, no check" spell.
- **Object Reading** (rank 1) — a much lower-rank divination-via-touch spell about extracting information; included for tradition-family breadth (arcane/occult divination-adjacent effects) even though its function (reading an object's history) differs from Talk the Talk's function (reading a living person's public identity).

Note: this spell is flagged by the routing metadata as `ledger:no-comparable-profile` — the assay scorer itself found no strong structural comparable, consistent with what the hand search above also surfaces (Heroism is a thematic/numeric anchor, not a close functional twin).

## Prior astra touches

Checked `apps/assay/homebrew/revisions.md`: **no entry** for "Talk the Talk" — 0 deviations from a fresh re-conversion of the vendored baseline (store matches adapter output exactly, no hand edits recorded). The trait set (`concentrate, memetics, subtle`) replaces jmnario's "divination" trait with the custom "memetics" school-trait tag (mapped from the 5e school field) — baked into the current adapter, consistent with the repo-wide trait-hygiene/school-traits sweep, not a spell-specific hand edit.

## Open flags

- The +2/+3 status-bonus mechanic has no basis anywhere in the 5e original (which is a pure automatic-knowledge effect with zero numeric bonus) — entirely invented during conversion, per the "What changed" analysis above.
- The 5e material component ("grease and a mockingbird's feather") was dropped before even the jmnario intermediate stage, and its removal is not mentioned anywhere in the converter's own preservedElements/changedElements notes — an undocumented drop, unlike Shape Modify: Severity or Sphere of Ruin where the material's removal happens later (store-stage) and is at least traceable via the jmnario diff.
- Routed as `ledger:no-comparable-profile` by the assay scorer — flagged by the tool itself as lacking a strong structural comparable, which the hand-picked comparables above corroborate (nearest official spell, Heroism, matches only loosely on scope and numbers).
- No residual 5e condition names, no curse/affliction text, no reaction trigger — clean on those axes.
- Traits include the custom homebrew school-trait tag "memetics" (mapped from the 5e school field), which has no counterpart in the standard PF2e trait taxonomy.
