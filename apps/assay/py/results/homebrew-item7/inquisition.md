# Inquisition

## Header block

- **Rank:** 2 (store `system.level.value = 2`)
- **Routing:** comparables
- **Pool reason:** wide-range
- **Current assay line:** scorer comparables gave a rank range of **1–9** — flagged LOW-INFORMATION, which is why this spell sits in the manual review pool.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, memetics (custom trait), mental, subtle — rarity common
- **Traditions:** arcane, occult
- **Cast:** `2` actions
- **Range:** touch
- **Targets:** 1 unconscious or sleeping creature
- **Defense:** save, statistic `will`, `basic: false`
- **Duration:** "10 minutes", `sustained: true`
- **Cost:** `system.cost.value = ""` (empty)
- **Heightening:** fixed-rank, at 4th and 6th

## The 5e original

- **Level:** 2 · **School:** memetics (source: `tfc`)
- **Casting time:** 1 action
- **Range:** touch
- **Components:** V, S (no material)
- **Duration:** up to 10 minutes, concentration
- **Classes:** Bard, Seeker (SW), Wizard

**Entries:**

> You create a temporary copy of the mind of a sleeping or unconcious creature you touch. If the creature is sleeping they must make a Charisma saving throw. If the saving throw fails, you are able to ask the copy questions and have it answer in its native tongue. If an answer would divulge information the creature wants especially to keep secret, it can make another Charisma saving throw with disadvantage to avoid answering.

No `entriesHigherLevel` block — the 5e original has no upcast/heightening text at all. Note also: the 5e text only makes an unconscious creature's target automatically subject to the effect (no save mentioned for the already-unconscious case) — only *sleeping* creatures are explicitly given a save in the 5e prose.

## The conversion (canonical store)

