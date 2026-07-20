# assay

Quantitative + comparables-based spell power scoring for PF2e homebrew (0030 round 3) —
calibrated against the official spell corpus. Damage and hybrid damage+condition spells get a
quantitative rank-equivalent score; hostile effect (condition-only) spells get a **comparables**
view (top-5 similar official spells + an induced rank range) and a **prior-anchored price card** —
explicitly labeled priors, not fits.

**Provenance / specs:** `thoughts/astra/specs/0030-assay-round3-spec.md` (D30-21..27) — read this
first, it is the locked round-3 design (status header carries the stakeholder-fork history: the
original generative control-spell fit was killed by adversarial review, replaced by comparables).
`thoughts/astra/specs/0030-assay-round2-spec.md` (D30-1..11) is still authoritative for the damage
ladder + Stage A/B mechanics, which round 3 carries unchanged. Round 1's scope doc (data reality,
extractor traps) still applies: `thoughts/shared/research/2026-07-19-assay-spell-power-0030-thoughts.md`.

## What the pipeline does

1. **Effect extraction** (`extract.py` + `conditions.py`) — every spell's description is parsed
   for `@UUID[...conditionitems.Item.X]` condition refs, degree-of-success attribution (four
   explicit rules — direct / preamble-affected / as-failure-inherits / plain-text-repeat, the last
   **case-insensitive**, D30-21a), duration classification, and status/circumstance modifiers
   (now carrying real degree + duration, and matching en-dash/unicode-minus signs, D30-21b/c).
   Round-3 additions: `target_raw` (the spell's own `target.value` prose), prose-only save
   detection (`has_prose_save`/`prose_save_statistic` — "must attempt a &lt;X&gt; save" when
   `defense.save` is structurally null), and a `hostile_area_phrase` flag ("each creature"/"each
   enemy"). Overlay-variant spells (heal/harm-style) score per variant via a base-onto-overlay deep
   merge; a small mechanically-derived scaling family (force barrage and 5 siblings) uses a
   hand-maintained per-action-count EV table; literal `@Damage[...]` inline rolls recover EV where
   no structured `damage` entry exists.
2. **Hostility routing** (`ledger.py`'s `classify_hostility`, D30-22, per-ROW) — hostile iff a
   structured save, an attack-roll trait, a prose-save, or a hostile-area phrase; beneficial iff
   every condition instance sits at a non-graduated degree AND the target prose reads cooperative;
   otherwise ambiguous, resolved toward hostile only if a tiered condition sits at a real graduated
   degree, else ledgered `routing-ambiguous`.
3. **Damage/hybrid pricing** (`pricing.py`) — a **pure-anchored damage ladder**
   (`log EV = a + b·log(rank)`, fit on a strict pure-damage subset, singleton-sensitivity reported)
   plus fitted effective-target/range structural multipliers and declared action-cost constants.
   Damage and hybrid spells score directly against this ladder — **unchanged from round 2, this
   IS the recommended tool for them.**
4. **Comparables** (`comparables.py`, D30-23) — for any hostile effect or hybrid spell, a
   deterministic profile (a weighted atom vector — per-condition×value AND tier-aggregated,
   D30-4/8b coverage×duration weights — plus structural coordinates: action bucket,
   effective-target, range bucket, damage-EV band) and a similarity formula (cosine over the atom
   vector, ×(1−small penalty) per structural mismatch, ×0.5 on an incapacitation-flag mismatch —
   ONE documented formula, no fitted parameters). Output: the top-5 official comparables + the
   induced rank RANGE (min–max, median highlighted) — **never a point score**. A warning prints
   whenever the range touches rank 9–10 (review F9: zero hostile r10 trainers exist to anchor on).
5. **Prior-anchored price card** (`priors.py`, D30-24) — replaces round-2's fitted per-condition
   price card (superseded — kept as a provenance appendix in `point-tables.md`). Every
   condition×value gets a labeled PRIOR: each tier is anchored on one named real spell/rule
   (T4: a fight-ender on failure ≈ a full same-rank slot; T3: Slowed 1 for 1 minute ≈ a full
   rank-3 slot; T2: Frightened 1 on success ≈ the rank-1 Fear benchmark; T1: cantrip-adjacent),
   stated unit-coherently as `V ≈ Budget/w_repr` with `w_repr` printed. Plus the marginal-rider
   guidance (GM Core's -1-rank rule, ×0.5–0.75 of same-rank budget) and the coverage/duration
   multiplier tables.
6. **Full-population routing/ledger** (`ledger.py` + `report2.py`) — every spell lands either in
   the scored population or a **typed unscored ledger** (summon / wall-terrain / teleport-utility /
   effect-item-payload / beneficial-effect / routing-ambiguous / raw-modifier-only /
   low-confidence / non-literal formula / long-cast / …) — coverage is honest, never silently
   partial.

Cantrips get an independent parallel ladder (same method, own pure subset — currently very thin,
n=2, so it's intercept-only; structural multipliers fall back to the main ladder's). The
comparables corpus does not cover cantrips (too thin to be useful).

## Running it

```bash
uv run assay extract              # -> out/features.json (gitignored, reproducible)
uv run assay price                # -> results/{fitted-params.json,point-tables.md,power-ledger.md,
                                   #    validation.md,comparables-corpus.json,comparables-spot.md}
uv run assay score --spell <path> # score one Foundry-shaped spell JSON against the committed fit
uv run assay fit                  # round-1 per-rank-facet fit — SUPERSEDED diagnostic, do not run after `price`
```

`--data-root` overrides the codex data path (default: `codex.data-path` from `config.kdl` via
`astra_config` — config-single-source, never hardcoded). If the Foundry snapshot isn't present
(e.g. a fresh checkout without `apps/codex/data/`), `extract`/`price` fail soft with a clear
message; the test suite never touches the snapshot — it runs entirely off the committed fixtures
under `tests/fixtures/` (real corpus files, one per extractor trap — see `apps/codex/fixtures`
for the precedent of committing corpus provenance this way). `assay score` never needs the live
snapshot either — it reads the committed `results/fitted-params.json` +
`results/comparables-corpus.json` artifacts, both reproducible via `assay price`.

## Homebrew workflow

`assay score --spell <path>` reads the same Foundry `system` shape the corpus uses, and routes
your spell down one of three paths:

1. **Damage or hybrid (has real EV)** — the quantitative round-2 score: rank-equivalent verdict
   (HOT/COLD/in band) against the pure-anchored ladder. If the spell ALSO carries a hostile
   condition (a hybrid), it gets comparables too (item 2 below), printed alongside the
   quantitative verdict — never instead of it.
2. **Hostile effect spell (ev=0, D30-22 routes it hostile)** — comparables: the top-5 most
   similar official spells (name, rank, shared/differing condition atoms) and the induced rank
   RANGE (never a point score), plus a per-condition pointer into the D30-24 prior card. Also
   prints the round-2 Stage-B fitted score labeled **superseded, reference only** — see
   `results/point-tables.md`'s appendix for why it's no longer trusted as the primary verdict.
3. **Beneficial/buff or routing-ambiguous** — a plain message: beneficial effects are out of
   round-3 scope (buff pricing needs target-prose maturity first, per the spec §3); ambiguous
   routing is flagged for manual GM judgment, not auto-priced.

### The condition markup contract (still load-bearing for both paths 1 and 2)

To score a homebrew spell that inflicts a condition, write its description with the **real
markup**, not plain English:

```html
<p><strong>Failure</strong> The target is @UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 2}.</p>
<p><strong>Critical Failure</strong> The target is @UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 3}.</p>
```

- The `@UUID[Compendium.pf2e.conditionitems.Item.<Name>]{<Name> <value>}` tag is what the
  extractor keys on (bracket-bounded capture — a bare `<Name>` with no `{value}` defaults to
  value 1 for valued-typed conditions, e.g. Frightened/Sickened/Clumsy/Enfeebled/Stupefied/
  Drained/Stunned/Slowed/Doomed).
- Wrap each outcome in `<strong>Critical Success</strong>` / `<strong>Success</strong>` /
  `<strong>Failure</strong>` / `<strong>Critical Failure</strong>` — the four attribution rules
  (see `conditions.py`) need this structure to attach a condition to the right outcome and read
  its duration from that section's own prose (`"for 1 round"` / `"for 1 minute"` / …).
- If your spell has no structured `defense.save` but a save DOES exist in prose, write it as
  **"...must attempt a &lt;Statistic&gt; save."** (D30-21d's `detect_prose_save` family) — this is
  what tells D30-22's routing your spell is hostile even without the structured field.
- An area/linked-check spell with no save at all (e.g. a Demoralize-linked emanation) needs
  **"each creature"/"each enemy"** phrasing somewhere in the description for D30-22 to route it
  hostile — otherwise it may be misread as a touch/self buff.
- **`assay score` WARNS** when the description contains plain condition-word text (e.g.
  "frightened") with **zero** `@UUID[...conditionitems.Item.X]` refs anywhere — that shape would
  otherwise silently score as pure damage (an overscore), since the pricing model has nothing to
  key its condition-tier lookup on.

## Validation verdicts (see `results/validation.md` for the real numbers)

**Round 2 gates (V1′–V4′, damage/hybrid axis, carried unchanged):** all report honest misses with
diagnosis (no silent tuning): V1′'s wider spread is the expected cost of round 2's smaller,
better-identified structural axis; V3′'s misses split into an architectural extrapolation mismatch
(now moot for effect spells — see round 3 below) and an unmodeled mechanic (Disintegrate's
attack-then-save double-gate). V4′ (ladder vs. the community 7×rank line) tracks tightly, within
±6% rank 3–10.

**Round 3 gates (V-A..V-D, `thoughts/astra/specs/0030-assay-round3-spec.md` D30-25):** V-A
(comparables leave-one-out) reports an honest 40% pass rate against the ≥70% target — the
neighbors are QUALITATIVELY correct (fear-themed spells cluster with Fear, mind-control spells
with Paralyze) but two spells sharing a condition profile can differ enormously in overall rank
due to unmodeled quality (bigger area, more targets, extra riders) — exactly the dimension the
round-3 redesign exists to sidestep by reporting a range instead of a point. V-B (extraction-fix
proof) and V-C (routing proof) both pass with exact/near-exact real-corpus numbers (see the S1
commit `3783473` and `validation.md`). V-D (damage-side carry) is byte-identical to round 2's
shipped ladder.

## Out of scope (round 4+, per the spec §3)

Beneficial-buff comparables/pricing (needs target-prose maturity first), summon/wall/terrain
sub-models, forced-movement atoms, any generative control-spell fit (dead until a schema captures
effect QUALITY, not just identity), effect-item buffs without numeric prose, teleportation/utility
valuation, focus-spell band comparison, ritual scoring, legacy-spell scoring, any codex surface.
