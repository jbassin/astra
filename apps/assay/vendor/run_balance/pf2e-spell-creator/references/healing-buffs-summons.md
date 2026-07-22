# Healing, Buffs, Summons, Polymorph — Non-Damage Scaling

Reference for spells whose primary mechanic isn't damage: healing, buffs, summons, battle forms, walls.

---

## 1. Healing scaling

### Heal template (rank 1, divine/primal)

| Action cost | Range/Area | Heal amount |
|---|---|---|
| 1 action | Touch, 1 target | 1d8 |
| 2 actions (concentrate) | 30 ft, 1 target | 1d8 + 8 flat |
| 3 actions (concentrate) | 30-ft emanation, all living | 1d8 (also damages undead in area) |

**Heightened (+1):** healing increases by 1d8 to all variants. 2-action variant also gains +8 flat.

Worked numbers:
- Rank 1: 1d8 / 1d8+8 / 1d8 — averages 4.5 / 12.5 / 4.5.
- Rank 3: 3d8 / 3d8+24 / 3d8 — averages 13.5 / 37.5 / 13.5.
- Rank 5: 5d8 / 5d8+40 / 5d8 — averages 22.5 / 62.5 / 22.5.
- Rank 7: 7d8 / 7d8+56 / 7d8 — averages 31.5 / 87.5 / 31.5.
- Rank 10: 10d8 / 10d8+80 / 10d8 — averages 45 / 125 / 45.

### Custom healing rules of thumb
- 1d8 per rank baseline for single-target living-target healing.
- +8 flat per rank as the "ranged 30 ft" tax/bonus.
- 3-action burst heal cannot pick targets (hits friend and foe in 30-ft emanation).
- Healing cantrips give zero HP. Stabilize/Renew just ends dying.

### Soothe (rank 1, occult)
1d10 + 4 HP at 30 ft (1 willing living creature), plus +2 status bonus to saves vs mental for 1 minute.
**Heightened (+1):** healing increases by 1d10 + 4. Status bonus does NOT scale (stays +2).

### Anti-patterns
- Healing cantrips that restore HP.
- Healing with no action cost (free-action heal).
- 1-action ranged heal (must be touch or higher action cost for range).
- Healing scaling faster than +1d8 per rank.

---

## 2. Status bonus scaling

PF2e status bonuses do NOT stack — the highest wins. So the bonus value scales by rank but never combines.

| Bonus | Source spell | Rank |
|---|---|---|
| +1 status to attacks (allies in emanation, sustained) | Bless | 1 |
| -1 status to attacks (enemies fail save in emanation) | Bane | 1 |
| +1 status to attacks, Perception, saves, skills | Heroism | 3, 10-min |
| +2 status (same set) | Heroism heightened | 6 |
| +3 status (same set) | Heroism heightened | 9 |
| +2 status to saves vs mental | Soothe rider | 1 (does not scale) |

### Design rules
- +1 status to ONE roll: rank 1 (Bless). Soothe rider grants +2 status to saves vs mental (fixed).
- +1 status to "everything that matters": rank 3 (10-min duration).
- +2 to everything: rank 6.
- +3 to everything: rank 9 — this is the CAP. Don't exceed.
- Item bonus to AC scales differently (Mystic Armor):
  - +1 item AC at rank 1 (base); 4th adds +1 item to saves.
  - +2 item AC at rank 6 (saves +1); 8th keeps AC at +2, saves +2.
  - +3 item AC at rank 10 (saves +3).

### Anti-patterns
- Stacking status bonuses from two spells (against the rule).
- +4 status anywhere.
- "+1 to literally everything you do" at rank 1 — that's Heroism at rank 3.

---

## 3. Temp HP scaling

PF2e temp HP does NOT stack — the highest active value wins. So a temp HP buff has a soft "second-source-is-wasted" cost.

**Rule of thumb:** ~5 × spell rank for a dedicated temp-HP buff.

| Rank | Temp HP target |
|---|---|
| 1 | 5 |
| 2 | 10 |
| 3 | 15 |
| 4 | 20 |
| 5 | 25 |
| 6 | 30 |
| 7 | 35 |
| 8 | 40 |
| 9 | 45 |
| 10 | 50 |