> You lay your hands on a sleeping or Unconscious creature and draw out a temporary echo of its mind — a ghostly impression that will answer your questions in the target's native language as long as you sustain the spell. The target's body remains motionless and unaware of the interrogation. The echo answers from memory alone; it knows everything the target knew at the time of casting but cannot access anything the target has since learned.
>
> The target must attempt a Will saving throw. A sleeping creature (as opposed to one magically Unconscious) attempts this save with a –2 circumstance penalty.
>
> **Critical Success** The echo does not form. The target wakes if it was sleeping and becomes aware an attempt was made to enter its mind.
> **Success** The echo does not form. The target remains Unconscious and unaware.
> **Failure** The echo forms and answers your questions for the duration. Particularly sensitive secrets may trigger a secondary Will save (DC equal to the spell's DC) from the echo to resist answering.
> **Critical Failure** The echo forms and answers all questions fully, with no secondary save granted for sensitive topics.
>
> **Heightened (4th)** You can target a creature that is merely asleep (magically or naturally) without the –2 circumstance penalty on its Will save. Additionally, the spell's duration increases to sustained up to 1 hour.
> **Heightened (6th)** The target need not be Unconscious or sleeping; it may be awake but Restrained and unable to speak. The secondary save for sensitive secrets is no longer granted.

("Unconscious" and "Restrained" render as `@UUID[Compendium.pf2e.conditionitems.Item...]{Label}` links in the store — shown above as their plain label text; they are clickable condition-item references, not plain prose.)

Structured fields agree with the four-degree save structure (`system.defense.save.statistic = "will"`, `basic: false`) and the sustained-10-minute duration.

## What changed, plain English

- **Save ability:** 5e is a **Charisma** save; the store retypes it as a **Will** save (both are PF2e's closest analog for a mind-affecting mental effect, but this is a full organ swap, not a straight port — 5e Cha vs. PF2e Will are not the same underlying stat).
- **Which target gets a save:** 5e ONLY gives a save to *sleeping* creatures — a magically-unconscious creature gets no save at all in the 5e text (the interrogation just works). The store gives EVERY target (sleeping or unconscious) a Will save, with sleeping targets taking a −2 circumstance penalty on it. This is a structural widening: the store adds a save where 5e had none (for the unconscious case).
- **Degrees of success ADDED wholesale:** 5e is a binary pass/fail (save succeeds = can't interrogate; save fails = full interrogation with one secondary save available for secrets). The store expands this into full four-degree PF2e structure (critical success/success/failure/critical failure), with critical failure removing even the secondary secret-protecting save — this level of granularity has no 5e source; it's invented to fit PF2e's standard save-result template.
- **Duration & sustain:** 5e is "concentration up to 10 minutes"; the store is "sustained up to 10 minutes" — a straightforward 1:1 mechanical translation of 5e concentration into PF2e sustain.
- **Subtle trait ADDED:** no 5e basis — added to keep the interrogation from being visibly detectable.
- **Heightening ADDED wholesale:** the 5e original has zero upcast/heightening text. The store adds two full heightened tiers (4th: drop the sleeping penalty + duration to 1 hour; 6th: works on an awake-but-restrained target, secondary save removed) — entirely new content invented for the conversion.
- **Question-limit clause DROPPED:** 5e never explicitly caps the number of questions (implicitly unlimited while concentrating); the store also allows unlimited questions "for the duration" — this one is preserved rather than changed.
- **Traditions:** 5e's class list (Bard/Seeker/Wizard) becomes arcane + occult in the store (Bard would ordinarily map toward occult/primal in many PF2e conversions; the store's choice isn't a direct 1:1 class-to-tradition port).

## Converter's notes

- **Anchor:** "Mind Probe (rank 5) — full mind-reading on failed Will; Inquisition is weaker: sleeping-target restriction + 10 min + yes/no only"
- **Archetype:** utility/divination (restricted mind-reading)
- **Balance bullets:**
  - "Sleeping/unconscious target restriction is the key balancing lever keeping this at rank 2. Mind Probe at rank 5 works on any creature; Inquisition requires the target to be helpless first."
  - "Sustained up to 10 minutes matches the 5e concentration cap; sustaining costs 1 action/round, which is the ongoing action-economy tax on an interrogation tool."
  - "Subtle trait is essential: the physical touch is visible, but the mental echo has no voice or outward sign — prevents the spell from becoming socially detectable in the interrogation scene."
  - "Secondary save for sensitive secrets gives the echo a small 'last line of defense' — flavor-accurate and keeps the GM from feeling trapped by an auto-answer spell."
  - "Will save is the correct organ: psychic extraction is mind-affecting, not body-affecting."
- **Overridable:**
  - "Could change the sleeping penalty from -2 to -4 if the GM wants the spell to be harder to resist, making the sleeping-target combo feel rarer."
  - "Could add a linguistic trait if you want the echo to speak in its own language (not yours), requiring magical translation to interpret."
- **Checklist failures:** none recorded.

## Similar official spells

- **Mind Probe (rank 5)** — jmnario's own cited anchor. Works on ANY creature (no sleeping/unconscious gate), Will save, repeatable per-round question-asking via Sustain with a Deception counter-check per question. Three ranks above Inquisition; the "any creature, no helplessness required" difference is the core power axis jmnario used to justify Inquisition sitting three ranks lower.
- **Mind Reading (rank 3)** — a lighter, non-interrogative mind-affecting Will-save spell (reveals only comparative Intelligence or surface thoughts, no active Q&A); one rank above Inquisition, useful as a "weaker information yield, no helplessness gate" contrast point.
- **Ring of Truth (rank 3)** — different mechanism (area-based lie detection + Deception penalty rather than direct mind-reading) but the same underlying goal of extracting truthful answers from a subject, one rank above Inquisition.
- **Scorer comparables (low-information):** rank range 1–9 (the wide spread that put this spell in the manual review pool).

## Prior astra touches

None found — `Inquisition` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly).

## Open flags

- The store's four-degree save structure and the "sleeping creature also gets a save" widening both have no 5e basis — the 5e original only gave sleeping targets (not unconscious ones) any save at all, and never in a graduated success/failure tier.
- The `memetics` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set.
- Four `@UUID[Compendium.pf2e.conditionitems.Item...]` links are present in the description (Unconscious ×3, Restrained ×1) — these are legitimate PF2e condition-item cross-references, not broken links, but worth noting they render as clickable UUID references rather than plain text in-game.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose; no curse-removal language present.
