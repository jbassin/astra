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
6. ~~Deep-COLD effect-dominant hybrids~~ DONE 2026-07-22 (item 6; 11 + Carnage borderline, one-at-a-time — see §10).
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
- **Monstrous Copy: Tail r7 (−4.48 → recorded LENS ARTIFACT, dice untouched; 8th heighten
  trimmed; duration resolved family-wide):** the §4a per-Strike engine class — 3d10/Strike
  (EV 16.5) priced vs the r7 per-cast budget, and the once-per-round hit-gated save-gated
  stun rider priced at full per-cast weight (comparables matched on the Stunned atom:
  Daze/Animus Mine — noise). Manual read: rank-appropriate next to the trimmed Shell r9.
  Stakeholder C: the 8th heighten's twice-per-round stun DROPPED (3d12 bump kept — the stun
  stays strictly once/round at every rank); the 5e-concentration `sustained:true` inheritance
  flipped to flat 1 minute FAMILY-WIDE (Tail/Stinger/Tentacle/Claws now match Shell; text
  never mentioned sustaining; probed scoring-neutral).
- **Cerebral Disruption r9 (−4.44 → chip damage DROPPED, curse kept; now `comparables 5-9`,
  in range):** Touch of Madness's r9 sibling — chip-damage artifact (failure-only 9d6, EV
  31.5 vs the ~66 r9 budget) STACKED with the Eye-Stalks roll-a-table artifact (all six d6
  curse rows priced as if they land; prior card showed Confused ×5). Anchor Unfathomable
  Song r9 sim 0.75. Stakeholder C: 9d6 dropped (the invented stand-in for 5e's Int drain);
  the CONVERSION BUG fixed — 5e's "frightened of you" row had been dropped and phobia
  duplicated at rows 1+6, entry 2's "about creatures" narrowing reverted to auto-crit-fail
  Int-based checks; success aligned to the sibling (Stupefied 2 for 1 MINUTE, not 24 h);
  crit-fail's Stupefied-5-flat-check micro-rule simplified to Confused 1 round; legacy
  names → Cleanse Affliction / Sound Body @UUIDs; "ability-score loss" gloss removed.
- **⭐ STANDING CONVENTION (stakeholder, this session): curse removal text must specify a
  successful COUNTERACT CHECK against the spell's rank.** Applied to Cerebral Disruption +
  retrofitted onto Touch of Madness. Still carrying legacy/loose removal text, to be
  converted as each comes up for review (mostly the item-7 pool): arcane-censure,
  divine-regression, fast-forward, poisoned-backflow, taboo.
- **Monstrous Copy: Stinger r8 (−4.38 → recorded LENS ARTIFACT, dice untouched; affliction
  legalized; 9th-heighten rider dropped):** the §4a per-Strike engine again (1d4+4d10/Strike,
  EV 24.5 vs the ~58 r8 budget; Enfeeble-r1-as-top-comparable = atom noise). The real defect
  was a MALFORMED affliction — stage 2 undefined (yet crit-fail entered there), no max
  duration, and persistent-damage "flat check DC 15" language afflictions don't use.
  Stakeholder A+trim: Hutijin Venom rewritten as a legal block (Fort vs spell DC · max 6
  rounds · S1/S2 Enfeebled 2 + Clumsy 2 · S3 Paralyzed 1 round; crit-fail = stage-2 entry,
  native idiom); the 9th heighten keeps ONLY the 6d10 bump (Drained 2 rider dropped, the
  Tail heighten precedent); the once-per-round gate was OFFERED and DECLINED (venom stays
  every-hit; affliction re-exposure rules self-limit). Post-edit routing hybrid→quantitative
  (stage-block conditions no longer promote), same −4.38.
- **Focus Break r5 (−4.33 → invented damage DROPPED; now `comparables 1-9`):** the 5e
  original was explicitly no-damage ("The energy does no damage") — the conversion invented
  a NO-SAVE 2d6 mental + 1d6/rank heighten on top of a near-guaranteed chassis (target loses
  its sustained effect even on a SUCCESSFUL save; only crit success protects). The real
  payload — no-counteract, no-rank-ceiling shutdown of a sustained effect by attacking the
  SUSTAINER — is extractor-invisible; the verdict was pure chip artifact (Daze r1 sim 0.87
  on the Stunned atom). Stakeholder A: damage + heighten removed, reliable-breaker degree
  structure KEPT (a deliberate conversion invention worth keeping), Stunned 1 / Stunned 2 +
  sustain-lockout riders kept as the psychic-shock flavor.
- **Eldritch Horror r9 (−4.07 → −2.47 residual = ENGINE ARTIFACT, dice untouched; renamed
  from "Eldrich"):** the §4a sustained-engine class — the 8d6 is PER ROUND inside the
  portal, and the whole engine (4 tendril spell attacks/round, grab+drag, the removal
  itself) is extractor-invisible; comparables matched on Stunned@1 (noise). The 500-ft
  range bucket alone was 1.6 ranks of the COLD reading (probed). Stakeholder C+rename:
  range 500→120 (5e was 150; sniper-portal reading killed); the TWO DROPPED 5e clauses
  restored PF2e-natively (single-action Athletics/Escape vs spell DC to climb out ·
  spell-end = everyone inside reappears, alive or dead — as seeded, a swallowed creature
  had NO exit, a de facto permanent banish on an attack roll); the incapacitation prose
  gloss replaced with clean extradimensional-removal text (trait kept); the max-HP "void
  drain" converted to native cumulative Drained 1 (max 4), crit-fail = as failure +
  Stunned 1; "Eldrich"→"Eldritch" (stakeholder: a ten-year-old typo; file renamed,
  seededFrom pairing intact per the Force Drumfire precedent). −2.47 residual accepted —
  per-round engine output vs per-cast budget.
- **Monstrous Copy: Tentacle r5 (−3.56 → recorded LENS ARTIFACT, dice untouched; venom
  legalized):** the §4a per-Strike engine (2d8 EV 9 vs the ~35 r5 budget; two Paralyzed
  atoms at prior 5.0 each = most of the phantom COLD). The real defect: an ILLEGAL
  affliction — auto-escalating stages shaken off by a DC 5 flat check (80% — the mechanic
  mostly deleted its own spell), no max duration, "Paralyzed 1 minute" inside 1-round
  stages. Stakeholder A: Tentacle Venom rewritten to the Stinger-precedent legal block one
  tier down (Fort vs spell DC · max 6 rounds · S1 Enfeebled 1 + Clumsy 1 · S2/S3 Paralyzed
  1 round; crit-fail = stage-2 entry), 8th heighten keeps only 3d10 (flat-check rider died
  with the mechanic). Grapple-gating kept as the real guard (the conversion's own good
  normalization of 5e's hit-equals-grappled). Incapacitation trait offered, declined —
  family runs without it.
- **Solar Rebuke r5→r6 (−3.47 → recorded REACTION-CONSTANT ARTIFACT; type fixed
  vitality→fire):** the conversion's radiant→vitality type map was a functional landmine —
  Remaster vitality only harms void-healing creatures, so the spell dealt ZERO against
  living attackers on every degree (assay is type-applicability blind; the real defect ran
  opposite the verdict). Most of the COLD was the ×1.6 reaction constant (the Deja Vu
  precedent). Stakeholder B+rank: fire damage (Holy Light lineage; trait swapped
  vitality→fire), degrees to half/full/double grammar, heighten softened 2d10→+1d10/rank
  (now structural — pure bump), and RANK RAISED 5→6 (stakeholder: reaction economy at
  full 2A-grade dice pays a premium). Post-edit reading −4.47 at r6 is the artifact
  deepened by the bump — true residual vs a 2A r6 expectation ≈ −1.5, accepted.
- **Repetitious Trauma r5 (−3.16 → ticks RAISED 6d6→8d6 onto the per-tick line):** the §4a
  sustained-engine class, but the Hypercompression precedent gave a real yardstick — per-tick
  dice sit ≈ −0.9 ranks below the one-shot line. 6d6/tick measured −1.86 (UNDER the family
  rate); 8d6 lands exactly −0.90. Single-target (vs Hypercompression's zone) argues for the
  full rate; riders are mild (Stunned 1 crit-fail only). Stakeholder B: 8d6/tick, degrees to
  half/full/double grammar (hardcoded 3d6/12d6 lines died), heighten "+2d6" now STRUCTURAL
  (was appendix-only), and the "caster chooses if unknown" hidden buff (always name the
  weakness) → defaults to mental. Post-edit −2.60 = the engine-artifact residual (dice sit
  −0.90 by construction; the hybrid router's Stunned-atom pricing supplies the rest).
- **Grey Frost r7 (−3.04 → recorded DoT/no-comparables ARTIFACT, dice untouched; rebuilt as
  a staged AFFLICTION ending in petrification, stakeholder-directed):** the extractor
  priced the two 3d8 entries per-cast (failure actually delivers initial + ~2-3 ticks +
  Restrained ≈ on-budget) and found ZERO comparables (no trainer row carries Petrified).
  Manual anchor: official Petrify r6 — one rank up with damage throughout, in band. The
  affliction rebuild (failure = stage 1, crit-fail = stage 2): S1 Restrained + 3d8/round
  (Escape shatters = affliction ends) · S2 Petrified · S3 permanently Petrified (outlasts
  the spell; thaw clause) — this RESTORES the 5e restrained→frozen escalation the
  conversion had dropped, dissolves its harsher-than-5e "three CONSECUTIVE saves" tightening
  into standard affliction recovery, and replaces the sustained-full-minute permanence
  trigger with stage-3 entry. Max duration 1 min, ends with the spell except at stage 3.
  Incapacitation trait unchanged. Routing hybrid→quantitative post-edit, same −3.04.
- **Carnage r8 (−2.98 borderline, raised at the pool's edge → recorded ENGINE ARTIFACT,
  dice untouched; action grammar fixed):** the 5e vendor source is BROKEN (its 2nd/3rd/4th-
  Use escalation list is empty) so the conversion was already a reconstruction, and a good
  one. The real defect: "while you sustain… you can use the following action" read as
  Sustain + 1A = 2 actions/turn for the engine — folded into the Sustain itself per official
  idiom (5e intent "use your action"). MAP clarifier added to opener + Sustain (single
  attack for MAP, penalty after all resolve); a stray markdown `**` in the HTML died with
  the rewrite. Dice kept (opener 6d6 vs 5e's 6d12 noted; the engine pays the slot).

**Item 6 CLOSED (2026-07-22): 11 deep-COLD hybrids + the Carnage borderline all resolved.**
Post-session scoreboard: zero hybrids colder than −3 remain (deepest = Tail −4.48 /
Stinger −4.38 / Tentacle −3.56 / Eldritch −2.47 residual — all RECORDED artifacts with
per-spell reasoning above, dice deliberately untouched). Real repairs shipped: 4 chip-
damage drops (ToM, Cerebral, Focus Break + Eldritch's was structural), 2 illegal
afflictions legalized + 1 rebuilt-as-affliction (Stinger, Tentacle, Grey Frost), 2 dropped-
clause restorations (Eldritch escape/spell-end; Cerebral's lost d6 row), 1 dead damage
type (Solar Rebuke vitality→fire, +rank 6), 1 per-tick re-line (Repetitious 8d6), the
counteract-check curse CONVENTION, and the morph family's duration/heighten consistency
pass.

## 11. Sustain sweep (2026-07-25, RUN — stakeholder-ratified same day)

**OUTCOME (`0fa37a8` batch · `afb384a` card 1 · `140baa2` card 2): 22 converted, 24/175
sustained remain (24/172 non-ritual = 14.0%, vs official 15.4%).** Cards resolved:
compressive-weapon → **flat 1 minute** (Enlarge r2 precedent over the 5e 3-round option) ·
dead-ringer → **flat 10 minutes** (Invisibility register; the r4 premium buys the reaction
trigger + decoy, not 6× duration) · ebb-and-flow → **KEPT sustained** (stakeholder call:
the fresh 3→4 Everything-Spell pricing included the action tax — recorded as the one
deliberate idiom exception, not residue). Score set-diff over the batch: 1/175 field
drift (Disrupt Movement routing label `ledger:utility`→`ledger:unpriced-modifier`, no
verdicts moved); revisions.md 130→132 deviating (compressive-weapon + dead-ringer newly
deviating; the batch added 8). Original draft follows.

**Provenance:** stakeholder concern that 5e concentration (≈half of all 5e spells) over-ported
into PF2e sustain. Measured: the store carries **46/175 sustained (26.3%)** vs the official
snapshot's **254/1,652 non-ritual (15.4%)** — and it is NOT a rank-mix artifact (per-rank
weighting of official rates predicts ~28; we have 46; z≈3.7). PF2e Sustain costs an action
every round, so residue double-taxes (rank price + action tax); conversely a conversion
FREES that action, so each is a small buff to be sanity-checked.

**Calibration (all comparables verified against the Foundry snapshot, not taken from
memory):** official design is NOT simply "active sustain or flat." Three verified families:

- **Sustain earns its action** (keep): Summons, Floating Flame (move), Spiritual
  Weapon/Armament (re-attack), Dragon Turret, Aqueous Orb/Forceful Hand (move+re-trigger).
- **Sustained-despite-passive families** (keep on family precedent): self-emanation
  battlefield effects — Vibrant Vibrato r7 (damaging aura, pure maintenance), Divine Aura
  r8, Antimagic Field r8; and link/curse maintenance — Cycle of Retribution r1,
  Synchronize Steps r1, Infectious Ennui r3; and sensory/interrogation links — Painted
  Scout, Mind Probe. Bless (flat, OPTIONAL Sustain-to-grow) is the r1 ally-aura exception.
- **Flat-duration classes** (convert when matched): planted zones even with per-round
  automatic effects (Wall of Fire, Black Tentacles, Toxic Cloud), self-buffs (Haste,
  Heroism, Fire Shield), wards (Protection, Spell Turning, Dispelling Globe), single-target
  repeat-save control (Slow, Confusion, Stupefy, Petrify — the petrification engine runs on
  TARGET saves, no caster tax), weapon coats (Ghostly Weapon), restrain+damage (Slither).

**Disposition — 20 CONVERT (batch-appliable once the set-wide policy is ratified; store
edits, flag + duration + description scrub of dead Sustain references):**

| spell | r | → | anchor / note |
|---|---|---|---|
| almonk's-arcane-siphon | 3 | 1 min flat | Protection/Spell Turning; 5e original was NOT concentration |
| almonk's-retribution | 5 | 1 min flat | Wall of Fire planted-zone idiom |
| awkward | 4 | 1 min flat | its OWN Heightened(6th) already removes Sustain — make base consistent, rewrite the H6 line (also kills a literal "without concentration" 5e-ism) |
| blades-of-bone | 5 | 1 min flat | `morph` trait — the item-6 morph-family flat-1-min rule, missed |
| blithering-gibberish | 2 | 1 min flat | Stupefy; target's own save = escape valve |
| containment-orbs | 7 | 10 min flat | Spell Turning (r7 ward, flat 1 h); a 10-MINUTE sustain cap (~100 consecutive Sustains) exists nowhere officially |
| darkseeker's-aura | 4 | 1 min flat | Armor of Thorn and Claw (passive retaliation aura, flat) |
| darkseeker's-restraint | 5 | 1 min flat | Slither; its own text says "Sustaining … does not allow the target a new save — the chains simply persist" — delete that sentence too |
| disrupt-movement | 1 | 1 min flat | minor debuff; 5e original NOT concentration |
| festering-slick | 3 | 1 min flat | Ghostly Weapon; sustain existed only as a disruption liability on an already-applied debuff |
| flutterstep | 3 | 1 min flat | Haste-idiom self-buff (orthogonal to the Flicker-rename adjudication) |
| grey-frost | 7 | drop sustained, 1 min stays | Petrify precedent: the staged engine runs on target saves; the flag contradicts the item-6 rebuild (bug-fix class) |
| grosteque-selfshape | 4 | 1 min flat | `morph` trait, same missed rule; temp-HP drip becomes "at the start of each of your turns while the spell is in effect" |
| mystic-negation | 5 | 1 min flat | Dispelling Globe; the move-the-sphere single action stays as-is |
| oddly-satisfying | 5 | 1 min flat | Slow/Confusion; `incapacitation` trait already caps |
| pendulum | 3 | 1 min flat | DELETE the verbatim 5e text "Sustaining the spell requires you to Concentrate at the start of each of your turns" — the clearest residue in the set |
| phlogistic-shield | 4 | 1 min flat | Dispelling Globe/Wall of Force; move-the-lens action stays |
| retributive-force | 1 | 1 min flat | Fire Shield (flat retaliation self-buff, r4) — reviewer eyeball on r1 riders |
| time-loop | 6 | 1 min flat | Confusion (repeat-save control, flat); `incapacitation` caps |
| zone-of-minimization | 8 | 1 min flat | Black Tentacles (stationary auto-zone, flat); r8 damage-nullification power is a separate question if wanted |

**3 STOP cards (real decisions):**

- **compressive-weapon r2** — passive reach window (the literal double-tax case) BUT the 5e
  original was only 3 rounds of concentration; flat 1 min over-delivers. Options: flat
  "3 rounds" (5e-faithful) · flat 1 min (idiom-standard) · keep sustained as the throttle.
- **dead-ringer r4** — no active sustain role, but converting hands **1 hour flat**
  invisibility + a death-fake off a REACTION (official Invisibility r2 caps at 10 min flat).
  Options: flat 10 min · keep sustained at 1 h · flat 1 h as-converted.
- **ebb-and-flow r4** — planted remote zone, pure maintenance (Bless/zone precedent says
  convert) BUT it was re-ranked 3→4 THIS WEEK for Everything-Spell power; converting
  strengthens it again. Options: convert + accept · convert + re-check rank · keep sustained
  as the power throttle.

**23 KEEP:** active sustain (11): ashen-pack, bodydouble, carnage, cone-of-silence
(Sustain reorients the cone), eldritch-horror, force-drumfire, hypercompression,
repetitious-trauma, sphere-of-ruin, summon-servant, wall-of-time (move gated BEHIND
Sustain, unlike mystic-negation/phlogistic-shield). Official sustained-family precedent
(7): djura's-righteous-pressure (Vibrant Vibrato), elemental-sink (Cycle of Retribution,
exact rank+shape), fumble (Infectious Ennui), lockstep-fate (Synchronize Steps),
illusory-illusion (Vibrant Pattern/Confusing Colors), flashback + inquisition (Painted
Scout/Mind Probe). Emanation family (3): arcane-interdiction, solar-fury,
thaumaturgic-obstruction (Vibrant Vibrato/Divine Aura/Antimagic Field — high-rank passive
self-emanations ARE officially sustained; the earlier "borderline" dissolved under
verified precedent). Deference (2): lucky-ward (Bless-family flat WOULD apply, but the
r2 pricing was just adjudicated with the ally-save half load-bearing — awareness only),
sphere-of-preservation (cross-referenced with sphere-of-ruin's counteract interplay).

**Outcome math:** 20 converts → 26/172 sustained = **15.1%**, landing exactly on the
official 15.4% baseline (all 3 cards converting → 13.4%).

**Protocol when run:** store-only edits (judgment-in-STORE; no adapter change — this is
per-spell judgment, not a set-wide mechanical transform), one batch commit for ratified
converts + one commit per card decision; `score-homebrew` set-diff before/after (duration
feeds the buff lane — drift is EXPECTED on converted buffs, characterize don't assume
zero); `homebrew-revisions` regen (each convert = a new deviation vs vendor);
revisions.md stays hand-edit-only.

## 12. End-review text sweep (2026-07-24, RUN — stakeholder feedback applied same day)

**Provenance:** stakeholder end-review of the live ingest ("definitely not fully
enumerating all places these issues were seen") — 7 text-quality rules + 2 frontend items
(header title only on parent pages; pathfinder-icons.ttf action glyphs — tracked codex-side).

**OUTCOME (`f64cdde` exemplars · `563be83` sweep · `161204d` revisions): 111 spells
edited (3 exemplars + 108 sweep), 64 clean, revisions.md 132→156.** The 7 rules, applied
set-wide by three partitioned engineers off a shared policy brief + the 3 hand-calibrated
exemplars (patishvat's-perfect-pocket Bulk redesign 3/50 H3 6/100 as SPECIFIED;
charming-memory dedup/de-slop; gambler's-trick gloss strip): em-dashes out ×70 (en-dash
minus/"1–3" range idiom verified official and KEPT); redundant die/rank parens deleted;
tag-parens ((no save)/(sight)/trait tags) deleted; load-bearing parens promoted to prose
(preserve-foodstuffs et al.); trait-gloss + generic-rules-explainer sentences deleted;
duplicate clauses deduped; body-vs-ladder outcomes now ladder-only; exactly-basic ladders
collapsed to prose basic saves ×9 (antimagic-shroud the named example; tag's collapse also
removed a WRONG half-damage restatement); crit≡adjacent-tier branch deleted ×8 (reposition
named; rule now explicitly bidirectional — cf==f too).

**Verification:** zero non-description field changes (structural set-diff, all 107 files);
issue-class rescan all zeroes; every full-ladder collapse retains a prose basic-save
sentence (falling-star's was restored by hand — the one orchestrator catch); score
set-diff vs `6f53b58`: ZERO verdict/routing drift, 2 comparables-lens neighbor artifacts
(bubble-bubble rankRange [1,6]→[1,9], touch-of-madness reshuffle — documented class).

**Flags for the stakeholder (not fixed, mechanics questions):** monstrous-copy-stinger
Hutijin Venom Stage 1 ≡ Stage 2 byte-identical; monstrous-copy-tentacle Tentacle Venom
Stage 2 ≡ Stage 3 byte-identical — both look like affliction-progression conversion bugs.

## 13. Scriptorium-calibrated sweep (2026-07-25, RATIFIED same day — all four decisions)

**Ratification:** Lane 1 R1–R4 set-wide, apply-without-stopping · D13-a = **full-store
lane now** (not as-you-review) · D13-b = staff re-convert from the 5e originals, cards
for sign-off before commit · cadence = **sweep first**, scriptorium pass resumes on the
post-sweep text. Original draft follows.

**RUN RECORD (same day):** four partitioned sonnet engineers (34/46/46/46, fangs+horns
excluded) + orchestrator merge. **95/172 spells edited** (`feat(assay): scriptorium-
calibrated sweep`), revisions.md 156→**167**. Mid-run rule added by the stakeholder:
**R5 — base damage declared in the body; ladder lines say full/half/double damage**
(Ignition exemplar; now a standing text convention). D13-b landed separately (cards a/a,
both with body-declared damage): Fangs r1 3d6 melee-attack + crit-Prone · Horns r2 3d12
+ Stride-20-ft rider menu; verdicts +0.66/+0.93 recorded as the attack-roll
all-or-nothing artifact (Hydraulic Push anchors 3d6@r1 officially). Ashen-pack
marginalia = a sustain→flat conversion (duration field + Command line reworded to
once-per-round single action) — overrides its §11 keep. Gates: 95 files, 0 parse
failures, 0 field changes outside description/heightening/duration(ashen-pack only);
rescan marker-parens 38→6 (survivors = official "such as"/"minimum 1" idiom),
opportunity-attack + emanation-centered → 0, wildshape/concentration survivors all
verified flavor-voice or the official concentrate trait; **score set-diff vs the
pre-sweep baseline: ZERO drift** beyond the committed D13-b pair (grey-frost's
inverted-severity ladder byte-preserved through its R5 rewrite).

**FLAGS (stakeholder digest, none applied):** mixed-heightening pattern with no official
precedent ×2 (propagating-blast: (+1) damage + fixed target-count tiers;
festering-slick: (+1) + fixed 5th tier) · fast-forward's Str/Dex/Con penalty triad
doesn't map to the calibrated Clumsy exemplar · thaumaturgic-inhibition's deliberately
stationary emanation vs its `system.area` schema (needs an area-field edit, out of
sweep scope) · reset's Failure line references two enemy initiative rolls the prose
never grants (pre-existing, exposed by label-flattening) · blades-of-bone carries an
orphaned structured-damage entry from its struck Strike text · chrysalis Heightened
(8th) has a backwards Perception-DC comparison (pre-existing) · hellforging says
"psychic damage" (not a PF2e type; mental?) · monstrous-copy-claws heightened die
sequence 2d12→3d10→3d12→4d12 looks like a typo · body-enhancement-hide + charming-memory
kept fixed tiers (progressions not clean enough to collapse safely) · time-loop Success
grants 24h immunity that Critical Success omits (design question).

**FLAG DIGEST DISPOSITIONS (2026-07-25, staff-dealt per the compact-card process —
6 resolved without stopping, 3 dealt as cards):**

- **reset — FIXED.** The Failure line now grants the reroll it referenced: "The enemy
  rerolls its initiative twice, and you choose which of the two results applies to it"
  (the 5e original's roll-twice-caster-picks, restored self-contained).
- **blades-of-bone — FIXED.** Orphaned structured-damage entry (1d6 piercing, from the
  struck Strike text; absent from the 5e original) deleted. Expected score move recorded:
  EV 21→17.5, verdict −1.86→−2.34 COLD — the only delta in the full set-diff.
- **chrysalis — FIXED.** H8 Perception DC un-inverted: "visually imperceptible; a
  creature must succeed at a DC 30 Perception check to notice it" (the redundant "cast
  time remains 10 minutes" clause dropped with it).
- **hellforging — FIXED.** 5e original reads "3d10 psychic + 2d10 necrotic" → store now
  "3d10 mental and 2d10 void" per the 5e-ism damage-type map (the old text's "psychic
  and mental" had mapped necrotic the wrong way).
- **time-loop — FIXED.** Immunity asymmetry resolved by dominance: Critical Success line
  deleted per the crit-≡-success convention; the Success line (unaffected + 24h temp
  immunity) now covers both success degrees.
- **monstrous-copy-claws — KEEP, no edit.** The 2d12→3d10→3d12→4d12 ladder is NOT a
  store typo: the friend's intermediate conversion carries it verbatim and it's
  monotonic (avg 13/16.5/19.5/26). The d12→d10→d12 die zigzag is off official idiom —
  flagged for the joint review, not unilaterally rewritten.
- **body-enhancement-hide + charming-memory** — informational only (R3 keeps), no action.
- **Card 1 — mixed heightening → DAMAGE-ONLY (stakeholder: option c).**
  propagating-blast + festering-slick drop their fixed trigger-count tiers; each keeps
  the single (+1) damage line, now STRUCTURALLY represented (interval heightening per
  the extraplanar-pulse shape) — the Foundry module will auto-scale them. Zero score
  drift.
- **Card 2 — fast-forward triad → NAMED CONDITIONS (stakeholder: option a).**
  Failure = Enfeebled 2 + Clumsy 2 + Speed −10; crit = Enfeebled 3 + Clumsy 3 + Speed
  −20 (the redundant 1-min Enfeebled 2 rider folded in); the Con axis is carried by
  H8's existing Drained rider. Comparables neighbors reshuffled (range 3–6 → 5–9, rank
  6 in-range) — the documented lens artifact, recorded.
- **Card 3 — thaumaturgic-inhibition: WITHDRAWN as a card, resolved as R2.** The
  card's premise was WRONG (staff error, stakeholder-corrected): per Player Core p.428
  an emanation "issues forth from each side of your space" with NO default movement —
  movement is the AURA trait's behavior. So the stationary sentence was a redundant
  restatement of the default (exactly the R2 class), the `system.area` emanation field
  was already correct, and H8's "moves with you" is a genuine explicit override that
  stays. Sentence deleted. Residue sweep for the class found ONE sibling store-wide:
  mystic-negation's "The sphere does not move on its own." preamble (its action-move
  grant carries the mechanic; official Floating Flame has no such line) — trimmed.

## 13b. Post-sweep review pause + remediation (2026-07-25 late)

**The reviewer resumed post-sweep (B–C range, 12 spells, 28 marginalia in ~30 min) and
PAUSED — the §13 sweep under-delivered on the judgment lanes (R2 defensive sentences,
D13-a flavor restoration) because its gates only measured greppable patterns.** Process
diagnosis + redesign agreed with the stakeholder: marginalia are now labeled ground
truth; sweeps get a held-out CALIBRATION GATE (engineer vs his actual strikes on the 12,
gold-set style), per-spell full reads (5e original + store — intermediate dropped from
briefs to save context), per-spell×class structured ledgers (clean/edited/flagged), and
an adversarial verification lane, before any fleet touches the unreached ~150.

**All 28 marginalia APPLIED + tombstoned; pre-application text of the 12 snapshotted for
calibration.** Highlights: bodydouble −7 defensive/over-specified spans · hide tiers →
`Heightened (+2) +5 temp HP` (Diamond Dust pattern) · mind/celestial-preservation/
checkpoint-H10 heightening struck (structural fields dropped in lockstep) ·
cerebral-disruption got its 6-row named curse-effect TABLE back + one-sentence
removal text · charming-memory opening restored from the 5e original (D13-a) ·
carnage RE-ADAPTED from the stakeholder-pasted 5e original (4-stage escalating
Sustain assault, 6d12/8d12; verdict −2.98→−2.46 COLD = per-cast lens artifact) ·
bubble-bubble 10-foot ×2, (+1)→(+2), Feywild→"land of fae".

**NEW CONVENTIONS (from tonight's marginalia):**
- `<hr>` sits ONLY between body and Heightened — never before the degree-of-success
  list (audit found + fixed 4 more: BE-horns, hellforging, overhaul, worldweaver).
- NO references to specific official spells/feats inside spell bodies (Massacre, Heal,
  Sound Body, Cleanse Affliction all excised); state the mechanic plainly.
- No over-explanation/pre-litigation (extends R2's reach; "of course a curse can only
  be removed through effects that target curses").
- Complex rolled effects get a named-entry TABLE in the body; degree text refers to it.
- **⏸ PARKED — the `<name|alias>` memetic-obfuscation feature:** in-universe proper
  nouns (first: `<Feywild|land of fae>`) display the alias; codex should render a
  dreamlike hover/click reveal of the true name; Foundry shows only the alias. Store
  text carries aliases now; codex feature needs its own scope doc.

**Provenance:** the stakeholder's scriptorium prose review (21/174 spells reviewed,
acupuncture → body-enhancement-horns; 67 live marginalia in
`review-ui/state/comments.jsonl`). The annotations cluster into a small set of classes —
most of them *policy*, not per-spell judgment — that survived the §12 seven-rule sweep
because §12 never enumerated them. Rather than hand-striking ~3 instances per spell for
the remaining 153 spells, this sweep applies the distilled policy set-wide so the
remaining scriptorium pass can focus on real per-spell calls.

**Why §12 missed these:** §12's paren rules covered *redundant die/rank* parens and *tag*
parens; the §13 classes are worked-example/enumeration parentheticals, defensive
interaction pre-litigation sentences, bespoke fixed-tier Heightened blocks, and residual
5e vocabulary — none on the §12 list.

### Lanes

**Lane 0 — apply the existing marginalia verbatim (21 reviewed spells, 67 annotations).**
Strikes (`kind:remove`) delete the quoted text; notes carry the specified replacement.
These are direct stakeholder edits, not proposals — apply, then re-run the differ.

**Lane 1 — mechanical sweep over the remaining 153 spells** (engineer lanes off this
policy brief + the marginalia as calibration exemplars):

- **R1 — explaining parentheticals.** Delete worked examples ("(so at rank 4 it targets a
  5th-rank slot or lower…)"), enumerations ("(a door, a pit, … etc.)"), edge-case
  qualifiers ("(minimum 1st rank)", "(no daily saves to recover)"). Load-bearing content
  is *promoted to prose*, never kept parenthesized ("lift out of parentheses" ×2 in the
  marginalia). Dry-run: 38 marker-matched explainers; **259 parentheticals ≥15 chars
  across 129 spells** = the full read-every-paren surface (keep/promote/delete per site).
- **R2 — defensive interaction sentences.** Delete sentences that pre-litigate rules
  interactions the general rules already govern: "This spell has no effect on creatures
  that lack spell slots…", "The orb cannot absorb cantrips, rituals…", "The emanation
  moves with you." (aura makes it implicit), "…for the purpose of sustaining X itself",
  "does not stack with other morph effects", class-feat interaction paragraphs.
  Dry-run grep floor: **25 sentences / 22 spells**; the marginalia rate (12 confirmed in
  21 spells) suggests ~90–100 store-wide — engineer-read territory, grep is only a lead.
- **R3 — Heightened fixed tiers → the official (+N) idiom.** Where fixed tiers are pure
  numeric progressions (damage +1d6 per tier, targets +2 per tier, DC +2 per tier),
  collapse to `Heightened (+1)/(+2)` per the official pattern (find an official exemplar
  per collapse — stakeholder instruction). Tiers granting *genuinely different effects*
  stay fixed (official idiom too). Corollary: any value the (+N) line scales must be
  stated in the body (Attraction's missing base 2d6). Dry-run: **92 spells carry 163
  fixed-tier entries; 48 spells have ≥2 tiers** (the BE family runs 3rd/5th/7th/9th
  ladders that are pure scaling); 68 spells already use (+N).
- **R4 — 5e vocabulary residue.** concentration/concentrating (**19 hits** — each is
  either a dead 5e-ism to delete per Arcane Interdiction's "not a thing in pathfinder",
  or a Sustain reference to re-word); wild shape/wildshaping (**26 hits** → polymorph or
  delete per the Bestial Rage strikes); opportunity attack (**1** → reactive strike);
  "emanation centered on you" (**1** → aura); ad-hoc penalty stacks → named conditions
  (Awkward's −1 atk/Cha-skills/Cha-saves → Clumsy 1 + −1 status Cha-skills; −2 tier →
  Clumsy 2). The condition-mapping arm is judgment-flavored: engineers flag, don't
  freelance beyond the calibrated Clumsy exemplar.

**Lane 2 — stop-worthy items (stakeholder decisions, NOT sweepable):**

- **D13-a — translation-not-rewrite doctrine.** The Almonk's Retribution marginalia
  ("rewrites like this suck. Use the original prose but updated to use pathfinder
  terminology") reads as set-wide doctrine: where the store invented flavor prose or
  restructured prose into lists, restore the 5e original's prose translated to PF2e
  terms (Artist's Rendition's list → prose is the second exemplar). Set-wide this means
  a per-spell store-vs-vendor flavor diff over all 174 — a separate judgment lane, and
  it interacts with the §8 voice sweep's deliberate edits. Ratify scope before running.
- **D13-b — BE:Fangs + BE:Horns re-conversion.** Confirmed against the vendor 5e
  originals: both are ONE-SHOT melee spell attacks (Fangs 3d6 piercing + prone rider;
  Horns 3d12 bludgeoning + a charge-rider menu), but the store carries claws-template
  persistent Strike-granting buffs. Re-convert from source; not an edit.
- **D13-c — "creature" → "enemy" targeting scope.** Marginalia on Arcane Interdiction;
  needs a policy: hostile-only auras/zones say "enemy", neutral zones stay "creature".
  Per-site judgment; engineers flag candidates only.

### Verification plan (the §11/§12 gates)

Description-field-only set-diff over every touched file (zero non-description changes);
issue-class rescan (R1–R4 patterns → zero, minus recorded keeps); score set-diff vs HEAD
= zero verdict/routing drift expected (comparables-lens neighbor reshuffles are the
documented artifact class); `homebrew-revisions` regen (count moves both ways —
vendor-matching edits VANISH); every (+N) collapse retains its base value in the body.

### Open decisions to batch (stakeholder)

1. Ratify Lane 1 R1–R4 as set-wide policy (engineers apply without stopping)?
2. D13-a translation-not-rewrite: full-store flavor-restoration lane now, or defer to
   the continuing scriptorium pass (spells get it as he reaches them)?
3. D13-b Fangs/Horns re-conversion: staff re-map from the 5e originals, or does he want
   to redesign at the table?
4. Scriptorium cadence after the sweep: his pass resumes on the post-sweep text (store
   re-seeds scriptorium's data.json) — confirm he's fine reviewing a moving target, or
   should the sweep wait until his pass completes?
