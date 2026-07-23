# Left Hand of Judgment

## Header

- **Rank:** 4 · **Routing:** ledger:utility · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; no priced quantitative verdict.
- **Adapter warnings:** `fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only`
- **Traits:** concentrate, fortune, kosmoturgy (rarity: common)
- **Traditions:** divine
- **Cast:** 1 action (`system.time.value = "1"`)
- **Range:** self · **Targets:** you
- **Defense:** none
- **Duration:** 1 minute, not sustained
- **Heightening (structured):** `type: fixed`, `levels: {"6": {}, "8": {}}`

## The 5e original

- **Level** 4, **school** kosmoturgy (homebrew)
- **Casting time** 1 **bonus action**
- **Range** self
- **Components** V, S (no material)
- **Duration** 1 minute, no concentration
- **Classes** Cleric, Paladin

> You exert a subtle gravity on those around you. For the duration of the spell, when an opponent strikes you with a melee attack you may use a reaction to pull them off-balance and make a melee attack.

No `entriesHigherLevel` — no upcast text in the 5e original.

## The conversion (canonical store)

> You channel a subtle gravitational pull through your left hand, bending the forces of momentum against those who strike you. For the duration of this spell, you gain the following reaction:
>
> \*\*Gravitational Counter\*\* [reaction] \*\*Trigger\*\* A creature within your reach successfully hits you with a melee attack. \*\*Effect\*\* The attacker's force pulls them off-balance. You may immediately make one melee Strike against the triggering creature (using your best melee attack bonus). This Strike does not count toward your multiple attack penalty, and your multiple attack penalty does not apply to this Strike.
>
> This spell is paired with Right Hand of Judgment (which channels the same kosmoturgy energy offensively). Left Hand governs the defensive reaction; Right Hand governs the offensive charge. Casters who know both may use either in the same encounter but cannot benefit from both simultaneously if both are active (the second cast suppresses the first).
>
> **Heightened (6th)** The Gravitational Counter reaction triggers on any melee attack against you (not only hits), and the free Strike gains a +2 circumstance bonus to its attack roll.
> **Heightened (8th)** The free Strike from Gravitational Counter can target any creature within 30 feet (not just the triggering attacker) as your gravitational pull redirects the energy.

Note: the `**...**` sequences above are rendered literally in the store's HTML (see Open Flags) — they are not `<strong>` tags.

## What changed, plain English

The core "get hit → free counter-Strike" reaction is preserved, but PF2e-specific structure and an entirely new cross-referenced companion spell were added:

- **Action cost:** 5e bonus action → PF2e 1 action (standard bonus-action-to-1-action mapping).
- **Reaction made explicit:** the 5e text describes the reaction inline in ordinary prose ("...you may use a reaction to pull them off-balance and make a melee attack"); the PF2e version restructures this into a named ability block with bolded "Gravitational Counter [reaction] Trigger... Effect..." labels — but see Open Flags for a formatting issue with this restructuring.
- **MAP-exemption clause added:** "This Strike does not count toward your multiple attack penalty, and your multiple attack penalty does not apply to this Strike" — necessarily new, since 5e has no multiple-attack-penalty concept.
- **Trigger tightened then relaxed by heighten:** 5e's trigger is "when an opponent strikes you with a melee attack" (read broadly); the PF2e base trigger requires the attack to **successfully hit**, with the 6th-rank heighten explicitly widening it back to "any melee attack against you (not only hits)."
- **A companion spell invented:** the entire third paragraph — introducing "Right Hand of Judgment" as an offensive counterpart and defining a mutual-exclusion rule between the two — has **no basis in the 5e source** at all. "Right Hand of Judgment" does not appear anywhere in the vendored 5e file.
- **Heightened tiers added wholesale:** the 5e original has no upcast text; both the 6th-rank (broader trigger, +2 circumstance) and 8th-rank (redirect to any creature within 30 ft) heighten tiers are pure PF2e additions.
- **Classes → tradition:** Cleric/Paladin → divine only.

## Converter's notes

- **Anchor:** no clean analog for a spell-as-counter-attack-reaction; closest is Reactive Strike (martial reaction) or Retaliate (champion ability); this is kosmoturgy converting martial counter-attacks into spellcasting territory
- **Archetype:** buff/reaction-setup
- **Balance bullets:**
  - "Reaction power budget: Left Hand grants one free Strike without MAP penalty when hit; reaction effects should be ≤ 1/3 of a 2-action spell at this rank — the free Strike is exactly a ≤1/3 budget item (no direct damage from the spell itself, only a triggered melee opportunity)"
  - "1-action cast is correct because the spell only establishes a reaction trigger, not an immediate offensive output"
  - "1-minute duration matches the combat-grade buff cap; does not need sustained (the reaction is passive and automatic once established)"
  - "Paired with Right Hand of Judgment: Left Hand is defensive/reactive, Right Hand is offensive/accumulative — they cover different action-economy niches and can safely coexist"
- **Overridable:**
  - "No MAP on the free reaction Strike is a balance call — with MAP the Strike would be weak mid-combat; without MAP it gives a meaningful reaction that still costs the triggering creature a hit"
  - "Trigger 'successfully hits you' (5e text) rather than 'attacks you' — the distinction matters; with MAP-exempt strike, requiring a hit-trigger is appropriate at base rank (heightened 6th relaxes to 'any attack')"
- **Checklist failures:** none.

## Similar official spells

- **Warding Aggression** (rank 3) — melee-Strike triggered ward against a specific foe; not a reaction, but shares the "your combat action creates a lingering punish-the-attacker effect" family.
- **Armor of Thorn and Claw** (rank 1) — automatic (no reaction spent) retaliation: whoever hits or touches you with a melee unarmed attack takes damage back. Much lower rank/power, but the closest published "punished for hitting me" mechanic found.
- **Spiritual Guardian** (rank 5) — divine, force weapon with an Attack mode (melee spell attack, 3d8) and a Protect mode triggered on Sustain; not a personal reaction, but the nearest official "divine floating counter-force" comparable found in the snapshot.

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell.

## Open flags

- The description's `**Gravitational Counter** [reaction] **Trigger** ... **Effect** ...` block uses literal, unconverted markdown double-asterisks inside the HTML `<p>` tag rather than `<strong>` tags. Compare the official reaction-spell convention (e.g., Gentle Landing): `<p><strong>Trigger</strong> ...</p><hr />`.
- The granted "Gravitational Counter" reaction exists only as prose inside the description; it is not represented as a discrete structured ability/effect item. The spell's own `system.time` (its cast action) is "1", while the reaction's own trigger/effect text lives entirely in the description field.
- "Right Hand of Judgment" is named and cross-referenced with an explicit mutual-exclusion rule, but does not appear anywhere in the vendored 5e source file for this spell, nor was it found searched-for as a sibling entry.
- The heightened tiers, the MAP-exemption clause, and the paired-spell mechanic all have zero basis in the 5e original — wholesale PF2e-side additions.
