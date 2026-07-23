# Worldweaver

## Header block

- **Rank:** 10
- **Routing:** `ledger:utility`
- **Pool reason:** ledger — `rawSkipReason`: "no-priceable-effect (no damage, no conditions,
  no modifiers)".
- **Current assay line (from `apps/assay/out/homebrew/scores.json`):** `kind: ledger`, no
  verdict/EV/residual (deliberately unpriced).
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "cast time '1 day (ritual, 16 casters required)' isn't a shape assay's own action-time
    parser recognizes — defaults to the 2-action structural multiplier"
  - "area text not structurally parseable, left unmapped (effective-target classification
    falls back to the description's own target-count heuristic): 'the cosmos'"
- **Traits:** concentrate, manipulate, seraphic. Rarity: **rare**.
- **Traditions:** arcane, divine, occult, primal (all four).
- **Cast:** `time.value` = "1 day (ritual, 16 casters required)" (not a structured actions
  count).
- **Cost:** "a sliver of Ruin and a slice of Preservation, intertwined (consumed); all spell
  slots of all 16 casters are expended."
- **Range:** unlimited. **Target/Area:** both empty/null (`target.value: ""`, `area: null`)
  — the description's own text is the only place "the cosmos" as the effective scope
  appears.
- **Defense:** none (`system.defense: null`).
- **Duration:** "permanent (rewrites history)" (not sustained).
- **Heightened:** none (no `heightening` field present in the store at all — rank 10 is the
  ceiling).

## The 5e original

- **Level/School:** 10th-level (5e has no 10th-level spells natively; this is a homebrew
  "epic"/miracle-tier spell), school "seraphic" (custom 5e school; source `tfc`).
- **Casting time:** 1 day. `meta.ritual: false` (5e explicitly does **not** tag this as a
  ritual, despite the multi-day/multi-caster framing).
- **Range:** special (no numeric range given).
- **Components:** V, S, M (a sliver of Ruin and a slice of Preservation).
- **Duration:** special (no numeric duration given).
- **Classes:** none listed (`fromClassList: []`).

> **Casters.** This miracle requires the arcane efforts of sixteen spellcasters with the
> capability to cast 9th level spells in any exotic school of magic. All of the casters'
> spell slots are expended upon a successful casting.
>
> **Preparation.** A magic circle 30 feet in diameter must be drawn on a level surface with
> alchemical chalk. An eight-pointed star must be inscribed in the center of the circle, with
> the casters standing equally spaced in a ring around the star. The sliver and slice are
> intertwined and laid in the center of the star. The material components are consumed at
> the end of the casting time.
>
> A miracle powered by the essence of the world itself, with the power to rewrite history.
> Once finished casting the cosmos resets, going back to before creation and progressing
> from then until the current time. Each caster can change one event while time progresses,
> such as "this person is never born" or "this battle is won by the other side." The cosmos
> continues with those changes as the new reality. There is no limit on the scope of the
> change — so long as it is a single change per caster — and the consequential events can
> compound greatly.

No `entriesHigherLevel` field present.

## The conversion (canonical store)

