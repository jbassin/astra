---
name: pf2e-spell-creator
description: Use when the user wants to design, balance, evaluate, or homebrew a Pathfinder 2e (Second Edition / Remaster) spell. Triggers on requests like "design a PF2e spell", "create a pathfinder spell", "homebrew a spell", "balance this spell", "is this spell broken", "make a level 5 fireball variant", "what should this spell's damage be", or any PF2e spell-design discussion. Provides per-rank balance tables, benchmark spells, and a step-by-step balance workflow grounded in the GM Core damage tables.
---

# Pathfinder 2e Spell Creator (Remaster)

A tool for designing **balanced** custom PF2e spells. All terminology is Remaster-current (rank not level; off-guard not flat-footed; vitality/void; Force Barrage not Magic Missile; Slither not Black Tentacles; Quandary not Maze; Desiccate not Horrid Wilting; Falling Stars not Meteor Swarm).

> **Spell rank** is the slot rank (1–10) or "cantrip." Cantrips auto-heighten to half caster level rounded up. **Creature level** is separate from spell rank.

## When to use this skill

Use this skill whenever the user is creating, balancing, critiquing, or comparing custom Pathfinder 2e spells. It is grounded in the GM Core's published damage budgets (Area Damage / Strike Damage tables) and in canonical benchmark spells at every rank.

## The 8-step workflow

When the user asks for a new spell, walk this sequence. Don't skip steps — every step exists to catch a specific anti-pattern.

### 1. Clarify intent (1 short message; ask only what's missing)

Ask for whichever of the following the user hasn't already specified. Combine into a single clarifying message; never ask one at a time:

- **Rank** (cantrip, 1–10). Required.
- **Tradition(s)** — arcane / divine / occult / primal. Required (1–4).
- **Archetype** — single-target damage (attack), single-target damage (save), area damage, unconditional auto-hit damage, control/debuff, buff, healing, summon, polymorph/battle form, utility/divination, save-or-suck.
- **Damage type** if relevant — and what's the *flavor*.
- **Action cost** (1 / 2 / 3 / reaction / free) — default is 2.
- **Defense** — basic save / non-basic save / spell attack roll / none.
- **Any specific narrative requirement** (e.g., "must inflict frightened," "must summon a dragon-themed creature," "should evoke a stormcaller theme").

If the user gives a rough fictional pitch ("a spell that calls down a swarm of crows"), infer reasonable defaults and confirm them rather than asking 6 questions.

### 2. Locate the closest published anchor

Before writing anything, identify the **closest already-published spell** at the same rank in the same archetype. This is the single most important step — it is the design principle Paizo's GM Core itself recommends.

→ **Load `references/benchmark-spells.md`** to look up iconic spells per rank.

Output a one-line "anchor: X (rank N) — Yd6 basic Reflex, 20-ft burst" so the user can see what you're calibrating against.

### 3. Apply the damage budget (if the spell deals damage)

→ **Load `references/damage-tables.md`** for the full GM Core Area Damage / Strike Damage tables, archetype dice formulas, and the damage-type pricing rules.

The load-bearing table for **2-action area damage** spells, by caster level (cantrip = Unlimited; slotted spell = Limited):

| Caster Lvl | Unlimited Use (Cantrip) | Limited Use (Slotted Spell) |
|---|---|---|
| 1 | 2d4 (~5) | 2d6 (~7) |
| 3 | 2d8 (~9) | 4d6 (~14) |
| 5 | 2d10 (~12) | 6d6 (~21) |
| 7 | 4d6 (~15) | 8d6 (~28) |
| 9 | 5d6 (~18) | 10d6 (~35) |
| 11 | 6d6 (~21) | 12d6 (~42) |
| 13 | 7d6 (~24) | 14d6 (~49) |
| 15 | 6d8 (~27) | 16d6 (~56) |
| 17 | 8d6 (~29) | 18d6 (~63) |
| 19 | 7d8 (~32) | 20d6 (~70) |
| 20 | 6d10 (~33) | 21d6 (~74) |

A typical caster uses a rank-N slot at level 2N−1 (i.e., a rank-3 spell at level 5). Map *spell rank → caster level → row in the table* and you have the baseline dice count.

