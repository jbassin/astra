# Mark of Protection

## Header block

- **Rank:** 4 · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (queue.json: `routing: "ledger:utility"`, `poolReason: "ledger"`, `verdict: null`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, kosmoturgy, manipulate · **Rarity:** common
- **Traditions:** divine
- **Cast:** 2 actions · **Range:** touch · **Target:** 1 willing creature
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "8 hours"
- **Cost:** none (`cost.value` empty string)

## The 5e original

- **Name:** Mark of Protection · **Source:** tfc (homebrew) · **Level:** 4 · **School:** kosmoturgy
- **Casting time:** 1 action
- **Range:** touch (point)
- **Components:** V, S (no material)
- **Duration:** 8 hours, not concentration
- **Classes:** Cleric, Paladin

> You touch a creature and place a mark upon them, granting them your protection. Whenever the target would take damage, you can use your reaction to instantly swap places with them, taking that damage in their stead. If this would reduce you to 0 hit points, you are reduced to 1 hit point instead, and the spell ends. You can place this mark upon multiple creatures at the same time, provided you expend an appropriate spell slot for each.

No `entriesHigherLevel` block in the 5e source.

## The conversion (canonical store)

You press your hand against a willing ally and inscribe an invisible protective mark upon them, binding your fate to theirs. For the duration, whenever the marked creature would take damage from a single source (an attack, spell, or effect), you may use the following reaction:

**Interpose** [reaction] **Trigger** The marked creature you can see within 120 feet would take damage from a source that targets only them or includes them in its targets. **Effect** You instantly swap positions with the marked creature (both of you must be able to occupy each other's spaces — if either space is blocked, the reaction fails). You take the triggering damage instead of the marked creature. If this damage would reduce you to 0 Hit Points, you are instead reduced to 1 Hit Point and the Mark of Protection immediately ends.

You can only have one Mark of Protection active at a time. Casting this spell while a Mark is already active on another creature ends the previous Mark.

---

**Heightened (6th)** You can mark up to 2 willing creatures simultaneously with a single casting. When the Interpose reaction triggers, you choose which marked creature to swap with (you can only intercept one at a time, and you still take the damage once regardless of how many marks are active).

**Heightened (8th)** When you intercept damage for a marked creature, you gain resistance equal to your level to the intercepted damage type until the end of the current round. This applies only to the intercepted strike, not to ongoing damage.

No `@UUID` references. No `successTiers` (matches the 5e original — no save). Structural note: `heightening.levels = {"6": {}, "8": {}}` matches the two Heightened blocks (text-only per the adapter warning). The reaction carries an explicit **Trigger** line, satisfying PF2e's reaction-formatting convention.

## What changed, plain English

- **Reaction formatting added:** 5e's vague "you can use your reaction" (no named action, no explicit trigger range, no line-of-sight requirement) is rewritten as a fully keyworded PF2e reaction named "Interpose" with a stated **Trigger** ("within 120 feet," "can see," "targets only them or includes them") and **Effect** block — a structural rewrite the converter's own notes flag as a plan-mandated addition, not a content choice.
- **Range cap added with no 5e basis:** the 120-foot trigger range does not exist in 5e text at all (5e never specified a range for the reaction).
- **Space-blocking failure condition added:** "both of you must be able to occupy each other's spaces — if either space is blocked, the reaction fails" has no 5e text basis; it's a PF2e-physics addition per the converter's notes.
- **Multi-mark restricted, not expanded:** 5e explicitly allows the caster to mark **multiple creatures simultaneously**, "provided you expend an appropriate spell slot for each" (i.e., unbounded by slots spent). The conversion caps this to **one Mark at a time at base rank**, with a new casting-ends-the-old-Mark clause; multi-mark (up to 2) is pushed to the 6th-rank heightening tier — a real downward scope narrowing at base rank relative to 5e.
- **8th-rank tier added with no 5e basis:** level-scaled resistance on the intercepted strike (resistance = caster level, one round, single strike only) is entirely new — 5e had no rank-8-equivalent upcast text at all for this spell.
- **HP-floor safety clause preserved 1:1:** "reduced to 1 HP instead, spell ends" carries over from 5e verbatim in substance.
- **Traits added with no 5e basis:** kosmoturgy (school-derived), concentrate, manipulate.
- **Traditions:** 5e class list (Cleric, Paladin) collapses to divine only (paladin's traditional PF2e-analog "champion" doesn't have its own tradition; both source classes are divine-flavored).

## Converter's notes

- **Anchor:** "no clean analog — closest is Interpose (champion reaction) or Life Link (oracle focus); this is a divine abjuration reaction-setup spell unique in the homebrew set"
- **Archetype:** buff/reaction-setup
- **Balance bullets:**
  - "Reaction power budget: Interpose swaps places and takes full damage (including possibly lethal amounts), which is more dangerous than typical reaction effects but is gate-kept by the 'reduced to 1 HP' safety clause"
  - "8-hour duration is appropriate — this is a protective ward placed before encounters; not a combat buff activated during a fight"
  - "One-mark-at-a-time limit prevents the caster from shielding every party member simultaneously (5e allowed multiple at spell-slot cost — preserved in heightened 6th only)"
  - "120-foot range on reaction trigger is generous but bounded (prevents the caster from protecting allies on the other side of the dungeon)"
- **Overridable:**
  - "REACTION TRIGGER REWRITE (per plan instruction): the original 5e text said 'use reaction' with no explicit trigger range or line-of-sight requirement; these were both added to comply with PF2e's reaction-trigger formatting requirement"
  - "5e had 'multiple creatures with multiple spell slots' — collapsed to one mark at base, two at rank 6; GM may restore multi-mark at base if the table wants that power level"
  - "The space-blocking failure condition is a logical PF2e physics addition not in the 5e text"
- **Checklist failures:** none recorded.

## Similar official spells

- **Life Link (focus, rank 1)** — the converter's own anchor: a persistent damage-sharing bond (reduce target's damage by 3, caster loses 3 HP, unmitigatable) plus an initial 1d4 healing burst; oracle focus spell, no reaction, always-on rather than reaction-gated, and damage-sharing (partial) rather than damage-swap (full transfer).
- **King's Castle (rank 5)** — 2-action, 60-foot willing swap-places spell; a same-mechanic (position-swap) comparable one rank above Mark of Protection, but proactive (cast to swap now) rather than reactive/held for later, and carries no damage-interception clause.
- **Unexpected Transposition (rank 6)** — reaction spell, Trigger "you are targeted with an enemy's Strike," swaps your own position with another creature so the attack resolves against them instead; the closest official reaction-based position-swap-to-redirect-an-attack spell, two ranks above Mark of Protection, but self-protective (redirect an attack off yourself) rather than other-protective (intercept damage meant for an ally), and doesn't transfer damage — it retargets the attack roll entirely.
- **Zealous Conviction (rank 6)** — cited elsewhere in this batch for its save-bonus structure; not a close functional match here, omitted from further comparison.

## Prior astra touches

None. `revisions.md` has no entry for Mark of Protection — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- 5e's unrestricted "mark multiple creatures, one slot each" is narrowed to a single Mark at base rank (multi-mark deferred to 6th-rank heightening) — a genuine scope reduction relative to the 5e source, already acknowledged by the converter's own "overridable" note.
- The reaction's damage-transfer clause reads "You take the triggering damage instead of the marked creature" with no stated cap or resistance at base rank (the level-based resistance is an 8th-rank-only addition) — the base-rank version can, per its own HP-floor clause, take arbitrarily large single-source damage down to 1 HP.
- No 5e-isms residue found (no death saves, no "bonus action," no legacy condition names, no material component text to scrub).

## Options & staff lean (enrichment, 2026-07-23)

One of the cleanest conversions in the pool — the Interpose reaction with a proper
Trigger line, the space-blocking physics, and the 120-ft cap are all correct PF2e
formalizations, and King's Castle r5 / Unexpected Transposition r6 bracket the rank
comfortably. The flagged multi-mark narrowing is real but smaller than it looks: the
caster only ever has ONE reaction per round, so 5e's N-marks-for-N-slots bought target
flexibility, not multiplied protection.

- **A. Keep as converted** — the one-active-mark base + H6 two-mark axis is a coherent
  PF2e ladder; the reaction economy already self-limits.
- **B. Restore per-slot multi-mark at base** — 5e-faithful and safe (one reaction/round
  caps the throughput), but H6 then needs a new payload; more churn than the fidelity
  gain is worth.

**Lean: A.**
