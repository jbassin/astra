# 0030 assay round 4 — buff + summon coverage, and the codex surface — NLSpec

**Status:** FINAL (2026-07-20) — adversarially reviewed; **5 blockers + 9 minors/nits ALL
folded below.** Foundations VERIFIED by the review: the spell-effects join premise is exact
(222 ref-bearing main-list spells, 263/263 refs resolve by item name, 0 unresolved); the
summon journal curve is byte-for-byte the declared table (gm-screen.json, entry
`S55aqwWIzpQRFhcq`, page `8gcp880pEWZ9VPnF` "Summon Trait"); slug mapping is TOTAL (all
1,144 pack basenames → plain codex slugs, zero collisions). Headline blocker catches:
(1) the draft's buff population excluded nearly all real buffs INCLUDING HEROISM (only
19/81 round-3-beneficial rows carry join atoms; the mass = 89 effect-ref-bearing
SkipRecords never extracted + the 65 raw-modifier-only rows — heroism routes there);
(2) the W-B roster named two spells that don't exist in the pack (stoneskin/false life →
Mountain Resilience/False Vitality); (3) the export schema couldn't render the surface's
promises (no rank/ev/budget, hybrid representation undefined); (4) comparable targets had
no id data path (28 variant-label profiles; 34 multi-row slugs, collapse undefined);
(5) empty-profile comparables degrade to an alphabetical junk top-5 at similarity 0.0 that
the surface would print. Also folded: the evaluator family widened (only 32/79 exprs are
ternary; +8 closed-form arithmetic among joined effects; 11 runtime-only stay flagged);
`@item.level` semantics = **the SPELL's base rank, never the effect item's own level field**
(29/263 joined pairs disagree — stale/heightened-variant levels); 198/333 FlatModifiers
carry predicates (mystic armor's saves atom is level-gated OFF at base rank — predicate-
blind extraction lies); array selectors fan out (71/333); ONE valueless FlatModifier
(pin: 253 int + 79 str + 1 null = 333); multi-effect merge rule; summons n=14 with
phantasmal minion needing kind-precedence and the round-3 `_SUMMON_TRAIT_RE` being dead
code (`^summon\s` can never match the bare trait "summon"); "remaster docs only" must read
"non-@legacy corpus docs" (389 never-remastered pack spells are visible-by-default codex
pages and MUST get entries); raw ledger reasons are internal jargon → typed reason codes +
a curated codex copy map (the P13 formatFacetValue lesson); "image unchanged" was FALSE
(new server code ⇒ image rebuild), bind-source pre-create as uid 1000, artifact reload
folded into `codex-refresh`; the assay loader must NOT mirror corpusFs's fixture fallback;
the block rides an optional data field (goldens byte-identical untouched) and DOES appear
in the `?entry=` preview pane (accepted, recorded).

**Stakeholder scope (R4, resolved 2026-07-19): BOTH tracks in one round.** Prior context:
rounds 1–3 (`0030-assay-round{2,3}-spec.md`, scope doc §6/§7); the generative effect-value
fit stays tombstoned. **Empirical pins:** spell-effects pack 510 items; rule keys
FlatModifier 333 (253 int / 79 str-expr / 1 null) · ChoiceSet 131 · BattleForm 97 ·
DamageDice 97 · Resistance 89 · GrantItem 45 · TempHP 35; 20 spells ref >1 effect;
summon-trait main-list spells **14** (13/14 match en-dash-tolerant base-level prose; miss =
Phantasmal Minion, fixed-creature, currently a scored row); buff-population components:
round-3 beneficial 81 (19 atom-bearing) + raw-modifier-only 65 (heroism, protection here)
+ ref-bearing skips 89 (43 atom-bearing; 8 hostile-shaped: blood vendetta, bone flense,
fungal infestation…). Re-derive at build; unexplained delta = STOP with options.

## 1. Goal

(A) Buff spells become comparables citizens with machine-extracted atoms (no pricing —
the tombstone stands); summons get a quantitative band check. (B) codex spell pages
(non-@legacy docs with pack counterparts — the 1,144 main list) surface the assay verdict
fail-soft, labeled experimental. After R4 every pack main-list spell's codex page shows
something truthful; corpus-only docs (superseded legacy, focus-under-spell/) correctly
show nothing.

## 2. Decisions — Track A (assay; owns `apps/assay/**` + `uv.lock`)

