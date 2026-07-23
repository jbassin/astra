# Almonk's Arcane Siphon

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** ledger:utility — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** antillurgy, concentrate, manipulate
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Range:** self
- **Target:** "you"
- **Defense:** none (`system.defense = null`)
- **Duration:** sustained, "1 minute"
- **Heightening:** no `system.heightening` key present at all (see Open flags)

## The 5e original

- **Level:** 3rd
- **School:** Antillurgy
- **Casting time:** 1 action
- **Range:** Self
- **Components:** V, S (no material)
- **Duration:** Up to 1 minute (not concentration)
- **Classes:** Sorcerer, Warlock, Wizard
- **Ritual:** No

> A small, black orb hovers around your head, seemingly drawing magical effects into it. The next time you're targeted with a single-target spell of third level or lower, the spell is instead drawn into the orb. You regain one spell slot of a level one lower than the spell that was caught. If the spell was a first level spell, you do not regain a slot. The orb cannot catch cantrips, and once the orb has caught a spell the spell ends.

**At Higher Levels:** Arcane Siphon can be cast using a spell slot of 3rd level or higher. It can catch spells of equal or lower level to the spell slot expended to cast it.

## The conversion (canonical store)

> A small black orb manifests and orbits your head, drawing magical energy toward itself like a drain. The orb can intercept one single-target spell of rank 3 or lower that is cast by another creature and targets only you (not an area that includes you). If such a spell is cast while the orb is active, the orb devours the incoming magic before it takes effect.
>
> When the orb absorbs a spell in this way: the spell's effect is completely negated against you; you regain one expended spell slot of rank one lower than the absorbed spell (minimum 1st rank). If the absorbed spell was rank 1, you instead gain 1 temporary Focus Point (which can be spent normally and lasts until the end of your next turn). The orb then vanishes and the spell ends.
>
> The orb cannot absorb cantrips, rituals, or spells that target an area.
>
> ---
> **Heightened (+1)** The maximum rank of spell the orb can absorb increases by 1 (for example, at rank 4 the orb can absorb spells of rank 4 or lower; at rank 5, rank 5 or lower).

No `@UUID` links present.

## What changed, plain English

