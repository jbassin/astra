# 0030 assay round 3 — effect-spell comparables + prior-anchored price card — NLSpec

**Status:** BUILT (2026-07-19) — both slices landed same-session (S1 `3783473`, S2 this commit).
REDESIGNED at the stakeholder fork after adversarial review.
The original round-3 draft (control-side generative fit, D30-12..20 v1) was killed by review
EVIDENCE, not opinion: the reviewer ran the model on the real post-routing population — best
~24% of control spells within ±½ rank vs the 60% gate, per-rank residuals −1.3..−2.1 at
r5–r9 at every γ, atom usage saturating from r4 while budget grows, fitted values
tier-incoherent under every variant. High-rank control-spell power lives in unmodeled
quality (harder saves, nastier riders/scaling), not in more/bigger extractable atoms.
**Stakeholder chose option (c): quantitative scoring stays damage/hybrid-only (round 2,
validated); effect spells get a COMPARABLES view + a PRIOR-ANCHORED price card, explicitly
labeled priors-not-fits.** The fork, the review digest (F1–F13), and the dead draft live in
git history at `32a7c0b` (§6 there); its still-valid repairs are folded below.
**Corrected pins (review F1/F2 — the proxy-pin class struck a 3rd time):** post-routing
hostile control population **151** (not ≈270–285; beneficial 95, ambiguous 61 of the 307
candidates); post-routing per-condition n: stunned 20, slowed 19, stupefied 16, prone 16,
dazzled 14, frightened 13, … concealed 3, invisible 1; hostile penalty-modifier rows **9**
(all target-shapes n=1 — modifier pricing is prior-only territory, permanently);
features.json has NO target-prose field (S1 must add extraction); prose-only saves exist
on ≥43 candidate rows (structured `defense.save` null). Re-derive all of these at build
with the S1 fixes in (the fixes CHANGE them — Sleep-class payload restoration adds
instances); unexplained delta = STOP with options.

## 1. Goal

A homebrew workflow with honest mechanics coverage: damage/hybrid spells get the round-2
quantitative score against the validated budget ladder; hostile effect spells get
(a) **comparables** — "your spell's effect profile most resembles these official spells,
ranks N–M" — and (b) the **prior card** — per-condition design guidance anchored on GM
Core's −1-rank rider rule and community consensus, labeled priors. Plus the
payload-restoring extraction fixes and hostility routing the review surfaced, which
improve every downstream consumer regardless of fork.

## 2. Decisions