- **D30-35 Join + rule extraction.** Name→item index over the pack ("Spell Effect: X",
  colon-tolerant bracket-bounded refs). Per effect: FlatModifier atoms — **fan out array
  selectors; evaluate `@item.level` expressions at the SPELL'S BASE RANK (never the
  effect item's level field); expression evaluator covers the ternary family AND the
  closed-form arithmetic family (`2*@item.level`, `ceil(...)`, `clamped(...)`,
  `match/when/btwn`) — runtime-only shapes (`@actor.*`, `@item.badge`, mustache flags,
  `rulesSelections`) flag the atom `expr-unresolved`; predicates: level-family predicates
  (`parent:level` gte/lte) evaluate at base rank (mystic armor has NO saves atom at rank
  1), all other predicates tag the atom `conditional` (present in profile as a tag, not a
  valued atom); the one valueless FlatModifier handled** — plus TempHP, typed Resistance/
  Weakness (mustache-typed resistance = a `choice-of-energy` representation, not a
  concrete type), BaseSpeed, structured duration. Non-atom rule keys → profile TAGS;
  BattleForm spells tagged `battle-form`, modifier profile suppressed (recorded
  sub-model gap). **Multi-effect merge:** base-variant effect only (heightened-duration
  variant items — "(8 hours)"/"(24 hours)"-class — excluded from base profiles);
  degree-split effect pairs keep the failure-row effect; choice-form fans (Animal Form
  ×13) → tags.
- **D30-36 Buff population (CONSTRUCTIVE — the draft's "round-3 beneficial" missed the
  mass).** Population = (round-3 beneficial rows) ∪ (raw-modifier-only rows passing the
  D30-22 beneficial test — heroism, protection) ∪ (**effect-ref-bearing SkipRecords
  PROMOTED to fully-extracted rows** and routed through D30-22 — the 89, of which 8
  hostile-shaped must land hostile; promotion changes the round-3 splits, so W-D
  reconciles against RE-DERIVED splits with every delta enumerated). Profiles: modifier
  atoms by selector class (AC/saves/attack/skills/speeds/perception), TempHP band,
  beneficial conditions, resistance (typed or choice-of-energy), tags, duration class,
  structural coordinates. Comparables: beneficial-vs-beneficial ONLY (population
  firewall). Prior-card buff section: pack-curve anchors (heroism +1/+2/+3 @ r3/6/9 —
  noting base-rank profiles carry +1 and the heightened tiers live in the CARD only,
  by design; the AC line; resistance-per-rank family), labeled priors.
- **D30-37 Summon band check.** Population = summon-TRAIT spells (fix the dead
  `_SUMMON_TRAIT_RE` — trait-list membership, not `^summon\s` name prefix), n=14 pinned.
  Base max-level from prose (en-dash U+2013 tolerant); the declared curve
  (r1→−1, r2→1, r3→2, r4→3, r5→5, r6→7, r7→9, r8→11, r9→13, r10→15) verified at build
  against the named journal page (STOP on disagreement). **Kind precedence:** a scored
  damage row wins `kind:"quantitative"`; summon band then rides as an additional field
  (Phantasmal Minion), not a competing kind. Nonstandard summons enumerated.
- **D30-38 Export artifact** (`assay export-codex` →
  `apps/codex/data/assay/spell-power.json`, deterministic: sorted keys, comparables in
  engine `(-similarity, name)` order, no timestamps, `schemaVersion: 1`). Entries keyed
  by codex id (`spell/<slug>`), **non-@legacy docs with pack counterparts** (never
  `remaster==true` filtering — 389 never-remastered spells are visible codex pages and
  get entries). **Schema (the cross-track CONTRACT — complete enough to render
  everything D30-40 promises):**
  `{ kind: "quantitative"|"comparables"|"buff-comparables"|"ledger", rank: number,
  population: "hostile"|"beneficial"|"summon"|null, verdict?: string,
  residualRanks?: number, ev?: number, budget?: number, rankRange?: [number, number],
  comparables?: [{id: "spell/<slug>", name, rank}], summonBand?: {baseLevel, curveLevel,
  delta}, reasonCode?: string (typed enum, NOT prose), variants?: [{label, kind, …same
  fields}] }`. **Hybrids: `kind:"quantitative"` MAY carry `comparables` — Track B renders
  both.** **Variant collapse (34 multi-row slugs):** one entry per slug; primary = the
  base/2-action variant (its fields at top level), others under `variants[]`.
  **Comparable targets: `ComparableProfile` gains `file`→slug (Track A regenerates the
  committed comparables corpus — schema change flagged); comparables DEDUPE by slug
  before top-5 truncation.** **Similarity floor: below 0.1 OR zero shared non-tier
  atoms → `kind:"ledger"`, `reasonCode:"no-comparable-profile"` — BOTH engines (the
  hostile engine has the same latent alphabetical-junk bug; fix it there too).**
  Export report enumerates unmatched ids (expect 0) + entry counts by kind reconciled
  against re-derived splits.

