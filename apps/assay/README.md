# assay

Quantitative spell power scoring for PF2e homebrew (0030 round 1) — calibrated against the
official spell corpus.

**Provenance / scope doc:**
`thoughts/shared/research/2026-07-19-assay-spell-power-0030-thoughts.md` — read this first, it
is the locked design (data reality, extractor traps, the model, validation gates).

## What round 1 does

Reads the codex Foundry spell-pack snapshot (read-only), extracts per-spell features on the
**damage axis only** (R4: condition/effect pricing is round 2), fits a log-linear
rank + facet budget model via plain `numpy` OLS (no sklearn), and produces:

- a **damage-budget-by-rank table** (dice-friendly, rounded),
- a **facet multiplier table** (clean fractions — the human point card for designing a spell),
- a **per-spell power ledger** (every fit spell's residual, in rank-equivalents),
- a **`score`** command that checks one homebrew spell JSON against the fitted model.

Cantrips get an independent parallel fit (their own intercept + facets, no rank ladder — they're
all rank 1 in the corpus; a "separate curve" per the design doc).

## Running it

```bash
uv run assay extract              # -> out/features.json (gitignored, reproducible)
uv run assay fit                  # -> results/{fitted-params.json,point-tables.md,power-ledger.md,validation.md}
uv run assay score --spell <path> # score one Foundry-shaped spell JSON against the committed fit
```

`--data-root` overrides the codex data path (default: `codex.data-path` from `config.kdl` via
`astra_config` — config-single-source, never hardcoded). If the Foundry snapshot isn't present
(e.g. a fresh checkout without `apps/codex/data/`), `extract`/`fit` fail soft with a clear
message; the test suite never touches the snapshot — it runs entirely off the committed fixtures
under `tests/fixtures/` (real corpus files, one per extractor trap — see `apps/codex/fixtures`
for the precedent of committing corpus provenance this way).

## Round-1 validation verdict (see `results/validation.md` for the numbers)

V1 (in-rank clustering) and V2 (heighten-projection consistency) both **FAIL** the design doc's
targets on the real corpus — reported honestly, not silently tuned. The residual spread among
same-rank spells is real (raw log-EV residual std ≈0.43, i.e. spells routinely differ from the
model's prediction by ~50%+ even after accounting for rank + every §3 facet), not a slope-metric
artifact. See the session's final report (or `validation.md`'s skip ledger + V3 outlier table) for
the diagnosis and candidate causes — this is round 2's starting evidence, not a bug to chase away.

## Round-2 hooks (scoped, not started)

Condition extraction via the `conditionitems` `@UUID` regex already proven in `extract.py`
(`condition_ref` flag); per-condition severity pricing; degree-of-success coverage multiplier;
`@Damage` inline-roll recovery (structured `damage` misses ~136 spells' prose-only damage,
including the discovered action-scaling gap — see Force Barrage in the final report); focus-spell
band comparison. Round 3+: a codex-integrated surface.
