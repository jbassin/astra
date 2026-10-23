# Ebb and Flow

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** comparables — **Pool reason:** wide-range
- **Current assay line:** comparables rank range 2–8 (LOW-INFORMATION — that is why it is in the manual pool); no numeric verdict/residual supplied
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, manipulate, mental
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Range:** "60 feet"
- **Area:** burst, 20 ft
- **Target:** "" (empty — area-based)
- **Defense:** Will save (non-basic)
- **Duration:** "1 minute", sustained = true
- **Heightening:** fixed, levels "5" and "7" (both empty objects — appendix-only text)

## The 5e original

- **Level:** 3rd
- **School:** Chronomancy
- **Casting time:** 1 action
- **Range:** 60 feet (point)
- **Components:** V, S, M ("an ant encased in amber")
- **Duration:** Concentration, up to 1 minute
- **Classes:** Bard, Druid, Wizard

> You detach a 20-foot-radius sphere centered on a point of your choosing from the natural flow of time.
>
> Allies gain an additional 10 feet of movement and can take a second reaction on turns they begin within the sphere.
>
> Enemies must succeed on a Wisdom saving throw against your spellcasting DC or their movement is reduced by 10 feet and they can only take either an action or bonus action on turns they begin within the sphere. Additionally, those who fail their saving throw cannot make multiattacks inside the sphere.

No entriesHigherLevel; the 5e original has no upcast/heightening text.

## The conversion (canonical store)

> You detach a 20-foot-radius sphere centered on a point within range from the natural flow of time, creating a zone where your allies move freely while your enemies wade through temporal molasses.
>
> While the zone lasts, it produces two simultaneous effects:
>
> **Allied Effect (automatic):** All allied creatures that begin their turn within the zone gain a +10-foot status bonus to their Speed until the start of their next turn and may use 1 additional reaction this turn (maximum 1 extra, not cumulative with other sources).
>
> **Enemy Effect (save required):** When the spell is cast, all enemy creatures in the area must attempt a Will saving throw. Creatures that enter the zone later must save when they first enter.
>
> **Critical Success** The enemy creature is unaffected by the temporal distortion.
> **Success** The enemy creature is unaffected by the temporal distortion.
> **Failure** The creature is *Slowed 1* (UUID link to the Slowed condition item) and limited to one Strike or one other action per turn while in the zone (no multi-Strike abilities). This persists for 1 round after it leaves the zone.
> **Critical Failure** As failure, and the creature also loses its reaction while within the zone.
>
> ---
> **Heightened (5th)** The allied Speed bonus increases to +20 feet. The zone's radius increases to 30 feet.
> **Heightened (7th)** Enemies that critically fail their Will save are also knocked *Prone* (UUID link to the Prone condition item) at the start of each of their turns while in the zone (no save). The allied extra-reaction benefit applies even to allies who enter the zone after it is created.

Two `@UUID[Compendium.pf2e.conditionitems.Item.Slowed]{Slowed 1}` / `@UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone}` links render as "Slowed 1" / "Prone" in the prose above (they are condition-item cross-references, not plain text).

## What changed, plain English

The dual ally/enemy zone concept is preserved closely: 20-ft-radius sphere within 60 ft, allies get +10 ft Speed and an extra reaction, enemies save or suffer reduced mobility and an action restriction, and enemies also lose the ability to multi-attack on a failure. Range, area radius, and the base ally Speed bonus all carry over 1:1.

Structure/mechanics:
- 5e single Wisdom save (pass/fail) for enemies → PF2e four-degree Will save. The crit-success/success split ("unaffected" both ways) collapses two 5e outcomes (only "pass" existed) into two identical PF2e outcomes — no new content there, just degree-of-success formalism. Critical failure (losing the reaction) is new — the 5e original had no crit tier at all.
- 5e "movement reduced by 10 ft, limited to action or bonus action" → PF2e "Slowed 1 + one Strike or one other action per turn" (PF2e has no bonus-action equivalent, so the closest condition/restriction combo was substituted).
- 5e Wisdom save → PF2e Will (organ-mapped).
- 5e concentration up to 1 minute → PF2e sustained up to 1 minute (structurally: `duration.sustained = true`, matches).
- Material component "an ant encased in amber" is **dropped** — `system.cost.value = ""` in the store (Remaster removed material components as a mechanical field).
- 5e non-scaling → PF2e adds two heighten tiers with no 5e basis: rank 5 (ally bonus +10→+20 ft, radius 20→30 ft) and rank 7 (crit-failure enemies get knocked Prone every turn with no save, plus late-arriving allies also get the extra-reaction benefit). Both are wholly new content relative to the 5e text.
- The 5e failure clause "persists for the duration the creature remains in the sphere" is implicit in 5e (only applies while inside); PF2e explicitly adds a **new** 1-round lingering effect after leaving the zone ("This persists for 1 round after it leaves the zone") — this has no 5e basis.
- Traits added with no 5e basis: chronomancy (school-as-trait replacing the 5e "time" custom trait jmnario had proposed), mental, concentrate/manipulate. Traditions arcane+occult replace the 5e Bard/Druid/Wizard class list.

