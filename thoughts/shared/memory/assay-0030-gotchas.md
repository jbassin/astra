---
name: assay-0030-gotchas
description: assay (0030) spell power scoring — 3 rounds built 2026-07-19; converged to damage-quantitative + effect-comparables; the load-bearing gotchas
metadata:
  type: project
---

**PROJECT 2026-07-19 — assay (0030) COMPLETE through round 3, one session:** `apps/assay`
(uv member) scores PF2e homebrew spells against the codex Foundry snapshot
(`apps/codex/data/snapshots/foundry/pf2e-*/packs/pf2e/spells/spells/`, read-only). Scope
doc `thoughts/shared/research/2026-07-19-assay-spell-power-0030-thoughts.md` (§6/§7 =
outcomes); specs `0030-assay-round{2,3}-spec.md` w/ §5 build records. Commits: r1
`e6df546`/`4285ce8` · r2 `6d77fa7`/`4098bff` · r3 `3783473`/`5ea0e5e`. 176 tests.

**THE CONVERGED SHAPE: damage/hybrid = quantitative** (pure-anchored ladder
`log EV = 1.798 + 1.089·log rank`, ±6% of the community 7×rank line, recovers GM Core's
creature-table bridge level=2r−1; `assay score` → rank-equivalents) **· hostile effect
spells = comparables + prior card** (top-5 neighbors + rank RANGE, never a point score;
price card = labeled PRIORS) **· everything else = typed ledger**. ⭐ **The generative
effect-value fit is TOMBSTONED** (round-3 spec §3): adversarial review RAN the model
pre-build — best ~24% within ±½ rank vs the 60% gate at every γ; extractable atom usage
SATURATES from r4 while budget grows — effect-spell power lives in unmodeled QUALITY
(DCs, riders, scaling text), not atom identity. Don't re-derive this the hard way.

**⭐ THE finds:**
- **Marginal ≠ standalone pricing** (round 2's honest fail): rider discounts learned from
  hybrid damage spells cannot fund a control spell's whole slot (fear −0.82 / slow −2.29
  / synesthesia −4.05 ranks cold with extraction fixture-verified correct). But the
  hybrids DID empirically reproduce GM Core's "condition rider ≈ −1 spell rank" exchange
  rate (rider family ×0.5–0.75 of same-rank pure budget — the round-1 probe).
- **The proxy-pin class struck ×3 in ONE project** (after P6/P10-14 warned): condition
  counts were description-OCCURRENCES→per-spell→actual-trainer-rows (77→39→14 for
  frightened); the round-3 "≈270–285 post-routing" pin was a subtraction guess vs real
  151. Only "run the real mechanism" survives contact.
- **Adversarial-review-runs-the-fit is the pattern that paid twice**: r2's review found an
  empty trainer head + unit-incoherent Stage A→B algebra pre-build; r3's review killed
  the whole design with an empirical fit. Cheap relative to a wasted engineer run.
- **Foundry pack extraction traps** (census-verified, all handled in `extract.py`):
  damage dicts keyed by random IDs (iterate .values()); `kinds` damage-vs-healing in ONE
  entry; `system.overlays` on 40 spells = per-variant partial overrides (deep-merge onto
  base; heal 1a inherits base 1d8; 6 flavor-only empty variants); degenerate heightening
  (`type:null`, `fixed`+empty levels); conditions are PROSE-ONLY via
  `@UUID[…conditionitems.Item.X]{X N}` refs; degree attribution needs FOUR rules
  (preamble payload — synesthesia; "As failure" inheritance; case-INSENSITIVE plain-text
  repeats — sleep's whole effect was invisible to a case-sensitive matcher, 84 spells;
  else ledger); en-dash `–1 status penalty` defeats ASCII `[+-]` (28 spells); prose-only
  saves have `defense.save` null (routing must read prose); empty range string parses as
  touch-self (Belittling Boast hostile-emanation trap).
- **Unit-coherence bug class ×2**: round 2's β_T4 derivation handled coverage weights
  right, the round-3 restatement dropped them (V_T4 = Budget/w_repr, NOT Budget);
  log-shortfall β vs linear budget-fraction p are different units — pin link functions
  explicitly in specs.

