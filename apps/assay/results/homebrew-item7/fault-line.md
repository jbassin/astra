# Fault Line

## Header block

- **Rank:** 6 (store: `system.level.value = 6`)
- **Routing:** hybrid — **Pool reason:** wide-range
- **Current assay line:** verdict −0.63 ranks COLD; comparables rank range 1–8 (LOW-INFORMATION — that is why it is in the manual pool); residual −0.63 ranks
- **Adapter warnings:** none (`flags.assay.adapterWarnings = []`)
- **Traits:** concentrate, earth, kosmoturgy, manipulate
- **Traditions:** arcane, primal
- **Cast:** time.value = "2" (2-action spell)
- **Range:** "500 feet"
- **Area:** line, 60 ft
- **Target:** "" (empty — area-based)
- **Defense:** basic Reflex save
- **Duration:** "" (instantaneous, not sustained)
- **Damage:** `8d10` bludgeoning
- **Heightening:** interval type, interval 1, damage `{"0": "2d10"}` (structural — only the damage bump is represented; see What changed)

## The 5e original

- **Level:** 6th
- **School:** Kosmoturgy
- **Casting time:** 1 action
- **Range:** Self (60-foot line)
- **Components:** V, S (no material)
- **Duration:** Permanent
- **Classes:** Cleric, Paladin

> You rupture the ground along a 60-foot line that you designate. All spaces affected by the spell become difficult terrain. In addition, all creatures in an affected space are knocked prone and take 8d6 bludgeoning damaging [sic]. Creatures that make a successful Dexterity saving throw take half damage and are not knocked prone. This spell doesn't damage permanent structures.

No entriesHigherLevel; the 5e original has no upcast/heightening text.

## The conversion (canonical store)

> You rupture the ground along a line, splitting the earth and hurling debris in a shockwave of bludgeoning force. Each creature in the affected line takes 8d10 bludgeoning damage from the seismic upheaval. All spaces in the line become difficult terrain (rubble and fissures), which persist permanently. The difficult terrain can be cleared by spending 1 minute of work per 5-foot square.
>
> **Critical Success** The creature takes no damage and is not knocked *Prone* (UUID link to the Prone condition item).
> **Success** The creature takes half damage and is not knocked *Prone* (UUID link).
> **Failure** The creature takes full damage and is knocked *Prone* (UUID link).
> **Critical Failure** The creature takes double damage and is knocked *Prone* (UUID link); it also cannot stand up until the start of its next turn.
>
> ---
> **Heightened (+1)** The damage increases by 2d10 and the line increases in length by 10 feet.

Two additional `@UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone}` links appear beyond the pair quoted above (in the crit-success and success tiers). All four Prone references are condition-item cross-references rendering as "Prone," not plain text.

## What changed, plain English

The core beat carries over: a line-shaped ground rupture, bludgeoning damage, permanent difficult terrain in the affected squares (clearable via 1 minute of work per 5-ft square — the clearing-time detail is new, see below), and a Dex/Reflex save that halves damage and negates the prone rider.

Numbers changed:
- 5e range "Self (60-foot line)" → PF2e "500 feet range, 60-foot line" — the line no longer has to originate at the caster; it can be placed up to 500 ft away. This is a real range expansion, not just a unit relabel.
- 5e 8d6 bludgeoning (avg 28) → PF2e 8d10 bludgeoning (avg 44) — a straight damage-dice increase, not merely a rank-appropriate rescale of the same dice count.
- 5e permanent difficult terrain with no stated way to clear it → PF2e adds an explicit clearing rule ("1 minute of work per 5-foot square") — new content with no 5e basis.
- 5e non-scaling (no upcast) → PF2e adds a `+1`-interval heighten: +2d10 damage and +10 ft line length per rank above 6th. Wholly new content.

Structure/mechanics:
- 5e single Dexterity save (pass = half damage + no prone; fail = full damage + prone, i.e., a **binary two-outcome** structure) → PF2e four-degree basic Reflex structure. The crit-success tier ("no damage, not prone") and crit-failure tier ("double damage, prone, and can't stand until the start of its next turn") are both new — the 5e original has no crit band at all, only pass/fail.
- Prone-on-failure (not crit-fail-only) is preserved from the 5e text (5e: "creatures in an affected space are knocked prone" unless they save) — this maps to PF2e's "Failure: prone" tier, which the converter's own notes flag as a non-standard rider on a **basic** save (PF2e basic-save convention typically reserves condition riders for the crit-fail tier only).
- Traits added with no direct 5e basis: bludgeoning-implied via `damage.type` (not a listed trait), earth, kosmoturgy (school-as-trait replacing the 5e "Kosmoturgy" school field), concentrate/manipulate. Traditions arcane+primal replace the 5e Cleric/Paladin class list — note this is a **tradition swap**, not an addition: the 5e original's caster classes (Cleric, Paladin — both divine casters) don't appear in the PF2e tradition list at all (arcane+primal, no divine).

