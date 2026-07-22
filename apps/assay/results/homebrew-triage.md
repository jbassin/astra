# Homebrew conversion triage — the run_balance 176 through assay

2026-07-21. Scores the vendored 5e→PF2e conversion set (`vendor/run_balance/`, converted
2026-05-17 by jmnario via his `pf2e-spell-creator` skill; originals by Josh Bassin) through the
0030 assay pipeline. Regenerate with `uv run assay score-homebrew` (adapter caveats in §6 —
read them before trusting any single row; the machine-readable per-spell detail is
`out/homebrew/scores.json`, gitignored/reproducible).

Routing over 176: **quantitative 31 · hybrid 24 · comparables 28 · buff 20 · ledger 73**
(ledger = deliberately unpriced: utility 48, long-cast 12, no-comparable-profile 5,
unpriced-modifier 3, teleport 3, summon 1, wall 1). Three cantrips ride the cantrip scale.

---

## 1. THE structural finding: a systematic COLD skew on the damage axis

Non-healing, non-cantrip damage rows (n=44): **pure quantitative mean −1.42 ranks
(19 COLD / 0 in-band / 4 HOT of 23); hybrid mean −2.40 (17 COLD / 0 in-band / 4 HOT of 21).**

Zero pure-damage spells land in-band. This is not noise and mostly not an adapter bug
(Falling Star, hand-verified correct at exactly the community 7×rank line, still reads
−0.65 — see below). Two compounding causes, both *conversion-policy* level, not per-spell:

1. **5e structural generosity carried over 1:1.** The conversions preserve 5e-idiom ranges
   (60/120/500 ft), areas, and target counts, and assay's ladder prices structure: a spell
   with long range + big area owes more EV than the bare 7×rank row. The GM Core table the
   converter used is the *unadjusted* baseline. Fix direction: tighten range/area to PF2e
   norms (30/60/120 ft) **or** grow dice — per spell, either re-bands most of the mild COLDs.
2. **Hybrid riders were paid for twice.** GM Core's exchange rate (≈ −1 rank of damage for a
   condition rider — empirically recovered by assay round 1) explains ~1 rank of the hybrid
   skew; the remaining ~−1.4 is cause 1 again. Hybrids sitting at −1-ish are *correct*;
   hybrids at −3 and colder gave up damage twice.

So: **the set is systemically conservative** — the 1:1 rank inheritance did not over-rank
(the pre-analysis worry); if anything the spells under-deliver for their rank. Player-facing
consequence: they'd feel weak next to Paizo picks at the same rank.

## 2. The short HOT list (real balance concerns, review first)

| Spell | Rank | Verdict | Note |
|---|---|---|---|
| Extraplanar Beam | 6 | +2.30 | hybrid; also carries a rider on top |
| Healing Draught | 6 | +1.86 | healing — caveat §6.2; official heal prices the same way, so this is comparable-apples |
| Cone of Decay | 6 | +1.45 | pure damage |
| Darkseeker's Aura | 5 | +1.02 | pure damage |
| Hypercompression | 6 | +0.74 | hybrid |
| Divine Regression | 7 | +0.73 | pure |
| Extraplanar Pulse | 7 | +0.65 | hybrid (sibling of Beam — the Extraplanar family runs hot as a series) |
| Tag | 4 | +0.64 | pure |
| Oblivion | 9 | +0.58 | hybrid + incapacitation — double-check the trait gates it |

Coldest damage rows (candidates for dice growth or structure tightening, worst first):
Forceful Onslaught −5.85 · Touch of Madness −5.35 · Monstrous Copy: Tail −4.48 · Cerebral
Disruption −4.44 · Monstrous Copy: Stinger −4.38 · Focus Break −4.33 · Eldrich Horror −4.07 ·
Monstrous Copy: Claws −3.98 · Solar Fury −3.97 · Monstrous Copy: Tentacle −3.56. (The deep-COLD
hybrids — Touch of Madness, Cerebral Disruption, Eldrich Horror — are effect-dominant
save-or-sucks whose real power is the condition, so read them through §3's comparables lens
too; their damage being vestigial may be fine *if* the effect carries the slot.)

