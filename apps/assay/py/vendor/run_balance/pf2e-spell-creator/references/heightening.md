# Heightening Conventions — PF2e Remaster

How to write the Heightened entries of a custom spell. Two styles: **Heightened (+N)** for quantitative scaling, **Heightened (Xth)** for qualitative unlocks at specific ranks.

---

## 1. When to use which style

### Heightened (+N) — per-rank scaling
Use when the primary effect is **quantitative**: damage, healing, range, duration, number of targets.

Examples:
- Fireball: **Heightened (+1)** the damage increases by 2d6.
- Heal: **Heightened (+1)** the healing increases by 1d8 (and the 2-action variant gains +8 flat).
- Force Barrage: **Heightened (+2)** add 1 missile (and a corresponding action cost adjustment).

### Heightened (Xth) — specific-rank unlock
Use when the effect is **qualitative**: a new ability mode, a higher condition tier, a larger area, a new save penalty.

Examples:
- Fear: **Heightened (3rd)** target up to 5 creatures.
- Energy Aegis: **Heightened (9th)** resistances increase from 5 to 10 across all 8 energy types.
- Mystic Armor: **Heightened (4th, 6th, 8th, 10th)** the item bonus and Dex cap increase.

Use this style sparingly — it's harder to remember at the table. Prefer (+N) unless the scaling is genuinely non-linear.

---

## 2. Per-archetype heightening rates

### Area damage (basic save)
**Standard: +2 dice per +1 rank.**

| Anchor spell | Base | Heighten |
|---|---|---|
| Fireball | rank 3, 6d6 | +2d6 per +1 |
| Howling Blizzard (Cone of Cold) | rank 5, 10d6 | +2d6 per +1 |
| Sunburst | rank 7, 8d10 fire + 8d10 vitality vs undead | +1d10 each per +1 |
| Desiccate (Horrid Wilting) | rank 8, 10d10 void | +1d10 per +1 |

Note the dropoff to +1d10 at higher ranks for spells with bigger base dice — the per-rank value is roughly constant (~3.5 avg per d6 ≈ 5.5 avg per d10, both at "1 damage per 2 ranks" pace).

### Line / chain damage
**Standard: +1 die per +1 rank.** Slower because the geometry is bigger per dice.

| Anchor spell | Base | Heighten |
|---|---|---|
| Lightning Bolt | rank 3, 4d12 | +1d12 per +1 |
| Chain Lightning | rank 6, 8d12 | +1d12 per +1 |

### Single-target spell-attack damage
**Standard: +2 dice per +1 rank.**

| Anchor spell | Base | Heighten |
|---|---|---|
| Hydraulic Push | rank 1, 3d6 | +2d6 per +1 |
| Disintegrate | rank 6, 12d10 | +2d10 per +1 |
| Polar Ray | rank 8, 10d8 + drained 2 | +2d8 per +1 |

### Single-target save damage
**Standard: +1 die per +1 rank**, or **+2 dice per +2 ranks** for spells with persistent-damage riders.

| Anchor spell | Base | Heighten |
|---|---|---|
| Acid Grip (Acid Arrow) | rank 2, 2d8 + 1d6 persistent (Reflex non-basic) | +2d8 + 1d6 persistent per +2 |
| Vampiric Feast (Vampiric Touch) | rank 3, 6d6 void + temp HP (basic Fortitude) | +2d6 per +1 |

### Unconditional auto-hit damage
**Heighten by adding effects, not dice.**

| Anchor spell | Base | Heighten |
|---|---|---|
| Force Barrage | rank 1, 1d4+1 per shard (1/2/3 shards by 1/2/3 actions) | +1 shard per +2 ranks |

### Sustained AoE / wall damage
**+1 die per +1 rank.** Slower because the spell does damage per round of sustain.

| Anchor spell | Base | Heighten |
|---|---|---|
| Wall of Fire | rank 4, 4d6 | +1d6 per +1 |

### Save-or-suck damage spells
The damage portion grows minimally; the threshold scaling carries the rank.

| Anchor spell | Base | Heighten |
|---|---|---|
| Massacre | rank 9, 9d6 on success / 100 on fail / death on crit fail | rank 10: 10d6 / 115 / death; level cap rises from 17 to 19 |

### Cantrip damage
**+1 die per +1 rank** (clean cantrips).
**+1 die per +2 ranks** (loaded cantrips with strong riders or cones).

Cantrips auto-heighten to ceil(caster level / 2); the player doesn't choose a rank — it's the caster's max rank.

| Anchor spell | Base | Heighten |
|---|---|---|
| Electric Arc | 2d4, 2 targets | +1d4 per +1 |
| Telekinetic Projectile | 2d6 | +1d6 per +1 |
| Ignition | 2d4 ranged / 2d6 melee | +1 die per +1 |
| Daze | 1d6 mental + stun on crit fail | +1d6 per +2 |
| Live Wire | 1d4 slashing + 1d4 electricity + crit persistent | +1d4 each per +2 |
| Breathe Fire | 2d6 cone | +2d6 per +1 (rare; double-dice for cone shape) |

---

## 3. Per-archetype heightening rates (non-damage)

### Healing
**+1d8 per +1 rank** for single-target living-target healing (Heal template).
**+8 flat per +1 rank** for the 30-ft-range variant on top of the dice (Heal 2-action).

### Resistance
Two published Remaster anchors:

**Resist Energy** (rank 2, touch, 10 min). Single chosen type (acid/cold/electricity/fire/sonic). Heightens via specific ranks, not (+1):
- (2nd, base): resistance 5, 1 creature.
- Heightened (4th): resistance 10, up to 2 creatures.
- Heightened (7th): resistance 15, up to 5 creatures.

