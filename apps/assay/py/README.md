# assay

assay is the campaign's PF2e homebrew spell workbench. It has three products
([ADR 0019](../../../docs/adr/0019-assay-scope.md)):

1. **The scorer** measures a spell's power against the official spell corpus. It fits a damage
   ladder, builds comparables corpora for effect and buff spells, and writes the committed
   reports in `results/`. `assay score` and `assay score-homebrew` apply it to one spell or to
   the whole store.
2. **The homebrew store** (`homebrew/`) is the single source of truth for the campaign's 173
   homebrew spells (`homebrew/spells/`) and the 8 school traits (`homebrew/traits/`). Each file
   is a hand-edited, Foundry-shaped JSON doc. codex ingests the store as the source book
   "Liturgy of the Iridite Vol.2" (abbreviation LotI2).
3. **The book**, *Liturgy of the Iridite Vol.2*, is a LaTeX build of the store
   (`books/liturgy_vol2/`), compiled with tectonic.

## Commands

All commands run from the repo root. Telemetry goes to SigNoz as `astra.assay`; set
`OTEL_SDK_DISABLED=true` to silence export noise in local runs.

| Command | What it does |
| --- | --- |
| `uv run assay price [--data-root PATH]` | Fits the scorer against the Foundry snapshot and rewrites `results/` and `out/` (below). |
| `uv run assay score --spell PATH` | Scores one Foundry-shaped spell JSON (a store file works) against the committed `results/`. |
| `uv run assay score-homebrew` | Scores every store spell into `out/homebrew/scores.json` and prints a table. |
| `uv run assay homebrew-revisions` | Diffs the store against a fresh re-conversion of the vendored set into `homebrew/revisions.md`. |
| `uv run assay store check` / `store fmt` | Validates the store against its model and format / rewrites it canonically. |
| `uv run assay export-codex [--data-root PATH]` | Rebuilds `out/spell-power.json` alone from the snapshot and the committed `results/`, without refitting. |
| `just book [--no-compile]` | Runs `assay export-book`: the `.tex` and, unless `--no-compile`, the PDF. |
| `just assay-store-check` | `assay store check` with telemetry off; part of `just check` and CI. |

Tests: `uv run pytest apps/assay/py`. They never touch the Foundry snapshot: they run off the
committed fixtures in `tests/fixtures/` (real corpus files, one per extractor trap), the
committed store and the committed `results/`.

## The scorer

### Inputs and outputs

`price` reads the main-list spells (`packs/pf2e/spells/spells/`, no focus spells or rituals)
from the Foundry snapshot that codex ingest fetched, under
`<codex.data-path>/snapshots/foundry/pf2e-<version>/`. `--data-root` overrides
`codex.data-path`. With several `pf2e-<version>` dirs, the highest version wins, compared
numerically. Without a snapshot, `price` fails with a clear message. The current snapshot is
`pf2e-8.3.0`, with 1,144 main-list spell files.

`price` writes, from scratch on every run:

- `results/` (committed): `fitted-params.json` (the fitted ladder and corpus sizes, under keys
  `round2`..`round4`), `point-tables.md` (the prior card and multiplier tables),
  `power-ledger.md` (every spell, scored or ledgered), `validation.md` (the validation gates),
  `comparables-corpus.json`, `buff-comparables-corpus.json` and `comparables-spot.md`.
- `out/` (gitignored): `features.json`, `spell-power.json`.

Rerunning `price` on the current snapshot reproduces the committed `results/` byte for byte.
`score` and `score-homebrew` need no snapshot: they read the committed `results/`.

### How a spell is scored

1. **Effect extraction** (`extract.py`, `conditions.py`, `effects.py`). The description is parsed
   for `@UUID[...conditionitems.Item.X]` condition refs, degree-of-success attribution (four
   rules: direct, preamble-affected, as-failure-inherits, and a case-insensitive plain-text
   repeat), duration, and status/circumstance modifiers (en-dash and unicode-minus signs
   included). It also reads `target_raw`, a prose-only save ("must attempt a <X> save" when
   `defense.save` is null) and a hostile-area phrase ("each creature", "each enemy").
   `@UUID[Compendium.pf2e.spell-effects.Item.<Name>]` refs join the effect item's
   `system.rules` (FlatModifier, TempHP, Resistance, Weakness, BaseSpeed, DamageDice) as atoms,
   evaluated at the spell's own base rank, never the effect item's `level`. Overlay variants
   (heal/harm style) score per variant; force barrage and five siblings use a hand-maintained
   per-action-count EV table; literal `@Damage[...]` rolls recover EV where no structured
   damage exists.
