# Damage Tables & Pricing — PF2e Remaster

All averages assume even die distributions. Damage **on a failed save** is full; basic save halves on success, doubles on crit fail, zero on crit success.

---

## 1. GM Core Area Damage Table (the load-bearing reference)

This is the official Paizo damage-budget table from GM Core's "Design Abilities" chapter. Use it for any 2-action area damage spell.

| Caster Lvl | Unlimited (Cantrip) | Limited (Slotted Spell) |
|---|---|---|
| 1  | 2d4 (5)    | 2d6 (7)  |
| 2  | 2d6 (7)    | 3d6 (11) |
| 3  | 2d8 (9)    | 4d6 (14) |
| 4  | 3d6 (11)   | 5d6 (18) |
| 5  | 2d10 (12)  | 6d6 (21) |
| 6  | 4d6 (14)   | 7d6 (25) |
| 7  | 4d6 (15)   | 8d6 (28) |
| 8  | 5d6 (17)   | 9d6 (32) |
| 9  | 5d6 (18)   | 10d6 (35) |
| 10 | 6d6 (20)   | 11d6 (39) |
| 11 | 6d6 (21)   | 12d6 (42) |
| 12 | 5d8 (23)   | 13d6 (46) |
| 13 | 7d6 (24)   | 14d6 (49) |
| 14 | 4d12 (26)  | 15d6 (53) |
| 15 | 6d8 (27)   | 16d6 (56) |
| 16 | 8d6 (28)   | 17d6 (60) |
| 17 | 8d6 (29)   | 18d6 (63) |
| 18 | 9d6 (30)   | 19d6 (67) |
| 19 | 7d8 (32)   | 20d6 (70) |
| 20 | 6d10 (33)  | 21d6 (74) |

**Spell rank → caster level mapping** (for a primary full caster):
- Cantrip auto-heightens to ceil(level / 2). At level 3 a cantrip is rank 2; at level 5 it's rank 3; etc.
- A slotted spell of rank R is typically cast at caster level 2R − 1 or 2R.

So when you pick a rank-3 slotted spell, look at row 5 (level 5) → 6d6. That's the fireball benchmark exactly.

**Note on Fireball:** the iconic spells (Fireball, Lightning Bolt) often sit ~1 row above table. This is the deliberate Paizo signal that flagship spells are slightly above-curve to remain attractive.

---

## 2. Strike Damage Table (for single-target spell-attack-roll spells)

Use this when a custom spell uses a spell attack roll against a single creature (Disintegrate, Polar Ray, Hydraulic Push, Telekinetic Projectile).

| Lvl | Low | Mod | High | Extreme |
|---|---|---|---|---|
| 1  | 1d4+2 (4)    | 1d6+2 (5)    | 1d6+3 (6)    | 1d8+4 (8)  |
| 2  | 1d6+3 (6)    | 1d8+4 (8)    | 1d10+4 (9)   | 1d12+4 (10) |
| 3  | 1d6+5 (8)    | 1d8+6 (10)   | 1d10+6 (11)  | 1d12+8 (14) |
| 4  | 2d4+4 (9)    | 2d6+5 (12)   | 2d8+5 (14)   | 2d10+7 (18) |
| 5  | 2d4+6 (11)   | 2d6+6 (13)   | 2d8+7 (16)   | 2d12+7 (20) |
| 6  | 2d4+7 (12)   | 2d6+8 (15)   | 2d8+9 (18)   | 2d12+10 (23) |
| 7  | 2d6+6 (13)   | 2d8+8 (17)   | 2d10+9 (20)  | 2d12+12 (25) |
| 8  | 2d6+8 (15)   | 2d8+9 (18)   | 2d10+11 (22) | 2d12+15 (28) |
| 9  | 2d6+9 (16)   | 2d8+11 (20)  | 2d10+13 (24) | 2d12+17 (30) |
| 10 | 2d6+10 (17)  | 2d10+11 (22) | 2d12+13 (26) | 2d12+20 (33) |
| 11 | 2d8+10 (19)  | 2d10+12 (23) | 2d12+15 (28) | 2d12+22 (35) |
| 12 | 3d6+10 (20)  | 3d8+12 (25)  | 3d10+14 (30) | 3d12+19 (38) |
| 13 | 3d6+11 (21)  | 3d8+14 (27)  | 3d10+16 (32) | 3d12+21 (40) |
| 14 | 3d6+13 (23)  | 3d8+15 (28)  | 3d10+18 (34) | 3d12+24 (43) |
| 15 | 3d6+14 (24)  | 3d10+14 (30) | 3d12+17 (37) | 3d12+26 (45) |
| 16 | 3d6+15 (25)  | 3d10+15 (31) | 3d12+18 (38) | 3d12+29 (48) |
| 17 | 3d6+16 (26)  | 3d10+16 (32) | 3d12+19 (39) | 3d12+31 (50) |
| 18 | 3d6+17 (27)  | 3d10+17 (33) | 3d12+20 (40) | 3d12+34 (53) |
| 19 | 4d6+14 (28)  | 4d8+17 (35)  | 4d10+20 (42) | 4d12+29 (55) |
| 20 | 4d6+15 (29)  | 4d8+19 (37)  | 4d10+22 (44) | 4d12+32 (58) |