## 3. Decisions — Track B (codex; owns `apps/codex/**` + `deploy/docker-compose.yml`)

- **D30-39 Loader.** Request-time server-only read of `data/assay/spell-power.json`
  (the P13 `bookToProductLine` pattern: try/catch, module-scope warn-once, fail-soft
  null). **NO fixture fallback** (absent → absent — never mirror corpusFs's
  fixture-corpus fallback; ssrSmoke/CI stay presence-agnostic). Cache-on-success
  per-process (the corpusFs convention) — artifact regeneration therefore requires a
  container restart: **fold into `just codex-refresh`** (which already restarts for
  exactly this reason).
- **D30-40 The Assay block.** Renders wherever the spell `EntityPage` renders — full
  page AND the `?entry=` split-view preview pane (accepted, recorded) — via an OPTIONAL
  field on `EntityPageData`: absent ⇒ render nothing ⇒ goldens/fixtures byte-identical
  untouched. Content per kind: quantitative — "Power: in band / +N.N ranks hot/cold"
  + "EV X vs budget Y at rank R" (all fields from the entry); comparables/buff — linked
  similar spells + "(ranks N–M)"; a "(includes rank 9–10 neighbors — thin data)" note
  when any comparable rank ≥9 (the r10 warning, surfaced); summonBand — the band line;
  ledger — **curated `reasonCode`→copy map (never raw internal strings — the P13
  formatFacetValue lesson)**, unknown codes fall back to a generic honest sentence.
  Hybrids render score AND comparables. Variants render as sub-lines. Header "Assay
  (experimental)". Static SSR, no new hydration, popover contract untouched, no new
  route family.
- **D30-41 Deploy (integration-phase, orchestrator).** Compose: third identical-path
  `:ro` bind `apps/codex/data/assay` (D29-53 convention). **The codex IMAGE MUST BE
  REBUILT** (new server code — never an artifact-only deploy). Order: pre-create
  `apps/codex/data/assay` uid-1000 → `assay export-codex` places the artifact → local
  smoke → **explicit at-the-moment stakeholder flag** → `docker compose build` +
  codex-scoped `just up` → W-F. Gate-H register addition recorded.

## 4. Validation gates

- **W-A (join):** ref/resolution counts re-derived (222/263/0 expected); evaluator
  coverage (evaluated vs `expr-unresolved`, named leftovers); predicate/selector-array
  handling proven on mystic armor + heroism fixtures.
- **W-B (buff comparables):** LOO on the REMASTER-NAMED roster — heroism, mystic armor,
  invisibility, haste, resist energy, sure strike, mountain resilience, false vitality,
  blur, protection (all present post-D30-36) — qualitative neighbor-spots recorded;
  ±1 median-rank rate REPORTED, not gated (the round-3 V-A lesson).
- **W-C (summons):** journal agreement; 13/14 prose extraction + phantasmal minion via
  kind-precedence; curve table published.
- **W-D (export):** double-run byte-identity; unmatched ids = 0; entry counts by kind
  reconcile against RE-DERIVED population splits (deltas from round-3 enumerated —
  promotion changes them by design).
- **W-E (codex, PRE-INTEGRATION):** artifact-absent byte-identity proven BEFORE the real
  artifact lands in the tree (after placement the main tree is never artifact-absent
  again); fixture-artifact render test per kind incl. hybrid, variants, r10 note,
  unknown reasonCode fallback; ssrSmoke against a REBUILT dist (P12); both CI lanes.
- **W-F (live, post-flag):** fireball quantitative block · heroism buff-comparables
  block · an unscored page's curated reason — through the edge; SigNoz 0 ERROR (1h).
- Honest-fail discipline carried.

## 5. Slices (PARALLEL tracks, disjoint ownership; orchestrator integrates)