**Energy Aegis** (rank 7, touch, until next daily prep). All 8 energy types (acid, cold, electricity, fire, force, sonic, vitality, void). No choice.
- (7th, base): resistance 5.
- Heightened (9th): resistance 10.

| Rank | Resistance | Coverage |
|---|---|---|
| 2 | 5  | 1 type, 1 target (Resist Energy) |
| 4 | 10 | 1 type, 2 targets (Resist Energy heightened) |
| 7 | 5  | all 8 energy types (Energy Aegis) |
| 7 | 15 | 1 type, 5 targets (Resist Energy heightened) |
| 9 | 10 | all 8 energy types (Energy Aegis heightened) |

Custom blanket-type resistance below rank 7 eclipses both anchors — avoid it.

### Temp HP
**~5 × spell rank** for a dedicated temp-HP buff.

### Status bonuses
- +1 status: rank 1 (Bless). Soothe rider is +2 status to saves vs mental (fixed, does not scale).
- +1 to "everything that matters": rank 3 (Heroism), 10-min duration.
- +2 to everything: rank 6 (Heroism heightened).
- +3 to everything: rank 9 (Heroism heightened). Cap is +3 because status doesn't stack with itself.

### Item bonuses (Mystic Armor)
- Rank 1 (base): +1 item AC.
- Heightened (4th): +1 item AC, +1 item to saves.
- Heightened (6th): +2 item AC, +1 item to saves.
- Heightened (8th): +2 item AC, +2 item to saves.
- Heightened (10th): +3 item AC, +3 item to saves.

### Number of targets (mass spells)
Doubling the targets ≈ +2 ranks.
- Fear (1 target → 5 targets): rank 1 → rank 3.
- Slow (1 target → 10 targets): rank 3 → rank 6.
- Confusion (1 target → 10 targets): rank 4 → rank 8.

### Duration upgrade
Moving up one tier (sustained → 1 min, 1 min → 10 min, 10 min → 1 hour) ≈ +2 ranks.
Moving from sustained to 1 min unconditional ≈ +1 rank.

### Area increase (without dice change)
Increasing burst size by ~10 ft ≈ +2 ranks (rough — usually accompanied by dice).

### Summon creature level
Roughly: creature level ≈ 2 × spell rank − 3 for ranks 1–4; 2 × rank − 5 for ranks 5–10. Themed summon lists (Fiend, Celestial, Dragon) start at rank 5.

### Polymorph (battle form)
Animal Form template:
| Cast Rank | AC | Atk Mod | Damage | Temp HP | Size | Reach | Athletics |
|---|---|---|---|---|---|---|---|
| 2 (base) | 16 + level | +9 | +1 | 5 | M | 5 ft | +9 |
| 3 | 17 + level | +14 | +5 | 10 | M | 5 ft | +14 |
| 4 | 18 + level | +16 | +9 | 15 | L | 10 ft | +16 |
| 5 | 18 + level | +18 | +7 (double dice) | 20 | H | 15 ft | +20 |

Attack mod and AC are **replacements**, not bonuses — this stops a martial getting a strictly better attack form. Temp HP is the only HP buffer. Damage dice double at the Huge tier (rank 5).

---

## 4. Worked heightening examples

### Custom rank-2 area damage spell ("Burning Hand")
- Base: rank 2, 15-ft cone, 4d6 fire, basic Reflex. (Matches Limited Use row 3 — 4d6 — but cantrip-cone style.)
- Heightened (+1): damage increases by 2d6.
  - At rank 4: 8d6. (~28; matches row 7.)
  - At rank 6: 12d6. (~42; matches row 11.)

### Custom rank-3 condition-rider AoE ("Disorient")
- Base: rank 3, 20-ft burst, 4d6 mental, basic Will, frightened 1 on failure. (Damage 2 rows below row 5's 6d6 because of the rider.)
- Heightened (+1): damage increases by 2d6.

### Custom rank-1 single-target attack-roll spell ("Frost Lance")
- Base: rank 1, 60-ft range, 3d6 cold, spell attack. Same as Hydraulic Push.
- Heightened (+1): damage increases by 2d6.

### Custom rank-5 summon ("Summon Storm Spirit")
- Base: rank 5, 3-action cast, sustained up to 1 min, level-5 creature.
- Heightened (6th): level-7 creature.
- Heightened (7th): level-9 creature.
- ... and so on, +2 creature level per +1 rank.

### Custom rank-1 buff ("Storm Cloak")
- Base: rank 1, 1-action cast, 1 min duration, +1 status bonus to AC, immunity to electricity 5.
- Heightened (3rd): immunity becomes 10.
- Heightened (6th): immunity becomes 15; status bonus becomes +2.

---

## 5. Heightening anti-patterns

| Anti-pattern | Fix |
|---|---|
| Adding a new condition at a higher rank without a save | Always tie new conditions to a save. |
| Heightening damage faster than +2d6 per rank for AoE | Stick to +2 dice/rank (or +1 for big dice). |
| Heightening healing faster than +1d8 per rank | Stick to +1d8/rank. |
| Status bonus exceeding +3 | +3 is the published cap. |
| Custom blanket-resistance spell below rank 7 | Resist Energy (rank 2, single type) and Energy Aegis (rank 7, all types) are the two published anchors — match one of them, don't eclipse them. |
| Heightening to add "1 more target" linearly past rank 6 | Use specific (Xth) jumps to 5 targets / 10 targets, not "+1 target per +1 rank." |
| Heightening to add range past 500 ft | 500 ft is the standard high-rank range; 1,000 ft is rank 10 only. |
| Heightening to remove restrictions ("at 7th, ignore incapacitation") | Never. Incapacitation gating doesn't go away with rank. |
