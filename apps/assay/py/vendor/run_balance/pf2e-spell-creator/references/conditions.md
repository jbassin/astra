# Conditions & Save Effects — PF2e Remaster

The reference for choosing which condition a spell imposes, on what save tier, and at which rank. Conditions are the primary "effect language" of non-damage spells.

---

## 1. Conditions grouped by severity tier

### Tier S — Hard disable (usually requires Incapacitation; high rank only)

| Condition | Effect | Save | Earliest "on failed save" rank | Incapacitation? |
|---|---|---|---|---|
| **Paralyzed** | Off-guard; can't act except Recall Knowledge & purely mental actions; can't Seek. | Will/Fort | Rank 3 (Paralyze) | **Yes** |
| **Petrified** | Turned to stone (AC 9, Hardness 8); no senses; no aging. | Fort | Rank 6 (Flesh to Stone) | **Yes** |
| **Controlled** | Controller dictates all actions, reactions, even Delay. | Will | Rank 4 (Dominate / Possession) | **Yes** |
| **Unconscious (sleep)** | Can't act; -4 status to AC/Perception/Reflex; blinded + off-guard; prone. | Will (sleep), Fort (other) | Rank 1 (Sleep, 1 min) | **Yes** |
| **Confused** | Off-guard; treats no one as ally; spends all actions on random offensive output. | Will | Rank 4 (Confusion) | **Yes** |

### Tier A — Major action loss

| Condition | Effect | Save | Earliest "on fail" rank | Incapacitation? |
|---|---|---|---|---|
| **Slowed 1** | Lose 1 action at start of turn. | Fort | Rank 3 (Slow) | No |
| **Slowed 2** | Lose 2 actions. | Fort | Rank 3 (Slow, crit fail) | No |
| **Slowed 3** | Lose 3 actions. | Fort | Rank 6+ | Sometimes |
| **Stunned X** | Lose X total actions; overrides slowed. | Fort | Rank 3 as 1-round; higher for Stunned 2+ | Stunned 4+ usually |
| **Stupefied 1** | -1 status to Int/Wis/Cha checks, Will, spell DCs/atks; DC 5 flat to cast. | Will/Fort | Rank 1 (Daze) | No |
| **Stupefied 2** | -2 / DC 7 flat. | varies | Rank 3–5 | No |
| **Stupefied 3+** | -3 to -4. | varies | Rank 7+ | No |
| **Drained 1** | -1 Con; lose 1×level HP; max HP also reduced. | Fort | Rank 3+ | No |
| **Drained 2–4** | Stacks; -2/-3/-4. | Fort | Rank 5+ for drained 2 on fail; rank 7+ for higher | No |
| **Fleeing** | Spends all actions moving away from source. | Will | Rank 1 (Fear, crit fail 1 round) | No |
| **Immobilized** | Can't use move-trait actions. | Reflex | Rank 1 (Web/Grease, crit fail rider); standalone rank 2+ | No |
| **Grabbed** | Off-guard + immobilized; DC 5 flat to manipulate. | Reflex/Athletics | Rank 5 (Slither / Black Tentacles) | No |
| **Blinded** | All terrain difficult; auto crit-fail sight Perception; -4 if vision is only precise sense. | Fort | Rank 3+ (Blindness) | Often |

### Tier B — Moderate debuffs (workhorses; scale across ranks)