- **Track A (py): S-A** `feat(assay): S-A effect join + buff profiles + summon bands +
  export-codex` — D30-35..38 + fixtures/tests (heroism join + array-selector fanout,
  mystic-armor predicate gate, expr-unresolved case, multi-effect merge, promoted-skip
  routing incl. a hostile-shaped one, summon fixture, export determinism + variant
  collapse + similarity floor) + re-derived pins.
- **Track B (ts): S-B** `feat(codex): assay block — artifact loader + spell-page render
  (D30-39,40)` — loader (no fixture fallback) + optional-field block + fixture artifact
  covering every kind/edge + compose bind edit + codex-refresh fold + tests. Builds
  against the D30-38 schema fixture, NOT Track A's output.
- **Integration (orchestrator):** W-E byte-identity FIRST, then export + place + smoke +
  the D30-41 flagged deploy + W-F; build record §6.
- Git: pathspec-scoped per ownership; no stash; push after green slices; timer check
  before commit windows.

## 6. Build record

**S-A (Track A, this commit) — effect join + buff profiles + summon bands + export-codex.** All
four decisions (D30-35..38) built in `apps/assay/src/astra_assay/{effects,buffs,summons,export}.py`
+ wiring into `extract.py`/`ledger.py`/`comparables.py`/`cli.py`, real corpus, `uv run assay price`
+ `uv run assay export-codex` both run end-to-end against `pf2e-8.3.0`.