For PC spell-attack spells, target the **Moderate** column at the spell's expected caster level (2R−1 to 2R). High-stakes save-or-die spells with a damage component sit at High. Cantrip spell-attack spells (Telekinetic Projectile, Ignition ranged) live on the Strike line because they replace a Strike.

---

## 3. Archetype dice formulas (canonical patterns)

### Single-target spell-attack damage
**+2 damage dice per +1 rank.** Examples:
- Hydraulic Push: rank 1, 3d6, +2d6 per +1
- Disintegrate: rank 6, 12d10, **+2d10 per +1**
- Polar Ray: rank 8, 10d8 + drained 2, +2d8 per +1

### Single-target save damage (non-basic Reflex)
**+2 dice per +2 ranks**, often with a persistent rider:
- Acid Grip: rank 2, 2d8 + 1d6 persistent acid, **+2d8 + 1d6 persistent per +2** (Reflex non-basic; success = half + no persistent, fail = full + persistent, crit fail = double + persistent)

### Single-target basic-save damage
**+1 die per +1 rank** (smaller cone because the target gets save tiers).

### Multi-target / area basic-save damage
**+2 dice per +1 rank** for bursts and cones (Fireball template).
**+1 to +2 dice per +1 rank** for lines/chains (slower because they're geometrically bigger).

### Unconditional auto-hit (no save, no attack)
Heighten by **adding effects, not dice.** Force Barrage adds +1 missile per +2 ranks. Total dice per rank is ~60–70% of an equivalent save-spell because no save layer applies.

### Sustained AoE / wall damage
**+1 die per +1 rank** — slower scaling because the spell deals damage each round of sustain.

### Save-or-suck damage spells
The damage component is small or symbolic; the save effect carries the weight. Massacre's "9d6 success / 100 fail / death crit fail" is the template — the dice are decorative; the threshold matters.

### Cantrip damage
**+1 die per +1 rank** for clean cantrips (Electric Arc 2d4 → 11d4).
**+1 die per +2 ranks** for "loaded" cantrips with strong riders (Daze, Live Wire) or cone-shaped (Breathe Fire — though Breathe Fire's +2d6 per +1 is the exception that proves the rule).

---

## 4. Per-rank archetype benchmarks

Damage shown is **on a failed save** (basic) or **on a hit** (spell attack). Numbers are averages.

| Rank | ST attack | ST basic save | ST auto-hit | AoE basic save | Save-or-suck damage |
|---|---|---|---|---|---|
| 1 | 3d6 (10) | 3d6 (10) | ~12 (3 missiles) | 2d6 burst (7) | n/a |
| 2 | 3d8 + 1d6 persistent (~17) | 2d8 + 1d6 persistent (~13) | ~16 | 4d6 (14) | n/a |
| 3 | 5d6 (~18) | 6d6 (~21) | ~20 | **6d6 fireball (21)** / 4d12 lightning (26) | 6d6 + Slow status |
| 4 | 6d6–8d6 (~25) | 8d6 (~28) | ~24 | 8d6 (28) | Confusion (no damage) |
| 5 | 8d6 (~28) | 10d6 (~35) | ~28 | **10d6 Howling Blizzard (35)** | Banishment (no damage) |
| 6 | **12d10 Disintegrate (~66)** | ~50 | ~32 | **8d12 Chain Lightning (52)** | Disintegrate is both |
| 7 | 14d10 (~77) | ~60 | ~36 | **8d10 Sunburst (44)** (+ 8d10 vs undead) | Plane Shift (utility) |
| 8 | **10d8 Polar Ray + drained 2 (~45)** | ~70 | ~40 | **10d10 Desiccate (55)** | Quandary (no damage) |
| 9 | 12d8 (~54) | ~80 | ~44 | **6d10 + 14d6 Falling Stars (~82)** | **Massacre: 100 on fail / death on crit fail** |
| 10 | 14d8 (~63) | ~90 | ~48 | **Cataclysm 7×3d10 (~115)** mixed types | Wish (ritual) / Remake (ritual) |

---

## 5. Damage type pricing

PF2e creatures use some damage types as resistances/immunities far more often than others. When pricing a custom spell, multiply the baseline dice count by the modifier for the damage type.

| Damage type | Pricing modifier | Notes |
|---|---|---|
| Fire | 1.00× | Baseline. Extremely common resistance. |
| Cold | 1.00× | Baseline. Common resistance. |
| Electricity | 1.00× | Baseline. Common resistance. |
| Acid | 1.00× | Baseline. Moderately common resistance. |
| Sonic | 1.00× | Baseline. Less commonly resisted but many constructs/oozes resist. |
| Bludgeoning / Piercing / Slashing (single) | 0.95× | Resisted as physical bundle by skeletons/oozes/swarms. |
| Mental | 1.10× | Many enemies fully immune (mindless undead, oozes, constructs, vermin). |
| Vitality | 1.10× | Only damages undead. Reliable when it applies, zero otherwise. |
| Void | 1.10× | Only damages living. Carries the death-flavor trait. |
| Force | 0.80× | Rarely resisted; bypasses incorporeal. |
| Spirit | 0.85× | Rarely resisted; doesn't affect mindless constructs. |
| Untyped (Disintegrate) | 0.80× | Should require spell attack OR incapacitation trait. |
| Mixed types (Cataclysm) | 1.15× | Each type defeats a different resistance set. |
| Holy / Unholy (sanctified) | 1.05× | Affects only the opposing alignment-coded creatures. |

### Rider pricing
When a damage spell also imposes a condition, persistent damage, or status:

| Rider | Cost |
|---|---|
| Persistent damage | ≈ 0.5–0.75 dice of base damage. Usually paired with smaller base dice. |
| Single-target status on hit (e.g., Polar Ray drained 2) | ≈ 2–3 dice of base damage. |
| Status only on crit fail (Vitality Lash enfeebled 1, Daze stunned 1) | Free in modern Remaster. |
| Strong status on every failure | ≈ 1–2 dice or 1 rank of restraint. |
| Knockback / forced movement | ≈ 0.5 dice. |
| Off-guard 1 round | Free on a crit hit, ≈ 0.5 dice baseline. |
| Frightened 1 (success or fail) | ≈ 1 die. |
| Difficult terrain in area | ≈ 0.5–1 die. |

---

## 6. Cantrip damage by rank

Half-level rounded up. Use 2d4-based cantrip for the "soft" version (Electric Arc, Void Warp), 2d6-based for the "hard" version (Telekinetic Projectile, Breathe Fire).

| Caster Lvl | Cantrip Rank | 2d4-base ST | 2d6-base ST | 2d4 × 2 targets (Electric Arc) | 2d6 cone (Breathe Fire, +2d6/+1) |
|---|---|---|---|---|---|
| 1  | 1  | 2d4 (5)   | 2d6 (7)   | 2d4 + 2d4 (10)  | 2d6 (7) |
| 3  | 2  | 3d4 (7.5) | 3d6 (10.5)| 3d4 + 3d4 (15)  | 4d6 (14) |
| 5  | 3  | 4d4 (10)  | 4d6 (14)  | 4d4 + 4d4 (20)  | 6d6 (21) |
| 7  | 4  | 5d4 (12.5)| 5d6 (17.5)| 5d4 + 5d4 (25)  | 8d6 (28) |
| 9  | 5  | 6d4 (15)  | 6d6 (21)  | 6d4 + 6d4 (30)  | 10d6 (35) |
| 11 | 6  | 7d4 (17.5)| 7d6 (24.5)| 7d4 + 7d4 (35)  | 12d6 (42) |
| 13 | 7  | 8d4 (20)  | 8d6 (28)  | 8d4 + 8d4 (40)  | 14d6 (49) |
| 15 | 8  | 9d4 (22.5)| 9d6 (31.5)| 9d4 + 9d4 (45)  | 16d6 (56) |
| 17 | 9  | 10d4 (25) | 10d6 (35) | 10d4 + 10d4 (50)| 18d6 (63) |
| 19 | 10 | 11d4 (27.5)| 11d6 (38.5)| 11d4 + 11d4 (55) | 20d6 (70) |

**Cantrip rules:**
- No persistent damage from cantrips (post-Remaster design rule; exceptions exist but mainline avoids it).
- Conditions imposed by a cantrip cap at value 1 (no Frightened 2 from a cantrip directly).
- Cantrip status effects last 1 round unless trivial (off-guard).
- Defensive cantrips (Shield) need an explicit limiter (10-minute cooldown after Shield Block).

---

## 7. Healing scaling

### Heal template (rank 1, divine/primal)
| Action cost | Range/Area | Heal amount |
|---|---|---|
| 1 action | Touch, 1 target | 1d8 |
| 2 actions | 30 ft, 1 target | 1d8 + 8 flat |
| 3 actions | 30-ft emanation, all living | 1d8 (also damages undead in area) |

**Heightened (+1):** +1d8 to all variants; the 2-action variant also gains +8 flat per rank.

So at rank 5: 1-action = 5d8 (≈22); 2-action = 5d8 + 40 (≈62); 3-action emanation = 5d8 (≈22) to everyone in 30 ft.

### Custom healing rules of thumb
- **1d8 per rank** baseline for single-target living-target healing.
- **+8 flat per rank** as the "ranged" tax/bonus when adding range to a touch spell.
- **3-action burst heal hits friend and foe alike** — cannot pick targets in the area.
- Healing cantrips give zero HP. Stabilize/Renew just ends the dying condition. Healing-via-cantrip is restricted by class feats only.

### Soothe (rank 1, occult)
- 1d10 + 4 HP at 30 ft (1 willing living creature), plus +2 status bonus to saves vs mental effects for 1 minute.
- Heightened (+1): healing increases by 1d10 + 4. Status bonus does NOT scale (stays +2).

---

## 8. Resistance & temp HP scaling

### Resistance: the two Remaster spells

There are TWO published resistance spells in Remaster — Resist Energy (single-type, scales by rank) and Energy Aegis (all-types, top-end).

**Resist Energy** (rank 2, touch, 10 min duration). The caster picks one of acid, cold, electricity, fire, or sonic; target gains resistance 5 to that type.

| Cast at Rank | Resistance | Targets |
|---|---|---|
| 2 | 5  | 1 creature |
| 4 | 10 | up to 2 creatures |
| 7 | 15 | up to 5 creatures |

**Energy Aegis** (rank 7, touch, until next daily prep). Grants **resistance 5 to all 8 energy types simultaneously** (acid, cold, electricity, fire, force, sonic, vitality, void) — no choice. Heightened (9th): resistance becomes 10.

| Cast at Rank | Resistance | Coverage |
|---|---|---|
| 7 | 5  | all 8 energy types |
| 9 | 10 | all 8 energy types |

For custom resistance buffs, anchor to Resist Energy's single-type curve at low rank, or Energy Aegis's blanket curve at rank 7+. Blanket multi-type resistance at lower rank should be avoided — it eclipses both anchors.

### Temp HP scaling
Aim for **temp HP ≈ 5 × spell rank** for a dedicated temp-HP buff. PF2e temp HP doesn't stack from multiple sources, so the cap matters less than usual. Self-target defensive spells can go higher; ally-target spells stay lower.

### Status bonuses to attack/saves/etc.
- **+1 status** to a single roll: rank 1 (Bless, Soothe rider).
- **+1 status to everything that matters** (attacks/saves/skills/Perception): rank 3 (Heroism), 10-min duration.
- **+2 status to everything:** rank 6 (Heroism heightened).
- **+3 status to everything:** rank 9 (Heroism heightened; cap).

### Item bonus to AC (Mystic Armor)
- +1 item AC at rank 1 (base). Heightened (4th) adds +1 item to saves.
- +2 item AC at rank 6 (saves +1). Heightened (8th) keeps AC at +2 but bumps saves to +2.
- +3 item AC at rank 10 (saves +3).

---

## 9. Damage budget vs creature HP (sanity check)

Creature HP averages (Moderate column):

| Lvl | Low | Mod | High |
|---|---|---|---|
| 1  | 15  | 20  | 25 |
| 3  | 34  | 45  | 56 |
| 5  | 56  | 75  | 94 |
| 7  | 86  | 115 | 144 |
| 9  | 116 | 155 | 194 |
| 11 | 146 | 195 | 244 |
| 13 | 176 | 235 | 294 |
| 15 | 206 | 275 | 344 |
| 17 | 236 | 315 | 394 |
| 20 | 281 | 375 | 469 |

**Damage-as-fraction-of-HP targets for a 2-action area damage spell** vs a same-level Moderate creature:

| Spell type | On fail | On crit fail |
|---|---|---|
| Cantrip | 10–15% | 20–25% |
| Limited-use spell at native rank | 25–35% | 50–70% |
| Single-target attack (Disintegrate-style) | 35–50% | 70–100% |

If your custom spell exceeds these brackets, scale back or add a restriction (incapacitation, smaller area, lower range).
