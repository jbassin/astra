# Taboo

## Header block

- **Rank:** 3 (store `system.level.value` = 3)
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, curse, linguistic, manipulate, memetics, mental
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`time.value` = "2")
- **Range:** touch
- **Targets:** 1 creature
- **Defense:** Will save (not basic)
- **Duration:** 1 week, not sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 3
- **School:** memetics
- **Casting time:** 1 action
- **Range:** Touch
- **Components:** V, S (no material)
- **Duration:** 1 week (no concentration)
- **Classes:** Bard (PHB), Seeker (SW), Wizard (PHB)

> You curse one creature you touch. The creature must make a Wisdom saving throw; if they fail, choose a taboo. The taboo can either be the act of lying, or a particular topic. The creature is cursed so that speaking about the taboo causes its tongue to swell grotesquely and protrude from its mouth, making it unable to speak. The tongue returns to normal size in 1d4 minutes.
>
> If you choose a topic the DM gets final say on if it's too broad to apply the spell. For example, you may choose to target an event the target witnessed or a particular location, you cannot target something broad like "People." The effect can be ended by magic that removes a curse.

No `entriesHigherLevel`.

## The conversion (canonical store)

> You curse one creature you touch, sealing a forbidden topic inside their mind. Choose one taboo: either the act of lying, or a specific narrow topic (a particular witnessed event, a specific location, or a specific named individual — the GM has final say that the topic is sufficiently specific). The creature must attempt a Will save.
>
> If the curse takes hold, whenever the target attempts to speak about the forbidden topic, its tongue swells grotesquely and protrudes from its mouth, rendering it unable to speak for 1d4 minutes. The tongue returns to normal size on its own after 1d4 minutes. Magical effects that remove curses (such as Remove Curse or a successful counteract check) end this spell.
>
> **Critical Success** The creature is unaffected.
> **Success** The creature is unaffected.
> **Failure** The curse takes hold. The creature cannot speak about the forbidden topic; attempting to do so triggers the swollen-tongue effect (unable to speak for 1d4 minutes).
> **Critical Failure** As failure, and the creature is unaware of the specific trigger — it doesn't know what topic has been taboo'd until it triggers the effect for the first time.
>
> ---
> **Heightened (+2)** You may designate up to 2 taboos on the same creature, or target 1 additional creature with a single taboo each.

Structured fields: `system.damage` = `{}` (no damage — correct, this is a pure debuff/curse). `system.defense.save` = `{statistic: "will", basic: false}` — matches ("must attempt a Will save," non-basic since outcomes are qualitative, not half/full).

**Structural gap:** unlike the other seven spells in this chunk, this spell's store JSON has **no `heightening` key at all** — not even an empty placeholder object. The "+2" interval-style heighten text exists only in the description prose (see the adapter warning and Open flags).

## What changed, plain English

The taboo-topic mechanic, the GM-veto-on-specificity clause, the tongue-swelling effect, and the curse-removal escape hatch are all preserved close to verbatim. The main changes are the save mechanics, added trait tags, and the four-degree structure.

- **Save mechanic — order of operations changed:** in 5e, the creature saves FIRST, and only "if they fail" does the caster then "choose a taboo" (topic selection happens after a failed save). In the PF2e conversion, the caster "chooses one taboo" BEFORE the target "must attempt a Will save" — the topic is picked upfront regardless of outcome. This is a structural sequencing change, not just a numbers translation, though the net mechanical effect (curse only takes hold on a failed save) is the same.
- **Save stat:** 5e Wisdom save → PF2e Will save (organ-mapping convention; same governing ability in practice since Will is driven by Wisdom).
- **Degrees of success:** 5e is a binary pass/fail. PF2e adds a full four-degree spread: critical success and success are both "unaffected" (identical outcomes, so functionally still binary in effect), but critical failure adds new content not present in 5e at all — the target becomes unaware of the specific trigger topic until they stumble into it. This is a wholly new consequence layer with no 5e basis.
- **Added traits:** linguistic, curse, and mental traits are all new additions not present as explicit 5e tags (5e has no trait system analog) — these gate the spell against creatures without language, apply standard curse-removal interactions, and flag it as mind-affecting, respectively.
- **Action cost:** 5e 1 action → PF2e 2 actions.
- **Nothing dropped:** duration (1 week, no concentration), the "unable to speak for 1d4 minutes" trigger effect, the topic-specificity GM veto, and the curse-removal escape are all preserved.
- **Heighten:** entirely new — 5e has no upcast text; PF2e adds a "+2: designate 2 taboos, or 1 additional target" heighten step with no 5e basis, and (per the adapter warning) this heighten text has zero structural representation at all.