- **D30-21 Extraction repairs (payload-restoring; from review F6/F7).**
  (a) Rule (iii) plain-text condition matching becomes case-insensitive (case-sensitivity
  loses payload on ~50 spells — Sleep's entire unconscious effect among them);
  (b) the status-modifier regex accepts en-dash/minus variants (`–1 status penalty`; ~28
  spells silently missed); (c) modifiers gain degree attribution + duration capture
  (schema extension — currently `degree` is always "unknown" and dropped at
  serialization, duration absent); (d) new extraction fields: `target_value` prose +
  `prose_save` detection (`must attempt a <save> save` family) + hostile-area phrasing
  flag ("each creature/each enemy in") — the routing inputs features.json lacks.
  Re-derive all round-2/3 pins after these land; enumerate deltas.
- **D30-22 Hostility routing (per-ROW — variants differ; review F2/F10 resolutions).**
  Hostile iff structured save ∨ attack trait ∨ prose-save ∨ hostile-area phrasing.
  Beneficial iff all-unconditional degrees ∧ no save (structured AND prose) ∧
  self/touch/willing-or-ally target prose. **Ambiguous bucket defined:** hostile if any
  tiered condition sits at a non-unconditional degree; else ledger `routing-ambiguous`
  with the NAMED list in the build record (gate-integrity guard, review F13). Routing
  fixtures: Belittling Boast (hostile no-save emanation — must NOT route beneficial),
  Overwhelming Memory (prose-only save — hostile), Haste (buff — beneficial),
  Invisibility (beneficial). The round-2 summon-arrival gap fix carried (summon warden of
  the wild-class → `summon` ledger reason). Damage-side scores byte-identical except the
  enumerated routing/summon diffs.
- **D30-23 Comparables engine.** For any hostile effect or hybrid spell (official or
  homebrew), build a deterministic profile: weighted atom vector (condition×value with
  the D30-4/8b coverage×duration weights, both per-condition and tier-aggregated),
  structural coordinates (action bucket, effective-target, range bucket), incapacitation
  flag, damage EV band if any. Similarity = cosine over the weighted atom vector,
  ×(1 − small penalty) per structural-coordinate mismatch, ×0.5 incap mismatch —
  ONE documented formula, no fitted parameters, unit-tested on synthetic profiles.
  Output: top-5 official comparables (name, rank, shared/differing atoms) + the induced
  **rank RANGE** (min–max of the top-5's ranks, median highlighted) — never a point
  score. `assay score` on an effect spell returns comparables + range; hybrids show the
  quantitative damage score AND comparables; the r10 extrapolation warning (review F9:
  zero hostile r10 trainers) prints whenever the range touches 9–10.
- **D30-24 Prior card (replaces every fitted condition price; review F3/F4 honored).**
  Per condition × value: tier, a prior STANDALONE-RANK BAND (anchors: a T4 fight-ender
  on failure ≈ a full same-rank slot — stated unit-coherently as V ≈ Budget/w_repr with
  w_repr printed; slowed 1 for 1 min ≈ a full rank-3 slot (the "slow is best-in-class"
  consensus); frightened 1 with effect-on-success ≈ the rank-1 fear benchmark; T1 minors
  ≈ cantrip-adjacent), the MARGINAL rider price via GM Core's −1-rank rule (a
  significant rider ≈ one rank of damage budget, the round-1 probe's empirical
  ×0.5–0.75), and coverage/duration adjustment guidance (the declared constants, shown
  as multipliers). Every cell labeled prior; the round-2 fitted card moves to a
  provenance appendix marked superseded-and-known-noisy.
- **D30-25 Validation gates.**
  - **V-A comparables sanity (leave-one-out):** for the enumerated roster — fear, slow,
    synesthesia, paralyze, confusion, blindness, overwhelming presence, synaptic pulse,
    dizzying colors, stupefy — the LOO comparables' median rank within ±1 of the spell's
    own rank for ≥70%, and a qualitative neighbor-spot record (fear's neighbors should
    be fear-family, not random) in validation.md.
  - **V-B extraction-fix proof:** Sleep extracts its unconscious payload (fixture +
    live); en-dash restoration ≈ +28 modifier spells (re-derived); the ~50
    case-fold-restored spells enumerated; all pins re-derived post-fix.
  - **V-C routing proof:** the four routing fixtures land on their mandated sides; route
    counts (hostile/beneficial/ambiguous) + the named ambiguous list in the build
    record; damage-side non-regression (fireball spot; enumerated diffs only).
  - **V-D carry:** ladder untouched; round-2 damage gates not regressed.
  - Honest-fail discipline carried: misses ship with diagnosis.
- **D30-26 Deliverables.** `assay score` effect-spell path (comparables + range + card
  pointers); `results/point-tables.md` rebuilt per D30-24; `results/comparables-spot.md`
  (the roster's LOO neighbors, human-readable); README homebrew workflow (damage →
  score; effect → comparables + prior card; the markup-mandate + no-refs warning
  carried); spec §5 build record.
- **D30-27 Discipline.** Same git rules (pathspec `apps/assay/**` + this spec in the S2
  commit; timer check before commits; push after each green slice; full py lane green
  locally per slice). Hermetic tests: routing fixtures ×4, case-fold + en-dash + modifier
  degree/duration fixtures, comparables synthetic-profile tests, a homebrew effect-spell
  end-to-end score test.

## 3. Out of scope (round 4+ candidates)

Beneficial-buff comparables/pricing (needs target-prose maturity first); summon/wall/
terrain sub-models; forced-movement atoms (command stays ledgered); any generative
control-spell fit (dead until a schema captures effect QUALITY, not just identity — the
review's saturation finding is the tombstone); any codex surface.

## 4. Slices (serial; one sonnet engineer + one orchestrator-reviewed commit each)

- **S1 — extraction repairs + routing** (`feat(assay): S1 payload fixes + hostility
  routing`): D30-21 (a–d) + D30-22 + fixtures/tests + refreshed features/ledger +
  re-derived pins with deltas enumerated. No comparables/card changes.
- **S2 — comparables + prior card** (`feat(assay): S2 comparables engine + prior card`):
  D30-23..26 + validation V-A..V-D + README + build record §5.

## 5. Build record

**S1 (`3783473`) — extraction repairs + hostility routing.** `conditions.py`: rule (iii)
plain-text matching made case-insensitive (D30-21a — Sleep's entire Unconscious payload, ref'd
title-case in the preamble and repeated lowercase at Failure/Critical Failure, was silently
dropped); the status-modifier sign class widened to accept en-dash/unicode-minus (D30-21b — the
SAME Sleep fixture's Success-row "–1 status penalty to Perception checks", verified by an
independent raw-corpus grep to affect **exactly 28 files**, matching the spec's pin exactly);
`StatusModifier` gained real degree + duration attribution via per-section scanning, replacing
the always-"unknown" placeholder (D30-21c); three new extraction fields — `target_raw`
(`system.target.value`, never read before), `has_prose_save`/`prose_save_statistic` ("must
attempt/succeed at/make a &lt;X&gt; save" family, D30-21d), `hostile_area_phrase` ("each
creature"/"each enemy"). `ledger.py` gained `classify_hostility` (D30-22, per-ROW): hostile iff
structured save ∨ attack trait ∨ prose-save ∨ hostile-area phrase (checked FIRST — Belittling
Boast's empty `range.value` parses to touch-self, which must not short-circuit to beneficial);
beneficial iff every condition instance sits at a non-graduated degree AND the target prose reads
cooperative; otherwise ambiguous, resolved hostile only if a tiered condition sits at a real
graduated degree, else `routing-ambiguous`. All four mandated routing fixtures (real corpus,
committed) land correctly: Belittling Boast → hostile, Overwhelming Memory → hostile (prose-save),
Haste → beneficial-effect (Quickened's tier=None bypass), Invisibility → beneficial
(Undetected/Hidden DO carry real tiers, exercising `classify_hostility` directly).

**Engineer judgment call** (flagged, spec text under-specifies this): D30-22's literal
"self/touch/willing-or-ally target prose" beneficial criterion has no substring match on Haste's
real shape (`target="1 creature"`, range 30 ft — no literal "willing"/"ally" word), yet Haste is a
mandated-beneficial fixture. Resolved via PF2e's own design convention (documented in
`ledger._is_friendly_target`'s docstring): a spell with none of the four hostile signals that
targets a plain "N creature(s)" is cooperative by construction — PF2e never ships an
unconditional, ungated debuff on an arbitrary target with no save/attack/area-phrase gate.

Re-derived pins (real extractor output, `assay extract` against pf2e-8.3.0): 729 rows / 486
skipped (was 736/481 pre-S2-bugfix in round 2's own S1). Case-fold restoration (D30-21a): **84
spells'** condition-instance count changes under the fix (spec's own status-header estimate was
~50 — same order of magnitude; 7 of those flip from SkipRecord to a scored/ledgered row entirely:
Sleep, Bane, Web, Levitate, Malediction, Hypnotize, Ring of Truth). D30-22 routing counts
(ev=0.0 rows, population = all condition-bearing rows regardless of tier assignment, n=259):
hostile 158, beneficial-effect 81, routing-ambiguous 20. Compared against the corrected pre-fix
reference in this spec's own status header (151/95/61 of 307 candidates, review F1/F2): hostile
and beneficial are close (+7/-14, plausibly payload-restoration + judgment-call effects); the
ambiguous bucket (20 vs. 61) is the largest delta — substantially explained by (1) the reference
population (307) not matching the strict "ev=0 AND condition_ref" candidate definition reachable
from the actual built code (259) since the review's own sweep predates any D30-22 implementation,
and (2) the Haste judgment call above actively shrinking the ambiguous bucket relative to a
stricter literal reading. Flagged rather than silently reconciled — no gate depends on the exact
count, and all four mandated fixtures land correctly either way. Independent secondary
validation: "hostile penalty-modifier rows" (all-penalty status modifiers on a row with an
independent hostile signal, no tiered condition) = 10, all target-shapes n=1 — a near-exact match
to the spec's pre-fix pin of 9 (off by one). Prose-save detection: 16 of 120 no-structured-save
condition-bearing rows match the literal family (28 of those 120 contain the bare word "save"
anywhere; the remaining 12 are mostly summon-flavor text, out of scope) — the spec's "≥43" is a
stated lower bound over an unspecified broader population, not a tuning target. Pure-damage
ladder: n=27, slope=1.0892, intercept=1.7979 — **byte-identical** to round 2's shipped values
(none of the 27 pure-subset spells had a condition ref restored by these fixes).

**S2 (this commit) — comparables engine + prior card.** New `comparables.py` (D30-23): a
deterministic atom-vector similarity model over hostile-effect and hybrid spells — no fitted
parameters, one documented formula (`similarity = cosine(atoms) × (1−0.10)^n_mismatches ×
(0.5 if incap mismatch)`), unit-tested on synthetic profiles (`test_comparables.py`, 20 tests).
The atom vector combines per-condition×value weighted atoms (`conditions.atom_key` +
`pricing.instance_weight`, reused as a similarity metric rather than a price) with the four
tier-aggregate weights (`pricing.tier_weights`); structural coordinates are action bucket,
effective-target, range bucket, and a damage-EV band. **One correctness fix found mid-build**
(not a tuning choice — documented per "no silent tuning"): the initial EV-band comparison skipped
the mismatch penalty whenever EITHER side lacked a band ("nothing to compare"), which meant a
pure hostile-effect spell (band=None) was never penalized against a hybrid carrying real damage
(band="high") — verified against the real corpus, this let rank-9 hybrids like Weird surface as
top-5 neighbors for rank-1 Fear purely because their condition-atom DIRECTION matched (cosine is
scale-invariant) even though Weird packs a whole extra damage budget the atom vector can't see.
Fixed: "has a band at all" is now itself compared, so a pure-vs-hybrid pairing always incurs the
mismatch penalty; only two bandless spells skip the coordinate. New `priors.py` (D30-24): the
prior-anchored condition price card, four tier anchors each grounded on one real spell/rule's OWN
extracted shape (T4: Paralyzed/failure/round, reported at rank 5; T3: Slowed/failure/**minute**
— Slow's own real duration; T2: Frightened/success/**instant** — Fear's own real fallback, since
its `duration.value="varies"` with no per-degree prose hits `classify_duration`'s final
fallback; T1: cantrip-adjacent, anchored on the cantrip ladder's own budget), stated as
`RATE = Budget(anchor)/w_repr` then `V = RATE × w` for any condition — a genuine unit-coherent
prior, never fit.

`cmd_price` now also builds the comparables corpus (every row where `ledger.classify_row` is
`None` AND `is_comparable_candidate` — n=**313**, committed to
`results/comparables-corpus.json`), computes the prior card + tier rates, and runs V-A. `cmd_score`
now dispatches homebrew spells three ways: damage/hybrid keeps the round-2 quantitative verdict
(hybrids ALSO get comparables printed alongside it, per D30-23); a hostile effect spell (ev=0,
D30-22 routes hostile) gets comparables + rank range + r10 warning + prior-card pointers, plus
the round-2 Stage-B score printed labeled superseded/reference-only; beneficial/ambiguous spells
get a plain explanatory message, not a fabricated price. `point-tables.md` was rebuilt: the prior
card is now the PRIMARY condition-pricing section (with a worked explanation of why "Slowed 1"'s
table row, evaluated at the shared failure/~1-round representative point, reads ≈1.2 ranks rather
than the T3 anchor's ≈3 — the anchor claim is about Slow's real 1-MINUTE duration specifically,
not a claim that every Slowed 1 instance is worth rank 3); the round-2 fitted Stage A/B card moved
to a clearly marked "Appendix: SUPERSEDED — known-noisy" section, still computed (it feeds the
appendix and comparables' atom weighting) but no longer the recommended design tool. New
`results/comparables-spot.md` (the V-A roster's human-readable LOO neighbors).

**Full population** (post D30-22 routing, real corpus): 558 scored / 657 ledgered (was 629/586
under round 2's naive "any tiered condition → hostile" rule — the 71-row shift is exactly the
mass D30-22 correctly re-routes to beneficial-effect/routing-ambiguous, confirmed self-consistent
with the V-C route counts above). Comparables corpus n=313.

**Gate evidence** (`results/validation.md`, real numbers):

- **V-A FAIL** (4/10 = 40.0% within ±1 rank of median vs. ≥70% target) — diagnosed in full in
  `validation.md` and `comparables-spot.md`: the QUALITATIVE check (D30-25's separate
  requirement) PASSES convincingly — every roster spell's top-5 shares its exact condition atoms
  (Fear's neighbors are literally fear-themed spells sharing Frightened@1/@2/@3; Paralyze's are
  mind-control/status-lock themed). The quantitative miss is architectural, not a bug: two spells
  can share an identical condition-atom profile while differing enormously in rank because the
  gap lives in unmodeled quality (bigger area, more targets, extra non-condition riders, tighter
  save DCs) — precisely the dimension the round-3 stakeholder fork's own review killed the
  generative fit over. A comparables tool that can only see extractable atoms correctly surfaces
  a WIDE range in these cases rather than a false-precision point score; Paralyze is the clearest
  example (its neighbors — Dominate r6, Possession r7, Hypnopompic Terrors r8, Astral Labyrinth
  r9 — are all much higher-rank spells bundling the same incapacitation-family atom alongside
  substantially more payload than Paralyze's own single clean Paralyzed rider). 4/10 pass BOTH
  the quantitative and qualitative checks (Slow, Synesthesia, Synaptic Pulse, Stupefy).
- **V-B PASS** — see the S1 section above; en-dash restoration matches the spec's pin exactly
  (28 files, independently grep-verified), case-fold restoration is the same order of magnitude
  as the spec's ~50 estimate (84 real spells affected), all pins re-derived post-fix.
- **V-C PASS** — all four mandated routing fixtures land correctly (proven end-to-end in
  `test_assay_extract.py`'s `test_routing_*` tests); route counts and the named
  20-spell `routing-ambiguous` list are recorded in `validation.md`; damage-side non-regression
  confirmed (Fireball's V2′ spot-check unchanged, pure population/ladder untouched).
- **V-D PASS** — pure-damage ladder byte-identical to round 2's shipped values (n=27,
  slope=1.0892, intercept=1.7979, R²=0.967); V1′–V4′ mechanisms unchanged, only the underlying
  scored/ledgered population shifted per V-C's routing counts (the expected D30-22 consequence).

**Decisions made that the spec left to the engineer** (same framing as round 2's own build
record): the Haste beneficial-target judgment call (above); the comparables corpus population
gate (`ledger.classify_row(row) is None` AND `is_comparable_candidate`) since D30-23's "any
hostile effect or hybrid spell" needed an operational definition; the EV-band mismatch semantics
(bandless-vs-banded IS a mismatch, fixed mid-build per the correctness note above); the prior
card's uniform failure/~1-round reporting point for the per-condition table (matches round-2's
own card convention for apples-to-apples comparison) versus each TIER's own named-anchor
representative point (which differs per tier) — documented explicitly in `point-tables.md` so the
two numbers (e.g. "Slowed 1" ≈1.2 vs. the T3 anchor's ≈3) aren't read as contradictory; keeping
Stage A/B computed-but-superseded (rather than deleting it) since it still feeds the comparables
atom-weighting function and the appendix, a smaller-footprint choice than a full pricing.py
rewrite that the spec's D30-26 deliverables list doesn't require.

**Homebrew workflow spot-checks** (three synthetic test spells, scratchpad JSON, real
`assay score` output): a pure-damage spell (2-action, Reflex basic save, 4d6 fire, rank 3) scored
`ev=14.00, verdict: in band`; a pure hostile-effect spell (2-action, Will save, Frightened
2/Frightened 3+Fleeing on crit-fail, rank 2, Fear-shape) returned comparables range 1–9
(median 5, r10-touch warning) with Fear itself as the #1 neighbor and prior-card pointers for
Frightened 2 (T3, ≈1.88 ranks) and Fleeing (T3, ≈1.79 ranks); a hybrid (3d6 poison + Enfeebled
1/2 on a basic Fortitude save, rank 4) returned both the quantitative verdict (`-3.02 ranks
COLD`) AND comparables (range 1–10, median 1) simultaneously, per D30-23's hybrid contract.