**D30-35 join** (`effects.py`) — a name→item index over the spell-effects pack (510 items, unique
names, confirmed) built once per `extract_all` run and threaded through `extract_single`. Ref
discovery scans the RAW (non-heightened-stripped) `description` field — an engineer finding:
scanning the heightened-stripped text under-counts (some spells only cite a ref inside their own
Heightened block), dropping the independently-reproduced join stats from the spec's own
222/263/0/20 pins to 184/222/0/17. Fixed by scanning the full description; re-verified against an
INDEPENDENT reproduction script (not reusing any extraction code path) — **222 ref-bearing
main-list spells / 263 refs / 0 unresolved / 20 multi-ref spells, EXACT match to the spec's
review-verified pins.** `@item.level`/`@spell.rank` evaluated at the spell's own base rank (never
the effect item's `system.level.value`): **29/263 disagree — exact match.** The evaluator (a
restricted-namespace `eval` — no `__builtins__`, a pre-substitution charset gate, dunder-access
rejected, unit-tested against `().__class__.__base__`-style probes) covers ternary
(`ternary(gte(...),a,b)`) and closed-form arithmetic (`match(when(...),...)`,
`floor`/`ceil`/`clamped`, `+`/`-`/`*`/`/`); runtime-only shapes (`@actor.*`, `@item.badge`,
`@item.origin`, `@item.flags...rulesSelections`, mustache `{item|...}`, `@weapon.*`) flag
`expr-unresolved`. Among the 28 distinct str-expr FlatModifiers actually joined (not the whole
510-item pack): 9 ternary / 8 closed-form / 11 runtime-only — an exact re-scoping of the spec's
"32/79 ternary [globally]; +8 closed-form; 11 runtime-only [among joined]" breakdown. Predicates:
a level-family shape (`{gte|lte|gt|lt: ["parent:level"|"item:level"|"self:level", N]}`) evaluates
at base rank and GATES the atom off entirely when false (Mystic Armor's saving-throw atom: absent
at rank 1, present at rank 4+ — the named fixture, proven); any other predicate shape (roll-option
strings, `{"or": [...]}` compounds) tags the atom `conditional` rather than emitting a value. Array
selectors fan out (Heroism's single rule → 4 atoms). Resistance/Weakness type arrays fan out the
same way; a mustache-templated `type` (`{item|flags...}`) becomes a `resistance:choice-of-energy`
signal, not a concrete-type atom. **Widening beyond the spec's literal atom-family list (engineer
judgment, flagged):** `DamageDice` added as a sixth atom family (selector-namespaced
`damage-dice:<selector>`) — without it, several genuinely-extractable rider effects (a
per-strike bonus-damage rule) would be indistinguishable from a true tag-only effect, which
matters for D30-36's promotion decision below. Multi-effect merge (`select_effect_name`): an
unqualified sibling wins as the base row when one exists (covers Draw Ire's "(Success)" bonus AND
every duration/rank-heightened-variant pair — Tailwind/Darkvision/Iron Gut/Divine Vessel); absent
that, a "(Failure)"-preferring rank among degree-qualified siblings (Bestial Curse, Infectious
Melody, Sage's Curse, Outcast's Curse, Equal Footing, Curse of Recoil, Albatross Curse); an
`Effect: X Immunity` marker sibling is dropped outright (Shield, Guidance); everything else with
no unqualified/degree-qualified resolution is a genuine choice-of-N fan, tagged, profile
suppressed (Animal Form ×13, Dinosaur Form, Plant Form, Element Embodied, Holy Host, Bone Flense's
Damage/Reaction split). **Documented miss:** Bone Flense (a weapon-imbuement curse — touch range
on the CASTER's own weapon, no save/attack-roll on the casting action, the harm lands on a third
party later via the imbued weapon's Strikes) does not fit D30-22's target-prose heuristic (built
for direct self/ally-vs-enemy targeting) and lands `beneficial-effect` rather than hostile; a
targeted regex fix was evaluated and REJECTED — it would have also flipped four genuinely
beneficial promoted rows sharing the same `weakness:`/`damage-dice:` atom shape (Juvenile
Companion, Oaken Resilience, Flame Wisp, Blink Charge) from beneficial to hostile, a strictly worse
trade. Blood Vendetta and Fungal Infestation (the spec's other two named hostile-shaped examples)
land hostile correctly (both carry a real `defense.save`, checked BEFORE any join-derived signal).

**D30-36 buff population** (`buffs.py` + a `ledger.classify_row` change) — CONSTRUCTIVE, re-derived
against the real corpus (not asserted): round-3 beneficial (`condition_ref` rows, every instance
non-priceable) **81** — matches the spec's own pin exactly, unchanged mechanism. Raw-modifier-only
rows now run through `classify_hostility` (previously: an unconditional ledger bucket, never
checked) — **45** resolve beneficial (Heroism, Protection among them); the rest stay wherever their
own hostile/ambiguous signal puts them. Effect-join-promoted rows: **77** total (`extract_single`'s
skip guard now treats ANY effect-join content — atom or tag — as priceable, not a strict
atom-only gate; ALL 77, not a 43-item subset, get promoted and routed): **59 beneficial**
(Mystic Armor, Invisibility's own effect item, Mountain Resilience, False Vitality, Sure Strike,
Resist Energy, Blur among them — every W-B roster name accounted for), **10 hostile-shaped**
(Blood Vendetta, Fungal Infestation, Ill Omen, Infuse Vitality, Weaken Earth, Mental Map, Sage's
Curse, Seal Fate, Dragon Form, Scintillating Safeguard — stay OUT of the buff population, correctly
unpriced), **8 routing-ambiguous**. **Total buff population: 81 + 45 + 59 = 185** (vs. the spec's
pre-fix draft estimate of "19/81 atom-bearing" — the fix is exactly what the spec's headline
blocker demanded: heroism/protection/mystic-armor now route here). Buff comparables corpus (atom
vector non-empty): **145** — an engineer fix found mid-build: the FIRST pass gave 109 because
`build_buff_atom_vector` only counted `tier=None` condition instances as tag atoms, dropping
Sure Strike's own Concealed/Hidden (real T1 tier, still a beneficial side-effect on an
already-beneficial-routed row) and Resist Energy's choice-of-energy resistance (a tag, not an
atom) entirely — fixed to count EVERY condition instance on a buff row (not just non-priceable
ones) plus a dedicated `resistance:choice-of-energy` unit atom; 109→145, and all 10 W-B roster
spells became comparable (were 7/10 before the fix).

**D30-37 summon band** (`summons.py`) — `ledger._SUMMON_TRAIT_RE` was confirmed dead code
(`^summon\s` tested against the bare trait string `"summon"`, which never has a trailing space);
fixed to trait-list membership. Population: **n=14**, exact match. Base-level prose regex
(`(?:whose level is|of level)\s+([-–−]?\d+)(?:\s+or lower)?`, en-dash/unicode-minus tolerant) —
**13/14 match the declared curve exactly (delta=0 for every match)**, Phantasmal Minion is the one
miss (a fixed-creature summon referencing a specific bestiary Actor, no scaling prose at all).
Journal verification (`verify_curve_against_journal`, parses the real `<table>` HTML from
`gm-screen.json` entry `S55aqwWIzpQRFhcq` page `8gcp880pEWZ9VPnF`) — **PASS**, byte-for-byte
against `SUMMON_CURVE`. Kind precedence: no summon-trait spell in the real corpus is also a scored
damage/hybrid row, so the "scored row wins kind" branch is untested against real data (unit-tested
synthetically in `test_export.py`); Phantasmal Minion carries `population="summon"` is NOT set
(its real classification, `beneficial-effect` with zero buff atoms → `ledger`/
`no-comparable-profile`, is left alone — summonBand is simply absent, per the spec's own
"phantasmal minion via kind-precedence" framing).

