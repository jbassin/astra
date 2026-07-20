# 0030 assay round 3 — effect-spell comparables + prior-anchored price card — NLSpec

**Status:** FINAL (2026-07-19) — REDESIGNED at the stakeholder fork after adversarial review.
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

(lands at build.)
