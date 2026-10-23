# Disperse Magic

## Header block

- **Rank:** 2
- **Routing:** buff
- **Pool reason:** wide-range (scorer comparables rank range 2–8 — LOW-INFORMATION, that is why it is in the manual pool)
- **Current assay line:** buff-path scoring, no damage verdict (per `homebrew-triage.md` §4: "Disperse Magic buff-path (no damage verdict)")
- **Adapter warnings (flags.assay.adapterWarnings):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** antillurgy, concentrate, manipulate (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** reaction
- **Range:** self
- **Target:** you
- **Defense:** none
- **Duration:** — (instantaneous; store `duration.sustained=false, value=""`)

## The 5e original

- **Level:** 2
- **School:** antillurgy
- **Casting time:** 1 reaction, "which you take when you are forced to make a saving throw against a spell or magical effect"
- **Range:** self
- **Components:** S only (no verbal, no material)
- **Duration:** Instantaneous
- **Classes:** Sorcerer, Warlock, Wizard

> You redirect some of the magical energy targeting you back into the Weave. You gain advantage on the saving throw against the spell or magical effect. Additionally, if the effect allows you to make a saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, or half damage if you fail.

No `entriesHigherLevel` block in the 5e original.

## The conversion (canonical store)

**Trigger:** You are forced to attempt a saving throw against a spell or magical effect.

You redirect incoming magical energy back into the surrounding field. You gain a +2 circumstance bonus to the triggering saving throw. Additionally, if the triggering effect would deal damage and normally allows you to take half damage on a success, you instead take no damage on a success and half damage on a failure (the basic save degrees shift one step in your favor for the damage roll only).

**Heightened (4th)** The circumstance bonus to the triggering save increases to +3, and you can also grant the bonus to one adjacent ally who is also targeted by the same effect.

No `@UUID[...]` references in this description. Structured fields agree with the prose.

## What changed, plain English

The reaction shape and its "succeed = no damage instead of half" rider are preserved closely; the main change is the advantage→bonus conversion and an added ally-sharing option at heighten.

- **Numbers:** 5e's "advantage on the saving throw" became PF2e's flat **+2 circumstance bonus** (per the converter, "the canonical equivalent for a reactive defensive bonus" since PF2e has no advantage mechanic).
- **Structure:** the "no damage on success / half on fail" rider is preserved as written from 5e — the converter notes this shifts the *damage outcome*, not the *saving throw itself*, one degree in the caster's favor. Time was changed from 5e's bare "reaction" to PF2e's reaction-with-explicit-Trigger-line format (see Prior astra touches — this was a hand-repair, not part of the original seed).
- **Content dropped:** none of the core beats (redirect magic, bonus to the triggering save, better damage outcome on success) are missing.
- **Content added:** the **heightened (4th)** entry (bonus increases +2→+3, and can also be granted to one adjacent ally targeted by the same effect) has no 5e basis — 5e Disperse Magic has no scaling text at all; the ally-sharing clause in particular is new content, not implied anywhere in the 5e original.

## Converter's notes

**Anchor:** Counterspell (rank varies) — magical defense reaction; closer to a personal Shield-equivalent vs spells

**Archetype:** reaction-defense (magic absorption, personal saving throw boost)

**balanceBullets:**
- "+2 circumstance bonus to a save as a reaction is slightly stronger than the rank-1 Resist Spell tradition cantrips but justified at rank 2 by the 'better damage tier on success' rider."
- "The damage improvement (success = no damage instead of half) is the primary value; this turns every basic-save damage spell into a 'succeed = no damage' situation, which is the 5e 'evasion' fantasy."
- "1-action reaction cast (reaction in PF2e) is appropriate: this is a defensive response, not an offensive action."
- "No tradition restriction on the triggering effect — it works against any spell or magical effect, which is consistent with an abjuration 'disperse the magic' feel."

**overridable:**
- "The +2 circumstance bonus could be replaced with 'roll the save twice, take the better result' (fortune effect) which more closely mirrors 5e's advantage — but fortune stacking rules make this riskier."
- "Could be restricted to only spells (not magical effects) for tighter balance."

**checklistFailures:** none.

## Similar official spells

- **Hidebound (rank 2)** — reaction, triggers when hit by a physical Strike; grants resistance 5 to physical damage (except adamantine) until the start of the target's next turn. Same rank; compares as another "reactive personal defense that improves an already-triggered outcome," though Hidebound softens damage after the fact rather than improving the save itself.
- **Wooden Double (rank 3)** — reaction, triggers on being critically hit; a decoy absorbs the blow. One rank above; compares on "reactive save-the-day defense" niche, though it substitutes a decoy rather than boosting your own save/damage outcome.
- **Rebounding Barrier (rank 4)** — reaction, triggers when hit by a physical Strike; grants resistance 10 to one physical damage type and reflects 5 damage back at the attacker. Two ranks above Disperse Magic's base rank (matches its heighten-4th tier); compares on "reactive damage mitigation with an added rider," though it reflects damage rather than improving a save.
- **Curse of Recoil (rank 1)** — reaction, triggers on an enemy about to make a ranged attack; forces a Will save that can impose an attack penalty. One rank below; included as a lower-rank reactive-defense comparable, though it targets an enemy's attack roll rather than the caster's own save.

**Scorer comparables (low-information):** rank range 2–8 (per the scorer's low-information wide-range routing — no specific comparable spell names were supplied by the scorer for this row).

## Prior astra touches

`revisions.md` lists one deviation for Disperse Magic:

- `time.value`: baseline (fresh adapter re-conversion of jmnario's data) = `'1'` → store = `'reaction'`
- `description`: length delta −7 chars (store=716, baseline=723)

Per `homebrew-triage.md` §4 (action-economy audit), this is one of three **reaction repairs** applied 2026-07-21: Disperse Magic (along with Deja Vu and Solar Rebuke) had its trigger buried mid-paragraph with `cast` structurally encoded as `1 action` instead of `reaction` — repaired to `time.value: reaction` with a leading Trigger line. The triage doc also notes a bonus fix in the same pass: **Disperse Magic's Remaster-invalid `abjuration` school trait was dropped** (jmnario's raw conversion carried an `abjuration` trait; the current store's trait list is `antillurgy, concentrate, manipulate` — no `abjuration`).

## Open flags

- The adapter warning notes the heightened (4th) entry has "no structurally-parseable damage bump" and is kept as a description appendix only — there is no structured `heightening.levels["4"]` payload beyond an empty object (`{}`), consistent with the warning.
- This spell is explicitly labeled LOW-INFORMATION by the scorer (comparable rank range spans 2–8), which is why it sits in the manual pool rather than an auto-scored bucket.
