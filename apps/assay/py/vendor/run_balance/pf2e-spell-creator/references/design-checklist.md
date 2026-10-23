# Design Checklist & Anti-patterns — PF2e Remaster Spell Balance

The final review pass. Walk every item before presenting the spell.

---

## 1. The 12 mandatory checks

For every custom spell, verify:

- [ ] **Rank** is set; **tradition list** (1–4) is set.
- [ ] **Traits** include the correct casting trait (concentrate / manipulate / subtle as appropriate), all damage-type traits, and any restriction traits (mental, fear, polymorph, incapacitation, death, sleep, summon, teleportation, illusion).
- [ ] **Action cost** (1 / 2 / 3 / reaction / free) matches the power. 1-action spells must be strictly weaker than 2-action spells. 3-action is ~1.3–1.5× of 2-action, never 2×.
- [ ] **Defense** is one of: basic save / non-basic save / spell attack roll / none-on-willing-target. Reject "no defense" for harmful effects.
- [ ] **Damage** is checked against the Area Damage or Strike Damage table at the appropriate level (rank-to-level mapping: rank R ≈ caster level 2R−1). Damage spells with conditions: subtract 2 rows.
- [ ] **Conditions** appear only on failure / critical failure, never on success. Hard CC (paralyzed, dominated, stunned 4+, petrified, sleep-style unconscious, save-or-die) has the **incapacitation** trait.
- [ ] **Duration** matches the tier (instantaneous / 1 round / 1 min / 10 min / 1 hr) and combat-grade buffs cap at 1 minute or sustained.
- [ ] **Heightening** uses (+1) or (Xth) correctly, with the per-rank delta matching the published progression (~+2d6 per rank for area; +1d8 for healing; etc.).
- [ ] **Counteract rank** = spell rank; the spell can be counteracted normally. **Never** write "cannot be counteracted."
- [ ] **Rarity** reflects narrative availability, not power. Don't bury a strong spell under "rare."
- [ ] Spell is **not** a strict upgrade of an existing spell of the same rank in the same tradition.
- [ ] **Tradition list matches essences** (matter+mind = arcane; mind+spirit = occult; spirit+life = divine; matter+life = primal).

---

## 2. Common balance pitfalls

| Pitfall | Why it breaks | Fix |
|---|---|---|
| Cantrip damage scaling like a slotted spell | Breaks the slot / unlimited divide | Use the Unlimited Use column; cap at half the limited-use damage at the same level |
| Save-or-die at low rank without incapacitation | Trivializes higher-level encounters via spam | Tag with **incapacitation** |
| Conditions stapled to a successful spell attack with no save | Bypasses the save-defense layer | Require a save in addition or instead; reduce damage |
| 3-action mode that doubles the 2-action effect | Warps action economy | Cap at ~1.3–1.5× |
| Long duration (10 min, 1 hr) on a powerful combat buff | Always-on | Shorten to 1 min, sustained, or 1 round |
| Multiple polymorphs stacking | Breaks intended cap | Add the **polymorph** trait |
| Hard CC without incapacitation | Spam against bosses | Always add **incapacitation** to paralyze/petrify/stun-4+/dominate |
| Damage + condition + area + good save type all at once | "Everything Spell" | Strip features; pick area damage OR strong condition, not both at full |
| "Targets the lower of two saves" | Reduces save floor | Pick one save; if you want flexibility, use a specific weakness, not a free choice |
| "Cannot be dispelled / counteracted" | Removes the dispel-magic layer | Always counterable at the spell's rank |
| Cantrip with a free condition on hit (e.g., frightened 1) | Massively outpaces Electric Arc | Conditions on cantrips only on crit fail, or never |
| Reactions that deal full-spell damage | Warps tempo | Reaction effects ≤ ⅓ of an equivalent slotted spell |
| Healing + damage in one spell | Doubles power budget | Pick one |
| No crit-success row in the save-effect breakdown | Hidden auto-effect | Always write all four degrees |
| Conditions appear on Success degree | Successes should be trivial | Move the condition to Failure |
| Heightening that adds a new condition without a save | Auto-staple effect | Tie any new condition to a save tier |

---

## 3. The "Everything Spell" anti-pattern

A common homebrew mistake: a spell that does all of:
- Big AoE damage
- Strong condition on failure
- Long range
- Reflex basic (the most common save weakness)
- Heightens generously

This is **Fireball + Slow + Stupefied + 10 min** stapled together. Reject this. Pick at most TWO of: high damage, strong condition, large area, long range.

Examples of how published spells trade off:
- **Fireball:** big damage, big area, no condition.
- **Slow:** strong condition, no damage, single target.
- **Stinking Cloud:** mild damage (none initially), persistent area, strong condition (sickened).
- **Confusion:** very strong condition (Incapacitation), no damage, single target.
- **Sunburst:** big damage, big area, very mild crit-fail rider (blindness on crit fail only).

When designing a multi-feature spell, force yourself to weaken one axis.

---

## 4. The "I want this to be cool" trap

