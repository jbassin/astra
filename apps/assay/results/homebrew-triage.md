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

ALL RESOLVED 2026-07-22 (item 1, stakeholder session; ranks below corrected to the store's
actual values — the original table's rank column had misprints):

| Spell | Rank | Verdict | Resolution (item 1 unless noted) |
|---|---|---|---|
| Extraplanar Beam | 6 | ~~+2.30~~ | item 5 — 6d12, dazzled/blinded tiers, 120-ft line, in band |
| Healing Draught | 6 | ~~+1.86~~ | item 5 — HP kept (below heal 2A); mass-cure -> counteract |
| Cone of Decay | 7 | ~~+1.45~~ | KEPT 8d10 — verdict = undead-crit-fail 4d10 counted at full weight (base alone −1.18, riders pay it); not-halved caveat dropped |
| Darkseeker's Aura | 4 | ~~+1.02~~ | dice KEPT (aura-engine lens artifact; burst alone in band); resist 10 acid dropped |
| Hypercompression | 8 | ~~+0.74~~ | 10d10->8d10 per tick (recurring-zone idiom; −0.88/tick intended) + orb-move trigger clarified |
| Divine Regression | 2 | ~~+0.73~~ | 4d8->3d8, in band (rider rides on the Fort-save agency) |
| Extraplanar Pulse | 2 | ~~+0.65~~ | KEPT explicitly — double-gated rider + shallow r2 ladder = artifact |
| Tag | 4 | ~~+0.64~~ | dice KEPT (probabilistic detonation = artifact); action-mode transfer targeting fixed |
| Oblivion | 5 | ~~+0.58~~ | 6d6+6d6 KEPT; 5e self-risk restored (caster in blast), sacrifice now grants chosen creatures +1 save tier |

Coldest damage rows (candidates for dice growth or structure tightening, worst first):
Forceful Onslaught −5.85 · Touch of Madness −5.35 · Monstrous Copy: Tail −4.48 · Cerebral
Disruption −4.44 · Monstrous Copy: Stinger −4.38 · Focus Break −4.33 · Eldrich Horror −4.07 ·
Monstrous Copy: Claws −3.98 · Solar Fury −3.97 · Monstrous Copy: Tentacle −3.56. (The deep-COLD
hybrids — Touch of Madness, Cerebral Disruption, Eldrich Horror — are effect-dominant
save-or-sucks whose real power is the condition, so read them through §3's comparables lens
too; their damage being vestigial may be fine *if* the effect carries the slot.)

## 3. Rank-range misses (comparables + buff axes)

Nominal rank OUTSIDE the induced comparable range:

- **Over-ranked — RESOLVED 2026-07-22 (item 1, stakeholder):** Illusory Illusion **6->3**
  (overtuned; now mid-range of [2–4]) · Legend Killer **REDESIGNED r7->5** (PF2e-native: 1A,
  flat 1-min, save tiers deny mythic abilities/Mythic Points then reactions, Stunned 1 crit
  fail; all 5e legendary-action/LR text gone) · Haunt KEPT 4 ([1–2] = teleport-engine lens
  artifact; 6th-rank Hidden-arrival rider dropped) · Checkpoint KEPT 9 (slot is the gate —
  the scrubbed 1,000 gp premise deliberately NOT restored; 5e full-HP cast requirement
  restored) · Monstrous Copy: Shell KEPT 9 ([1–3] = atom-match artifact; AC +3->+2 official
  ceiling, heighten dropped, Tarrasque -> Armageddon Engine)
- **Under-ranked — RESOLVED 2026-07-22 (item 3, stakeholder):** Body Enhancement: Sense
  KEPT at rank 1 (comps overruled — the buff lens matched on bonus atoms and can't see how
  narrow the scopes are; deliberately under Darkvision) · Body Enhancement: Mind kept rank 2
  but **Will/Perception bonuses +2→+1** (Heroism calibration: +2 saves is Heroism's RANK-6
  tier; ladder shifted, H9 max +3/+2) · Suspension **rank 3→4 + 5-minute non-sustained**
  (a true Fly sidegrade — indoor combat is always within 30 ft of a surface, so it was
  functionally flight one rank before PF2e's deliberate flight gate)

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
2. **Variable-action candidates — RESOLVED 2026-07-22 (item 5; scrutiny dissolved most of it):**
   Magic Re-Missiles is NOT a fixed-cast nuke — the conversion is a faithful SUSTAINED
   re-fire engine (each Sustain re-launches all missiles; per-action output ≥ Force Barrage);
   its COLD verdict reclassified as the sustained-lens artifact; **renamed Force Drumfire**
   (stakeholder), design kept. Healing Draught: variable actions don't fit the potion
   identity; HP is BELOW official heal 2A (57 vs 75) — the real fix was the no-check
   mass-cure -> **counteract one disease or poison**. Extraplanar Beam (the real HOT):
   **6d12 + Dazzled on failure / Blinded on crit fail, 120-ft line** (stakeholder), now in
   band. Pulse (+0.65, double-gated) and Planar Pyre (−0.68 = the healthy hybrid rate)
   untouched. ⚠ CORRECTION: the "resolve HOT as 3 actions" idea below is BACKWARDS under
   the model's declared action constants (3A lowers expected EV — reads HOTTER); +1 action
   remains a real-table nerf but assay cannot credit it.
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

1. ~~§2 HOT list + §3 over-ranked rows~~ DONE 2026-07-22 (item 1; all 12 stakeholder-decided — see §2/§3 resolutions).
2. ~~§4.1 reaction repairs~~ DONE (first store edits, 2026-07-21).
3. ~~§3 under-ranked buffs~~ DONE 2026-07-22 (Sense kept; Mind +1; Suspension r4/5-min).
4. ~~The systemic §1 policy decision~~ RESOLVED per-spell-mix — execute §4a's sheet.
5. ~~§4.2 variable-action redesigns~~ DONE 2026-07-22 (Drumfire kept-as-engine; Draught counteract; Beam 6d12/120ft dazzled-blinded).
6. Deep-COLD effect-dominant hybrids — decide per spell whether the effect earns the slot.
7. The 73-ledger manual pool, seeded by his balanceBullets.

## 8. Voice sweep (2026-07-22, stakeholder-directed)

Set-wide scan for out-of-world/editor voice in descriptions. **13 spells fixed**, catch-all
rescan now CLEAN: the "no clean analog / designed from the rank-N budget" conversion-note
leak (Checkpoint, Move the Cosmic Wheel, Outside of Time, Worldweaver) · the "associated
with X / conversion noted as unusual / see notes" catalog paragraphs (Almonk's Retribution,
Laixa's Expert Intuition, Djura's Divine Protection) · series cross-marketing (Extraplanar
Beam, Sphere of Ruin — mechanic kept, re-voiced) · e.g./explainer asides (Force Drumfire,
Awkward, Swap, Nightfall). Bonus 5e-isms fixed in passing: Djura's "death-saving throws" ->
recovery checks; Excavation's percentile collapse -> DC 7 flat check (+1/5 ft). Legitimate
official-style "such as" examples were deliberately KEPT (Cone of Silence, Erase, Taboo,
Suspension, etc.).

## 9. Trait-hygiene sweep (2026-07-22, stakeholder-directed; landed with item 1)

Set-wide, adapter + store in lockstep (93 docs touched, 0 score drift, 0 new revisions
deviations): rarity keywords lifted from traits.value into the rarity FIELD (10 rare /
4 uncommon — the friend's intent, previously presenting as common); tradition names
(primal x22, occult x9, divine x5) folded into traits.traditions; STRIPPED = standard 5e
school traits (abjuration/divination/transmutation/enchantment — the standing policy,
now enforced against the vendor traits arrays too), custom strays (time, temporal, trap,
creation, summoning, gravity), and damage-type traits (bludgeoning, piercing). `illusion`,
`extradimensional`, `move` verified OFFICIAL against the Foundry snapshot vocabulary and
kept. Stakeholder: a later curation sweep may deliberately re-add custom traits; the
baseline stays strict official-vocab + the 8 homebrew schools.

## 10. Item 6 — deep-COLD effect-dominant hybrids (2026-07-22, one-at-a-time stakeholder session)

The pool: the 11 hybrids at −3.0 ranks or colder (per `score-homebrew` at session start),
coldest first — Forceful Onslaught −5.85 · Touch of Madness −5.35 · Monstrous Copy: Tail
−4.48 · Cerebral Disruption −4.44 · Monstrous Copy: Stinger −4.38 · Focus Break −4.33 ·
Eldrich Horror −4.07 · Monstrous Copy: Tentacle −3.56 · Solar Rebuke −3.47 · Repetitious
Trauma −3.16 · Grey Frost −3.04. (Carnage −2.98 sits on the line; raised as a borderline at
the end.) A hybrid at ~−1 is HEALTHY (the rider pays ≈1 rank; the GM Core exchange rate) —
these are the ones where the effect has to earn the slot on its own.

**Resolutions:**

- **Forceful Onslaught r7 (−5.85 → recorded LENS ARTIFACT, dice/mechanics untouched):**
  double artifact — a per-Strike 2d6 rider priced against the r7 per-cast budget (the §4a
  weapon-engine class) AND *prevented* Unconscious refs promoted as payloads (comparables
  came back Sleep/Power Word Kill — nonsense for a party buff). Probe with damage stripped
  routes `buff`, range 1–9, r7 comfortably inside. Manual buff read vs heroism r6: rich but
  rank-appropriate (paid by touch/2A/1-min/martial-target). The one real defect was residual
  5e dying text — the 0-HP clause + heighten rewritten PF2e-native (dying as normal, conscious
  until start of next turn, recovery checks, can't be stabilized while conscious; heighten =
  no dying until the unconscious turn, outright-kill effects still kill). Score unchanged
  −5.85 (text-only), 41st revisions deviation.
- **Touch of Madness r8 (−5.35 → chip damage DROPPED, curse kept; now `comparables 4-9`, in
  range):** the chip-damage-on-effect-spell artifact — 4d6 (EV 14) priced against the r8
  budget while the curse is the spell. Official anchor Never Mind r6 (curse+incapacitation,
  failure = Stupefied 4 unlimited, no damage) proves permanent-on-plain-failure is official
  idiom; +2 ranks pays for the no-casting lock + trusting/follow-orders rider. Stakeholder B:
  4d6 removed (Never Mind idiom, pure 5e inheritance), removal text Remaster-fixed ("remove
  curse" doesn't exist → curse-targeting effects / 4th-rank+ Cleanse Affliction @UUID),
  monthly repeat save deliberately KEPT (player-facing escape valve). Degrees rewritten
  damage-free; crit-fail confusion round untouched.