## Converter's notes

- **Anchor:** "Chain Lightning (rank 6, 8d12, line) — Fault Line is a physical line-damage variant with prone rider and permanent difficult terrain"
- **Archetype:** area damage (line, basic Reflex) + battlefield control
- **Balance bullets:**
  - "8d10 bludgeoning (avg 44) on a 60-foot line at rank 6: Chain Lightning does 8d12 (avg 52) with no riders; Fault Line is 8d10 + prone on fail + permanent difficult terrain — slightly below the damage curve with meaningful terrain control compensation"
  - "Prone on failure (not crit fail only): this is a non-basic rider on a basic-save spell — design trade-off noted (prone on failure is stronger than prone on crit fail only); justified by the permanent terrain effect limiting reuse value"
  - "Permanent difficult terrain: strong exploration/tactical effect; rubble persists past the encounter"
  - "Earth trait + arcane/primal: ground-rupture transmutation maps cleanly to both traditions"
- **Overridable:**
  - "Prone could be moved to crit-fail only to make the spell more conservative (matching the 'damage + minor rider' pattern); the current 'prone on failure' is slightly aggressive for a basic-save spell"
  - "The 8d10 could be increased to 8d12 (matching Chain Lightning) if the prone + terrain effects are considered insufficient compensation for losing energy typing"
- **Checklist failures:**
  - "Prone on failure for a basic-save spell is an anti-pattern edge case: basic saves (crit success/success/failure/crit fail) should not add condition riders on the failure tier without acknowledging the 'Everything Spell' risk. Prone on failure was kept because (1) bludgeoning damage is slightly under-curve vs energy types, (2) permanent difficult terrain is the primary non-damage value. Flagged as a design decision the author may override."

## Similar official spells

- **Chain Lightning (rank 6)** — the converter's own anchor: 8d12 line-adjacent AoE (chains between targets), basic Reflex, no condition rider, no lasting terrain effect. Pure damage benchmark at the same rank.
- **Disintegrate (rank 6)** — single-target rank-6 damage benchmark (12d10 on failure, Fortitude, target reduced to dust/rubble on crit failure) for reference on rank-6 damage ceilings outside line AoE.
- **Earthquake (rank 8)** — two ranks above Fault Line but the clearest official "earth trait + AoE + prone/difficult-terrain" battlefield-control template (fissures, structural collapse, prone) for comparing how the official game handles permanent terrain alteration at a higher rank.

**Scorer comparables (low-information):** rank range 1–8, residual −0.63 ranks (COLD verdict) supplied by the assay routing (hybrid routing, wide-range pool reason) — no specific named spells given in the chunk brief.

## Prior astra touches

None found in `revisions.md` — Fault Line matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- Prone is applied on the plain **Failure** tier of a **basic** Reflex save, not gated to critical failure only — the converter's own checklist-failures entry explicitly flags this as a non-basic-save anti-pattern and records it as a deliberate, overridable design decision (not an oversight).
- `heightening.damage = {"0": "2d10"}` structurally represents only the damage half of the "+1: damage increases by 2d10 and the line increases in length by 10 feet" heighten text — the **line-length increase (+10 ft per rank) is not represented in any structured field**, only in the description prose.
- The 5e original's caster classes are both divine (Cleric, Paladin), but the PF2e tradition list is arcane+primal with **no divine tradition** — a full tradition swap away from the 5e class list, not merely an addition of extra traditions.
- Range changed from 5e's self-origin line to a PF2e 500-ft-range line — the caster no longer needs to be an endpoint of the line, a functional (not just cosmetic) change to how the spell can be placed.

## Options & staff lean (enrichment, 2026-07-23)

At −0.63 this hybrid sits AT the healthy GM-Core rider exchange rate — pricing is fine.
The prone-on-plain-failure basic-save anti-pattern is converter-flagged, deliberate, and
compensated (8d10 vs Chain Lightning's riderless 8d12; the permanent terrain is the real
payload) — keep it. The 500-ft placement range matches the Chain Lightning anchor
exactly, so that expansion is anchor-consistent.

One consistency item: the tradition swap. 5e casters were Cleric/Paladin (both divine),
and the kosmoturgy family everywhere else in this set (Kosmoturgist's Weapon/Armor, Mark
of Protection, the Djura spells) is DIVINE — Fault Line alone shipped arcane+primal with
no divine at all.

- **A. Keep mechanics; add divine to the traditions** — restores the 5e class lineage
  and the school family's identity (final list: arcane/divine/primal, or divine/primal
  if he wants it tighter).
- **B. Keep as-is** — accepts the family inconsistency.
- **C. His conservative overridable pair (prone→crit-fail only, 8d10→8d12)** — solves a
  problem nobody has; the current trade is the more interesting spell.

**Lean: A.**
