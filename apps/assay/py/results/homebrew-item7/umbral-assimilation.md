# Umbral Assimilation

## Header block

- **Rank:** 6
- **Routing:** `buff` (scorer kind `buff-comparables`)
- **Pool reason:** wide-range — the scorer's own comparables span rank 1–9 (population
  `beneficial`), which the chunk brief calls LOW-INFORMATION; this is why the spell sits in
  the manual-review pool rather than an auto-scored bucket.
- **Current assay line (from `apps/assay/out/homebrew/scores.json`):** no verdict/residual —
  `buff`-routed rows don't get a quantitative verdict. `rankRange: [1, 9]`.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage
    effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, darkness, illusion, manipulate, planar (`planara`... note: store
  value is literally `planara`, see Open flags), shadow. Rarity: common.
- **Traditions:** arcane, occult.
- **Cast:** 2 actions (concentrate, manipulate).
- **Range:** self. **Target:** you.
- **Defense:** none (`system.defense: null`).
- **Duration:** 10 minutes (not sustained).
- **Heightened:** fixed-rank, level 8 only (description appendix; no structured effect).

## The 5e original

- **Level/School:** 6th-level, school "planara" (a custom 5e school; source `tfc`).
- **Casting time:** 1 action.
- **Range:** Self.
- **Components:** V, S (no material).
- **Duration:** 10 minutes, non-concentration.
- **Classes:** Ranger, Seeker, Warlock, Wizard.

> You draw upon the shades of Carceri to shield you from sight. Until the spell ends shadows
> swirl around you and you gain the following benefits:
> - At the start of each of your turns, you turn invisible. If you attack or cast a spell,
>   this invisibility ends.
> - You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.
> - You can use your action to create a 15-foot radius sphere of magical darkness centered on
>   a point you can see within 60 feet of you, as per the *darkness* spell. This darkness
>   lasts for the duration, or until you activate this ability again.

No `entriesHigherLevel` field present (5e original has no upcast text).

## The conversion (canonical store)

> You draw upon the tenebrific shades of Carceri, wreathing yourself in swirling umbral
> energy. For the duration, you gain the following benefits. At the start of each of your
> turns, you become *Undetected* (UUID link to `Compendium.pf2e.conditionitems.Item.Undetected`)
> by any creature that relies on sight (this functions as the invisible condition, but ends
> immediately if you use a hostile action rather than at the start of your next turn). You
> gain darkvision with a range of 120 feet, including the ability to see through magical
> darkness. Once per minute as a 2-action activity (concentrate, manipulate), you can create a
> 15-foot-radius sphere of magical darkness centered on a point you can see within 60 feet;
> this darkness lasts until the end of your next turn or until you dismiss it with a free
> action.
>
> ---
> **Heightened (8th)** The magical darkness you create lasts until the end of the spell's
> duration rather than until the end of your next turn.

No degree-of-success structure (no save, no attack roll). Structured fields agree with the
prose: `duration.value` = "10 minutes", `range.value` = "self", `target.value` = "you",
`time.value` = "2". The heighten text lives only in prose (appendix); `heightening.levels`
has an empty `{}` at "8" with no structured dice/effect payload, consistent with the
adapter warning.

## What changed, plain English

The core package is preserved essentially 1:1 — Carceri fiction, per-turn stealth that
breaks on hostile action, darkvision 120 ft through magical darkness, and a gated darkness-
sphere ability — but several numbers and one structural piece moved:

- **Action cost:** 5e 1 action → PF2e 2 actions for the initial cast (standard PF2e multi-
  benefit self-buff conversion).
- **Darkness-creation gating:** 5e let you re-trigger the darkness sphere with your action
  any number of times per turn/at will (only bounded by needing an action each time), with
  the darkness persisting for the whole 10-minute duration. PF2e version gates it to *once
  per minute* as its own 2-action activity, and the darkness now expires at the end of your
  next turn (not the spell's duration) unless heightened to 8th. This is a real, gameplay-
  visible *reduction* in the always-on utility of the darkness ability — flagged explicitly
  in jmnario's `changedElements` as intentional anti-spam design.
- **Invisible → Undetected:** terminology change only (Remaster renamed the condition
  behavior at the "relies on sight" carve-out); same mechanical footprint as 5e's turn-start
  invisibility that ends on a hostile act.
- **"See normally in darkness" → "darkvision 120 feet":** re-expressed as the PF2e sense
  trait rather than 5e's bespoke sentence; functionally equivalent (both explicitly cover
  magical darkness).
- **New structural element not in 5e:** the 8th-rank heightening entry (extending darkness
  duration to the full spell duration) has no 5e counterpart — 5e had no upcast text for
  this spell at all. This is an ADDITION with no 5e basis.