2. **Hostility routing** (`ledger.py`'s `classify_hostility`, per row). A row is hostile if it
   has a structured save, an attack-roll trait, a prose save or a hostile-area phrase. It is
   beneficial if every condition sits at a non-graduated degree and the target prose reads
   cooperative. Otherwise it is ambiguous: hostile if a tiered condition sits at a real
   graduated degree, else ledgered `routing-ambiguous`.
3. **Damage and hybrid pricing** (`pricing.py`). A damage ladder, `log EV = a + b·log(rank)`, is
   fit on a strict pure-damage subset (n=27, R²=0.967; the singleton-sensitivity fit is
   reported too), with fitted effective-target and range multipliers and declared action-cost
   constants. Damage and hybrid spells get a rank-equivalent score against it. Cantrips get
   their own ladder; it has only 2 observations, so it is intercept-only and borrows the main
   ladder's multipliers.
4. **Comparables** (`comparables.py`). A hostile effect or hybrid spell gets a deterministic
   profile: a weighted condition-atom vector plus structural coordinates (action bucket,
   effective target, range bucket, damage-EV band). Similarity is cosine over the atoms, times a
   small penalty per structural mismatch, times 0.5 on an incapacitation mismatch, with no fitted
   parameters. The output is the top 5 official comparables and the induced rank **range**
   (min–max, median highlighted), never a point score. A warning prints when the range touches
   rank 9–10, because no hostile rank-10 spells exist to anchor on. A match below 0.1 similarity
   or with no shared atoms becomes a `no-comparable-profile` ledger entry. The hostile corpus
   has 313 profiles; cantrips have none.
5. **Buff comparables** (`buffs.py`). Rows routed `beneficial-effect` (including modifier-only
   rows like Heroism and rows the effect join promoted, like Mystic Armor) get comparables from
   a separate beneficial-only corpus of 145 profiles, never mixed with the hostile one.
   Spells with several effect items collapse to a base variant; a choice-of-N form (Animal Form)
   is tagged and its profile suppressed.
6. **Prior card** (`priors.py`). Every condition×value gets a labeled prior, not a fit. Each tier
   is anchored on one named rule or spell (T4: a fight-ender on failure ≈ a full same-rank slot;
   T3: Slowed 1 for 1 minute ≈ a full rank-3 slot; T2: Frightened 1 on success ≈ the rank-1 Fear
   benchmark; T1: cantrip-adjacent), stated as `V ≈ Budget/w_repr`. The card adds GM Core's
   marginal-rider guidance and the coverage and duration multipliers.
7. **Summon band check** (`summons.py`). The 14 summon-trait main-list spells are checked
   against the GM Screen journal's level curve; 13 have a base level in prose (Phantasmal
   Minion has none). Drift fails the check.
8. **Full-population ledger** (`ledger.py`, `report2.py`). Every row is either scored (558) or
   lands in a typed ledger (657): summon, wall-terrain, teleport-utility, effect-item-payload,
   beneficial-effect, routing-ambiguous, raw-modifier-only, low-confidence, non-literal
   formula, long-cast and others. Coverage is complete, never silently partial.

### Validation (`results/validation.md`)

The validation gates report misses with a diagnosis rather than tuning them away:

- The damage ladder tracks the community 7×rank budget within 6% at ranks 3–10.
- Comparables leave-one-out passes 4 of 10 roster spells (40%) against a 70% target. The
  neighbors are the right kind (fear spells cluster with Fear), but spells that share a
  condition profile differ in rank through quality the atoms cannot see (area, targets, riders).
  That is why effect spells get a range.
- Disintegrate reads hot because its attack-then-save double gate is not modeled.
- The summon curve check passes, and the export is byte-identical across two runs.

### The codex export

`price` (and `export-codex` alone) writes `out/spell-power.json`: one entry per spell file,
keyed `spell/<slug>` (1,144 entries; 34 multi-row files collapse to one entry with the rest
under `variants[]`), with stable reason codes from `export.REASON_CODE_MAP`. Nothing reads this
file today: codex has no Assay block, and no recipe copies it. A copy from July 2026 sits at
`<codex.data-path>/assay/spell-power.json`.

### Out of scope

Wall and terrain sub-models, forced-movement atoms, any generative control-spell fit,
teleportation and utility valuation, focus-spell band comparison, ritual scoring and
legacy-spell scoring.

## Scoring a homebrew spell

`assay score --spell <path>` reads the Foundry `system` shape and takes one of three paths:

1. **Damage or hybrid (real EV):** a rank-equivalent verdict (HOT, COLD or in band) against the
   ladder. A hybrid also gets comparables, printed alongside the verdict.
2. **Hostile effect spell (EV 0, routed hostile):** the top 5 comparables (name, rank, shared
   and differing atoms), the induced rank range and a pointer into the prior card per condition.
   It also prints the old fitted Stage-B score, labeled "superseded, reference only";
   `point-tables.md`'s appendix explains why it is no longer the verdict.
