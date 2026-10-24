# Overhaul

## Header block

- **Rank:** 5
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score — pooled on the utility-ledger routing reason)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "cast time '3 hours' isn't a shape assay's own action-time parser recognizes — defaults to the 2-action structural multiplier"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics, polymorph (rarity: rare)
- **Traditions:** arcane, occult
- **Cast:** 3 hours
- **Cost:** a drafting table and 1,000 gp worth of metallic inks, which the spell consumes
- **Range:** touch
- **Targets:** 1 living humanoid creature
- **Defense:** Fortitude save (non-basic)
- **Duration:** permanent

## The 5e original

- **Level:** 5 (Bard, Seeker, Wizard)
- **School:** memetics (this batch's homebrew school label)
- **Casting time:** 3 hours
- **Range:** touch
- **Components:** V, S, M — "a drafting table and 1000gp worth of metallic inks, which the spell consumes" (cost 1,000 gp, consumed)
- **Duration:** Instantaneous

> You destroy the body of a living humanoid and use the pieces of its soul to construct a new form. The creature must make a Constitution, Wisdom, and Charisma saving throw. On any success, the spell ends. A willing creature may choose to fail all three.
>
> Due to the volatility of this magic, the race of the new form is selected by the DM (or randomly) from the following table. However, you may make a Charisma (Persuasion) check to influence the result.

**Race table (d100, abbreviated — full 18-row table in source):** Aasimar (1–4), Dragonborn (5–6), Warforged (7–8), Dwarf, hill (9–13), Dwarf, mountain (14–21), Elf, dark (22–25), Elf, high (26–34), Elf, wood (35–42), Gnome, forest (43–46), Gnome, rock (47–52), Half-elf (53–56), Half-orc (57–60), Firbolg (61–65), Halfling, lightfoot (66–68), Halfling, stout (69–76), Merfolk (77–80), Goliath (81–84), Human (85–96), Tiefling (97–100).

> Any additional features, such as skin color, age, weight, and so on are completely under your control. The overhauled creature retains all of its abilities and skills from its previous body, but its racial traits and bonus change to match its new form.

No `entriesHigherLevel` block (no upcast text).

## The conversion (canonical store)

> Over the course of three hours of painstaking work, you deconstruct and rebuild the physical form of a living humanoid creature. A willing creature may choose to fail all saving throws (treating the result as critical failure for each). An unwilling creature must attempt three separate Fortitude saving throws — one at the end of the first hour, one at the end of the second hour, and one at the end of the third hour; if any save succeeds, the spell ends with no effect and the partially-begun transformation is reversed harmlessly.
>
> If all three saves fail (or the creature chose to fail), the creature's ancestry changes to a randomly determined humanoid ancestry (the GM determines this, typically by rolling on a table of available ancestries in the setting). The creature retains all of its abilities, class features, proficiencies, and memories, but its ancestry traits, ability boosts, and ancestry feats change to match its new form. Appearance features such as height, weight, age, and coloration are under the caster's direction.
>
> This is a permanent polymorph. It can be reversed only by a spell that removes curses of rank 6 or higher, or by casting Overhaul again.
>
> **Critical Success** The creature is unaffected for that hour's phase.
> **Success** The creature is unaffected for that hour's phase; the spell ends.
> **Failure** That phase of the transformation proceeds.
> **Critical Failure** That phase of the transformation proceeds; the creature also takes 2d10 void damage from the stress of restructuring.
>
> **Heightened (7th)** You may direct the ancestry outcome, choosing from ancestries you are familiar with, rather than having the GM determine it randomly.

Structured fields agree with the prose: `time.value: "3 hours"` matches; `cost.value` matches the material text; `defense.save.statistic: "fortitude"` matches; `duration.value: "permanent"` matches "This is a permanent polymorph"; `heightening.levels: {7}` matches the single heightened tier.

## What changed, plain English

- **Save structure completely reworked:** 5e used three *different* ability saves (Constitution, Wisdom, Charisma), any single success ending the spell instantly. PF2e replaces this with three separate **Fortitude** saves (same ability, three times), spread one per hour across the full 3-hour cast, with success on any of the three ending it (with the transformation "reversed harmlessly").
- **Race-selection table dropped entirely:** the 5e original's explicit d100 table of 18 named real-world-style ancestries (Aasimar, Dragonborn, Warforged, dwarves, elves, gnomes, halflings, Merfolk, Goliath, Human, Tiefling, etc.) is **not reproduced anywhere in the PF2e conversion**. The store text just says "a randomly determined humanoid ancestry (the GM determines this, typically by rolling on a table of available ancestries in the setting)" — the actual table is gone, replaced by a pointer to a GM-maintained setting-specific table.
- **Charisma (Persuasion) influence check dropped:** 5e let the caster attempt a Charisma (Persuasion) check to influence which race result the table produced. The PF2e version has no equivalent mid-cast influence check at rank 5 — instead, the influence capability is deferred entirely to the rank-7 heightened tier, where the caster can simply *choose* the ancestry outright (a stronger, unconditional version of the 5e check, but gated two ranks higher).
- **New critical-failure damage added with no 5e basis:** "the creature also takes 2d10 void damage from the stress of restructuring" on a critical failure — this consequence does not exist anywhere in the 5e text.
- **Explicit degree-of-success structure added:** 5e was a flat success/fail-per-save. PF2e adds a formal 4-tier successTiers block (critical success/success/failure/critical failure), including the "willing creature treats every save as a critical failure" framing, which has no direct 5e equivalent phrasing (5e just let a willing creature "choose to fail" without specifying degree).
- **Reversal method specified with no 5e basis:** 5e's transformation is simply Instantaneous with no stated reversal method at all. PF2e adds: "It can be reversed only by a spell that removes curses of rank 6 or higher, or by casting Overhaul again" — an entirely new mechanic not present in source.
- **Traits/rarity added with no 5e basis:** `polymorph`, `rare` (5e had neither trait system nor rarity). `memetics` mirrors the 5e school field (adapter-level normalization seen across this batch).
- **Cast-time note:** the adapter flags that its own action-time parser doesn't recognize "3 hours" as a distinct time unit, so EV/structural calculations default to a 2-action multiplier internally — the player-facing `time.value` field itself is unaffected and correctly reads "3 hours."

## Converter's notes

**Anchor:** no clean analog — permanent ancestry alteration has no published PF2e equivalent; designed from Flesh to Stone (rank 6, permanent polymorph incapacitation) as structural template

**Archetype:** utility / polymorph (permanent ancestry change)

**Balance bullets:**
- "Three-phase Fortitude save over 3 hours: each phase is a separate save opportunity, making unwilling use against a prepared enemy nearly impossible at rank 5"
- "Rare rarity appropriate: permanent ancestry change is a setting-impactful effect that should require GM permission to deploy"
- "Permanent polymorph — counterable only by Remove Curse rank 6+; this is a stronger counter-requirement than most polymorphs (which can be dispelled normally) flagged as overridable"
- "Willing use is the intended primary use case: a player using this to change their character's ancestry between sessions, not a combat spell"

**Overridable:**
- "The three Fortitude saves could be replaced with three different saves (Fort + Will + Charisma-analog) to match the 5e Con/Wis/Cha save triplet; Con→Fort is clean, Wis→Will is clean, Cha→Will is less clean"
- "The counteract condition (Remove Curse rank 6+) could be loosened to 'any Remove Curse effect' to be more consistent with how PF2e handles permanent polymorphs"
- "Rare rarity could be Uncommon if the setting treats ancestry alteration as purchasable (e.g., from planar surgeons)"

**Checklist failures:**
- "The three-save structure (three Fortitude saves spread over hours) is a custom mechanic with no direct PF2e precedent. PF2e rituals handle extended-time magic better than spells. An alternative design would be a ritual. Flagged: the author may prefer to keep it as a spell for convenience."

## Similar official spells

- **Stone to Flesh** (rank 6) — Touch, restores a petrified creature to normal or turns a human-sized stone object into flesh; the closest official example of a permanent-transmutation-undo spell, relevant context for Overhaul's own "reversed only by a rank-6+ curse-removal spell" clause. One rank higher.
- **Cursed Metamorphosis** (rank 6) — 30-foot range, single-target Fortitude save, transforms the target into a harmless animal with escalating severity by degree of success (up to permanent transformation on critical failure, reversible only by remove curse). One rank higher; closest official analog for "forced permanent-on-crit-fail transformation with graduated degrees of success," though its default target is unwilling (no willing-creature fast path like Overhaul's).
- **Animal Form / Humanoid Form** family (rank 2) — Self-only, temporary, caster-chosen polymorph. Three ranks lower and self-targeting only, but useful as a baseline for how PF2e's native polymorph line handles the "choose your new form" mechanic that Overhaul only grants at its rank-7 heightened tier.
- **Monstrosity Form** (rank 8) — High-rank self-polymorph with strong statistical benefits; included as a same-trait-family (`polymorph`) high-rank reference point, though functionally unrelated (temporary self-buff vs. permanent forced/willing ancestry change on another creature).

## Prior astra touches

Not in `revisions.md`'s deviations list — the store's fields match the fresh adapter re-conversion exactly (0 deviations recorded for this slug). No hand edits since seeding.

## Open flags

- The text "It can be reversed only by a spell that removes curses of rank 6 or higher" matches the standing curse-removal convention used elsewhere in this homebrew set (counteract check vs. the spell's rank) — flagged for awareness since the instructions call out "remove curse"-style text specifically.
- The 5e original's full 18-entry d100 race table is not reproduced in the PF2e description at all; the store text defers entirely to "a table of available ancestries in the setting" with no such table provided anywhere in this spell's data.
- The adapter warning notes its own action-time parser doesn't recognize "3 hours" and falls back to a 2-action structural multiplier for internal calculation purposes — this is an assay-tooling limitation, not a player-facing field discrepancy (the `time.value` field itself correctly reads "3 hours").
- The critical-failure 2d10 void damage clause and the three-Fortitude-saves-over-three-hours structure are both converter inventions with no 5e textual precedent, both explicitly acknowledged as such in the converter's own notes (including a checklist failure calling the three-save structure "a custom mechanic with no direct PF2e precedent").

## Options & staff lean (enrichment, 2026-07-23)

**Post-batch-0 note:** the "removes curses of rank 6 or higher" reversal text was already
converted to the counteract-vs-spell-rank convention by `7839a81` (the "casting Overhaul
again" valve preserved) — the dossier sections above predate that.

What remains is one structural judgment: the three-Fortitude-saves-over-three-hours
custom mechanic, which the converter's OWN checklist flags as having no PF2e precedent
("PF2e rituals handle extended-time magic better — an alternative design would be a
ritual"). Note this is really a SET-WIDE question: the pool carries 12 ledger:long-cast
spells, and whether hours-long casts should be rituals is one decision, not twelve. The
d100 table drop is fine (a setting-ancestry table is campaign property; the store pointer
is right), and deferring form-choice to H7 is cleaner than 5e's mid-cast Persuasion check.

- **A. Keep as a spell, as-is** — willing use (a player changing ancestry between
  sessions) is the stated primary case, and the three-save gauntlet makes hostile use
  near-impossible; the custom shape reads fine.
- **B. Reshape as a rank-5 ritual** — PF2e-idiomatic for a 3-hour, 1,000 gp, permanent
  working (and Worldweaver already went ritual); a real restructure, so only worth it if
  the set-wide long-cast question resolves toward rituals.
- **C. A plus restore a base-rank influence check** — redundant next to the H7 choice.

**Lean: A**, with the set-wide long-cast-vs-ritual question surfaced once at review.