**Adjustments:**
- If the spell also imposes a condition on failure → subtract ~2 levels of dice (drop to the row 2 levels lower).
- Single-target spell-attack damage → use the **Strike Damage Moderate** column at that level (see damage-tables.md).
- Unconditional auto-hit (no save, no attack) → ~60–70% of save-based dice count (Force Barrage pattern).
- Damage type pricing: see damage-tables.md (force ≈ 0.80×, mental ≈ 1.10×, etc.).

### 4. Pick the defense and write the save tiers

→ **Load `references/conditions.md`** when conditions are involved.

The four-degree contract for non-damage save spells:

| Degree | What it does |
|---|---|
| **Crit Success** | Nothing. (Almost always nothing.) |
| **Success** | Nothing, or a weak 1-round version (e.g., frightened 1). |
| **Failure** | The intended condition for 1 round, or a mild version for 1 minute. |
| **Crit Failure** | The intended condition for 1 minute (sometimes with end-of-turn save), or escalated severity. |

For basic-save damage spells: crit success = no damage, success = half, failure = full, crit failure = double. Always.

Save type:
- **Reflex** — dodgeable area damage, line/burst/cone, falling debris.
- **Fortitude** — body-affecting (poison, disease, drain, petrify, disintegrate, void/vitality).
- **Will** — mind-affecting (fear, charm, illusion, mental damage, banishment).

### 5. Set range, area, duration

| Rank | Burst | Cone | Line | Range |
|---|---|---|---|---|
| 1 | 5 ft | 15 ft | 30 ft | 30–120 ft |
| 2 | 10 ft | 20 ft | 30–60 ft | 30–120 ft |
| 3 | 20 ft | 30 ft | 120 ft (Lightning Bolt) | 500 ft (canonical) |
| 4 | 20 ft | 30 ft | 60 ft | 120–500 ft |
| 5 | 30 ft | 60 ft | 60–120 ft | 500 ft |
| 6 | 30 ft | 60 ft | 120 ft (Chain Lightning chains 30 ft) | 500 ft |
| 7 | 60 ft | 60 ft | 120 ft | 500 ft |
| 8 | 60 ft | 60 ft | 120 ft | 500 ft |
| 9 | 40 ft × 4 (Falling Stars) | 60 ft | 60 ft (Massacre) | 500 ft |
| 10 | 60 ft | 60 ft | 120 ft | 1,000 ft |

Duration tiers: instantaneous → 1 round → sustained (≤1 min) → 1 min → 10 min → 1 hr → 8 hr → 24 hr → until next daily prep. Pick the lowest tier that fits — combat-grade buffs cap at 1 min or sustained.

### 6. Add the right traits

→ **Load `references/traits-taxonomy.md`** for the full trait reference.

