# Item 7 — the manual-review pool (dossiers)

Pre-collated review dossiers for the final homebrew worklist item: every spell neither pricing
lens covers (ledger), every low-information wide-range row (comparables/buff span ≥6), and the
§4a lens-artifact reclassifications deferred here. One dossier per spell, fixed template:
5e original · conversion-as-stored · plain-English what-changed · converter's balanceBullets ·
similar official spells (verified against the pf2e-8.3.0 snapshot) · prior astra touches ·
factual open flags. **Dossiers are facts-only**; options + the staff lean are added in the
enrichment pass / live at review. `queue.json` is the machine-readable pool (108 entries).

**Pool derivation (2026-07-22, from the live `score-homebrew` output — NOT the triage doc's
stale counts):** 73 ledger + 25 open wide-range (34 total span-≥6 rows minus 9 already decided
in items 1–6) + 10 §4a reclassified-out (weapon/morph + sustained/charge lens artifacts +
the Artist's Rendition misroute) = **108**.

## Set-wide findings from collation (batch-0 review items)

Fourteen collation agents reported 98 issues; they decompose into these classes. Items marked
**[policy — explained]** are the documented adapter policies the agents didn't know about and
need no action.

1. **[policy — explained] School-trait swap.** Store replaces official school traits
   (abjuration/transmutation/…) with the 8 homebrew school traits (antillurgy, memetics,
   chronomancy, planara, gestalt, mercuromancy, …) — this is the standing trait-hygiene
   policy (triage §9), applied in the adapter. The agents' "loses abjuration" flags are
   expected behavior. One residual question: **"planara" spelling** is the 5e source's
   verbatim school name — confirm it's intended.
2. **[policy — mostly explained] Material-component drops.** The cost-only-on-long-casts
   policy explains most "inconsistent scrub" flags (Arcane Tattoo/Farsight/Temporal Discharge
   keep costs = long casts; 2A spells drop them). **Real review item: the policy collided
   with load-bearing costs** — Sphere of Ruin's 500 gp "spam tax" was jmnario's own stated
   balance lever and is now gone; Connection's prose still opens on the conch with no cost
   field. Decide per-spell whether the lever returns (as cost or as rank).
3. **Structural heightening gaps (adapter-level, real).** ~10 spells carry heighten PROSE
   with no `system.heightening` key at all (ashen-pack is the headliner — its "+1: 1d6 fire"
   is a pure interval bump the adapter structures elsewhere; also lucky-stars,
   lyrr's-chronomantic-shell, excavation, pendulum, taboo, compressive-weapon,
   retributive-force, rewind-and-playback, incensed-bestial-rage). Fixed-rank heighten levels
   are empty `{}` scaffolds set-wide (documented adapter warning). Kosmoturgist's Weapon's
   interval bump structures only damage index 0 of 3 modes. Candidate: one adapter fix pass.
4. **Structured-field/prose disagreements (adapter-level, real).** Null/empty structured
   fields despite explicit prose mechanics: Anomalous Object (attended attack-roll defense →
   null), Hellforging (DC 25 Will + 3d10/2d10 → null/empty — the fixed DC 25 is also a
   5e-ism), Raise Island (DC 25 Reflex → null), Propagating Blast (2d8 force → empty),
   Jolt (duration empty), Revisit (target+duration empty), Do My Bidding (range duplicates
   emanation), Eye Stalks (Will/Fort split unrepresentable), Take Me Instead (deliberate —
   self-cost excluded from EV).
5. **Markup bugs (mechanical sweep candidate).** Literal `**bold**` markdown inside HTML
   descriptions: Wall of Time, Temporal Discharge, Temporal Threshold, Left Hand of Judgment.
6. **Adapter prose drop (verify!).** Earworm's store description is missing two sentences
   present in jmnario's conversion (Seek-detection clause, free-action link toggle) with zero
   revisions.md deviation — i.e. the adapter itself dropped them. If confirmed, check whether
   the drop class affects other spells.
7. **Vendor-notes errata (context only, no store action).** The converter's notes misstate
   several official facts: Sending has no subtle trait and is 3A (not 1-min); Geas is a
   rank-3 ritual (not rank 7); "True Strike"/"Dimension Door" anchors are pre-Remaster names
   (Sure Strike / Translocate); Gambler's Trick's 5e range claim wrong; Body Enhancement:
   Horns' cited original level (1) contradicts the 5e source (2); Bodydouble's notes
   self-contradict on the teleportation trait; Summon Servant's stated formula is imprecise
   (the actual stored values match PF2e's real summon-level curve — the spell is fine).
8. **Standing-convention conversions due.** Overhaul carries legacy curse-removal text
   ("a spell that removes curses of rank 6 or higher") → convert to counteract-vs-spell-rank
   per the item-6 convention. Worldweaver claims counteract-immunity below rank 9 (a rules
   exception with no structured representation). Mystic Negation uses spell DC as a
   counteract modifier (nonstandard, converter-acknowledged). Patishvat's Perfect Pocket is
   "until dispelled" at rank 1 (converter-flagged).
9. **Misc.** Homebrew Flicker (r3) name-collides with official Flicker (r4, unrelated
   mechanic). Right/Left Hand of Judgment are a cross-referencing pair — review together.
   Some 5e originals live in `base_spells_5e/tfc.json`, not gen_homebrew.json (Connection);
   agents resolved via jmnario's sourceFile fields.

## Review lanes (preliminary, refined in enrichment)

- **Judgment lane** (real content deltas vs 5e, PF2e-legality items, or COLD verdicts
  needing the artifact-vs-real read): fumble, flashback, forensic-analysis,
  djura-s-divine-razor, djura-s-righteous-pressure, let-s-start-a-fight, tunnel-vision,
  mark-of-protection, farsight, reduce-resistivity, reflective-defense, overhaul,
  worldweaver, mystic-negation, hellforging, patishvat-s-perfect-pocket, sphere-of-ruin,
  earworm, monstrous-copy-eye-stalks, monstrous-copy-claws, solar-fury,
  kosmoturgist-s-weapon, planar-shield, festering-slick, grosteque-selfshape,
  body-enhancement-horns, artist-s-rendition, take-me-instead, extra-motivation,
  lesser-wish, anomalous-object, connection, ebb-and-flow, lockstep-fate, fault-line.
- **Fast lane** (everything else — no content deltas found beyond the set-wide classes
  above; expect keep-as-is + structural fixes).

## Review decisions (running log, started 2026-07-23)

**Set-wide rule (stakeholder):** casts **over 1 hour convert to rituals** (the hard
>1-hour boundary — official data has no spell above 1 hour; the exactly-1-hour trio
bound-minds/celestial-preservation/excavation stays spell-side on the Create Food /
Magic Mailbox / Remake precedent).

| Spell | Decision | Commit |
|---|---|---|
| hellforging | **Ritual conversion (A)** — rank-7 ritual, Creature Creation table levels (10–11 @r7 … 16–17 @r10), Arcana/Occultism (master) + 1 Crafting secondary, binding clause @r9+, 50k gp premium kept | `08c72e5` |
| overhaul | **Ritual conversion (A-variant)** — rank-5 ritual, Arcana/Occultism (expert) + 1 Medicine secondary; gauntlet re-organed Reflex→Will→Fort; H7 deleted; crit success = choose ancestry | `549a34e` |
| worldweaver | **Ritual encoding (A + mythic trait)** — Wish-pattern rank-10 ritual, 15 secondaries, Wish-register ladder; content clauses kept verbatim | `6ce6089` |
| artist-s-rendition | **Keep (C)** — misroute artifact recorded; lead-sheet doorway clause restored; energy damage stays static | `dcc8cb8` |
| body-enhancement-horns | **Keep as-is (A)** — §4a weapon/morph artifact recorded; redesign rank-fair next to Claws of the Otter r2; vendor-notes "level 1" claim = errata only (source is level 2) | (log-only) |

## Status

- 2026-07-22: collation complete — 108/108 dossiers written by 14 agents (0 missing 5e
  originals; every named official comparable snapshot-verified). Enrichment (options +
  staff lean per spell) pending; batch-0 set-wide decisions above gate parts of it.
- 2026-07-22: **batch-0 DECIDED (stakeholder)** — verified facts first (planara = the 5e
  source's own school name, non-issue; markup bug = 20 spells not 4; curse-removal legacy
  text = exactly 5 spells; the prose-drop class = adapter composes from structured
  successTiers/heightened, freeform-only sentences drop). Decisions: (1) FULL structural
  encoding sweep, adapter+store lockstep (heightening ×10 + defense/damage/duration gaps +
  `**`→`<strong>` ×20), gated on before/after score-homebrew with every routing change
  reported; (2) Sphere of Ruin's stripped 500 gp spam tax stays stripped — **judge at its
  spell review** (rank vs restored cost vs other lever); (3) curse-removal convention
  swept onto all 5 legacy spells now (divine-regression, fast-forward, overhaul,
  poisoned-backflow, taboo); (4) adapter-dropped freeform mechanics RESTORED now on
  earworm/inquisition/forensic-analysis/laixa-s-expert-intuition/excavation/nightfall/
  awkward, each still judgeable at review. Build delegated to an engineer; store edits
  land as revisions.md deviations for (3)/(4), zero new deviations for (1).
- 2026-07-23: batch-0 BUILT + pushed (`b737e18` encoding sweep — one routing change,
  Propagating Blast ledger→quantitative −1.06 COLD, revisions deviation-set unchanged;
  `7839a81` curse sweep; `f91b2d6` prose restoration — excavation + awkward were verified
  no-ops, content already present re-voiced). Enrichment IN PROGRESS — "## Options &
  staff lean" appended so far: the 10 reclassified-out spells + fumble (`e230ab3`).
  Remaining judgment lane: flashback, forensic-analysis, let-s-start-a-fight,
  tunnel-vision, mark-of-protection, farsight, reduce-resistivity, reflective-defense,
  overhaul, worldweaver, mystic-negation, hellforging, patishvat-s-perfect-pocket,
  sphere-of-ruin, earworm, monstrous-copy-eye-stalks, take-me-instead, extra-motivation,
  lesser-wish, anomalous-object, connection, ebb-and-flow, lockstep-fate, fault-line.
  Fast-lane spells get their lean live at review (no pre-written section).
- 2026-07-23: **ENRICHMENT COMPLETE — all 35 judgment-lane dossiers now carry an
  "## Options & staff lean" section** (the 73 fast-lane spells deliberately get their
  lean live at review). Recurring findings from the pass: several dossier flags were
  FALSE POSITIVES against documented policy/idiom (school-trait strips, the 1A→2A
  systemic cast mapping, effect-on-success non-basic tiers per the Slow precedent,
  PF2e sustain vs 5e concentration-break semantics, attack-trait/defense-null official
  conventions); the two deferred batch-0 cost decisions resolved in-dossier (Sphere of
  Ruin: leave tax stripped, restore the caster-adjacent pursuit start instead;
  Connection: cost stays stripped on the Telepathic Bond precedent); ⭐ a SET-WIDE
  question surfaced for the review: hours-long casts as spells vs RITUALS (Overhaul,
  Hellforging — Hellforging is the poster child: the official Creature Creation Rituals
  table pins its level-14 output at ritual rank 9, not spell rank 7); genuine text bugs
  queued: Take Me Instead's "Charisma-based (Diplomacy or Society)" contradiction,
  Lockstep Fate's hold/discharge lifecycle contradiction, Reflective Defense's embedded
  editor-voice sentence (voice-sweep escapee). ▶ NEXT: run the review — batch-0's four
  decisions are DONE; each remaining spell is one pre-built card (dossier + lean),
  fast-lane cards built live.
