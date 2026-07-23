# Time Step

## Header block

- **Rank:** 2
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = `null`, rankRange = `null`, residualRanks = `null` (unscored in `queue.json`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, teleportation — rarity: common — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** self
- **Target:** you
- **Defense:** `null` (no save — the caster affects only themself)
- **Duration:** until the start of your next turn (structured: `duration.sustained = false`)
- **Cost:** `""`
- **Structured `heightening` field:** present — `{levels: {"4": {}, "6": {}}, type: "fixed"}` (matches the "Heightened (4th)" and "Heightened (6th)" prose triggers)
- **Structured `damage` field:** empty (`system.damage = {}` — no damage in this spell at any tier)

## The 5e original

- **Level / School:** 2nd-level chronomancy
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V only (no S, no M — `"s": false`)
- **Duration:** Instantaneous
- **Classes:** Bard, Druid, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> You briefly step forward in time. You disappear from your location and reappear at the beginning of your next turn in a location within 30 feet of the space you disappeared from. You can't be affected by anything that happens during the interval you're missing, and you aren't aware of anything that happens during that time. You cannot cast this twice in a row.

**entriesHigherLevel:** none present.

## The conversion (canonical store)

You briefly step forward through time, vanishing from your current location and skipping ahead by one tick of the clock. You disappear until the start of your next turn. While displaced, you cannot be targeted by any effect, cannot be detected, cannot observe or interact with the world, and are not affected by anything that happens in your absence.

At the start of your next turn, you reappear in any unoccupied space within 30 feet of where you vanished. You cannot cast this spell twice in a row — on the turn you reappear, you are incapable of casting Time Step again (if you attempt to, the casting fails and the slot is wasted).

---

**Heightened (4th)** You can choose to reappear at the end of your next turn instead of at the start, effectively skipping your next turn entirely. You may still choose to reappear at the start if you prefer.

**Heightened (6th)** The reappearance range increases to 60 feet, and you can bring up to one willing creature of your size or smaller with you (the creature must be adjacent to you when you cast the spell and reappears adjacent to you).

**Structured/prose notes:**
- No `@UUID` links.
- No `system.damage` and no `defense` — matches 5e (self-only, no save, no damage).
- Two heightened tiers structurally represented (4th, 6th), both matching the prose triggers exactly.

## What changed, plain English

The core fiction (vanish, become untargetable/undetectable/unaffectable, reappear at the start of your next turn within 30 feet, can't be cast twice in a row) is preserved almost verbatim from the 5e original, including the "cannot cast this twice in a row" clause and the specific "you aren't aware of anything that happens during that time" wording (paraphrased as "cannot observe or interact with the world").

- **Numbers:** 30-foot reappearance range preserved exactly at base rank. Cast time: 5e 1 action → PF2e 2 actions (a genuine action-cost increase).
- **Structure:**
  - Components: 5e was Verbal-only (no somatic, no material — `"s": false`). Per the vendored conversion plan's own taxonomy (`apps/assay/vendor/run_balance/pf2e-spell-creator/references/traits-taxonomy.md`: "Old verbal → concentrate," "Old somatic → manipulate"), the store's `concentrate`/`manipulate` trait tags stand in for 5e's V/S components. Time Step's trait list carries only `concentrate` (no `manipulate`) — consistent with 5e never assigning this spell a somatic component.
  - The explicit "You can't be targeted... cannot be detected... cannot observe or interact with the world" phrasing expands 5e's terser "can't be affected by anything... aren't aware of anything" into more granular PF2e-style itemized clauses (targeted / detected / observe / interact) — a wording expansion, not a new mechanical capability, though it is more explicit than the 5e source.
  - The explicit penalty for attempting to re-cast on the reappearance turn — "the casting fails and the slot is wasted" — makes concrete something 5e's "You cannot cast this twice in a row" leaves ambiguous (5e doesn't specify what happens mechanically if you try). This is a clarifying addition, not a contradiction of the source.
- **Content dropped from 5e:** none identified — the core restriction and range are fully preserved.
- **Content added with no 5e basis:**
  - Both heightened tiers are wholly new — 5e provided no upcast text for this spell at all:
    - Heightened (4th): choose to reappear at the end of your next turn instead of the start (skip the whole next turn).
    - Heightened (6th): reappearance range increases to 60 feet, and you can bring one willing adjacent creature (of your size or smaller) with you.
  - The `teleportation` trait is added — the converter's notes describe this as "PF2e standard for any vanish-and-reappear effect," a systemic tag rather than new mechanical content.

## Converter's notes

**Anchor:** "Dimension Door (rank 4) — teleport 120 ft; Time Step is rank 2 with 30-ft range but adds 1-round immunity at the cost of losing that round entirely"

**Archetype:** utility/teleportation (temporal skip)

**Balance bullets:**
- "Time Step is weaker than Dimension Door (rank 4) in range (30 ft vs 120 ft) but adds a 1-round 'phase out' effect that prevents all damage for that round — a powerful defensive rider that justifies rank 2."
- "The 'lose the round' tradeoff is significant: the caster does nothing for a full round and reappears without knowing what happened. This is balanced against the damage-immunity window."
- "Cannot-cast-twice-consecutively rule prevents the degenerate loop of skipping every other round indefinitely; preserved from 5e."
- "Teleportation trait correctly gates dimensional-lock effects and anti-teleport auras."
- "2-action cost (not 1-action from 5e): the power of immunity-for-a-round is worth the full 2 actions; keeping 1-action would be under-priced at rank 2."

**Overridable:**
- "Could allow the caster to reappear in the same space they vanished from (not requiring a new space within 30 ft) if the GM wants a simpler 'blink forward in time without repositioning' effect."
- "Could allow observation of events while displaced (caster is aware but unable to act) — closer to the 5e 'you aren't aware of anything' clause could flip to 'you observe but can't intervene' for a more dramatic feel."

**Checklist failures:** none listed.

## Similar official spells

- **Translocate** (rank 4) — `apps/codex/.../spells/rank-4/translocate.json`. Self-teleport to an unoccupied space within 120 feet you can see, instantaneous, no phase-out/immunity window — heightens at rank 5 to 1-mile range without line of sight. Two ranks above Time Step; trades Time Step's damage-immunity round for much greater range and no lost turn.
- **Flicker** (rank 4) — `apps/codex/.../spells/rank-4/flicker.json`. Grants resistance 5 to all damage (except force) and randomly teleports 10 feet at the end of each turn while sustained — a different defensive-teleport shape (ongoing partial damage mitigation + involuntary short random hops) versus Time Step's full-round untargetable phase-out.
- **Warping Pull** (rank 2) — `apps/codex/.../spells/rank-2/warping-pull.json`. Same rank, reaction-triggered ally-rescue teleport (10 feet, resistance 5 to the triggering damage) — same rank tier but reactive/defensive-for-another rather than proactive self-displacement.
- **Anticipate Peril** (rank 1) — not a teleport comparable; listed here only as the closest official example of a spell using the "brief foresight, one specific mechanical benefit, short duration" shape at a lower rank (see Tunnel Vision dossier for the direct comparison).

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **No structured heightening damage note applicable** — both heightened tiers are non-damage riders (choice of reappearance timing; range increase + bring a companion), correctly flagged by the adapter as non-parseable as a damage bump, but both are functionally significant rules changes a reviewer should read in full prose, not just the bare `heightening.levels` marker.
- **Components representation**: the verbal→concentrate / somatic→manipulate mapping (per the vendored plan's taxonomy doc) is not spelled out anywhere in the store's own structured fields — a reviewer unfamiliar with the vendored conversion plan could read the absence of `manipulate` as an oversight rather than a deliberate component-fidelity signal.
- No material-component drop, trait drop, or prose/field contradiction identified beyond the above.