## Converter's notes

- **Anchor:** "Haste (rank 3, +1 action, 1 min) + Slow (rank 3, slowed 1 on fail, 1 min); Ebb and Flow does both simultaneously in an AoE"
- **Archetype:** control/buff aura (dual ally/enemy time zone)
- **Balance bullets:**
  - "Haste + Slow at rank 3 combined into a single AoE zone is the 'Everything Spell' risk. Mitigated by: (a) ally buff is weaker than full Haste (+10 Speed + extra reaction vs +1 full action), (b) enemy debuff requires a Will save, (c) 20-ft burst only, (d) sustained."
  - "Will save for enemies is correct (temporal/mental perception of time). Slowed 1 + action limit on fail is weaker than Slow's full effect (Slow can give slowed 2 on crit fail with no anti-multi-attack); the no-multi-Strike clause compensates."
  - "The 20-foot burst at 60 feet is within rank-3 AoE norms (benchmark shows 20-ft burst at rank 3)."
  - "Sustained up to 1 minute is the correct combat cap for a dual buff/debuff aura — Haste and Slow are both 1 minute sustained; this matches."
  - "The 'time' trait is a custom trait flagged as potentially non-immunitable; the spell's effects are still gated by the mental trait on saves."
- **Overridable:**
  - "Could remove the allied extra-reaction benefit to reduce the spell's dual-axis power, keeping only the movement bonus — this would make the enemy-debuff axis clearly the primary function."
  - "The 'no multi-Strike' anti-flurry clause could be replaced with a simpler slowed 1 (matching Slow) if the GM prefers standard conditions over custom action restrictions."
- **Checklist failures:**
  - "Design tension: Combining Haste-level ally buff with Slow-level enemy debuff in a single AoE at rank 3 risks the 'Everything Spell' anti-pattern. Mitigations applied (weaker-than-Haste ally buff, Will save required for enemies, 20-ft burst only, sustained). Flagged for GM review — could reasonably be rank 4 if the combined effect proves too strong at table."

## Similar official spells

- **Haste (rank 3)** — single target, Quickened condition (+1 action usable only for Strike/Stride), 1 minute, no save; heightened 7th targets up to 6 creatures. The converter's own ally-side anchor.
- **Slow (rank 3)** — single target, Fortitude save (not Will), Slowed 1 on success-tier failure / Slowed 2 on crit failure, 1 minute; heightened 6th targets up to 10 creatures. The converter's own enemy-side anchor — note the save-statistic mismatch flagged below.
- **Confusion (rank 4)** — AoE-adjacent via heightening (targets up to 10 at rank 8), Will save, mental/emotion traits; useful reference for a Will-based mass mental-control effect at nearby ranks.

**Scorer comparables (low-information):** rank range 2–8 supplied by the assay routing (comparables pool, wide-range reason) — no specific named spells given in the chunk brief.

## Prior astra touches

None found in `revisions.md` — Ebb and Flow matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- The converter's own balance bullet says "Will save for enemies is correct (temporal/mental perception of time)," but the official rank-3 analog **Slow** uses a **Fortitude** save for its speed-reduction effect, not Will. Ebb and Flow's enemy effect (which functionally mirrors Slow — reduced actions/Slowed condition) uses Will instead.
- `heightening.levels["5"]` and `["7"]` are both empty objects; both heighten effects (Speed-bonus/radius bump at 5th; Prone-on-crit-fail + late-arrival ally benefit at 7th) live only in the description HTML (per the adapter warning).
- The store's failure-tier text adds "This persists for 1 round after it leaves the zone" — a lingering-effect clause with no 5e-original basis and not called out explicitly in the converter's preserved/changed-elements lists.
- Material component "an ant encased in amber" from the 5e original is dropped with no replacement (Remaster convention — no material components).

## Options & staff lean (enrichment, 2026-07-23)

The conversion is careful and the converter's OWN checklist names the issue: Haste-lite
for every ally + Slow-lite for every enemy in one zone at rank 3 — the Everything-Spell
tension — with his own stated remedy: "could reasonably be rank 4 if the combined effect
proves too strong." The mitigations (weaker-than-Haste buff, Will-gated debuff, 20-ft
burst, sustained) are real, but both single-target anchors (Haste, Slow) sit at THIS
rank and the zone does a version of each to multiple creatures. The Will-vs-Fortitude
flag is taste, not a defect (his temporal-perception reasoning + the mental trait hang
together); the 1-round lingering clause is a harmless invention.

- **A. Rank 3 → 4** — his own flagged remedy; keeps the full dual-axis design intact and
  prices the area multiplication. (Comparables routing gives no point score — record the
  call, no scorer gate applies.)
- **B. Keep rank 3, drop the ally extra-reaction** — his other overridable; trims the
  dual axis instead of pricing it.
- **C. Keep as-is at rank 3** — accepts the Everything-Spell risk he himself flagged.

**Lean: A.**