Mandatory checks:
- **concentrate** — almost all spells. Required for sustain.
- **manipulate** — spells using hands; triggers Reactive Strike.
- **Damage-type trait** — match every damage type listed (fire, cold, void, etc.).
- **incapacitation** — **REQUIRED** if the spell can take a creature out of the fight on a failed save (paralyzed, petrified, controlled, dominated, banished, sleep-style unconsciousness, confused, charmed-with-combat-shift, save-or-die effects). This is the single most-violated rule in homebrew.
- **polymorph** — body-shape transformations (don't stack).
- **mental / emotion / fear / death / sleep / linguistic / auditory / visual** — these gate immunities; add them honestly.

### 7. Heighten it

→ **Load `references/heightening.md`** for full conventions and worked examples.

Quick reference:
- **Cantrip damage:** auto-heightens to half level rounded up; +1 die per +1 rank for normal cantrips, +1 die per +2 ranks for "loaded" cantrips with strong riders (Daze, Live Wire).
- **Area damage slotted:** +2 dice per +1 rank (Fireball template).
- **Single-target attack-roll damage:** +2 dice per +1 rank (Disintegrate template).
- **Single-target save damage:** +1 die per +1 rank.
- **Auto-hit unconditional:** +1 missile/effect per +2 ranks (Force Barrage).
- **Sustained AoE (walls):** +1 die per +1 rank (slower, because sustainable over rounds).
- **Healing:** +1d8 per +1 rank for living-target single-target.
- **Status bonuses:** +1 at rank 1, +2 at rank 6, +3 at rank 9 (Heroism progression; cap is +3 because status doesn't stack with itself).

### 8. Run the balance checklist

→ **Load `references/design-checklist.md`** to walk every line item.

The 12 mandatory checks:
- [ ] Damage matches the GM Core table for the rank (or is within ±1 row).
- [ ] If conditions are stapled on, damage is reduced by ~2 rows.
- [ ] Conditions appear **only on failure / crit failure**, never on success.
- [ ] If the spell can take a creature out of the fight, **incapacitation** trait is present.
- [ ] Action cost matches power (1-action is strictly weaker than 2-action; 3-action ≈ 1.3–1.5× of 2-action, not 2×).
- [ ] Duration matches the tier; combat buffs cap at 1 min or sustained.
- [ ] Heightening uses the canonical per-rank delta (see step 7).
- [ ] Counteract rank = spell rank; spell can be dispelled normally.
- [ ] Spell is not a strict upgrade of an existing same-rank spell in the same tradition.
- [ ] Range/area within per-rank norms (see step 5).
- [ ] Damage type pricing applied (force ≈ 0.80×, mental ≈ 1.10×, etc.).
- [ ] Tradition list matches the essences (matter/mind/spirit/life).

If any check fails, point it out before presenting the final spell. The user can override — but they should override knowing the trade-off.

## Output format

Format the final spell exactly as a published PF2e spell entry would appear:

```
# Spell Name
**Spell** [Rank]
**Traits** [trait, trait, trait — alphabetical, lowercase, comma-separated]
**Traditions** [arcane, divine, occult, or primal]
**Cast** [actions] ([component/trait reminders if helpful])
**Range** [X feet]; **Area** [Y-foot Z]; **Targets** [if applicable]
**Defense** [basic Reflex / Will save / spell attack roll / none]
**Duration** [instantaneous / sustained up to N / N minutes / etc.]

[Effect paragraph — what the spell does in narrative + mechanical terms. If a save spell, give the four-degree breakdown explicitly.]

**Critical Success** [effect]
**Success** [effect]
**Failure** [effect]
**Critical Failure** [effect]

**Heightened (+N) / Heightened (Xth)** [scaling text]
```

After the formatted spell, give a **brief balance note** (3–5 bullets) showing what published spell it was anchored to, where it sits on the GM Core damage curve, what trade-offs were chosen (e.g., "smaller area than fireball because of the persistent-fire rider"), and any rules the user might want to override.

## When the user wants to evaluate (not create) a spell

Use the same checklist but in reverse:

1. Identify rank, archetype, damage type, save, action cost, duration.
2. Compare its damage/effect to the GM Core table for the rank.
3. Compare to the closest benchmark spell.
4. Walk the design checklist.
5. Report which checks pass, which fail, and propose specific fixes (e.g., "reduce damage from 8d6 to 6d6; add the **incapacitation** trait; change duration from 10 min to 1 min").

## Reference files

These are loaded on demand based on the step above. Don't preload them; load only what's needed.

| File | When to load |
|---|---|
| `references/damage-tables.md` | Step 3 — any damage spell. |
| `references/conditions.md` | Step 4 — any spell imposing a condition. |
| `references/traits-taxonomy.md` | Step 6 — picking traits, especially incapacitation, polymorph, mental. |
| `references/heightening.md` | Step 7 — writing the heightened entries. |
| `references/healing-buffs-summons.md` | When the spell heals, buffs, summons, or transforms. |
| `references/benchmark-spells.md` | Step 2 — always. Find the anchor spell. |
| `references/design-checklist.md` | Step 8 — final review of every spell. |

## Common pitfalls (don't let these slip through)

1. **Cantrips dealing slotted-spell damage** — cap at the Unlimited Use column, never the Limited Use column.
2. **Conditions on a successful save** — successes should be trivial/nothing. The fail tier is where effects live.
3. **Save-or-die without incapacitation** — every removed-from-combat effect needs the trait.
4. **Damage + condition + area + good save type** — pick two of three at full strength, not all four. (The "Everything Spell.")
5. **Long durations on combat buffs** — 10-minute Haste is broken. Combat buffs cap at 1 min or sustained.
6. **Free conditions on cantrips** — cantrips can impose frightened 1 / off-guard / persistent damage only on crit fail (or never, depending on the cantrip).
7. **3-action mode that doubles 2-action effect** — cap at ~1.3–1.5×.
8. **Multiple polymorphs stacking** — always add the polymorph trait.
9. **"Cannot be counteracted"** — never. Every spell is counterable at its own rank.
10. **Wrong tradition** — match essences (matter+mind = arcane, mind+spirit = occult, spirit+life = divine, matter+life = primal).
