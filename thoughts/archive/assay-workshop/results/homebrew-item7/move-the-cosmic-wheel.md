# Move the Cosmic Wheel

## Header block

- **Rank:** 8
- **Routing:** `comparables`
- **Pool reason:** wide-range (LOW-INFORMATION signal — this spell landed in the manual pool because the comparables-based scorer returned a very wide candidate rank range, not a tight estimate)
- **Current assay line:** verdict = null, rankRange = [1, 9], residualRanks = null — the scorer's comparable-spell search spanned ranks 1 through 9, which is why the routing flagged it as low-information rather than trusting a point estimate
- **Adapter warnings:** none recorded
- **Traits:** concentrate, manipulate, planara, teleportation (rarity: rare)
- **Traditions:** arcane, occult
- **Cast:** 10 minutes
- **Cost:** a music box worth at least 250 gp, attuned to the destination plane (not consumed)
- **Range:** 120 feet
- **Targets:** (none listed — area-only)
- **Area:** 30-foot burst
- **Defense:** Will save (non-basic)
- **Duration:** 8 hours

## The 5e original

- **Level:** 8 (Ranger, Seeker, Warlock, Wizard)
- **School:** planara (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** 120 feet (point)
- **Components:** V, S, M — "a music box worth at least 250 gp attuned to a particular plane of existence" (cost 250 gp, not marked consumed)
- **Duration:** 24 hours

> You wind your music box and call forth a piece of another plane of existence with which you are familiar, either through personal experience or intense study. The magic creates a bubble of space with a 30-foot radius within range of you and at a spot you designate. The portion of your plane that's inside the bubble swaps places with a corresponding portion of the plane your music box is attuned with.
>
> There is a 10% chance that the portion of the plane you summon arrives with native creatures on it. Inanimate objects and non-ambulatory life (like trees) are cut off at the edge of the bubble, while living creatures that don't fit inside the bubble are shunted outside of it before the swap occurs. Otherwise, creatures from both planes that are caught inside the bubble are sent along with their chunk of reality to the other plane for the duration of the spell unless they make a successful Charisma saving throw when the spell is cast; with a successful save, a creature can choose whether to shift planes with the bubble or leap outside of it a moment before the shift occurs. *(Source text has "shit planes"/"the shit occurs" — a verbatim vendor typo for "shift"; reproduced here for accuracy, not editorialized.)*
>
> Any natural reaction between the two planes occurs normally (fire spreads, water glows, etc.) while energy (such as necrotic energy) leaks slowly across the edge of the sphere (no more than a foot or two per hour). Otherwise, creatures and effects can move freely across the boundary of the sphere; for the duration of the spell, it becomes a part of its new location to the fullest extent possible, given the natures of the two planes. The two displaced bubbles shift back to their original places automatically after 24 hours.

No `entriesHigherLevel` block in the 5e source (no upcast text).

## The conversion (canonical store)

> You wind your music box and draw a bubble of another plane of existence to the spot you designate within range. The magic creates a 30-foot-radius bubble at that point: the material within the bubble on your plane swaps with a corresponding piece of the attuned plane. Inanimate objects are cut off at the edge; ambulatory creatures from both planes caught inside can attempt to escape.
>
> Creatures from your plane inside the bubble when it fully manifests must attempt a Will save; on a failure they are transported to the other plane when the bubble swaps. On a success they choose whether to stay or go. Creatures arriving from the other plane into the bubble on your plane likewise may attempt a Will save if the GM determines they are present (10% chance of native occupants).
>
> For the duration, the boundary of the bubble is permeable: creatures and effects can move freely across it, though effects that are plane-dependent (fire that needs oxygen, gravity orientation, etc.) interact according to the physics of whichever side they are on. After 8 hours, both bubbles revert automatically to their original planes.
>
> **Critical Success** The creature is unaffected and may observe the bubble safely.
> **Success** The creature may freely choose to remain on its current plane or enter the bubble.
> **Failure** The creature is transported to the other plane with the bubble.
> **Critical Failure** The creature is transported to the other plane and is Stunned 1 from the disorientation.

Structured fields agree with the prose (area = 30-foot burst, duration = 8 hours, defense = Will save, cost text matches). No field/prose disagreements found.

## What changed, plain English

- **Cast time:** 5e 1 action → PF2e 10 minutes. A full order-of-magnitude slower cast (the jmnario conversion notes justify this explicitly — a rank-8 reality-bending planar swap is treated as too dramatic for a combat-instant 1-action cast).
- **Duration:** 5e 24 hours → PF2e 8 hours (a deliberate 1/3 reduction, called out in the converter's notes as "the plan's exploration cap" for this kind of effect).
- **Save ability:** 5e Charisma saving throw → PF2e Will save (standard Cha→Will organ-mapping used throughout this batch).
- **Degree-of-success structure added:** 5e had a simple pass/fail (successful save = choose to go or stay; failed/no save = forced transport). PF2e adds explicit crit-success/success/failure/critical-failure tiers, and invents a **new critical-failure clause with no 5e basis**: the creature is transported AND Stunned 1 from disorientation.
- **Content dropped:** the store's description **removed a sentence present in the raw conversion** — "This spell has no clean analog in standard PF2e magic — it is designed from the rank-8 utility/planar budget." That design-note sentence leaked into the intermediate conversion's player-facing text (visible in the vendor conversion file) and was cut from the canonical store's description (accounts for the bulk of the recorded −109-char delta in `revisions.md`).
- **Rarity added with no 5e basis:** `rare` (5e had no rarity concept).
- **Traits added with no 5e basis:** `teleportation`. The `planara` trait mirrors the 5e school field (adapter-level normalization, seen consistently across this whole batch — e.g. also present on Patishvat's Perfect Pocket).
- **No heightening in either version** — 5e had no "at higher levels" text and the PF2e conversion carries no heightened entries either.

## Converter's notes

**Anchor:** no clean analog — designed from rank-8 utility/planar budget; nearest is Plane Shift (rank 7, single creature teleport) scaled to mass planar zone

**Archetype:** utility/planar — mass planar displacement

**Balance bullets:**
- "10-minute cast time reflects the gravity of swapping a 30-ft bubble of reality between planes — Plane Shift (rank 7) is 2 actions for 8 creatures; this displaces terrain and creatures en masse, justifying ritual-length cast"
- "Will save (Cha-organ per 5e → Will per PF2e) preserves the 'mental/soul resistance to planar displacement' fiction; no save = instant guaranteed displacement of up to ~7 large creatures is too strong without it"
- "8-hour duration (down from 5e's 24 hours) per plan exploration-buff duration cap; still narrative-significant"
- "Rare rarity: cross-planar mass terrain swap is extraordinary even in high-magic PF2e settings"

**Overridable:**
- "Cast time: reduced from 5e's 1-action to 10-minute; GM may allow 3-action cast at the cost of narrowing the bubble to 15-foot radius"
- "Duration: 5e was 24 hours; PF2e version is 8 hours; GM may restore to 24 hours for maximum fidelity to source"

**Checklist failures:**
- "No clean PF2e analog exists for cross-planar terrain swap at rank 8; design from budget is the only path. Duration reduced from 5e's 24 hrs — deviation logged here."

## Similar official spells

- **Interplanar Teleport** (rank 7) — Requires a planar-key Requirement; moves up to 8 willing creatures to a known plane. One rank lower, single-direction group transport with a material-key gate, vs. Move the Cosmic Wheel's bidirectional area-swap with no willing-only restriction.
- **Teleport** (rank 6) — Moves the caster + up to 4 willing targets/objects up to 100 miles instantly (1 action), with a location-familiarity risk table for imprecise targeting. Two ranks lower; single-plane point-to-point vs. this spell's cross-planar bubble-swap.
- **Banishment** (rank 5) — Single-target Will save, sends a creature not on its home plane back there; can add a −2 circumstance penalty via an extra action + anathema cost. Three ranks lower; single-target forced ejection vs. this spell's area-wide optional/forced group transport.
- **Quandary** (rank 8) — Single-target extraplanar removal into a locked puzzle room (Will save, sustained). Same rank; single-target and escapable-by-puzzle-solving vs. Move the Cosmic Wheel's area-wide swap with a fixed 8-hour auto-reversion and no escape mechanic.

**Scorer comparables (low-information):** rank range 1–9 (per queue routing `wide-range`) — no individual named comparables were supplied in the routing data; the wide span itself is what triggered manual pooling.

## Prior astra touches

Listed in `revisions.md` deviations: description length delta −109 chars (store=1637, baseline=1746). No other field-level deviations recorded (traits/duration/area/etc. match the fresh adapter re-conversion exactly). Cross-checked against the vendor conversion text above: the delta corresponds to the dropped "no clean analog... rank-8 utility/planar budget" design-note sentence.

## Open flags

- The 5e source text contains a verbatim typo ("shit planes" / "the shit occurs" for "shift") — noted for awareness, not corrected in this dossier's quoted original.
- The PF2e critical-failure clause (Stunned 1 from disorientation) has no 5e precedent — it was invented during conversion, not ported from source.
- `system.target.value` is an empty string (this is a pure-area spell with no target line — expected for a burst/area effect, not an error, but noting the empty field for completeness).
- The converter's own notes flag this as a "checklist failure" case: no clean PF2e analog exists for rank-8 cross-planar terrain swap, so the whole spell was budget-designed rather than analog-anchored — this is the documented reason the scorer's comparable search returned such a wide rank range.
