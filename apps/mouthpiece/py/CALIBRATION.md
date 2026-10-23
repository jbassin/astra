# Tone golden A/B — lint calibration (NLSpec 0008 gate E)

The `lint.py` thresholds were ported PROVISIONAL from faerrin `script/lint.ts` (set
against hand-built fixtures, not real episodes). This note records the observed
metrics from linting the **7 committed faerrin `out/*.script.json` reference
outputs** (the gold standard) — established with **zero LLM spend** (the reference
scripts already exist). Regenerate with `tests/test_lint_calibration.py` (the test
asserts these stay sane) or the one-liner in the PR notes.

## Observed (faerrin reference scripts)

| session | turns | vocab | tlstd | spkSpr | meta | disfl | clean | subtotal | zeros |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--|
| 2026-5-11 | 370 | 0.95 | 6.8 | 8.3 | 0.00 | 0.53 | 0.32 | 10/10 | — |
| 2026-5-21 | 346 | 0.90 | 8.7 | 9.6 | 0.00 | 0.39 | 0.46 | 9/10 | — |
| 2026-5-25 | 400 | 0.82 | 5.7 | 5.8 | 0.00 | 0.32 | 0.52 | 8/10 | — |
| 2026-5-7 | 369 | 0.86 | 9.1 | 11.6 | 0.00 | 0.37 | 0.43 | 10/10 | — |
| 2026-6-1 | 392 | 0.90 | 7.3 | 6.6 | 0.00 | 0.53 | 0.32 | 10/10 | — |
| 2026-6-8-recap (mega — feature retired in 0024; historical reference row) | 596 | 0.73 | 9.2 | 12.2 | 0.00 | 0.59 | 0.30 | 9/10 | — |
| 2026-6-8 | 307 | 0.85 | 9.7 | 12.4 | 0.00 | 0.29 | 0.47 | 9/10 | — |
| **median** | 370 | 0.86 | 8.7 | 9.6 | 0.00 | 0.39 | 0.43 | — | — |

## Reading

- **The provisional thresholds hold up** — the gold output clusters at **8–10/10
  with no criterion at 0**. They are a valid floor as-is; no re-tune needed to start.
- **Proposed acceptance bar for the astra A/B:** a generated `session_script` must
  hit **mechanical subtotal ≥ 8/10 AND zero criteria at 0** to match the reference
  distribution. (R7–R9 voice/friction/coverage remain a human spot-read, per H2.)
- Near-boundary metrics to watch when re-tuning against *astra* output:
  `vocab_spread` two=0.75 (mega ref is 0.73 → scores 1), `clean_line_ratio` two=0.45
  (two refs land 0.47–0.52 → score 1), `turn_length_stdev` two=6 (one ref at 5.7).
  These are the criteria most likely to drop a point first if the port drifts toward
  "clean podcast"; leave the thresholds as-is until astra output is measured.