**D30-38 export** (`export.py`) — `assay export-codex` (new subcommand) + wired into `assay price`.
**1,144 entries, one per main-list spell file** (never `remaster==true`-filtered — every file gets
an entry). **Variant collapse: 34 multi-row slugs — exact match to the spec's pin.** Similarity
floor (`comparables.SIMILARITY_FLOOR = 0.1` + ≥1 shared non-tier atom, `has_usable_comparables`)
applied in `comparables_for` — the SAME function both the hostile and buff engines call, so one fix
covers both engines as the spec required; verified not to regress round-3's V-A gate (still 4/10,
same names). `ComparableProfile` gained `file` (an engineer bug found mid-build: `buffs.
build_buff_profile` initially omitted it, producing bare `"spell/"` ids in every buff-comparables
entry — fixed, `ComparableMatch` also gained `file` so `export.py` never needs a name→file side
table). Slug = `Path(file).stem` (the P1 codex finding: a pack file's basename IS `sluggify(name)`,
0 disagreements over 28,636 real docs — no JS port needed). Reason codes: a 13-entry curated map
(`export.REASON_CODE_MAP`) + one fallback (`"other"`) — no raw ledger prose crosses the wire.
Kind/population reconciliation against the re-derived splits above, real numbers: `ledger` 524 /
`quantitative` 349 / `comparables` 148 / `buff-comparables` 123; population `null` 652 / `hostile`
296 / `beneficial` 183 / `summon` 13. **Unmatched ids: 0** (a REAL post-build check —
`_find_unmatched_ids` scans every `comparables[].id`, top-level and inside `variants[]`, against
the artifact's own entry keys; not a vacuously-empty field). **Double-run byte-identity: PASS**
(`export.dump_export` on two independent `build_export` calls, byte-equal). The artifact was
written ONLY to `apps/assay/out/spell-power.json` (gitignored, reproducible) — never into
`apps/codex/`, per the spec's explicit instruction; the orchestrator places a copy at integration.

**Full py lane, real run:** `uv run ruff check .` / `uv run ruff format --check .` /
`uv run ty check` / `uv run pytest` — all green (226 tests in `apps/assay` alone, repo-wide suite
green). Real-corpus `assay extract`/`assay price`/`assay export-codex` all run clean against
`pf2e-8.3.0` (no fixture-only shortcuts).

**Gate evidence** (`results/validation.md`'s "Round 4 gates" section, real numbers — summarized
here, see that file for the full tables):

- **W-A (join) — PASS.** Independent join self-test reproduces 222/263/0/20 exactly; 29/263
  `@item.level` disagreements exactly; evaluator family breakdown (9 ternary/8 closed-form/11
  runtime-only among the 28 joined str-exprs) matches the spec's re-scoped pin; Heroism
  array-selector fanout and Mystic Armor's predicate gate both proven on the real fixtures (also
  unit-tested, `test_effects.py`).
- **W-B (buff comparables) — REPORTED, not gated (per spec).** Buff corpus n=145; all 10 W-B
  roster spells resolve (Heroism/Mystic Armor/Invisibility/Haste/Resist Energy/Sure Strike/
  Mountain Resilience/False Vitality/Blur/Protection); qualitative neighbor spot-check reads
  sensibly (Mystic Armor's neighbors are all AC-buffs — Shielded Arm, Benediction, Circle of
  Protection, Protection; Sure Strike and Blur are each other's #1 neighbor, both granting a
  concealment-family condition) — full LOO table in `validation.md`.
- **W-C (summons) — PASS.** Journal agreement byte-for-byte; 13/14 prose extraction, Phantasmal
  Minion the named miss via kind-precedence; curve table published in both `validation.md` and
  `summons.SUMMON_CURVE`.
