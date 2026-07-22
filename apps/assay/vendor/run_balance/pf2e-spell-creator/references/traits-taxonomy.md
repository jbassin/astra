# Traits & Taxonomy — PF2e Remaster

The full vocabulary of spell descriptions. Use this when writing the trait line of a spell, choosing tradition, picking action cost, defining area shape, or selecting defenses.

---

## 1. Traditions and essences

Every spell belongs to one or more of four traditions, each defined by a pairing of two of the four essences (Matter, Mind, Spirit, Life).

| Tradition | Essences | Casters (iconic) | Strong at | Weak at |
|---|---|---|---|---|
| **Arcane** | Matter + Mind | Wizard, arcane sorcerer, magus | Breadth, evocation damage, transmutation, illusion, force | Healing, true spirit/life manipulation |
| **Divine** | Spirit + Life | Cleric, divine sorcerer, champion | Healing, harm (vitality/void), spirit damage, protection | Raw blasting, broad utility |
| **Occult** | Mind + Spirit | Bard, witch, occult sorcerer, psychic | Mental, enchantment, illusion, fear, weird metaphysical | Raw elemental, nature |
| **Primal** | Matter + Life | Druid, primal sorcerer, ranger | Elemental damage (fire/cold/electricity/acid), healing, nature/animals, polymorph | Mental, illusion |

### Cross-tradition rules
- Matter and Spirit do not directly mix.
- Mind and Life do not directly mix.
- A spell on three traditions usually sits at an essence intersection (Heal: divine + primal share Life; Fear: arcane + divine + occult share the Mind/Spirit bridge).
- A spell on all four traditions is extraordinary (Detect Magic, Read Aura — these read the magical fabric and so transcend boundaries).

### Tradition flavor assignments (when picking traditions for a custom spell)
- Elemental energy damage (fire/cold/electricity/acid) → **primal** first, **arcane** second.
- Force / pure magic → **arcane**, occult secondarily.
- Sonic / mental / illusion / enchantment / fear → **occult**, arcane secondarily.
- Healing (vitality) → **divine + primal**.
- Harm (void) / death → **divine + occult**; primal in "decay" themes.
- Spirit damage → **divine + occult**.
- Protection / abjuration → all four, with flavor.
- Transmutation → **arcane + primal**.
- Polymorph (body) → **primal**-leaning.
- Teleportation → **arcane** primarily.
- Summon (elemental) → **primal**.
- Summon (celestial / fiend) → **divine**.
- Summon (construct, general) → **arcane**.
- Summon (fey / aberration) → **occult / primal**.
- Animal effects → **primal** exclusively.

---

## 2. Casting traits

| Trait | Meaning |
|---|---|
| **concentrate** | Mental focus required. Disrupted by damage if interrupted. Required by Sustain. Most spells have this. |
| **manipulate** | Uses hands; triggers Reactive Strike. Requires at least one free hand. |
| **subtle** | No verbal/somatic visible signs. Can't be Identified by observers. Bypasses speech-block. |
| **cantrip** | Auto-heightens to half caster level (rounded up). Unlimited use. Cap on power (see damage-tables.md). |
| **focus** | Uses Focus Points (1–3 pool). Refocus to recover. Auto-heightens like cantrips. Reserve for class-defining abilities. |

### Component model (Remaster shift)
The Remaster removed verbal/somatic/material/focus components and folded them into traits:
- Old verbal → **concentrate**.
- Old somatic / material / focus → **manipulate**.
- New: **subtle** for stealth-cast spells.

This matters because **manipulate** triggers Reactive Strike — a hidden cost martials don't pay. Most spells will carry both concentrate and manipulate.

---

## 3. Sense / perception traits

| Trait | Effect |
|---|---|
| **auditory** | Uses sound. Defeated by deafness/silence/auditory immunity. |
| **visual** | Uses sight. Defeated by blindness/invisibility/visual immunity. |
| **linguistic** | Target must understand a language. Most enchantments. |