Often a homebrew spell exists to enable a specific cool moment (e.g., "the warlock blinds an entire battlefield with shadow-flames"). Two failure modes:

1. **The cool moment is too good** — the player wins the encounter because the spell exists. Fix by adding incapacitation, smaller area, save tiers that make the cool moment a crit fail.
2. **The cool moment never triggers** — the player invested in a spell that only works on minions. Fix by ensuring the spell has a meaningful effect on success/failure too, not just crit fail.

### The Crit Fail Reward
Crit failures are 5–10% of saves (more vs low-save creatures). A spell whose cool moment is on crit fail is balanced — that's the design contract. Make the failure tier still meaningful so the spell isn't a Hail-Mary.

---

## 5. The cantrip ceiling

Cantrips are unlimited-use. To prevent a player from never running out of resources, the cantrip damage cap is enforced by the GM Core's **Unlimited Use** column.

| Caster Lvl | Cantrip cap (per 2-action cast) |
|---|---|
| 1  | 2d4 (~5) |
| 5  | 2d10 (~12) |
| 9  | 5d6 (~18) |
| 11 | 6d6 (~21) |
| 15 | 6d8 (~27) |
| 19 | 7d8 (~32) |
| 20 | 6d10 (~33) |

If a custom cantrip exceeds these numbers for its caster level, it's broken. Multi-target cantrips (Electric Arc) split the same total across targets but get to apply it twice.

### Cantrip-specific rules
- No persistent damage (mainline rule).
- Conditions cap at value 1 (no Frightened 2 from a cantrip).
- Status effects last 1 round unless trivial (off-guard).
- Defensive cantrips need an explicit limiter (Shield's 10-min cooldown).
- Cantrips do NOT need to be balanced against full-rank slotted spells of the same rank — they're held intentionally below the Limited Use line.

---

## 6. Specific high-risk archetypes

### Sleep / mass control
Always Incapacitation. Always Will save. Wake-up condition (damage / harsh sound). Duration that decays.

### Polymorph / battle form
Add polymorph trait. Attack mod and AC are replacements, not bonuses. Use Animal Form template (see heightening.md) for scaling.

### Summon
Add summon trait. Sustained up to 1 min. 3-action cast. Creature level ≈ 2×rank − 3 (ranks 1–4), 2×rank − 5 (ranks 5–10).

### Wall / area-control
- AC 10, Hardness scales by rank (Wall of Stone Hardness 14, Wall of Force Hardness 30).
- HP scales by rank (Wall of Stone 50/section, Wall of Force 60).
- Sustained or fixed minute duration.
- Counteract rank = spell rank.

### Healing
1d8 per rank for living-target single-target. +8 flat for ranged-30-ft variant. 3-action burst hits friend and foe in 30-ft emanation.

### Teleport
- Within sight: lower rank (Dimension Door 4).
- Long-range: rank 5 (Teleport, 100 miles).
- Interplanar: rank 7 (Plane Shift).
- Discern Location (find specific creature): rank 8.

### Mind control
- Charm (1): "treat caster as friendly."
- Suggestion (2-3): single requested action.
- Dominate (6): full control, incapacitation.
- Each tier is a major escalation; don't let a low-rank spell do Dominate's job.

### Death effects
- Damage death effects (Massacre rank 9): single-target removal at top of rank curve.
- Instant-kill at lower rank: requires incapacitation and a high crit-fail threshold.
- Aging/withering: usually rank 7+.

---

## 7. Sanity check: would I let this be a player spell?

Final mental test: imagine a player at your table picks this spell. After three sessions, do they feel:

- **The spell does its job sometimes but not always** — good. (Successes negate it, crit fails reward it, fails deliver the intended effect.)
- **The spell always wins the encounter** — bad. Scale back, add incapacitation, shrink area, shorten duration.
- **The spell never matters** — bad. Increase the failure-tier reward, or fold it into a more impactful spell.
- **The spell duplicates an existing class spell but better** — bad. It must occupy a different niche.

---

## 8. Evaluating an existing spell (reverse workflow)

If the user shows a spell and asks "is this balanced?":

1. Extract: rank, archetype, damage type, save, action cost, duration, traits, heightening.
2. Compare damage to the GM Core table for the rank.
3. Compare to the closest benchmark spell.
4. Walk the 12-item checklist.
5. Report:
   - Which checks PASS.
   - Which checks FAIL.
   - Specific suggested fixes (e.g., "reduce damage from 8d6 to 6d6 to match Fireball; add the incapacitation trait; change duration from 10 min to 1 min").
6. If the user pushes back, explain the trade-off — they may have a deliberate intent.

---

## 9. Final output format

After all checks pass, present:

1. The spell in published-format (see SKILL.md §Output format).
2. A brief balance note:
   - Anchor spell used for comparison.
   - Where it sits on the GM Core damage curve.
   - Trade-offs chosen (smaller area, persistent rider, etc.).
   - Any rules the user might override (e.g., "I cut duration to 1 round so it's a tactical pump rather than always-on; the user could extend to 1 min if they're okay with the buff being stronger than Heroism for its rank").
