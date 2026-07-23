# Revisit

## Header block

- **Rank:** 5 (store `system.level.value = 5`)
- **Routing:** `ledger:teleport-utility` — **pool reason:** ledger
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: null`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, manipulate, teleportation
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** self
- **Targets:** none set (`system.target.value = ""`)
- **Defense:** none (`system.defense = null`)
- **Duration:** none set (`system.duration.value = ""`, not sustained) — i.e., instantaneous by omission
- **Heightening:** fixed, level 7 only

## The 5e original

- **Name:** Revisit (source: `tfc`)
- **Level:** 5th
- **School:** chronomancy
- **Casting time:** 1 action
- **Range:** self
- **Components:** V, S (no M)
- **Duration:** instantaneous
- **Classes:** Bard, Druid, Wizard

**Entries:**

> You return to a point in your recent past. You may select a location you've visited within the last hour and teleport back to it, regaining any momentum and inertia you may have had at that moment.

**At Higher Levels:**

> For each spell slot higher than 5th level, you may bring an additional person along with you. They are brought to a location within five feet of you, and also gain your same speed.

## The conversion (canonical store)

> You rewind your own personal timeline to a location you occupied within the last 10 minutes, snapping back to that position in an instant. You teleport to any unoccupied location you personally occupied within the last 10 minutes. You arrive with the exact momentum you had at the moment you left that location — if you were running, you continue running; if you were falling, you continue falling (though you choose direction again). Any equipment you carry teleports with you. You cannot teleport into a space that is currently occupied by a solid object.
>
> **Heightened (7th)** You can revisit a location you occupied within the last hour, and you can bring up to 2 willing creatures who are adjacent to you at the time of casting.

No `@UUID[...]` links in this description. Structured fields largely agree with the prose, with one gap: `system.target.value` is an empty string and `system.duration.value` is also an empty string in the store, even though the spell is clearly self-only/instantaneous per the prose — see Open flags.

## What changed, plain English

The core "teleport back to a place you recently stood, keeping your momentum" fiction is preserved closely, with the main changes being the lookback window and the action cost:

- **Numbers:** 5e's lookback window is **1 hour** at base rank → the conversion sets the base lookback to **10 minutes**, with the full 1-hour window moved to the **heighten 7th tier**. This is a real reduction in base-rank capability relative to the 5e original, deferred to a +2-rank heighten.
- **Action cost:** 5e "1 action" → PF2e "2 actions" (standard mapping).
- **Structure — clarifications added:** the conversion adds explicit PF2e-standard teleport restrictions not present in the 5e text: "You cannot teleport into a space that is currently occupied by a solid object" and "Any equipment you carry teleports with you" — both are standard PF2e teleportation-spell boilerplate, added for rules clarity rather than drawn from the 5e source (the 5e original is silent on occupied-space blocking and doesn't explicitly state carried equipment comes along, though it's implied).
- **Heighten vs 5e upcast — structurally different mechanism:** 5e scales this as a **per-slot-level** upcast ("for each spell slot higher than 5th level, you may bring an additional person") — i.e., every level you spend above 5th grants +1 extra passenger, uncapped in principle. The conversion instead uses a **single fixed heighten tier at 7th** that (a) extends the lookback window to 1 hour and (b) grants the ability to bring up to 2 willing adjacent creatures — a flat one-time unlock rather than a per-level scaling passenger count. This is a structural change from "linear per-level scaling" to "one fixed unlock two ranks up," and the passenger count itself changes shape too (5e: unbounded scaling with slot level; PF2e: capped at 2, unlockable only at heighten 7th, no further scaling shown beyond that tier).
- **Nothing dropped** from the core self-teleport/momentum mechanic; nothing added beyond the standard teleport-restriction boilerplate noted above.

## Converter's notes

- **Anchor:** "Teleport (rank 5, 100-mile range) — Revisit is a shorter-range, backward-in-time personal teleport"
- **Archetype:** utility / teleportation
- **Balance bullets:**
  - "Self-only temporal teleport within 10 minutes: Teleport at rank 5 goes 100 miles to a known location; Revisit goes to any personally-visited location within 10 minutes — much shorter range but no destination preparation needed"
  - "Momentum preservation is a unique mechanic with no balance cost (momentum carries over); it's purely flavor"
  - "10-minute window at rank 5 is appropriate; 1-hour at rank 7 (heightened) matches duration-tier progression"
  - "Instantaneous: this is not a sustained or concentration effect; the jump happens once"
- **Overridable:**
  - "The 10-minute lookback could be extended to 1 hour at base rank if the author feels rank-5 deserves the full hour from the 5e original"
  - "The momentum mechanic could be dropped for simplicity — 'you arrive with no momentum' is cleaner but less evocative"
- **Checklist failures:**
  - "The 'time' trait is a custom homebrew trait not found in canonical PF2e Remaster. See Jolt note for series-wide flag."

## Similar official spells

- **Translocate** (rank 4) — instant self-teleport (with worn/held items) to an unoccupied visible space within 120 feet; heighten 5th extends range to 1 mile and drops line-of-sight requirement in favor of "have been there before," plus grants 1-hour teleport-immunity. Comparison axis: the closest official "short-hop self-teleport with a scaling reach at heighten" pattern — Translocate scales *spatial range* (120 ft → 1 mile) where Revisit scales *temporal range* (10 min → 1 hour); both are self-only base rank with a passenger-adding or reach-adding heighten tier.
- **Teleport** (rank 6) — long-range (100-mile, heighten 7th → 1,000-mile) group teleport requiring precise knowledge of the destination, with an imprecision/mishap risk at range. Comparison axis: the converter's own named anchor; shows the top end of the teleport-utility rank ladder and underscores that Revisit trades Teleport's huge spatial range for the novelty of "no destination knowledge needed, just recent personal history" plus momentum preservation.
- **Mirror Image** (rank 2) — unrelated function, included only as a rank-referenced sanity check; not a close comparable for teleport-utility and not otherwise used here.

*(Only two closely-function-matched official teleport-utility spells exist in the searched rank bands near rank 5 in this snapshot — Translocate at rank 4 and Teleport at rank 6 — bracketing Revisit's rank 5 from both sides.)*

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly.

## Open flags

- **`system.target.value` is an empty string** (`""`) even though the spell is unambiguously self-only per the prose ("you personally occupied," "you teleport") — the sibling self-only spells in this batch (Reflective Defense, Retributive Force, Right Hand of Judgment, both Shape Modify spells) all set `target.value = "you"`. Revisit does not.
- **`system.duration.value` is also an empty string** despite jmnario's own conversion explicitly recording `"duration": "instantaneous"` for this spell. The store's duration field carries no value at all where jmnario's conversion had "instantaneous" — a field-level content loss between jmnario's output and the current store, even though `revisions.md` shows zero deviation (meaning this empty-string state is what a fresh re-conversion of jmnario's baseline through the current adapter also produces — i.e., this appears to be an adapter-level transformation, not a hand edit).
- Custom "time" trait, explicitly flagged as non-canonical by the converter's own checklist-failures note above ("not found in canonical PF2e Remaster").
- No `@UUID[...]` compendium links anywhere in this description.