**Process:** engineer session-limit-killed mid-build → SendMessage resume worked (standing
pattern); opus reviewer died to 3× API 500s → relaunch fresh on the default model, point
it at the dead instance's scratch dir (it was empty — verify, don't assume). Shared-tree
discipline while codex P14 ran concurrently: pathspec-only commits (`git commit -- paths`;
untracked files need add first), the pre-commit hook format-checks the WHOLE tree (another
session's WIP TS files block your docs commit → verify own files clean, `--no-verify`).

**▶ Round-4 candidates (unstarted):** buff-side comparables (needs target-prose maturity),
summon/wall sub-models, forced-movement atoms (command is ledgered), a codex surface.

**ROUND 4 (2026-07-20) BUILT + DEPLOYED + LIVE** — buff+summon coverage + THE CODEX
SURFACE (spec `0030-assay-round4-spec.md` D30-35..41; Track A `b053df5` py · Track B
`1b16072` ts, PARALLEL disjoint-ownership tracks in one tree · integration `fa05880` ·
records `4946acc`): spell-effects join (222/263/0 by item NAME — "Spell Effect: X", a
colon kills naive regexes; evaluate `@item.level` exprs at the SPELL's base rank, NEVER
the effect item's own level field — 29/263 disagree; predicates gate atoms — mystic armor
has NO saves atom at rank 1; heightened-stripped text UNDERCOUNTS refs, scan raw), buff
comparables (pop 185 constructive: beneficial ∪ beneficial raw-modifier ∪ promoted
ref-bearing skips; sure strike/blur mutual #1), summon bands (n=14, 13/14 exact vs the
GM Screen journal curve), export 1,144 entries (349 quant/148 comp/123 buff/524 ledger,
13 typed reasonCodes each w/ curated codex copy — the P13 formatFacetValue lesson),
codex `assayFs` loader (NO corpusFs-style fixture fallback — absent→absent) + optional-
field AssayBlock (goldens byte-identical untouched; one seam serves page + `?entry=`
pane). Deploy: image rebuild + codex-scoped compose, 12 s window, W-F Playwright live
(fireball in-band 21/23.3 · heroism comparables · scrying curated copy · legacy-doc
negative) + SigNoz 0 ERROR. ⭐ finds: a 33h STALE `node server.ts` dev process held a
dead in-memory build on :10399 (rebuilds deleted its chunks → convincing 500 shells —
check `ss -tlnp` before blaming fresh code); the 7 baseline ssrSmoke fails are
FIXTURE-ENV-ONLY (vanish against real data); cross-track enum seams (reasonCode) need
an integration reconcile step — schema contracts pin SHAPE, not vocabularies;
`codex-refresh` now regenerates+places the artifact. Register for gate H: the Assay
block + wide buff rank-ranges (honest by design).

**⏸ SURFACE ON HOLD (2026-07-20, `8db3a0a`):** stakeholder revisited the representation —
the codex Assay block is HIDDEN not removed (one-line unwire: `corpusFns.ts` passes
`emptyAssayReader`; all machinery + artifact + bind intact; redeployed + live-verified
absent, SigNoz 0 ERROR). Revisit = swap back to `getAssayReader()` + redeploy, but
re-scope the REPRESENTATION with the stakeholder first. The assay CLI tool itself stays
fully live for design-table use.

**ROUND 5 — THE HOMEBREW CONVERSION PROJECT (2026-07-21→22, `7ede558`…`8cc766e`):** vendored
jmnario/run_balance (`apps/assay/vendor/`, byte-identical, SHAs in VENDORED.md — 176 of the
user's 5e spells + the friend's complete PF2e conversions) → adapter → **CANONICAL STORE**
`apps/assay/homebrew/spells/` (176 COMMITTED Foundry-shaped docs = THE source of truth;
eventual codex source + Foundry module). Commands: `seed-homebrew` (--force-guarded) ·
`score-homebrew` (store-only) · `homebrew-revisions` → committed `homebrew/revisions.md`
(every stakeholder edit; pairing follows `flags.assay.seededFrom` so
renames don't orphan — Magic Re-Missiles → Force Drumfire proved it). Paper trail:
`apps/assay/results/homebrew-triage.md` (worklist; items 1/2/3/4/5 + voice sweep +
trait-hygiene sweep DONE, **6/7 OPEN**).

**ITEM 1 DONE (2026-07-22, `dabbb24`…`3a2d6a7`, 13 commits):** 12 spells (7 HOT + 5
over-ranked) one-at-a-time — resolutions in triage §2/§3. ⭐ **Process: the stakeholder
REJECTED AskUserQuestion batches for spell review** — the format he wants: full
description + what-the-conversion-changed (diff vs the 5e original in
`vendor/…/base_spells_5e/gen_homebrew.json`) + why-out-of-band + options w/ recommended
lean, ONE spell per message, decide in chat. ⭐ New LENS-ARTIFACT classes confirmed:
conditional-rider damage partitions counted at FULL weight (Cone of Decay's
undead-crit-fail 4d10 = the whole +1.45; base alone −1.18); probabilistic-trigger
payloads priced as guaranteed (Tag detonation starts 10%); recurring zones priced per
CAST — per-tick dice should sit BELOW the one-shot line (Hypercompression 10d10→8d10,
−0.88/tick intended, Flaming Sphere idiom). ⭐ PF2e-native mappings that unlock 5e-ism
redesigns: 5e legendary actions/resistance → Remaster MYTHIC (mythic trait + Mythic
Points — Legend Killer r5 redesign keyed off it); Tarrasque → **Armageddon Engine**.
⚠ The triage §2 table's RANK column had misprints — trust the store JSON, never the doc
table. Measuring variants = temp-edit store files → `score-homebrew` → `git checkout --
homebrew/spells/` (never commit probes).

**TRAIT-HYGIENE SWEEP (same day, `a84d07d`):** vendor traits arrays hide FOUR misfiling
classes the school-policy (which only guarded `originalSchool`) missed: rarity keywords
in traits.value w/ rarity FIELD still common (10 rare/4 uncommon — friend's intent
silently presenting common); tradition names as traits (primal ×22/occult ×9/divine ×5
→ folded into traits.traditions); standard 5e school traits riding the arrays
(abjuration ×14 etc.); damage-type traits. Fix = `_hygiene_traits()` in the ADAPTER +
surgical store sweep in LOCKSTEP (93 docs, 0 score drift, 0 new revisions deviations —
one old hand-edit got SUBSUMED into policy, the architecture rule working). Verify
candidate traits against the OFFICIAL vocab built from the codex Foundry snapshot
(68 spell traits; `illusion`/`extradimensional`/`move` ARE official — don't strip on
vibes). Stakeholder: a later curated sweep may re-add custom traits; baseline stays
strict official+8-schools.

**⭐ THE architecture rule: set-wide POLICY lives in the ADAPTER (baseline), per-spell
JUDGMENT lives in the STORE** — school traits (8 homebrew schools from originalSchool),
cost-only-on-long-casts (ritual-keep), trait-gloss stripping all baseline-side, so
revisions.md stays hand-edit-only. oxfmt ignores `**/assay/homebrew/**` (json.dumps can't
reproduce its array line-fill) + `**/assay/vendor/**`.

**⭐ Adapter/lens artifact classes (run the real batch to find them):** self-inflicted-damage
costs parsed as output EV (5 spells, −6.8 "COLD" utility spell); roll-a-table spells summing
the whole table (Eye Stalks EV 88); healing on the damage ladder (official heal does the
same — `isHealing` tag); sustained-engine + weapon-morph + per-round-aura spells mis-lensed
by per-cast budgets (Force Drumfire, Kosmoturgist's Weapon, Solar Fury — NEVER "fix" their
dice); caster-vs-target has NO extractor axis (Take Me Instead routes buff falsely);
negated conditions ("is not Blinded") must not promote; reversed parenthetical
"damage (NdM type)" shape.

**⭐ Model quirks that flip design intuition (measure, don't assume):** the declared action
constants make 3A spells EXPECT LESS EV (a 3A conversion reads HOTTER, not cooler — "+1
action as nerf" is real at the table but assay can't credit it) and reactions expect MORE
(×1.6 — Deja Vu went −0.51→−0.68 on repair); area size within a shape is INVISIBLE to the
fit (burst 30→20 = no change) while the RANGE bucket is a blunt >1-rank lever (500→120
overshoots mild COLDs to HOT); the ladder trains on BASE-rank rows only, so heightened
official benchmarks (Lightning Bolt r6 = 7d12 line) read HOT — Beam settled at 6d12 (model)
after the stakeholder call, not 7d12 (benchmark).

**⭐ THE batch findings:** his conversions are SYSTEMICALLY COLD (pure mean −1.42, 0/23
in-band — 5e structural generosity carried 1:1 without paying dice; hybrids double-paid
riders −2.4); action cost was a mechanical 5e-casting-time inheritance (3/5 reactions
structurally broken to 1A — prose triggers survived, encoding didn't); zero variable-action
spells; his 44 checklist flags ∩ assay flags = only 8 (complementary lenses). **The
voice-leak class:** conversion notes INSIDE spell text ("no clean analog in standard PF2e —
designed from the rank-9 budget", "see notes") on 7 spells + series cross-marketing +
explainer asides — 13 fixed, catch-all regex now CLEAN (`no clean analog|see notes|noted
as|budget|anchored to|…`). Bonus 5e-isms: "death-saving throws"→recovery checks;
percentile collapse→flat check; "verbal component"→"requires speech"; flat-footed alias.

**Process pattern that worked:** interactive per-spell stakeholder loop — present full text
+ his notes + comparables evidence, batch decisions via AskUserQuestion, measure every A/B
through the REAL `assay score` before proposing, apply + commit + regenerate revisions per
decision. Stakeholder calls logged in triage doc + commit messages. Set-wide policies:
Remaster = no materials (except long-cast ritual Costs), no school traits except the 8
HOMEBREW schools (standard-school spells like Connection get stakeholder-assigned homes —
memetics), trait line is source of truth (no prose glosses).

**ITEM 6 DONE (2026-07-22, `16f8814`…`d036a35`, 12 commits):** the 11 deep-COLD hybrids
(≤ −3.0) + the Carnage borderline (−2.98), one-at-a-time. **ALL 12 verdicts decomposed to
artifact classes — zero true miscostings**; the value was the defects assay wasn't pointing
at. Resolutions in triage §10. ⭐ New artifact classes confirmed: **prevented-condition
promotion** (Forceful Onslaught's "does not fall Unconscious" priced as a Sleep-family
payload — negation guard misses UUID-ref'd preventions); **chip-damage-on-effect-spell**
(the fix is DROP the dice, Never Mind idiom — official curse spells don't chip; dropping
also flips routing to honest comparables); **reaction constant deepens with rank bumps**
(Solar Rebuke r5→6 read −3.47→−4.47 — expectations scale with rank, state the true 2A
residual when recording); **stage-block conditions don't promote** (legalizing an
affliction flips routing hybrid→quantitative at the SAME number — expected, not drift).
⭐ The Hypercompression per-tick line is REUSABLE MATH: tick EV should sit ≈ −0.9 ranks
below the one-shot ladder (8d6 at r5 lands exactly; solve r = (EV/6.04)^(1/1.089)).
⭐ **STANDING CONVENTION (stakeholder): curse removal text = successful counteract check
against the spell's rank** — applied ToM + Cerebral; arcane-censure/divine-regression/
fast-forward/poisoned-backflow/taboo still carry legacy text, convert as reviewed. Also:
"remove curse"/"restoration" don't exist in Remaster (→ Cleanse Affliction / Sound Body,
both verified in the codex snapshot). ⭐ Conversion-bug classes to check EVERY spell for:
dropped 5e clauses (Eldritch's escape + spell-end = accidental permanent banish; Cerebral's
lost "frightened of you" d6 row + duplicated phobia); harsher-than-5e tightenings ("three
CONSECUTIVE saves"); dead Remaster type maps (radiant→vitality = zero damage vs living);
malformed afflictions (undefined stages, flat-check recovery language, no max duration —
fix = legal stage blocks, the Stinger/Tentacle/Grey Frost pattern; affliction framing can
RESTORE lost 5e escalation, Grey Frost); markdown `**` inside HTML description fields.
Rename mechanics proven again: git mv + name field, seededFrom untouched (Eldritch).