3. **Beneficial or routing-ambiguous:** a plain message. Ambiguous routing needs a GM's
   judgment. `assay score` does not print buff comparables; `score-homebrew` shows the buff range
   for store spells.

### The condition markup contract

To score a spell that inflicts a condition, write its description with the real markup, not
plain English:

```html
<p><strong>Failure</strong> The target is @UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 2}.</p>
<p><strong>Critical Failure</strong> The target is @UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 3}.</p>
```

- The extractor keys on `@UUID[Compendium.pf2e.conditionitems.Item.<Name>]{<Name> <value>}`.
  A bare `<Name>` with no `{value}` means value 1 for valued conditions (Frightened, Sickened,
  Clumsy, Enfeebled, Stupefied, Drained, Stunned, Slowed, Doomed).
- Wrap each outcome in `<strong>Critical Success</strong>`, `<strong>Success</strong>`,
  `<strong>Failure</strong>` or `<strong>Critical Failure</strong>`. The attribution rules
  (`conditions.py`) need this structure to attach a condition to an outcome and read its
  duration from that section's prose ("for 1 round", "for 1 minute").
- With no structured `defense.save` but a save in prose, write "...must attempt a <Statistic>
  save." That is how routing sees the spell as hostile.
- An area spell with no save (a Demoralize-linked emanation, say) needs "each creature" or "each
  enemy" in the description, or it may read as a touch or self buff.
- `assay score` warns when the description has a plain condition word ("frightened") and no
  `@UUID[...conditionitems.Item.X]` ref. That shape would otherwise score as pure damage.

## The homebrew store

`homebrew/spells/<slug>.json` holds one spell per file, committed and edited by hand. The store
was seeded once (commit `b7b990d4`) from the vendored `run_balance` conversion set
(`vendor/run_balance/`, 176 spells; see `VENDORED.md`) through the adapter in `homebrew.py`.
Three vendored spells were never seeded (hardlight-bridge, lesser-wish, mystic-negation), and
every store spell now deviates from its baseline; `homebrew/revisions.md` lists each deviation.
Nothing downstream reads `vendor/`; only `homebrew-revisions` re-converts it. There is no seed
command: a re-seed would overwrite hand edits and bring back deleted or renamed spells.
`homebrew.seed_homebrew(store_dir)` builds a scratch store for tests and refuses the canonical
store and any directory that already holds spell files.

Every store file carries a `flags.assay` block: `seededFrom` (`repo`, `commit`,
`originalName`, `convertedName`) and `adapterWarnings` (recorded at seed time). The extractor
never reads `flags`.

**Model and format.** `store.py` holds a strict Pydantic model for a spell file and a trait
file, fitted to the data as stored: unknown keys and type coercion fail. Every file is
canonical JSON: sorted keys, 2-space indent, non-ASCII text as-is, one trailing newline (the
same rule as `being.canonical.json`). `assay store check` fails on a model or format problem;
after a hand edit, run `uv run assay store fmt`, which rewrites each file from its own parsed
value and so cannot change content. A repeated key in any object fails `check`, and `fmt`
leaves that file alone rather than keep one value. Sorted keys put heightening rank `"10"`
before `"4"`; the consumers ignore key order.

**Consumers.** codex ingest reads the store from the checkout it runs in, so a store change
reaches codex only through a codex build (see Operations). The book reads the store and the
traits.

## Operations

**Edit a store spell.**

1. Edit `homebrew/spells/<slug>.json`. For description-only edits, substitute raw text; a
   `json.load`/`json.dump` round trip rewrites escaping and newlines across the file.
2. `uv run assay store fmt`, then `uv run assay score-homebrew`, and check that score and
   routing changed only where intended.
