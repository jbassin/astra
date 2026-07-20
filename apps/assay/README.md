# assay

Quantitative spell power scoring for PF2e homebrew (0030 round 2) — calibrated against the
official spell corpus. Covers pure damage, hybrid damage+condition spells, and pure
condition-control spells on one power scale.

**Provenance / spec:** `thoughts/astra/specs/0030-assay-round2-spec.md` (D30-1..11) — read this
first, it is the locked design. Round 1's scope doc (data reality, extractor traps) still applies:
`thoughts/shared/research/2026-07-19-assay-spell-power-0030-thoughts.md`.

## What round 2 does

1. **Effect extraction** (`extract.py` + `conditions.py`) — every spell's description is parsed
   for `@UUID[...conditionitems.Item.X]` condition refs, degree-of-success attribution (four
   explicit rules — direct / preamble-affected / as-failure-inherits / plain-text-repeat),
   duration classification, and raw status/circumstance modifiers. Overlay-variant spells
   (heal/harm-style) score per variant via a base-onto-overlay deep merge; a small
   mechanically-derived scaling family (force barrage and 5 siblings) uses a hand-maintained
   per-action-count EV table; literal `@Damage[...]` inline rolls recover EV where no structured
   `damage` entry exists.
2. **Pricing** (`pricing.py`) — a **pure-anchored damage ladder** (`log EV = a + b·log(rank)`,
   fit on a strict pure-damage subset, singleton-sensitivity reported) plus fitted
   effective-target/range structural multipliers and declared action-cost constants. A **Stage A**
   OLS fit (in log-discount space, with intercept) on hybrid trainer spells learns per-tier
   (T1–T4) condition severity discounts; **Stage B** applies `p = 1 − exp(−Σ β·w)` to price
   condition-only control spells as a fraction of the same ladder.
3. **Full-population routing** (`ledger.py` + `report2.py`) — every spell lands either in the
   scored population or a **typed unscored ledger** (summon / wall-terrain / teleport-utility /
   effect-item-payload / beneficial-effect / raw-modifier-only / low-confidence / non-literal
   formula / long-cast / …) — coverage is honest, never silently partial.

Cantrips get an independent parallel ladder (same method, own pure subset — currently very thin,
n=2, so it's intercept-only; structural multipliers fall back to the main ladder's).

## Running it

```bash
uv run assay extract              # -> out/features.json (gitignored, reproducible)
uv run assay price                # -> results/{fitted-params.json,point-tables.md,power-ledger.md,validation.md}
uv run assay score --spell <path> # score one Foundry-shaped spell JSON against the committed fit
uv run assay fit                  # round-1 per-rank-facet fit — SUPERSEDED diagnostic, do not run after `price`
```

`--data-root` overrides the codex data path (default: `codex.data-path` from `config.kdl` via
`astra_config` — config-single-source, never hardcoded). If the Foundry snapshot isn't present
(e.g. a fresh checkout without `apps/codex/data/`), `extract`/`price` fail soft with a clear
message; the test suite never touches the snapshot — it runs entirely off the committed fixtures
under `tests/fixtures/` (real corpus files, one per extractor trap — see `apps/codex/fixtures`
for the precedent of committing corpus provenance this way).

## Homebrew spell contract (for `assay score`)

`assay score --spell <path>` reads the same Foundry `system` shape the corpus uses. To score a
homebrew spell that inflicts a condition, write its description with the **real markup**, not
plain English:

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
- **`assay score` WARNS** when the description contains plain condition-word text (e.g.
  "frightened") with **zero** `@UUID[...conditionitems.Item.X]` refs anywhere — that shape would
  otherwise silently score as pure damage (an overscore), since the pricing model has nothing to
  key its condition-tier lookup on.

## Round-2 validation verdict (see `results/validation.md` for the real numbers)

V1′/V2′/V3′ all report honest misses with diagnosis (no silent tuning, same discipline as
round 1): V1′'s wider spread is the expected cost of round 2's smaller, better-identified
structural axis (effective-target + range + action only, vs. round 1's collinear area/targeting
terms); V3′'s misses split into an architectural extrapolation mismatch (Stage A's β's are learned
from *partial* discounts on hybrid trainers, then reused by Stage B to justify the *entire* budget
for pure-control spells like Fear/Slow/Synesthesia — a real, diagnosed gap, not a broken
extraction) and an unmodeled mechanic (Disintegrate's attack-then-save double-gate). V4′ (ladder
vs. the community 7×rank line) tracks tightly, within ±6% rank 3–10.

## Out of scope (round 3+, per the spec §3)

Effect-item buffs without numeric prose (spell-effects-linked payloads), summons, walls/terrain,
teleportation/utility valuation, focus-spell band comparison, ritual scoring, legacy-spell scoring,
any codex surface.