| Condition | Effect | Save | Earliest "on fail" rank |
|---|---|---|---|
| **Frightened 1** | -1 status to ALL checks/DCs. Ticks down at end of turn. | Will | Rank 1 (Fear success) |
| **Frightened 2** | -2 status to all. | Will | Rank 1 (Fear failure) |
| **Frightened 3** | -3 status to all. | Will | Rank 1 (Fear crit fail) |
| **Frightened 4** | -4 status. Max value. | Will | Rank 5+ as crit-fail, or rare emotion effects |
| **Sickened 1–4** | -X to checks/DCs; can't drink potions; 1-action + Fort save to reduce. | Fort | Rank 1 (Sickened 1, e.g., Stinking Cloud); Sickened 2 at rank 3+ |
| **Off-Guard** | -2 circumstance to AC. | varies | Rank 1 (Grease, Trip-cantrips) |
| **Prone** | Off-guard; -2 to attacks; only Crawl/Stand. | Reflex | Rank 1 (Grease crit fail, Tangle Vine) |
| **Clumsy 1–4** | -X Dex-based rolls, AC, Reflex, ranged. | Fort | Rank 1 for Clumsy 1; 2+ at rank 3+ |
| **Enfeebled 1–4** | -X Str-based rolls, melee atk/dmg, Athletics. | Fort | Rank 1 for Enfeebled 1; 2+ at rank 3+ |
| **Dazzled** | All creatures concealed if vision is only precise sense. | Fort | Rank 1 (rider on stronger spells) |
| **Deafened** | Auto crit-fail hearing Perception; -2 init; DC 5 flat auditory. | Fort | Rank 1 (rare; Sound-Burst variants) |
| **Fascinated** | -2 status to Perception/skills; can't use concentrate actions unrelated to source. | Will | Rank 1 (Charm-adjacent, often Incapacitation) |

### Tier C — Mild / utility

| Condition | Effect | Notes |
|---|---|---|
| **Fatigued** | -1 status to AC and saves; can't use exploration activities. | Rank 1+ as rider; cured by full rest |
| **Concealed** | DC 5 flat to target. | Rank 1 (Obscuring Mist) |
| **Hidden** | Off-guard to observer; DC 11 flat to target. | Rank 1–2 (Vanishing Tracks / Sanctuary-style) |
| **Undetected** | Can't be targeted; observer guesses square. | Rank 2 (Invisibility) |
| **Quickened** | +1 action of restricted type. | Rank 3 (Haste — Strike/Stride only); broader at rank 7+ |

### Tier D — Severity modifiers (rarely the primary spell effect)

| Condition | Effect |
|---|---|
| **Wounded X** | When you regain HP from dying, gain Wounded 1; future dying values increase by X. |
| **Doomed X** | Dying threshold reduced by X. Reserved for rank 7+ death-touch. |
| **Dying X** | Reach Dying 4 = dead. |
| **Persistent damage X** | End-of-turn damage; DC 15 flat to end. **Cantrips should NOT apply** (design rule). |

---

## 2. The four-degree save-effect contract

Every save spell distributes outcomes across four degrees. The canonical patterns:

### Low-rank single-target debuff (Rank 1, Fear template)
| Degree | Effect |
|---|---|
| Crit Success | Unaffected |
| Success | Frightened 1 (ticks down each turn — effectively 1 turn) |
| Failure | Frightened 2 |
| Crit Failure | Frightened 3 + fleeing 1 round |

### Low-rank area soft debuff (Rank 1, Grease / Daze)
| Degree | Effect |
|---|---|
| Crit Success | Unaffected |
| Success | Unaffected (intended outcome for ~50% of enemies) |
| Failure | Minor effect (prone / off-guard / -1 status, 1 round) |
| Crit Failure | Stronger (prone + drop item / 1 minute) |

### Mid-rank hard debuff (Rank 3, Slow template)
| Degree | Effect |
|---|---|
| Crit Success | Unaffected |
| Success | Slowed 1 for 1 round |
| Failure | Slowed 1 for 1 minute |
| Crit Failure | Slowed 2 for 1 minute |

### Mid-rank Incapacitation (Rank 3, Paralyze template)
| Degree | Effect |
|---|---|
| Crit Success | Unaffected |
| Success | Stunned 1 |
| Failure | Paralyzed 1 round |
| Crit Failure | Paralyzed 4 rounds + end-of-turn save to reduce |

### High-rank save-or-suck (Rank 6+, Flesh to Stone / Quandary)
| Degree | Effect |
|---|---|
| Crit Success | Unaffected |
| Success | Minor (e.g., slowed 1 for 1 round) |
| Failure | Major condition 1 round, OR removed from combat with end-of-turn save |
| Crit Failure | Removed permanently / petrified until counteracted |