---

## 4. Mental & body traits (the immunity gates)

| Trait | Effect |
|---|---|
| **mental** | Targets the mind. Mindless creatures immune (most undead, oozes, constructs, vermin). |
| **emotion** | Adds the mental restriction. Emotionally immune creatures unaffected. Calm ends the effect. |
| **fear** | Emotion + applies frightened. Fear-immune creatures bypass entirely. |
| **sleep** | Induces unconsciousness. Usually has incapacitation. |
| **death** | If it would kill via the listed mechanic, target is killed dead. |
| **polymorph** | Body-shape change. Multiple polymorphs do not stack; the new overrides the old. |
| **incapacitation** | See conditions.md §3. CRITICAL. |

---

## 5. Effect-category traits

| Trait | Use |
|---|---|
| **illusion** | False sensory information. Subject to disbelieve attempts. |
| **summon** | Produces a summoned creature. Creature level ≤ ~2× rank − 4. |
| **teleportation** | Bypasses normal movement. Many counter-effects key off this trait. |
| **healing** | Restores HP. Matters for *life link*, oracle features, etc. |

---

## 6. Damage-type traits

Each is both the damage type and the corresponding trait.

### Physical
- **bludgeoning, piercing, slashing** — common; resisted as physical bundle by skeletons/oozes/swarms.
- **bleed** — persistent only. Only affects creatures with blood (excludes undead, constructs, oozes).
- **precision** — additive; gated by creature trait (most undead, oozes, gelatinous creatures are immune to precision).

### Energy
- **acid, cold, electricity, fire, sonic** — common; many resistances.
- **force** — rarely resisted; bypasses incorporeal.

### Essence-coded
- **vitality** — heals living, damages undead.
- **void** — heals undead, damages living. Carries the death-themed flavor.
- **spirit** — bypasses incorporeal/possession; doesn't affect mindless constructs.
- **mental** — damages the mind; no effect on mindless.

### Alignment (Remaster replacement)
- **holy** — replaces "good." Damages unholy creatures.
- **unholy** — replaces "evil." Damages holy creatures.

---

## 7. Action costs

| Cost | Power-budget rule |
|---|---|
| **1 action** | ~50–70% of a 2-action spell's effect. Quick variants of bigger spells (1-action Heal touch). |
| **2 actions** | The default. The full power budget at the spell's rank. |
| **3 actions** | ~1.3–1.5× of a 2-action effect. Buys range/area/targets, never flat 2× damage. |
| **reaction** | ≤ ⅓ of a 2-action spell's effect. Must have a meaningful trigger. |
| **free** | Should not grant offensive output without an explicit trigger. Buff activation only. |

Sustain itself is a 1-action **concentrate** action.

**Anti-pattern:** 1-action spell that does what a 2-action does. Cantrips break this rule deliberately by being unlimited; slotted 1-action spells must remain strictly weaker than 2-action.

---

## 8. Defenses

| Defense | Use when |
|---|---|
| **Basic save** | Spell deals damage; save modifies damage (none/half/full/double). Default for area damage. |
| **Non-basic save** | Spell imposes a condition or binary effect. Usually no damage roll (or a fixed flat number). Default for control. |
| **Spell attack roll vs AC** | Precision-aimed spells. Uses MAP rules. Crit on nat-20 or +10 over AC. |
| **No defense** | Buffs on willing targets, environmental spells. **Never** for damage or hostile effects. |

Mixing (e.g., spell attack + condition on hit) increases the power budget — reduce damage one tier or row to compensate.

---

## 9. Areas

| Shape | Definition | Power relative to others |
|---|---|---|
| **Burst** | Radius from a corner within range. Caster places origin. | Strongest at same dice count. |
| **Emanation** | Centered on the caster, all directions. Forces self-placement. | Slightly stronger than burst due to self-restriction. |
| **Cone** | Quarter-circle from the caster's space, widening. | Middle. |
| **Line** | Straight line, 5 ft wide by default. | Weakest because it hits fewest creatures on average. |