The core fiction (small black orb orbits the caster's head, intercepts and devours the next single-target spell, caster recovers a lower-rank slot) is preserved. The rank-3-or-lower spell-catching ceiling and the "one rank lower" slot-recovery formula both carry over from the 5e original nearly verbatim.

Structure/mechanics:
- 5e "1 minute upTo, no concentration" (a fire-and-forget buff requiring zero maintenance) → PF2e "sustained up to 1 minute" (requires spending an action each round to maintain). This is a genuine mechanical tightening — the converter's notes state this explicitly as the primary balance lever, since a maintenance-free spell-denial effect was judged too strong.
- 5e "if the spell was 1st level, you do not regain a slot" → PF2e "if the absorbed spell was rank 1, you instead gain 1 temporary Focus Point." This is content ADDED with no 5e basis: the 5e version simply grants nothing on a 1st-level catch, while PF2e substitutes a consolation reward (a temporary, time-limited Focus Point) that the 5e text never has an equivalent for.
- Content ADDED with no 5e basis: an explicit exclusion of "rituals" from what the orb can absorb (5e text only excludes cantrips) — PF2e's ritual category doesn't map to anything in the 5e text.
- Content ADDED: an explicit clarification that the orb only catches spells "that target only you (not an area that includes you)" — this narrowing is not present in the 5e text, which is silent on area spells (the 5e original just says "single-target spell").
- 5e cast time 1 action → PF2e 2 actions.
- Traits: PF2e adds "antillurgy" (the school-name-as-trait pattern — see Open flags) and drops the "abjuration" trait that jmnario's own conversion had assigned (see Open flags).
- Traditions arcane + occult replace the 5e Sorcerer/Warlock/Wizard class list.

## Converter's notes

- **Anchor:** "no clean analog — closest is Counterspell (reaction, arcane/occult, negates a spell at the cost of expending a slot of equal or higher rank); Siphon negates AND recovers a slot at lower power"
- **Archetype:** abjuration/utility (spell interception + slot recovery)
- **Balance bullets:**
  - "Counterspell (standard) costs a slot of equal rank to the intercepted spell; Arcane Siphon costs a rank-3 slot but recovers one slot of (absorbed rank - 1). Net slot cost: if absorbing a rank-3 spell, net cost is 0 slots (spent 3, recovered 2). This is strong but gated by: (a) sustained up to 1 min, (b) only single-target spells, (c) only catches one spell total."
  - "Sustained requirement (not 'free 1-minute duration') is the primary balance lever: the caster must spend 1 action per round to maintain the orb, which costs action economy in exchange for the anti-magic effect."
  - "The 5e '1 minute, no concentration' was changed to sustained because a free spell-denial orb that requires zero maintenance is too powerful — the sustain cost is the balancing force."
  - "Named-caster series companion to Arcane Drain: Drain is offensive (drain slots from enemy), Siphon is defensive (catch a spell, recover own slots)."
  - "The temporary Focus Point on rank-1 absorption is a minor reward for catching low-value spells and preserves the 'always gets something' design of the 5e spell."
- **Overridable:**
  - "Named-caster (Almonk's): PF2e-idiomatic is a focus spell. Kept as regular spell per plan directive."
  - "The sustained requirement could revert to '1 minute, no sustain required' if the GM finds the action cost too punishing — this would make the spell comparable in power to a very strong defensive buff."
- **Checklist failures:**
  - "Named-caster spell (Almonk's): PF2e-idiomatic conversion is a focus spell; kept as regular spell per plan directive."
  - "The 'recover a spell slot' mechanic has no direct PF2e published equivalent — closest is the Focus Point system. Slot recovery was flagged as a design deviation from PF2e conventions; the spell may warrant GM review before deployment in a campaign."

## Similar official spells

- **Spell Turning (rank 7)** — a reaction that reflects a targeted spell back at its caster via a counteract check, ending regardless of outcome; a much higher-rank single-target spell-defense analog for comparing potency scale against Siphon's rank-3 catch-and-recover.
- **Dispel Magic (rank 2)** — the closest official "spend an action to remove a magical effect" via counteract check; unlike Siphon it doesn't require a maintained orb and doesn't recover a resource.
- **Antimagic Field (rank 8)** — full area-wide spell suppression while sustained; useful as a scale reference for how much rank PF2e spends on "actively prevent magic" effects.
- **Heroism (rank 3)** — same-rank status buff for comparing action-economy cost (a plain 2-action buff with no sustain) against Siphon's sustained-every-round upkeep.

## Prior astra touches

None found in `revisions.md` — Almonk's Arcane Siphon matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.heightening` is entirely absent from the store JSON (no key at all), even though the description contains a "Heightened (+1)" block. This matches the adapter warning — the heighten effect (raising the max absorbable spell rank) is not a pure damage bump, so it isn't structurally represented; it exists in prose only.
- Trait discrepancy: the store's traits list is `[antillurgy, concentrate, manipulate]`. jmnario's own conversion (`all_spells_pf2e.json`) lists traits as `[abjuration, concentrate, manipulate]` — the store's "antillurgy" (the 5e homebrew school name, carried over verbatim) has **replaced** the "abjuration" trait that jmnario's conversion notes explicitly justify adding ("Abjuration trait added (spell interception is canonically abjuration in PF2e)"). The store therefore lacks the real PF2e "abjuration" trait entirely for a spell whose own converter notes call that trait canonical for its mechanic.
- `system.defense` is null and the description has no explicit save/attack-roll line — this is consistent with the spell having no save (it's an automatic interception, not an attack), but is worth confirming has no gap versus the intent.