Self-targeted defensive spells can go higher (e.g., a defensive 7th-rank polymorph that's also a temp-HP buff). Ally-target spells stay near or below the table.

---

## 4. Resistance scaling

Two published Remaster spells anchor this design space — Resist Energy (single-type, scales with rank) and Energy Aegis (all-types, top-end).

**Resist Energy** (rank 2, touch, 10 min). Pick one of acid, cold, electricity, fire, or sonic; target gains resistance 5.

| Cast at Rank | Resistance | Targets |
|---|---|---|
| 2 | 5  | 1 creature |
| 4 | 10 | up to 2 creatures |
| 7 | 15 | up to 5 creatures |

**Energy Aegis** (rank 7, touch, until next daily prep). Resistance 5 to all 8 energy types (acid, cold, electricity, fire, force, sonic, vitality, void) — no choice. Heightened (9th): resistance 10.

| Cast at Rank | Resistance | Coverage |
|---|---|---|
| 7 | 5  | all 8 energy types |
| 9 | 10 | all 8 energy types |

For custom resistance buffs, mirror the Resist Energy curve at low rank or Energy Aegis at rank 7+. Don't write blanket multi-type resistance below rank 7 — it eclipses both anchors.

---

## 5. Summon spell template

### Standard Summon (Animal / Fey / Fiend / Dragon / Construct / Elemental)
- **Action cost:** 3 actions.
- **Duration:** sustained up to 1 minute.
- **Range:** 30 ft.
- **Trait list:** concentrate, manipulate, summon.
- Creature acts on caster's turn; uses caster's action via Sustain.

### Creature level by spell rank

| Spell Rank | Creature Level |
|---|---|
| 1 | -1 |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| 5 | 5 |
| 6 | 7 |
| 7 | 9 |
| 8 | 11 |
| 9 | 13 |
| 10 | 15 |

**Formula:**
- Ranks 1–4: creature level ≈ 2 × rank − 3.
- Ranks 5–10: creature level ≈ 2 × rank − 5.

Themed summons (Fiend, Celestial, Dragon) typically start at rank 5 with a level-5 creature — the low-rank tier is skipped because the curated list is powerful.

### Anti-patterns
- Summon spell with NO sustain requirement (free creature).
- Summoned creature higher than the table.
- Summon that gets the caster's full action economy (treat as 1 action, not 3).

---

## 6. Polymorph / Battle Form scaling

### Animal Form (rank 2 base) — definitive template

| Cast Rank | AC | Atk Mod | Damage | Temp HP | Size | Reach | Athletics |
|---|---|---|---|---|---|---|---|
| 2 (base) | 16 + level | +9 | +1 | 5 | Medium | 5 ft | +9 |
| 3 | 17 + level | +14 | +5 | 10 | Medium | 5 ft | +14 |
| 4 | 18 + level | +16 | +9 | 15 | Large | 10 ft | +16 |
| 5 | 18 + level | +18 | +7 (double dice) | 20 | Huge | 15 ft | +20 |

### Heightening past rank 5
For Aerial / Dragon / Element Form: +1 attack mod per 2 ranks; +1 AC per rank up to a cap; damage continues to scale.

### Critical balance points
- **Attack mod is replacement**, not bonus. This stops a martial getting a strictly-better attack form.
- **AC is replacement** for the same reason.
- **Temp HP is the only HP buffer.** No extra HP otherwise.
- **Damage doubling at rank 5** (Huge tier) is the major spike. Design custom forms to match.

### Custom battle form rules
- Always polymorph trait.
- Always replaces (not adds to) attack/AC.
- Always sustained or 1-minute duration max for combat-relevant forms.
- Always uses the Animal Form template numbers — don't write better ones.

---

## 7. Walls and barriers

| Spell | Rank | Dimensions | AC / Hardness / HP | Duration |
|---|---|---|---|---|
| Wall of Wind | 3 | 60 ft long, 30 ft high | — (movement/ammo block) | 1 min |
| Wall of Fire | 4 | 60 ft long, 10 ft high, 5 ft thick | (damages passers, 4d6 fire) | 1 min |
| Wall of Ice | 5 | 60 ft long, 10 ft high, 1 ft thick | AC 10, Hardness 10, ~40 HP | 1 min |
| Wall of Stone | 5 | 120 ft long, 20 ft high, 1 inch thick | per 10×10 section: AC 10, Hardness 14, 50 HP. Permanent if sustained full duration. | Sustained / perm. |
| Wall of Force | 6 | 50 ft long, 20 ft high | AC 10, Hardness 30, 60 HP. Auto-destroyed by Disintegrate. Immune to counteract ≤ rank. | 1 min |

**Heighten rule:** Walls gain ~+15 HP per 2 ranks heightened.

### Custom wall rules
- Burst origin within 30–120 ft.
- Hardness scales by rank (10 at rank 5, 30 at rank 6 for force).
- HP per 10×10 section, ~50 at rank 5, scaling by ~+15 per 2 ranks.
- Counteract rank = spell rank (Wall of Force is immune to counteract LOWER than its rank; that's the exception, not the rule).

---

## 8. Area control spells

| Spell | Rank | Area | Effect |
|---|---|---|---|
| Grease | 1 | 4-sq area or 1 object | Reflex/Acrobatics or fall prone; on crit fail object spell, holder drops |
| Web (Tangling Creepers etc.) | 2 | 10-ft burst | Athletics/Reflex; failure = -10 ft speed; crit fail = immobilized |
| Stinking Cloud | 3 | 20-ft burst | Sickened 1-2, 1 min, cloud persists |
| Solid Fog | 4 | 20-ft burst | Difficult terrain + concealment; 1 min |
| Slither (Black Tentacles) | 5 | 20-ft burst | 3d6 piercing + 1d6 persistent poison; grabbed on fail, restrained on crit fail; ongoing per-turn save |
| Quandary (Maze) | 8 | 1 target | **Incapacitation.** Banish into demiplane; target makes Will/Int saves to escape |

### Rules of thumb for custom area control
- **Burst size:** 5-ft (rank 1), 10-ft (rank 2), 15–20-ft (3–5), 20–30-ft (6+). Cap at 30-ft burst.
- **Difficult terrain** is the lowest-impact area effect — fine at rank 1.
- **Save-or-grab** effects belong at rank 5+ and usually have ongoing damage as the rationale.
- **Save-or-removed-from-combat** (Quandary, Imprisonment) requires Incapacitation and rank 8+.

---

## 9. Utility / divination / illusion benchmarks

| Effect | Rank |
|---|---|
| Detect Magic, Read Aura, Light | Cantrip |
| Mystic Armor, Sure Strike (Mage Armor, True Strike) | 1 |
| Invisibility (ends on hostile action) | 2 |
| See Invisibility / See the Unseen | 2 (8-hr at rank 5) |
| Comprehend Language, Tongues base | 2 (Tongues) |
| Locate (specific object) | 3 |
| Locate (creature/ancestry) | 5 (heightened) |
| Invisibility (1 min, hostile-action-immune) | 4 (heightened) |
| Scrying | 6 (uncommon, divine/occult) |
| Teleport (100 mi) | 5 |
| Teleport (1,000 mi) | 7 (heightened) |
| Teleport (same planet) | 8 (heightened) |
| Interplanar Teleport / Plane Shift | 7 |
| Discern Location | 8 |
| Wish / Miracle (ritual) | 10 |

### Design rules of thumb
- **Long-duration utility scales by 1 rank per duration tier**: 10 min → 1 hour → 8 hours → 24 hours.
- **"You alone" is rank N; "you + allies" is rank N+1 to N+2.**
- **Divinations that find specific named creatures** belong at rank 5+. Generic categories ("nearest dragon") are rank 3 baseline.
- **Scrying and remote sensing** start at rank 6 — they're game-changers for investigation.
- **Permanent invisibility / undetectability** don't exist baseline; closest is Invisibility heightened (1 min unconditional) at rank 4. Hour-long combat-stable invisibility should be rank 8+.

---

## 10. Action-cost trade-offs

| Cost shift | Effect on spell |
|---|---|
| 2-action → 1-action (same spell) | Reduce damage/effect to ~60% |
| 2-action → 3-action (same spell) | Increase damage/effect to ~130–150% — usually via larger area or extra targets, not more dice |
| Adding sustain | Lose ~20% of "on cast" power; each round costs 1 action |
| Adding reaction trigger | Cap effect at ⅓ of equivalent slotted spell |
| Removing manipulate (subtle trait) | Effectively no penalty; design feature |