Sizes by rank: see SKILL.md §5 and damage-tables.md.

---

## 10. Targeting

| Targeting | Notes |
|---|---|
| target X creatures | Singletons. Usually with save. |
| willing creatures | Buffs; no save. |
| objects | No save (or object's save / Hardness). |
| creatures in area | Area effect; default to saves. |

---

## 11. Rarity

Rarity is a **narrative-availability** lever, not a power lever. Power is set by rank; rarity gates access.

| Rarity | Meaning |
|---|---|
| **Common** | Default. Accessible to anyone meeting the prerequisites. |
| **Uncommon** | Needs in-fiction justification (background, training, downtime quest, GM permission). Examples: raise dead, teleport. |
| **Rare** | GM gives it out as treasure/discovery. Lost-art spells. Still balanced for rank. |
| **Unique** | One-of-a-kind, named, tied to an NPC or artifact. |

**Design rule:** raise rarity for setting impact, not mechanical power. If a spell is too strong, fix the spell — don't bury it under a rarity tag.

---

## 12. Counteract

Every spell has an inherent **counteract rank** = its spell rank. Effects with no rank use ceil(level / 2).

A counteract check resolves by degree:
- **Crit success** — counter if your rank ≥ target rank − 3.
- **Success** — counter if your rank ≥ target rank − 1.
- **Failure** — counter only if your rank > target rank.
- **Crit failure** — no effect.

### Design implications
- Custom buff spells must be counterable at their rank. Do not write "cannot be counteracted."
- A long-duration buff is significantly weaker than its raw text suggests because Dispel Magic exists. Account for that.
- A counter-X spell (custom "remove polymorph") should match its rank to the rank of the thing it removes.
- A persistent magical hazard (wall, aura) uses the spell's rank as its counteract rank. Don't artificially boost it.

---

## 13. Sustained spells

### When to use sustained
- The spell has an ongoing effect (wall, summoned creature, aura, beam).
- The caster should commit action economy to keep it alive.
- The effect would be free value without an action drain.

### Default rules
- Sustaining beyond 10 minutes / 100 rounds ends the spell and applies fatigued.
- "Sustained up to 1 minute" is the explicit shorter cap for stronger effects.
- Sustain is a 1-action **concentrate** action.
- Power budget: 2-action strength minus ~20% on cast, with the round-by-round drain as the soft cost.

### Anti-patterns
- Sustained damage cantrips — unlimited action budget for unlimited damage.
- Sustained without a cap on a powerful battlefield control (always cap at 1 min for hard CC).

---

## 14. Common trait combinations (template guide)

| Spell archetype | Typical traits |
|---|---|
| AoE blasting damage | concentrate, manipulate, [damage type] |
| Single-target attack damage | attack, concentrate, manipulate, [damage type] |
| Single-target save debuff | concentrate, manipulate, [mental/emotion/fear if mind-affecting] |
| Save-or-suck (combat-removal) | concentrate, manipulate, **incapacitation**, [category traits] |
| Buff (touch) | concentrate, manipulate |
| Buff (self) | concentrate, manipulate (or just concentrate if no gestures) |
| Healing (Heal) | concentrate, healing, manipulate, vitality |
| Charm / dominate | concentrate, emotion, **incapacitation** (for dominate), linguistic, manipulate, mental |
| Polymorph (battle form) | concentrate, manipulate, polymorph |
| Summon | concentrate, manipulate, summon |
| Illusion (visual) | concentrate, illusion, manipulate, visual |
| Wall / barrier | concentrate, manipulate, [element if elemental] |
| Teleport | concentrate, manipulate, teleportation |
| Cantrip damage | cantrip, concentrate, manipulate, [damage type] |
| Subtle psychic | concentrate, mental, subtle |