- **W-D (export) — PASS.** Double-run byte-identity; unmatched ids = 0 (real check); entry counts
  by kind reconcile against the re-derived splits above, deltas from round-3 fully enumerated in
  this build record (not silently absorbed).

**Decisions made that the spec left to the engineer** (same framing as rounds 2/3's own build
records): the multi-effect merge algorithm for the 11 real corpus shapes the spec doesn't
explicitly enumerate (immunity-marker drop, unqualified-sibling-wins, choice-fan detection);
widening the atom-family list with `DamageDice` (documented above, needed for hostile-shaped
promoted rows to carry any signal at all); the buff-population promotion gate (`extract_single`
treats ANY join content — atom or tag — as priceable, not a strict atom-only filter, so all 77
ref-bearing skips promote rather than a smaller subset); leaving Bone Flense as a documented
false-negative rather than a bespoke regex fix that would have broken four other spells; Phantasmal
Minion NOT getting `population="summon"` (its real beneficial-but-atomless classification is left
to speak for itself). None of these are silent — all recorded here and in the relevant module
docstrings/comments.

**No STOP triggered.** Every re-derived number either matched the spec's review-verified pins
exactly (222/263/0/20/29/n=14/curve/round-3-beneficial-81) or is explicitly framed by the spec's
own status header as "re-derive at build" territory (the buff-population component counts, which
the promotion fix was EXPECTED to move) — every delta from the pre-fix draft numbers is enumerated
above with its mechanism, not silently absorbed.

### §6b — Track B + integration + deploy record (orchestrator, 2026-07-20)

- **Track B `1b16072`:** schema (Zod, strict), `assayFs.ts` loader (no fixture fallback,
  cache-on-success, warn-once), `assayBlock.tsx` (field-presence rendering — covers
  hybrids naturally), EntityPageData optional-field wiring (single seam serves standalone
  page + `?entry=` preview pane), fixture artifact all kinds/edges, compose third bind.
  W-E proven pre-integration: dist deleted + rebuilt (P12), 2,339/2,346 — the 7 fails =
  the known main baseline; all 7 flagship goldens byte-exact untouched.
- **Integration `fa05880`:** the 13-code reasonCode copy map completed on the codex side
  (Track B correctly shipped only the spec-named code + safe fallback — cross-track enum
  reconciled by the orchestrator, the flagged seam); `codex-refresh` regenerates + places
  the artifact (export has no `--out` flag — recipe copies from `apps/assay/out/`).
- **Deploy (stakeholder-flagged, sanctioned "do it"):** image rebuild + codex-scoped
  compose up (never blanket `just up` — P14). Window **12 s**, healthy, all THREE binds
  mounted. **W-F live (Playwright DOM, edge): fireball "Power: in band. EV 21 vs budget
  23.3 at rank 3" · heroism "Comparable spells: Levitate, …" · scrying curated long-cast
  copy · magic-missile@superseded NO block (corpus-only doc negative check) · SigNoz
  astra.codex ERROR count 0 (1h).**
- **Incidents (recorded):** a 33-hour stale `node server.ts` dev process from a prior
  session held :10399 with a dead in-memory build (chunks deleted by later rebuilds →
  500s) — killed; local prod-server smoke replaced by the vitest ssrSmoke run against the
  real artifact (26/26; the 7 baseline fails are fixture-env-only and vanish on real
  data). `.claude/settings.local.json` carries pre-existing format drift both engineers
  correctly left uncommitted.
- **Gate-H register addition:** the Assay (experimental) block on spell pages (incl. the
  `?entry=` preview pane), the 13-entry reason copy, heroism-class buff neighbor quality
  (mixed-rank lists are expected — rank ranges are wide by honest design).

### §6c — surface ON HOLD (stakeholder, 2026-07-20)

Post-gate stakeholder call: the block's representation wasn't what was wanted — **the codex
surface is ON HOLD, hidden not removed** (`8db3a0a`): `corpusFns.ts` wires
`emptyAssayReader` at the one production call site, so the block never renders; the
loader/component/tests/artifact/compose-bind/`codex-refresh` machinery all stay intact.
Redeployed (image rebuild + codex-scoped up), live-verified absent on fireball + heroism,
SigNoz 0 ERROR. Revisit = swap the one import back to `getAssayReader()` + redeploy; the
representation design goes back through scope when picked up. The gate-H register entry
for the block is WITHDRAWN (nothing user-visible remains).
