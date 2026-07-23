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
