# Reflective Defense

## Header block

- **Rank:** 8 (store `system.level.value = 8`)
- **Routing:** `ledger:utility` — **pool reason:** ledger
- **Current assay line:** verdict/range/residual not yet computed for this chunk (queue.json shows `verdict: null`, `rankRange: null`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, force, fortune, mercuromancy
- **Traditions:** arcane, occult
- **Cast:** 1 action (`system.time.value = "1"`)
- **Range:** self
- **Targets:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** until the start of your next turn (not sustained)
- **Heightening:** fixed, level 9 only

## The 5e original

- **Name:** Reflective Defense (source: `tfc`)
- **Level:** 8th
- **School:** mercuromancy
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V (no S, no M)
- **Duration:** instantaneous
- **Classes:** Bard, Druid, Seeker, Sorcerer, Warlock, Wizard

**Entries:**

> As luck would have it, all magic just happens to bounce off you until the next turn. If you would take damage during that time, the damage is reduced to 0, and if the source of the damage was another creature, that creature takes the full amount of the damage as force damage instead.

No `entriesHigherLevel` in the 5e original (no upcast text).

## The conversion (canonical store)

> You twist luck around your body like a shimmering mirror. Until the start of your next turn, you gain resistance 30 to all damage from spells and magical effects. If any single source deals damage that you reduce to 0 with this resistance, you immediately deal force damage equal to the amount reduced to 0 to the source of that damage (if the source is a creature, it takes this force damage with no save; if the source is an area or trap, the damage is simply negated). This resistance applies only to damage that originates from a spell or magical ability; it does not apply to weapon Strikes or non-magical effects.
>
> As a 1-action spell with a strong defensive effect, this spell is modeled after the reaction-to-defense pattern and is intentionally limited to 1 action and 1-round duration.
>
> **Heightened (9th)** Resistance increases to 40 and applies to all damage, not just magical.

No `@UUID[...]` links in this description. Structured fields agree with the prose: `duration.value` matches "until the start of your next turn"; `heightening.levels.9` is present but empty (`{}` — heighten text lives only in the description appendix, per the adapter warning); `damage` is empty (`{}` — the spell has no direct-damage payload, only the reflect-back-as-force clause in prose).

## What changed, plain English

The 5e original is a total-immunity spell: **any** damage during the window is reduced to 0, and if a creature caused it, that creature eats the full amount back as force damage — no restriction on source (mundane weapon, magic, trap, anything). The PF2e conversion narrows this substantially and adds a numeric resistance value:

- **Numbers:** 5e has no numeric cap (0 damage taken, full reflect) → PF2e sets a flat **resistance 30** (40 at heighten 9th) instead of true immunity.
- **Structure:** 5e "bonus action" → PF2e "1 action" (the stated PF2e mapping). 5e "instantaneous" effect with a 1-round window → PF2e explicit duration "until the start of your next turn" (not sustained). No save is involved in either version for the reflected damage.
- **Scope narrowed (DROPPED):** the 5e original blocks/reflects damage from **any source** ("all magic," and the reflect applies "if the source was another creature" — implying weapon/mundane sources were in scope for the "reduce to 0" half). The conversion restricts the entire effect — both the resistance and the reflect — to damage that **originates from a spell or magical ability**; weapon Strikes and non-magical effects are explicitly carved out. This is a content drop relative to the 5e text's "all magic" framing (5e's own wording is arguably magic-only in the first clause but doesn't explicitly exclude non-magical damage sources the way the conversion's closing sentence does).
- **Structure changed (from immunity to resistance):** 5e's "damage reduced to 0" (true negation) becomes a **resistance 30/40** value — a finite absorb rather than unconditional immunity. This is the single largest mechanical change: a big magical hit can now blow through the resistance and still land on the caster.
- **Reflect condition changed:** 5e reflects the *full* damage amount whenever the source is a creature. PF2e conditions the reflect specifically on "damage... reduced to 0 with this resistance" — i.e., only the portion actually absorbed is reflected (same idea, but now tied to a finite resistance pool rather than blanket negation), and explicitly no-save for the creature target, with area/trap sources having the damage "simply negated" (no reflect target).
- **Heighten (9th):** widens the resistance to all damage (not just magical) and bumps the number 30→40 — this heighten tier is the point where the spell's *scope* catches back up to the 5e original's "all magic" (arguably "all damage") framing, but only at heighten +1 rank.
- **No content added** beyond the explicit design-rationale sentence embedded in the description prose itself ("As a 1-action spell with a strong defensive effect, this spell is modeled after the reaction-to-defense pattern...") — this is converter commentary embedded directly in the player-facing description text, not a mechanical addition.

## Converter's notes