3. `uv run assay homebrew-revisions` to regenerate `homebrew/revisions.md`.
4. To publish to codex, follow "Transform-only change" in
   [`apps/codex/web/README.md`](../../codex/web/README.md#operations). To update the book, run
   `just book` and commit the `.tex` diff.

To measure a variant, edit the store file, run `score-homebrew`, then restore the file. Never
commit a probe.

**Rename a store spell.** `git mv` the file and change the `name` field. Leave
`flags.assay.seededFrom` alone; `homebrew-revisions` pairs files through it. Check the new name
against official spell names (the Foundry snapshot and codex's full id space, including legacy
AoN-only spells).

**Build the book.** The book sources live in `books/`: `liturgy_vol2/` (the LaTeX book) and
`liturgy_vol1/` (the retired Homebrewery source, kept for reference). The book has front
matter, a table of contents and eight school chapters, each an opener, a spell-list table and
the school's spells by rank and name. Prose fragments live in `books/liturgy_vol2/content/`.

```bash
just book               # .tex + PDF into apps/assay/py/books/liturgy_vol2/
just book --no-compile  # .tex only
```

The PDF is a build output and git-ignored ([ADR 0018](../../../docs/adr/0018-book-binaries-stay-in-history.md));
nothing serves it, so hand a reader the file `just book` writes. Commit the `.tex` diff:
`test_book.py` fails when the committed `.tex` differs from a fresh build. `just book` needs
tectonic 0.17.0 on `PATH` (not in mise; `~/.cargo/bin/tectonic` on this host) and refuses any
other version. The compile takes about 20 s with `SOURCE_DATE_EPOCH=0`, and both the `.tex` and
the PDF are byte-deterministic. The style is the committed `liturgy.sty`. School art goes in
`books/liturgy_vol2/assets/img/processed/<school>.{png,jpg}` (cover: `fm-cover`); missing art
becomes a placeholder. The `processed/` art is committed source: it is the hand-cropped,
color-graded finish of the raw generations in `preprocessed/`, which is local-only and
git-ignored, and no script derives one from the other. The fonts are licensed for personal use
only: flag this before distributing the PDF.

**The archived review workshop.** The workshop files live under
`thoughts/archive/assay-workshop/`: the scriptorium review UI source (`review-ui/`) and the
one-off review paperwork (`results/`). The scriptorium's state is in
`thoughts/archive/scriptorium-review-state/`. Its `comments.jsonl` is an append log: drop the
ids that later `op: delete` lines retract before reading it.

## Traps

**Scorer**
- The generative effect-value fit is dead: effect-spell power lives in unmodeled quality
  (DCs, riders, scaling text), not in which conditions a spell names. Effect spells get
  comparables and a rank range, never a point score.
- Derive any population count by running the real scorer, never from description grep
  counts or an earlier doc.
- Known lens artifacts, to record rather than "fix" in dice: conditional or probabilistic
  damage priced at full weight; recurring zones priced per cast (a per-tick line should sit
  about 0.9 ranks below the one-shot ladder); sustained engines, weapon morphs and per-round
  auras; attack-roll spells (no half on a miss); a 3-action cost reads hotter and a reaction
  colder; area size within a shape is invisible, while the range bucket moves more than a rank;
  the ladder trains on base-rank rows, so heightened official spells read hot.
- No extractor axis separates caster from target, so self-benefit spells can route as buffs.
  Negated or prevented conditions ("does not fall Unconscious") can promote falsely.
- Degree attribution reads only `<strong>Failure</strong>`-style headed sections. Put the degree
  block first and any rolled table after it (the Unfathomable Song layout), or the table's
  conditions go unpriced.
- A routing flip after a text edit can be the correct result. Compare `assay score --spell`
  before and after the edit before blaming the lens.
- Effect-item atoms are evaluated at the spell's base rank. `@actor.*` and mustache expressions
  are tagged `expr-unresolved`; a predicate other than a level check tags the atom
  `conditional`.

**Store and adapter**
- Set-wide policy lives in the adapter (`homebrew.py`); per-spell judgment lives in the store.
  A policy change edits both in lockstep, and `revisions.md` should show no new deviations.
- Prose and structure must agree: when a description edit changes an area, damage or save,
  update the structured field too, and the reverse. Body-only sweeps miss leftovers in
  structured fields such as `duration.value`.
- Non-damage heightening by a fixed step encodes as
  `{"damage": {}, "interval": N, "type": "interval"}`. Official wall spells have
  `area: null` with dimensions in prose.
- When a review adds a new field class, check that `homebrew-revisions` diffs it
  (`_DIFF_FIELDS`).
- oxfmt ignores `homebrew/**`, `books/**` and `vendor/**` but formats `results/**` JSON; run
  `pnpm run format` before committing generated ledgers.
- Before any PF2e rules claim (area behavior, condition mechanics), grep the codex corpus
  rules docs under `<codex.data-path>/releases/current/corpus/rules/` and quote them.

**Book (XeTeX via tectonic)**
- `\needspace` is broken inside `multicols`: it checks the page, not the column. Use a
  minipage to keep a header with its content.
- `multicols` balancing overrides `\columnbreak`. Chapter openers use a single-column
  `adjustwidth` narrowed by `\openerreserve`.
- An unbreakable `tabularx` taller than a column silently drops rows. Tables are built one
  row per `\tblrow` box.
- `\pageref` expanded under a fresh `\fontsize…\selectfont` corrupts `\strutbox` for the rest
  of the compile (phantom tall table rows). Resolve it at `\normalsize` in its own group, then
  `\scalebox` the finished box.
- Never trust "visually verified". Render the PDF yourself and measure (for example with
  `pdftotext -bbox`).
