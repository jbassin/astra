# 0030 assay round 3 — control-side effect calibration — NLSpec

**Status:** DRAFT-2 (2026-07-19) — adversarial review returned **5 blockers (F1–F5) + 2
majors + findings F8–F13**, incl. one that is not spec surgery but EVIDENCE: the reviewer
ran the D30-12 model on the real post-routing population and **V1″ is empirically
unreachable for this model family** (best ~24% within ±½ vs the 60% gate, in-sample, every
generosity applied; per-rank residuals −1.3..−2.1 at r5–r9 at every γ — high-rank control
spells are the same atoms with better unmodeled quality, and atom usage saturates from r4
while budget grows). **Design fork pending stakeholder decision — see §6 review digest.**
Other blockers (all fixable by decision): the post-routing trainer pin was a proxy
derivation AGAIN (real hostile population 151, not 270–285; the n≥15 head collapses to 4
conditions; frightened isn't in it); the D30-14 routing rule misroutes real spells both
directions (Belittling Boast → beneficial; prose-only saves invisible to the structured
prong; Haste stranded ambiguous; 61 rows undefined) and needs S1 extraction fields
(target prose, prose-save) that don't exist in features.json; the restated T4 prior
dropped the coverage weight (the round-2 β/p unit bug class — V_T4 must be
Budget(3)/w_repr); the λ hybrid fit inherits buff-atom contamination (Armor of Thorn and
Claw at value/budget 10.5) + floor-gradient degeneracy + the round-2 intercept lesson
undone. Majors: modifier atoms are prior-only (9 hostile penalty rows, all n=1 shapes) +
two real extraction bugs (case-sensitive plain-text rule (iii) loses payload on 50 spells
incl. Sleep's entire effect; en-dash penalties missed on 28 spells).
**Provenance:** round 2's V3′ diagnosis (spec `0030-assay-round2-spec.md` §5): Stage A's tier
discounts are MARGINAL prices (a rider's cost when added to a damage spell) and cannot price a
control spell's ENTIRE slot — fear scored −0.82 ranks, slow −2.29, synesthesia −4.05 with
extraction fixture-verified correct. Round 3 inverts the direction: fit standalone effect
values ON the control population (the spells' ranks are the known response), then reconcile
the hybrid population via a single marginal-discount factor.
**Round-2 base (kept, not refit):** the pure-anchored ladder `Budget(r)` (V4′ PASS, ±6% of
7×rank at r≥3), the D30-2 extraction layer (four attribution rules, fixture-verified), the
structural/action/coverage/duration constants, the D30-8 ledger routing.
**Empirical pins (swept 2026-07-19 on the round-2 `out/features.json`, `r3_pins.py`):**
control candidates (non-cantrip, no EV, conditions or modifiers) **307** (302 high-conf,
5 low); rank spread 44/63/47/45/32/20/20/17/13/6 (r1..r10); per-condition control-spell n:
prone 28, stunned 27, dazzled/concealed/slowed 24, invisible/enfeebled 23, stupefied 22,
clumsy/blinded/immobilized 21, frightened 20, sickened 14, confused 12, restrained 11,
grabbed/deafened 10, paralyzed 8, quickened 7; degree-set shapes: unconditional 107 /
full-3+-degree 44 / crit-fail+fail 29 / fail-only 27 / success-only 21; status-modifier
control spells 78 (target_stat is RAW PROSE — normalization is S1 work); hybrid rows for
the reconciliation fit 146. ⚠ The 307 includes beneficial-effect rows the round-2 ledger
diverts (invisible/quickened are mostly self-buffs) — the trainer population is
POST-ROUTING hostile-only, re-derived at build (expected ≈270–285). Pin discipline
(P6/P10–P14 + this project ×3): re-derive from the real mechanism; unexplained delta =
STOP with options.

## 1. Goal

Standalone effect values calibrated so official control spells cluster in-band by rank,
giving (a) an interpretable price card ("frightened 1, on failure, 1 min ≈ a standalone
rank-N slot"), (b) in-band scoring for homebrew control/hybrid spells, (c) a fitted
marginal-discount factor reconciling the hybrid population with GM Core's −1-rank rider
rule. Buff pricing stays OUT (round 4 candidate) — beneficial-effect spells remain typed
ledger entries.

## 2. Decisions

- **D30-12 The control-side model.** For hostile control spell i at rank r_i with effect
  atoms a (conditions × value, modifier classes) carrying coverage×duration weights w_ia
  (round-2 D30-4/D30-8b constants, unchanged):
  `log(Budget(r_i) × struct_i) = log(Σ_a V_a · w_ia · s(r_i)) + ε_i`
  where `s(r) = (Budget(r)/Budget(3))^γ` is a single fitted rank-scaling exponent
  (γ=1 → effect values scale with budget; γ=0 → absolute damage-equivalents; V_a is
  therefore denominated at rank 3 by construction). struct_i = the round-2
  effective-target/range multipliers + declared action constants. Fit: outer grid over
  γ ∈ [0, 1.25] (step 0.05) × inner non-negative least squares in linear value space
  (numpy; simple projected/active-set NNLS — no scipy). Report γ with its grid profile,
  not just the argmin.
- **D30-13 Atom set: fit the head per-condition WITH tier shrinkage, pool the tail.**
  Conditions with ≥15 post-routing trainers fit individually, ridge-shrunk toward their
  tier mean (single shrinkage strength chosen by leave-rank-out CV over a small grid —
  report the profile); tail conditions take their tier's pooled value × the round-2
  within-tier prior offsets. T4 (paralyzed n≈8) fits POOLED with shrinkage toward a
  restated prior (a T4 fight-ender on failure ≈ a full same-rank slot, i.e. V_T4 ≈
  Budget(3) at the rank-3 denomination — replaces round 2's opaque β=6.0). Valued
  conditions: value-1 and value-2+ are separate atoms where trainer n supports both
  (frightened 1 vs 2), else value scales by the round-2 tier-promotion rule. Modifier
  atoms: S1 normalizes `target_stat` prose into classes {AC, saves-all, save-one, attack,
  checks-broad, skill-narrow, speed, perception/initiative, other}; per-class atoms with
  priors from the ±10-crit math (−1 broad ≈ T2-adjacent), fit where n ≥15, else prior.
  "other"/unparseable → confidence downgrade → ledger (never silently priced).
- **D30-14 Hostility routing (fixes the trainer-contamination the pin sweep exposed).**
  Per-SPELL classification, before training: a condition-bearing spell is hostile iff it
  targets non-willing creatures (save present, or attack-roll, or hostile targeting
  prose); unconditional-degree + no-save + self/touch/willing-target → beneficial →
  ledger (`beneficial-effect`, round-2 reason). Mixed spells (hostile conditions + self
  buff rider) keep hostile atoms only, flagged. Also S1: the round-2 known residual gap —
  `_is_summon()` gates only inline-damage recovery — is fixed so "Summon X" spells whose
  payload is an arrival effect route to the `summon` ledger reason (round 2's cold-list
  was polluted by them: summon warden of the wild, element embodied, call fluxwraith…).
- **D30-15 Hybrid reconciliation (replaces Stage A as the price SOURCE; hybrids become
  the cross-check).** On the 146 hybrid rows: fit the single marginal-discount λ in
  `log EV_i = log( max(Budget(r_i)·struct_i − λ · value_i^standalone, floor) ) + ε_i`
  with floor = 0.05×Budget (guards the log; rows hitting the floor are reported, and if
  >10% hit it λ is refit on the non-floored subset with both numbers recorded). Expected
  λ ∈ (0.2, 0.9): a rider is worth less bolted onto damage than standalone.
- **D30-16 Price-card presentation (fixes round 2's misleading "rank-equivalent @ rank
  5" column).** Per atom: (a) budget-fraction at rank 3 (the denomination), (b) the
  STANDALONE RANK r* solving `Budget(r*)·s-adjustment = V_a` at a representative
  failure-only 1-minute application — "frightened 1 ≈ a rank-N slot on its own" — the
  homebrew-facing number, (c) the marginal price λ·V_a for rider use. Card regenerated
  in `results/point-tables.md`; the round-2 card moves to the provenance appendix.
- **D30-17 Carried unchanged:** incapacitation dual scoring (at-level + boss-degraded);
  coverage constants (incl. the success=1.0 fix); duration constants; the damage-side
  scoring path and ladder — round 3 MUST NOT change any pure-damage spell's score
  (byte-identical damage-side results asserted, modulo the summon/routing fixes which
  are enumerated).
- **D30-18 Validation gates (honest-fail discipline carried).**
  - **V1″ control clustering (in-sample, the design's own hypothesis):** ≥60% of scored
    hostile control spells within ±½ rank-equivalent, ≥85% within ±1; per-rank residual
    table published. In-sample fit quality IS the claim here (does the atom set explain
    rank at all) — overfit risk is bounded by the atom count (~25–30 params on ~275
    rows) and the leave-rank-out CV in D30-13.
  - **V2″ known-name ordering (enumerated in the build record BEFORE S2 scores land):**
    strong control names (fear, slow, synesthesia, + the scoreable strong set) vs weak
    control names (flense's control-side analogues, dizzying colors (incap-at-rank,
    at-level score), sleep-as-slot-spell…): ≥75% correct side of own-rank band center
    AND strong-mean minus weak-mean ≥ 0.5 rank-equivalents. Expected-ledger assertions
    carried (command, sure strike, shadow siphon, walls, buffs).
  - **V3″ reconciliation:** λ lands in (0.2, 0.9); implied marginal price of a
    representative T2 failure-only rider within ±50% of the GM Core −1-rank exchange
    rate at ranks 3–5.
  - **V4″:** γ reported with grid profile + interpretation; damage-side non-regression
    (fireball spot unchanged; ladder untouched; enumerated routing-fix diffs only).
- **D30-19 Deliverables.** Rebuilt price card (D30-16) + full power ledger (control
  spells now genuinely scored; ledger reasons re-counted) + validation.md (V1″–V4″ real
  numbers) + README homebrew section updated (control-spell template + the no-refs
  warning carried) + spec §5 build record. `assay score` prices hostile homebrew
  control/hybrid spells end-to-end.
- **D30-20 Discipline.** Same git rules (pathspec `apps/assay/**` + this spec file in the
  S2 commit; timer check before commit windows; push after each green slice). Full py
  lane green locally per slice. Tests hermetic; new fixtures for: hostility routing
  (hostile save spell / self-buff / mixed), modifier normalization classes, a
  summon-arrival-effect spell, NNLS + γ-grid on synthetic data with known values, λ fit
  incl. a floor-hitting row.

## 3. Out of scope (round 4+ candidates)

Beneficial-buff pricing (needs its own anchor — the biggest remaining coverage gap:
~78+27 spells); summon sub-model; wall/terrain; focus-spell band; forced-movement/
action-compulsion atoms (command stays ledgered); degree-of-success EV beyond the
declared coverage table; any codex surface.

## 4. Slices (serial; one sonnet engineer + one orchestrator-reviewed commit each)

- **S1 — routing + atoms groundwork.** D30-14 hostility routing + summon fix; D30-13
  modifier normalization; re-derived post-routing trainer pins (expected ≈270–285
  hostile control / per-condition n table — report deltas); refreshed features/ledger;
  fixtures + tests. No pricing changes; damage-side results asserted unchanged except
  enumerated routing diffs.
- **S2 — the control-side fit + rescore.** D30-12 γ-grid × NNLS + D30-13 shrinkage/CV +
  D30-15 λ + D30-16 card + full rescore + V1″–V4″ validation + README + build record §5.

## 5. Build record

(lands at build.)

## 6. Review digest + the design fork (2026-07-19)

The reviewer's empirical fits (scratchpad `r3-review/`: routing.py, gamma_fit.py,
best_shot.py, weighted.py, lambda_rstar.py) established, beyond the fixable blockers:

1. **The atom-value linear model cannot explain control-spell rank** on the extractable
   schema: rank×atom usage saturates (~0.66 weighted plateau from r4, T4 share 0% at r8);
   fitted values are tier-incoherent under every variant (dazzled 1.86×B3 > tail-T2 0.99);
   γ is ridge-identified (argmin swings 0.25–0.80 by objective choice — and the spec never
   pinned the outer objective: the round-2 unit-bug class, milder form).
2. **What still works:** the damage/hybrid quantitative path (round 2, V4′ PASS); the
   verified-scoreable V2″ roster (strong: fear, slow, synesthesia, paralyze, confusion,
   blindness, overwhelming presence, synaptic pulse; weak: dizzying colors, stupefy;
   expected-ledger: command, sure strike, shadow siphon, sleep-until-extraction-fix);
   the two payload-restoring extraction fixes (case-fold rule (iii); en-dash modifiers);
   the routing/hygiene repairs (F1/F2/F4/F5 resolutions).

**The fork (stakeholder decision):**
- **(a) Rank-relative model:** add per-rank intercepts absorbing the unexplained curve;
  deliverable becomes WITHIN-RANK ordering + percentile vs same-rank official spells, not
  a generative point system. Honest but weaker: ordering quality itself is uncertain
  given tier-incoherent values.
- **(b) Build as spec'd with truthful gates:** keep the generative model, re-set V1″ to
  what the data supports (monotone per-rank medians + ordering on the enumerated roster);
  ship knowing the point card is noisy at high ranks.
- **(c) Pivot the control-spell deliverable to comparables + prior-anchored card:**
  quantitative scoring stays damage/hybrid-only (validated); effect spells get (i) the
  extraction-driven COMPARABLES view — "your homebrew's atom profile most resembles these
  official rank-N spells" — and (ii) the price card as a community/GM-Core prior-anchored
  design checklist, explicitly labeled priors-not-fits. Fix the extraction bugs + routing
  either way (they're real payload losses independent of the fork).