## 3. Rank-range misses (comparables + buff axes)

Nominal rank OUTSIDE the induced comparable range:

- **Over-ranked:** Illusory Illusion 6 vs [2–4] · Legend Killer 7 vs [3–6] · Haunt 4 vs [1–2]
  · Checkpoint 9 vs [1–7] · **Monstrous Copy: Shell 9 vs [1–3]** (the starkest miss in the set)
- **Under-ranked (free upgrades available):** Body Enhancement: Sense 1 vs [2–4] · Body
  Enhancement: Mind 2 vs [4–8] · Suspension 3 vs [4–8]

16 comparables + 3 buffs sit tight-in-range (healthy). 21 rows have wide ranges (span ≥6) —
honest low-information, not misses; review manually like ledger rows.

## 4. Action-economy audit (the stakeholder-raised axis)

The action cost is a **mechanical inheritance of 5e casting time** (action→2A 121/131,
bonus→1A/2A, reaction→"1A", minutes→3A+), never a design lever. Three worklists:

1. **Reaction repairs — DONE 2026-07-21 (the first canonical-store edits; see
   `homebrew/revisions.md`).** CORRECTION to this doc's earlier claim: all three carried
   their triggers in PROSE — nothing was lost semantically; the defect was encoding-only
   (`cast = 1 action` structurally, trigger buried mid-paragraph instead of the standard
   leading Trigger line Lend Time/Dead Ringer got). Repaired: Deja Vu, Disperse Magic,
   Solar Rebuke -> `time.value: reaction` + Trigger line. Deja Vu content calls
   (stakeholder): widened trigger KEPT w/ wording fix (the retry rider was unreachable as
   drafted), SAME-TYPE echo restored (mental trait dropped — it gated the whole spell off
   mindless creatures), fortune -> misfortune, materials dropped (Remaster has none —
   set-wide policy). Bonus: Disperse Magic's Remaster-invalid `abjuration` school trait
   dropped. Post-repair: Deja Vu -0.68 (re-measure any dice bump vs this), Solar Rebuke
   -3.47 (item-6 spell), Disperse Magic buff-path (no damage verdict).