### Basic save damage (ALL basic-save damage spells)
| Degree | Effect |
|---|---|
| Crit Success | No damage |
| Success | Half damage |
| Failure | Full damage |
| Crit Failure | Double damage |

### Anti-patterns
- **Success = full effect for 1 round.** Successes should be trivial. Reserve the real effect for failure.
- **Crit fail = same as fail.** Crit fail must escalate (longer duration, stronger value, additional condition).
- **No crit success row.** Always write all four. It's a load-bearing balance lever.
- **Imposing the condition on EVERY degree.** If even Crit Success applies the effect, you have a no-save spell.

---

## 3. The Incapacitation trait (CRITICAL)

**Official rule:** A spell with the incapacitation trait, when used against a creature of level higher than 2× the spell's rank, treats the target's save one degree of success better (or the caster's check one degree worse). So a rank-1 incapacitation spell vs a level-3+ creature gets a save-bump; a rank-3 vs level-7+; a rank-5 vs level-11+; etc.

The threshold is **creature level > spell rank × 2**.

### MUST have incapacitation
Any effect that removes a creature from the fight on a failed save:
- Unconsciousness (Sleep)
- Paralyzed (Paralyze)
- Petrified (Flesh to Stone)
- Controlled / Dominated
- Confused (Confusion)
- Banished / extradimensional removal (Banishment, Quandary)
- Imprisonment / soul-trap
- Charm with combat-ending behavioral changes
- Calm Emotions / Calm
- Death effects with no damage component (Power Word Kill, instant-kill Finger of Death)
- Mass long-duration fascination

### Does NOT need incapacitation
- Pure damage spells (Fireball, Disintegrate) — even if they HP-kill the target.
- Frightened, Sickened, Slowed 1, Stupefied — debuffs, not "out of the fight."
- Slow at rank 3 — slowed 1/2 is not incapacitating.
- Daze — stunned 1 on crit fail is a 1-turn debuff.

### Design heuristic
> **If the effect could reasonably make a player skip a full turn doing nothing, it needs Incapacitation.**

---

## 4. Trait gates for spell power

| Trait | Effect on design | Use it for |
|---|---|---|
| **Incapacitation** | Treats higher-level creatures' saves one step better. | Anything that removes from combat. |
| **Concentrate** | Disrupted by damage (counterspell hook); blocked while silenced. | Almost all spells. |
| **Manipulate** | Triggers Reactive Strike; requires hands free. | Spells with somatic-style casting. |
| **Subtle** | No verbal/somatic signs visible; can't be identified. | Stealth/illusion/charm at rank 2+. |
| **Linguistic** | Requires shared language. | Mental enchantments that "speak" to the target. |
| **Mental / Emotion / Fear / Death / Auditory / Visual** | Allow targeted immunities. | Use INSTEAD of removing Incapacitation. |
| **Cantrip** | All cantrip restrictions apply (no persistent damage; condition value cap 1; etc.). | Cantrips. |
| **Polymorph** | Doesn't stack with other polymorphs. | Battle forms, transformations. |
| **Healing + Vitality / Void** | Required tags for Heal/Harm; auto-damages opposite. | Heal, Harm. |
| **Summon** | Created creature has the summoned trait; counter-magic hooks. | Summon spells. |
| **Teleportation** | Hook for anti-teleport effects (Dimensional Lock). | Any teleport. |

---

## 5. Quick condition-pricing reference (for spells that impose a condition)

When pricing how much damage to subtract from a spell that imposes a condition:

| Condition imposed on fail | Damage reduction (rows in GM Core table) |
|---|---|
| Off-guard, 1 round | 0–1 row |
| Frightened 1, 1 round | 1 row |
| Sickened 1 | 1 row |
| Persistent damage (small die) | 1 row |
| Frightened 2 / Sickened 2 | 2 rows |
| Slowed 1, 1 round | 2 rows |
| Drained 1 | 2 rows |
| Slowed 1, 1 min | 3 rows |
| Blinded, 1 min (Incapacitation) | 3 rows |
| Stunned 1+ | 3 rows |
| Save-or-removed (Incapacitation) | Replace damage with symbolic minor damage |

If imposing the condition only on a critical failure, halve the reduction.
