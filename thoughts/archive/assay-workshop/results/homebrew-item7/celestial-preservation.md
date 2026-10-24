# Celestial Preservation

## Header

- **Rank:** 4
- **Routing:** ledger:long-cast
- **Pool reason:** ledger
- **Current assay line:** `kind: ledger`, `reasonCode: long-cast`, `rawSkipReason: "long-cast time ('1 hour')"`, `routing: ledger:long-cast`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, manipulate — rarity **rare**
- **Traditions:** arcane, divine, occult
- **Cast:** time value "1 hour"
- **Range:** touch — **Target:** 1 dead creature
- **Defense:** none
- **Duration:** until ended
- **Cost:** "25 gp of starlight-ink and ritual chalk"
- **Structured damage:** none (`{}`)
- **Heightening:** fixed levels 6/8 (empty structured payloads — text-only)

## The 5e original

- **Level:** 4 (source file `gen_homebrew.json`)
- **School:** chronomancy
- **Casting time:** 1 hour
- **Range:** touch
- **Components:** S + V + M ("a cracked lens", no gp value given)
- **Duration:** permanent
- **Classes:** Bard, Druid, Wizard
- **Ritual:** true (5e ritual tag)

> You can cast this spell only at night. You memorialize a dead creature you touch, turning it into a constellation, provided that it has been dead no longer than 1 day. The target's body dissolves into stardust and rises into the sky.
>
> The spell effectively extends the time limit on raising the target from the dead, since days spent under the influence of this spell don't count against the time limit of spells such as raise dead. A spell that targets the dead but usually requires a body can be cast targeting this constellation instead, provided the spell is cast at night and the caster can see the target's constellation. If the target of this spell is returned to life, this spell ends and the constellation fades.

No `entriesHigherLevel` section is present — the 5e original has no upcast text (consistent with it being a ritual, not a leveled-slot spell).

## The conversion (canonical store)

> You can cast this spell only at night, under an open sky where stars are visible. You memorialize a dead creature you touch — one that has been dead no longer than 1 day — turning it into a constellation. The creature's body dissolves into luminous stardust and rises into the sky, visible as a new constellation on clear nights.
>
> While the creature exists as a constellation, time does not pass for it as regards resurrection magic: days spent in this state do not count against the time limits of spells such as Raise Dead, Resurrect, or similar. Spells that normally require a body or physical remains can instead target the creature's constellation, provided the spell is cast at night when the constellation is visible.
>
> If the creature is successfully returned to life through any resurrection effect, this spell ends and the constellation fades from the sky.
>
> **Heightened (6th)** The time-since-death limit extends to 1 week (rather than 1 day).
> **Heightened (8th)** The time-since-death limit is removed. You can memorialize a creature dead for any length of time, provided identifiable remains exist.

This description matches jmnario's baseline conversion (confirmed via `revisions.md` — 0 deviations for this spell).

## What changed, plain English

- **Structural shift, ritual → slotted spell:** 5e is a true ritual (no spell slot consumed, `ritual: true`, cast only via the ritual-casting rules). PF2e drops the ritual mechanic entirely and reframes it as a rank-4 spell using a normal spell slot, with the 1-hour cast time carried over as the sole "this is a big commitment" signal (`ledger:long-cast` routing reflects that).
- **Material component invented:** 5e's material was "a cracked lens" with no stated cost. PF2e drops the lens entirely and invents a new, explicitly costed material — "25 gp of starlight-ink and ritual chalk" — with no 5e basis for either the specific items or the price.
- **Duration reframed:** 5e "permanent" becomes PF2e "until ended" — functionally the same concept, phrased in PF2e's duration vocabulary.
- **Heightening is entirely new content:** since 5e is a ritual with no slot level to upcast, it has zero higher-level text. Both PF2e heightened tiers (6th: 1-day → 1-week deadline; 8th: deadline removed) are wholly invented for the conversion.
- **Classes/traditions:** 5e's Bard/Druid/Wizard class list becomes arcane/divine/occult traditions — Druid (and by extension primal) is dropped entirely even though Druid was one of the three 5e source classes.
- **Content preserved near-verbatim:** the night-only casting restriction, the "dissolves into stardust and rises as a constellation" fiction, the resurrection-deadline pause, letting other resurrection spells target the constellation instead of a body, and the spell ending when the creature is raised — all carried over essentially unchanged.

## Converter's notes

- **Anchor:** "no clean analog — closest is Gentle Repose (rank 2, preserves a body from decay) plus aspects of Raise Dead logistics. Celestial Preservation dramatically exceeds Gentle Repose in narrative scope (constellation, planar permanence) at rank 4."
- **Archetype:** utility (death/resurrection logistics, ritual-adjacent)
- **balanceBullets:**
  - "This spell solves a logistics problem (resurrection deadline) rather than granting combat power; its rank-4 cost is justified by the narrative scale (turning a body into a visible constellation) and the permanent until-raised duration."
  - "Night-only restriction and material cost (25 gp) provide meaningful constraints for a permanent-duration utility."
  - "Heightening at 6th and 8th ranks extends the death-duration threshold rather than adding power — appropriate for a qualitative unlock pattern."
  - "Rare rarity applied: this spell creates a semi-permanent sky feature and has major in-world narrative consequences (anyone with Astronomy can see the new star)."
- **overridable:**
  - "Could be redesigned as a ritual (multiple casters, 1-day cast, higher material cost) for stronger thematic weight."
  - "The 'visible constellation' could be kept private (only visible to those with the Detect Magic spell or similar) to reduce the setting-impact."
- **checklistFailures:** none.

## Similar official spells

- **Peaceful Rest** (rank 2) — the actual Remaster equivalent of 5e's Gentle Repose: prevents a corpse from decaying or being turned undead, and time under its effect doesn't count against a Raise Dead-style deadline. This is the direct rank-2 "stop the resurrection clock" analog the conversion's own anchor is describing.
- **Raise Dead** (rank 6) — the resurrection spell whose deadline Celestial Preservation is built to bypass; requires the body and a death within the past 3 days. Shows what the base "1 day dead" limit is being measured against.
- **Resurrect** (ritual, rank 5) — the ritual version of raising the dead, with a 1-year death-window instead of Raise Dead's days. A useful reference point for how far a "no more time-since-death limit" effect (Celestial Preservation's rank-8 heighten) reaches relative to the highest normal deadline in the game.

## Prior astra touches

None. `revisions.md` does not list Celestial Preservation among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations).

## Open flags

- No residual 5e-isms in the prose (no "bonus action," no death-save language). The 5e ritual tag and the "cracked lens" material component are both dropped without any structural marker of "this used to be a ritual" beyond the 1-hour cast time.
- No curse-removal wording, no affliction text, not a reaction (no Trigger line to check).
- Structured `system.damage` is empty, consistent with the prose (no damage anywhere in this spell).
- The rare rarity and the material-cost invention (25 gp starlight-ink/ritual chalk, replacing the uncosted "cracked lens") are both stakeholder-visible departures from the 5e source with no 5e-side justification for the specific numbers/items chosen.