2. **Variable-action candidates (the missing PF2e idiom — zero spells use it):**
   **Magic Re-Missiles** (−2.60 COLD at fixed cast; the official Force Barrage it apes is
   *defined* by 1/2/3-action scaling — adopting that pattern likely fixes its COLD verdict
   for free), **Healing Draught** (heal's 1/2/3-action pattern is the genre template), and
   the Extraplanar family (its HOT could resolve as "current numbers at 3 actions").
3. **Cost re-banding before touching dice:** for each §2 HOT row, +1 action is a legitimate
   nerf that preserves the dice; for mild COLDs (−1-ish), dropping to 1A (single-target
   short-range ones) is a buff that preserves flavor. Assay's action-cost constants make
   this checkable per spell — rerun `score-homebrew` after any edit.


### 4a. Item-4 RESOLVED + APPLIED (sheet approved 2026-07-21; edits landed 2026-07-22 — see `homebrew/revisions.md`)

**Applied:** Falling Star 11d6 · Almonk's Retribution 11d6 · Sapping Lightning 9d12 ·
Elemental Sink 3d4 · Acupuncture 5d6 · Deja Vu cap 5d6 (re-measured post-reaction, in band) ·
Spawn Abyssal Sprite range 500→120 ft · Summon Heart **11d10** (stakeholder call — lands
−1.13, the intended residual: the death rider's unmodeled price). All others in band.
**Still open from the sheet:** Magic Re-Missiles (item-5 redesign).

No blanket sweep. The 19 COLD pure-damage rows split: **9 genuine nukes** (sheet below, both
options re-scored through the real `assay score`), **5 weapon/morph** (Claws, Divine Razor,
Grosteque Selfshape, Festering Slick, Horns) **+ 4 sustained/charge** (Solar Fury, Righteous
Pressure, Kosmoturgist's Weapon, Planar Shield) **reclassified OUT** (per-Strike/per-round
dice vs per-cast budget = lens artifact; review them with the buff/manual pool), 1 utility
misroute (Artist's Rendition). The 17 COLD hybrids are item 6, not here — a hybrid ~−1 is
HEALTHY (the rider pays ≈1 rank); only the −3-and-colder ones need the item-6 judgment.

| Spell | Now | Baseline | A: range→120 | B: grow dice | Call |
|---|---|---|---|---|---|
| Falling Star r5 | 10d6, 500 ft | −0.65 | +0.77 HOT overshoot | **11d6 in band** | B |
| Almonk's Retribution r5 | 6d6, 500 ft | −2.28 | −1.39 still COLD | **11d6 in band** | B |
| Sapping Lightning r7 | 8d12, 500 ft | −0.74 | +1.30 HOT overshoot | **9d12 in band** | B |
| Magic Re-Missiles r4 | 1d4+1 ×3 | −2.60 | n/a | 6d4+1 in band | prefer item-5 Force-Barrage 1/2/3A redesign |
| Summon Heart r6 | 8d10 | −2.37 | n/a | 13d10 in band | death rider unpriced — some COLD is correct; ~10–11d10 |
| Spawn Abyssal Sprite r7 | 12d6 chain | −1.52 | **in band** | 15d6 in band | chain output unmodeled — prefer A or leave; NOT 15d6 |
| Elemental Sink r1 | 1d4 | −0.74 | n/a | **3d4 in band** | B |
| Acupuncture r2 | 4d6 | −0.73 | n/a | **5d6 in band** | B |
| Deja Vu r2 | 4d6 | −0.51 | n/a | 5d6 in band | repair reaction encoding FIRST (item 2), then re-score |

Model facts the sheet rests on (measured, not assumed): area size within a shape is
invisible to the fit (burst 30→20 = no verdict change — but still gameplay-stronger, don't
treat as free); the only structural lever is the RANGE bucket and it is blunt (500→120
overshoots mild COLDs straight to HOT); dice growth re-bands cleanly at every depth.

## 5. The two review lenses barely overlap (good)

His `_conversion_notes.json` flags 44 spells with `checklistFailures`; only **8** of those
also carry an assay verdict flag. His lens caught format/mechanics issues, ours catches
pricing — run both. The 73 ledgered spells (mostly true utility + rituals) are the shared
manual-review pool neither lens prices; his notes' per-spell `balanceBullets` are the
starting point there.

## 6. Adapter caveats (trust boundaries for single rows)

1. **Take Me Instead routes `buff` falsely** — its self-inflicted Unconscious/Dying *cost*
   reads as a target condition (the extractor has no caster-vs-target axis). Known, single
   spell, review manually.
2. **Healing scores on the damage ladder** (`isHealing: true` rows) — this mirrors the
   official pipeline exactly (heal itself prices the same way), so the *comparison* is fair,
   but don't read healing HOT/COLD as literally as damage.
3. **Monstrous Copy: Eye Stalks** is ledgered (`no-comparable-profile`) after its
   roll-a-table dice were excluded from EV; its six condition atoms don't match any single
   official spell. Manual review; it's the most mechanically novel spell in the set.
4. 147/176 rows carry adapter warnings — dominated by non-damage heightening text kept as
   description appendix (zero scoring impact). Read `warnings[]` before acting on any row.
5. Self-damage costs are excluded from EV (Extra Motivation, Lesser Wish, Hellforging now
   correctly ledger as utility); Solar Rebuke keeps its real enemy damage.

## 7. Suggested worklist order

1. §2 HOT list (9 spells) — nerf or re-cost; over-ranked §3 rows (5) — re-rank down.
2. ~~§4.1 reaction repairs~~ DONE (first store edits, 2026-07-21).
3. §3 under-ranked buffs (3) — free player-facing upgrades.
4. ~~The systemic §1 policy decision~~ RESOLVED per-spell-mix — execute §4a's sheet.
5. §4.2 variable-action redesigns (Magic Re-Missiles first — likely a strict improvement).
6. Deep-COLD effect-dominant hybrids — decide per spell whether the effect earns the slot.
7. The 73-ledger manual pool, seeded by his balanceBullets.