- **Traits:** 5e had no explicit trait list (5e schools/traits don't map 1:1); PF2e added
  concentrate/darkness/illusion/manipulate/shadow plus the school trait. jmnario's
  intermediate conversion omitted the school trait (`planara`); the canonical store adds it
  back (see Open flags for the misspelling).
- **Nothing else was dropped** — no mechanical benefit present in the 5e text is absent from
  the PF2e version.

## Converter's notes

**Anchor:** Fiery Body (rank 7) — self-buff polymorph with aura + immunity + special
abilities; Umbral Assimilation is the shadow analog 1 rank lower.

**Archetype:** buff (self; shadow-plane abilities)

**balanceBullets:**
- "Fiery Body at rank 7 grants fire immunity + 3d6 fire aura + touch fire damage + fly 60.
  Umbral Assimilation at rank 6 grants per-turn invisibility (ends on attack) + darkvision
  120 + darkness creation — the package is comparable but the invisibility is more
  tactically flexible."
- "Per-turn invisibility that resets on each turn (ends on hostile action within that turn)
  is a strong stealth ability; it's weaker than 4th-rank Invisibility (1 min unconditional
  hostile) because it resets per attack."
- "10-minute duration (non-concentration) at rank 6 is generous; appropriate for an
  exploration-tier self-buff with no per-round effect."
- "Darkness creation is once-per-minute-gated to prevent darkness spam that trivially shuts
  down vision-dependent foes."
- "No damage, no save, no attack — purely self-buffs; this is appropriate for a rank-6
  self-improvement package."

**overridable:**
- "Duration could be reduced to 1 minute (sustained) to bring it in line with combat-grade
  self-buffs like Fiery Body."
- "The darkness creation could be reduced to once per casting (rather than once per minute)
  to prevent mid-combat repositioning abuse."
- "Could add shadow trait if the GM wants that immunity gate."

**checklistFailures:** none.

## Similar official spells

- **Invisibility (rank 2)** — 10-minute duration, target turns Invisible/Undetected, ends on
  hostile action. Nearly the same stealth clause as Umbral Assimilation's per-turn version,
  but Invisibility is a single continuous window at 1/4th the rank; Umbral Assimilation's
  version *resets each turn* instead of ending outright, which is the tactically stronger
  read jmnario's notes call out.
- **Blanket of Stars (rank 6)** — 10-minute non-concentration self-buff granting a Stealth
  bonus and starlight-cloak effects; same rank, same duration shape, similar "quiet
  passive self-buff, no combat payload" archetype — a good same-rank apples-to-apples check.
- **Mislead (rank 6)** — sustained 1-minute Invisible + illusory duplicate that can act with
  your full actions; same rank, much more combat-active (duplicate can misdirect attacks),
  a useful upper bound for what a rank-6 invisibility-adjacent buff can carry.
- **Fiery Body (rank 7)** — jmnario's own anchor; self-transmutation buff bundling
  immunity/resistance/weakness/an aura/a fly speed/spell-damage boost. One rank above
  Umbral Assimilation, useful as the "richer package, higher rank" ceiling comparison.
- **Wall of Shadow (rank 3)** — pure darkness-wall utility (blocks light) at a much lower
  rank; useful only as a check on how PF2e prices raw "create darkness" as a standalone
  effect (cheap, rank 3) versus Umbral Assimilation bundling it with stealth+darkvision at
  rank 6.

**Scorer comparables (low-information):** Empty Pack (rank 2), Invisibility (rank 2),
Invisible Item (rank 1), Foresight (rank 9), Flashy Disappearance (rank 1). Rank range 1–9 —
this spread is the reason the row is flagged wide-range/low-information rather than trusted
as a scored verdict.

## Prior astra touches

None found. `revisions.md` has no `Umbral Assimilation` entry (store matches a fresh
re-conversion of the vendored baseline exactly — 0 hand-edit deviations). Not named in the
voice-sweep (§8) or item-6 deep-COLD list (§10) of `homebrew-triage.md`.

## Open flags

- **Trait spelling:** `system.traits.value` includes `"planara"` — this is the 5e original's
  literal (and apparently non-standard/misspelled) school name ("planara" rather than a
  conventional English word); it was carried through verbatim from the 5e source rather than
  normalized. jmnario's intermediate conversion (`all_spells_pf2e.json`) omits this trait
  entirely — the store adds it back, and doing so re-introduces the odd spelling.
- **Heighten text is prose-only:** `heightening.levels["8"]` is an empty object; the actual
  effect (darkness duration extension) exists only in the description's "Heightened (8th)"
  paragraph, per the adapter warning. No structured mechanism enforces or exposes it outside
  the description text.
- **Once-per-minute gating has no explicit reset trigger text** ("Once per minute" — the
  window start isn't defined structurally; relies entirely on prose, consistent with a
  self-buff activity but worth a read for clarity).
- **Scorer comparables are explicitly low-information** (rank range 1–9) — this row was
  never meaningfully auto-scored; it is manual-review-only by construction, not by omission.