## Converter's notes

- **Anchor:** "Geas (rank 7, compels behavior at higher rank) — Taboo is a much weaker, topic-specific version appropriate for rank 3"
- **Archetype:** control/debuff (curse, social/linguistic restriction)
- **Balance bullets:**
  - "Taboo is a social-utility curse with a narrow but significant effect: silence on a specific topic for 1 week. This is weaker than Geas (rank 7) but stronger than Silence (rank 2) in its specificity."
  - "The GM-veto on topic specificity is preserved as a safety valve against overbroad uses (e.g., 'you can't speak about anything related to combat')."
  - "The 1-week duration is appropriate for a non-combat social curse — combat-grade buffs cap at 1 min, but this is an interrogation/social utility with no combat upside."
  - "Linguistic + mental traits correctly gate the spell against mindless creatures and creatures that share no language with the caster."
- **Overridable:** "The GM may choose to require the caster to share a language with the target for the 'topic' option to function — the current text implies this implicitly but doesn't state it." / "Could reduce duration to 24 hours if 1 week feels too long for a rank-3 curse."
- **Checklist failures:** none recorded.

## Similar official spells

- **Geas** (the converter's stated anchor) — found in the snapshot as a **ritual**, rank 3 (`spells/rituals/geas.json`), NOT rank 7 as the converter's anchor note claims. See Open flags — this is a factual discrepancy in the converter's own commentary, verified against the actual snapshot file.
- **Silence** (rank 2) — the converter's other explicit comparison point; prevents ALL sound/speech from the target unconditionally (broader restriction, shorter default duration, no save-based curse framing). One rank below Taboo.
- **Nightmare** (rank 4) — a delayed-trigger Will-save curse-adjacent debuff with a 1-week-scale narrative footprint (temporarily immune for 1 week on critical success) — a useful same-neighborhood-rank comparable for a non-combat, long-duration Will-save effect.
- **Mystic Armor** (rank 1) — not directly comparable in function, included only as a check that no closer rank-3 curse/topic-restriction analog exists in the snapshot; none was found via keyword search for "curse," "geas," "silence," "nightmare," "warp-mind," or "bind-soul" at neighboring ranks.

## Prior astra touches

Checked `apps/assay/homebrew/revisions.md`: **no entry** for "Taboo" — 0 deviations from a fresh re-conversion of the vendored baseline (store matches adapter output exactly, no hand edits recorded). The trait set (`concentrate, curse, linguistic, manipulate, memetics, mental`) adds the custom "memetics" school-trait tag (mapped from the 5e school field) on top of jmnario's traits — baked into the current adapter, consistent with the repo-wide trait-hygiene/school-traits sweep.

## Open flags

- **Converter anchor discrepancy:** the conversion notes state the anchor is "Geas (rank 7)," but the actual Geas entry in the codex snapshot is a rank-3 ritual, not a rank-7 spell. Verified directly against `apps/codex/data/snapshots/foundry/pf2e-8.3.0/packs/pf2e/spells/rituals/geas.json` (`system.level.value` = 3).
- **Curse-removal wording matches the standing convention** noted in project memory (curse removal = counteract check vs. the spell's rank), but the store text itself doesn't state the rank explicitly — it says "a successful counteract check" without specifying "against this spell's rank," leaving the DC/rank target implicit rather than stated in the spell text.
- **Heightening structural gap:** unlike the other seven spells in this chunk (which at minimum carry an empty-object placeholder per heighten level), Taboo's store JSON has no `system.heightening` key at all. The "+2" heighten text exists purely as description prose with zero structural backing — flagged explicitly by the adapter warning.
- No residual 5e condition names (no "Wisdom saving throw," no bonus-action language) — the mechanical language is fully Remaster-consistent. No material-component residue (5e had none to begin with).
- Traits include the custom homebrew school-trait tag "memetics" (mapped from the 5e school field), which has no counterpart in the standard PF2e trait taxonomy.