> The most profound working of magic possible, Worldweaver requires the coordinated effort
> of sixteen spellcasters each capable of casting rank-9 spells. The casters form a ring
> around an eight-pointed star drawn in alchemical chalk on a level surface in a circle 30
> feet in diameter. The intertwined sliver of Ruin and slice of Preservation are placed at
> the center and consumed when the ritual completes.
>
> When the casting concludes, the cosmos resets entirely — the universe rewinds to before the
> current creation and runs forward again in continuous progression until it reaches the
> present moment. During this rewinding-and-progressing, each of the sixteen casters may
> alter one event in history. The change must be a single discrete event (examples: "this
> person is never born," "this battle's outcome is reversed," "this artifact is never
> created," "this planar incursion is turned back at its origin"). There is no limit on the
> scope of any one change, but each caster may make only one change, and compound
> consequences of all changes resolve through the natural progression of causality in the new
> timeline.
>
> All sixteen casters, by virtue of having cast the ritual, retain their memories of the
> previous timeline. No other being retains such memories unless specifically included as one
> caster's single change ("this person remembers the prior timeline").
>
> Worldweaver cannot be counteracted by any effect of rank 9 or lower. A second casting of
> Worldweaver itself could alter or undo the changes from a prior casting.

(Trailing empty `<p></p>` after the last sentence — a minor formatting artifact, see Open
flags.)

No degree-of-success structure (no save, no attack, no counteract check exposed on the
spell's own casting). `system.counteraction: false` — this is a Foundry structural field
about whether the spell itself performs a counteract action; it does not encode (and cannot
encode) the prose's own claim that Worldweaver is immune to being counteracted by anything
rank 9 or lower — see Open flags.

## What changed, plain English

The fiction and mechanical shape (16 casters, rank-9 minimum, 30-ft chalk circle,
eight-pointed star, dual material focus consumed, one-change-per-caster with no per-change
scope limit, memory retention only for casters) all carry through essentially verbatim from
5e. The main changes:

- **5e explicitly tags this as NOT a ritual** (`meta.ritual: false`) despite the 1-day/
  multi-caster framing. PF2e reclassifies it as an actual **rank-10 ritual** (1-day cast,
  16-caster requirement) — a structural reframing, not a numeric change, and jmnario's own
  notes flag this explicitly as a deliberate choice ("this is a ritual by every definition").
- **New content with no 5e basis: the counteract-immunity clause.** "Worldweaver cannot be
  counteracted by any effect of rank 9 or lower" does not exist anywhere in the 5e text. This
  is an added rule, invented for the PF2e conversion and explicitly logged in the converter's
  own `checklistFailures` as a violation of the standing PF2e design rule "every spell is
  counterable at its own rank" — an acknowledged, deliberate exception, not an oversight.
- **New content with no 5e basis: "a second casting of Worldweaver itself could alter or
  undo changes."** 5e's text never addresses what happens if the spell is cast again; the
  PF2e version adds this as the explicit countermeasure to the counteract-immunity clause
  above.
- **9th-level spellcasting requirement for casters is unchanged** (5e: "capability to cast
  9th level spells" → PF2e: "each capable of casting rank-9 spells" — same numeric
  threshold, same headcount of 16).
- **Traditions:** 5e has no explicit tradition list; PF2e assigns all four traditions
  (arcane/divine/occult/primal), justified in the converter's notes as "reality-spanning
  metaphysical working transcends essence boundaries" — an added classification with no 5e
  precedent to check it against.
- **Rarity: rare** — added in PF2e (5e has no rarity system); justified as "unique
  cosmological ritual; only one such cast is likely in any campaign."
- **No heightening exists in either version** — 5e has no upcast text, PF2e has an empty
  `heightened: []` (rank 10 ceiling, nothing to heighten to).
- **Nothing from the 5e mechanical text was dropped.** The one piece of 5e *voice* that did
  not survive into the current store is a trailing conversion-note sentence that briefly
  existed in jmnario's intermediate text ("This spell has no clean analog in standard PF2e
  magic — designed from the rank-10 reality-warping budget anchored to Wish/Remake rituals.")
  — this was out-of-world/editor voice, not 5e content, and was removed by the 2026-07-22
  voice sweep (see Prior astra touches).

## Converter's notes

**Anchor:** no clean analog — designed from rank-10 reality-warping budget; nearest anchors
are Wish (rank-10 ritual, rare) and Remake (rank-10 resurrection ritual, rare) from
benchmark-spells.md.

**Archetype:** utility/reality-warping — 16-caster cosmos-reset ritual

**balanceBullets:**
- "16 rank-9 spellcasters with all spell slots expended is the steepest possible resource
  cost in PF2e — this is a campaign-ending or campaign-pivoting ritual by design"
- "One change per caster (16 total) with no scope limit per change but only one change each
  is the exact 5e balance mechanism preserved; compound causality handles the rest"
- "Cannot be counteracted at rank 9 or lower: unique exception to standard counteract rules,
  justified by the rank-10 reality-rewrite scope (another Worldweaver is the intended
  countermeasure)"
- "Rare rarity: this should appear once per campaign at most; rarity gates access
  appropriately"

**overridable:**
- "Counteract exception: standard PF2e rule is 'every spell is counterable at its rank';
  Worldweaver breaks this rule intentionally because rank 10 is the ceiling and no rank-11
  counteract exists. GM may remove the exception and allow rank-10 counteract attempts at the
  cost of narrative coherence"
- "Number of casters: 5e required 16; GM may reduce to 8 or 4 for smaller campaigns while
  keeping all other parameters"
- "Ritual vs spell: flagged as a ritual in PF2e (1-day cast, multi-caster) — 5e explicitly
  tagged it as non-ritual; GM may run it as a standard spell (2 actions) for a pulpier
  high-magic feel at the cost of balance"

**checklistFailures:**
- "Counteract exception: 'cannot be counteracted by rank 9 or lower' violates the
  design-checklist item 'every spell is counterable at its own rank.' Exception is
  intentional and logged. The rationale: rank 10 is the cap; there is no rank 11 to
  counteract it normally; another Worldweaver is the explicit countermeasure."
- "No clean analog: rank-10 reality-reset has no published PF2e equivalent. Designed from
  the rank-10 budget using Wish and Remake as narrative anchors."

## Similar official spells

- **Wish (ritual, rank 10)** — 1-day ritual, 100,000 gp material cost, grants the target's
  "greatest desire," GM-arbitrated scope with an explicit warning about consequences for
  overreaching wishes. The closest official structural analog: a rank-10 ritual whose actual
  power is bounded by GM discretion rather than a fixed mechanical effect, same as
  Worldweaver's "no limit on the scope of any one change."
- **Miracle (rank 10)** — 3-action spell (not a ritual) that duplicates any divine spell of
  rank 9 or lower, or produces an effect "in line with" spells of that power, subject to the
  divine source's whims. Useful contrast: Miracle is single-caster and repeatable every day;
  Worldweaver is a 16-person one-shot with a steep resource cost, at the same rank.
  Comparing the two highlights how much heavier Worldweaver's resource gate is for
  ostensibly the same power tier.
- **Alter Reality (rank 10)** — 3-action, duplicates any occult spell of rank 9 or lower or
  any other-list spell of rank 7 or lower, or produces an effect of similar power. Same
  "reality-manipulation budget" tier as Miracle; another single-caster comparison point
  against Worldweaver's 16-caster requirement.
- **Remake (rank 10)** — 1-hour ritual-like ability (single caster, no listed cost field in
  the snapshot despite normally requiring a costly remnant) that fully re-creates a
  destroyed object from a remnant of it. Much narrower scope than Worldweaver (restores one
  object vs. rewrites history) but the same "unique reality-bending capstone" design
  register jmnario cites as an anchor.

## Prior astra touches

`revisions.md` lists exactly one deviation for this spell:

> ### Worldweaver (`worldweaver`)
> - description: length delta -137 chars (store=1556, baseline=1693)

This matches the 2026-07-22 voice sweep (`homebrew-triage.md` §8), which names Worldweaver
explicitly as one of four spells where a "no clean analog / designed from the rank-N budget"
conversion-note leak was stripped from the in-world description text: jmnario's intermediate
conversion (`all_spells_pf2e.json`) ends its description with "This spell has no clean
analog in standard PF2e magic — designed from the rank-10 reality-warping budget anchored to
Wish/Remake rituals." — that sentence is absent from the current store's
`description.value`. No other hand edits are recorded for this spell; it is not named in the
item-6 deep-COLD list (§10).

## Open flags

- **Counteract-immunity clause has no structural enforcement.** `system.counteraction:
  false` (a Foundry field about whether the spell itself performs a counteract action) is
  unrelated to the prose's claim that Worldweaver "cannot be counteracted by any effect of
  rank 9 or lower" — that claim exists only as description text; nothing in the structured
  data encodes or exposes a counteract-DC override or an immunity flag.
- **Cast-time field isn't machine-parseable** (per the adapter warning) — `time.value` = "1
  day (ritual, 16 casters required)" is a free-text sentence, not a structured actions/ritual
  schema; the scorer defaults to a 2-action multiplier internally, which has no bearing on
  the actual cast (informational only, since this row is unscored, but worth knowing if any
  future tooling reads `actionBucket` for ledger rows).
- **`system.area` and `system.target` are both empty/null** despite the description's own
  "the cosmos" as the effective scope — flagged by the adapter as unmapped.
- **Trailing empty paragraph** (`<p></p>`) at the end of `description.value` — a minor
  formatting artifact from either the original conversion or an edit pass.
- **No structured cost breakdown** — `system.cost.value` bundles both the material-component
  sentence and the "all spell slots of all 16 casters are expended" resource-cost sentence
  into one free-text field; there's no separate field for the caster-slot cost.
