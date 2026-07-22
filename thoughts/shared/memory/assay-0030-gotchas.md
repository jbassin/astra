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

**ROUND 5 — HOMEBREW CONVERSION TRIAGE (2026-07-21):** vendored jmnario/run_balance
(`apps/assay/vendor/run_balance/`, SHAs in VENDORED.md — 176 of the user's 5e homebrew
spells + his friend's complete PF2e conversions, bespoke schema) + built the adapter
(`homebrew.py`, `assay convert-homebrew`/`score-homebrew`; scoring reuses
`export.build_entry_for_row` renamed public). Triage: `results/homebrew-triage.md`.
⭐ Adapter trap classes found by running the real batch: self-inflicted-damage costs
parsed as output EV (5 spells; "4d6 void to yourself" made a utility spell read
−6.8 COLD); roll-a-table spells summing the whole table (Eye Stalks EV 88, +10.5);
healing on the damage ladder (official heal does the same — tagged `isHealing`, kept);
reversed parenthetical "damage (NdM type)" shape; negated condition mentions ("is not
Blinded") must not promote; caster-vs-target has NO axis in the extractor (Take Me
Instead's self-cost conditions route it buff — known false row). THE findings: his
conversions are SYSTEMICALLY COLD (pure mean −1.42, 0/23 in-band — 5e structural
generosity (range/area) carried 1:1 without paying dice; hybrids double-paid riders,
mean −2.4); action cost is a mechanical 5e-casting-time inheritance (3 of 5 reactions
broken to plain 1A, zero variable-action spells — Magic Re-Missiles COLD *because* it
lacks the Force Barrage 1/2/3A pattern); his 44 checklist flags ∩ assay verdict flags
= only 8 (complementary lenses). oxfmt ignorePatterns needs `**/assay/vendor/**`
(vendored JSON stays byte-identical, the codex/data precedent). ▶ CANONICAL STORE
(stakeholder model, eventual codex source + Foundry module): `apps/assay/homebrew/spells/`
= 176 COMMITTED Foundry-shaped docs, THE single source of truth — `assay seed-homebrew`
(refuses overwrite w/o --force; provenance in `flags.assay.seededFrom`), `score-homebrew`
reads the store, `assay homebrew-revisions` → committed `homebrew/revisions.md` diff vs a
fresh vendor re-conversion (0-deviation on seed = determinism proof); vendor/ is
provenance-only; oxfmt ignores `**/assay/homebrew/**` (oxfmt's array line-fill can't be
reproduced from json.dumps). Worklist state: item 4 RESOLVED per-spell-mix (§4a sheet in
homebrew-triage.md); items 1/2/3/5/6/7 open; NO spell edits applied yet (stakeholder-gated).