- **Anchor:** "no close PF2e analog at rank 8; nearest is Mirror Image (rank 2 dodge) or Wall of Force (rank 6 barrier) — designed as a 1-action quick-reactive buff"
- **Archetype:** buff/reactive — self damage reduction with reflect
- **Balance bullets:**
  - "1-action cast at rank 8: resistance 30 to magical damage for 1 round sits firmly in the 1-action ~60% power budget (2-action equivalent would be resistance 30 to all damage, which would be rank 9+)"
  - "Reflect mechanic: damage reduced to 0 by the resistance is sent back as force (rarely resisted); this mirrors the 5e design of 'all damage reduced to 0, source takes it as force'"
  - "Magical-only restriction balances the reflect: weapon Strikes, natural attacks, and mundane hazards are not reflected; only spells and magical abilities"
  - "Fortune trait: mercuromancy/luck flavor; also signals this doesn't stack with other fortune effects"
- **Overridable:**
  - "Magical-only restriction: 5e original reflected all damage from 'any creature'; GM may remove the magical-only restriction to restore full 5e fidelity, making this a rank-9 effect"
  - "Resistance value: set at 30 — a rank-8 full caster has ~200 HP; resistance 30 absorbs 1 big hit but doesn't make the caster unkillable. GM may adjust to 20 (more conservative) or 40 (more heroic)"
- **Checklist failures:**
  - "1-action cast: the spell is 1 action (from 5e bonus action), which must be strictly weaker than 2-action. The magical-only restriction is the core balance lever. If GM removes that restriction, the cast time should increase to 2 actions or a reaction with a trigger."

## Similar official spells

- **Spell Turning** (rank 7) — abjuration reaction-style reflect: spend a reaction when a spell targets you, counteract-check the spell, and on success it's turned back on the caster; ends after one reflection attempt regardless of outcome. Comparison axis: Spell Turning uses PF2e's standard **counteract-check** mechanic for reflection (no numeric resistance), lasts 1 hour, and is a reaction gated by "when a spell targets you" — a structurally different approach to "reflect magic back" than Reflective Defense's flat-resistance-then-reflect-the-absorbed-amount model.
- **Energy Aegis** (rank 7) — grants resistance 5 (10 at heighten 9th) to a broad energy-damage list (acid/cold/electricity/fire/force/sonic/vitality/void) for a long duration ("until your next daily preparations"). Comparison axis: shows the going rate for a *flat resistance number* at rank 7 (5, heightening to 10) against a wide damage-type list over a long duration — Reflective Defense's resistance 30 (40 at rank 9) against magical damage for 1 round is a much larger number over a much shorter window, the classic short-duration-buff trade-off.
- **Mirror Image** (rank 2) — three illusory duplicates give incoming attacks a chance to hit an image instead of the caster; images pop on a hit. Comparison axis: PF2e's other "make yourself hard to damage" self-buff at a much lower rank, using a randomized-miss mechanic rather than a resistance number — useful as the low end of the "avoid damage" design space the converter's own anchor note points to.

## Prior astra touches

None found. The spell name/slug do not appear in `apps/assay/homebrew/revisions.md`'s deviation list (52 hand-edited spells are enumerated there), meaning the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly — no astra-side hand edits have touched this spell yet.

## Open flags

- The description's closing sentence of the base-effect paragraph — "As a 1-action spell with a strong defensive effect, this spell is modeled after the reaction-to-defense pattern and is intentionally limited to 1 action and 1-round duration." — is converter/design-rationale commentary embedded directly in the player-facing spell description (out-of-world editor voice), not flavor or mechanical text.
- `heightening.levels["9"]` is a structurally empty object (`{}`); the actual heighten text lives only in the HTML description appendix, per the adapter warning. The structured field carries no data of its own.
- The 5e original's scope ("all magic... any creature") is broader than the conversion's explicit "originates from a spell or magical ability; ... does not apply to weapon Strikes or non-magical effects" restriction — a scope narrowing from the source material, called out by the converter itself as the core balance lever (see checklist failure above).
- No `@UUID[...]` compendium links appear anywhere in this description (nothing to check for broken/legacy references).

## Options & staff lean (enrichment, 2026-07-23)

The immunity→resistance-30-magical-only redesign is deliberate, converter-documented
(checklistFailures names the magical-only restriction as THE balance lever for a
1-action rank-8 cast), and well-bracketed by Spell Turning r7 / Energy Aegis r7 — keep
the mechanics wholesale. H9 restoring all-damage scope is a clean ladder.

The one real defect is a **voice-sweep escapee**: the description embeds design
rationale as player-facing text — "As a 1-action spell with a strong defensive effect,
this spell is modeled after the reaction-to-defense pattern and is intentionally limited
to 1 action and 1-round duration." Pure editor voice; the set-wide sweep missed it.

- **A. Delete the editor-voice sentence, mechanics untouched.**
- **B. A plus restore all-damage scope at base rank** — his own checklist says that
  version needs 2 actions or a reaction trigger; a real redesign with no complaint
  motivating it.

**Lean: A.**
