---
name: weal-0032-gotchas
description: weal v2 (0032) — Rust dice-language engine → committed wasm → bot swap; build/deploy gotchas + the open live-gate residue
metadata:
  type: project
---

PROJECT 2026-08-09 **weal v2 (0032) BUILT + DEPLOYED LIVE — S1–S7 all committed (`798f8e3`
lexer/CST → `bc8049d` checker → `500179f` interpreter → `a060c4b`+`52c8984` icepool-port dist
engine → `7875cbb`+`e09695f` render/plot/wasm + member → `40c7dde` bot swap → `2dd2cea` live fix +
`2fa5d93` docs/charter); gates A/B/C/G met, D/E/F ◐ PARTIAL** (spec §6 gate record) — the typed
dice language (HM + atom unions, exact distributions) in `libs/rust/weal-engine`, compiled to the
**committed** `libs/ts/weal-engine/gen/` wasm, swapped into weal-bot (v1 `roller/` deleted).

**⭐ THE load-bearing gotchas:**

- **Root `.gitignore`'s unanchored `dist/` swallowed the crate's `src/dist/`** — a negation
  entry fixed it at the S4 worktree merge. Any new `dist`-named source dir hits this.
- **plotters 0.3.7 cfg-OUTS its ab_glyph font backend on wasm32-unknown-unknown** and
  hard-selects a browser-DOM backend (`window().unwrap()` = a Node trap). Fix = plotters draws
  geometry only; text rasterized directly via the `ab_glyph` crate over one embedded
  DejaVuSans.ttf — identical pixels native/wasm; label-PIXEL goldens guard the blank-text
  regression (D32-9 deviation, recorded).
- **Interpreter depth-256 needs a sized wasm stack**: `.cargo/config.toml` wasm32-scoped
  `-zstack-size=8388608` (debug frames overflowed a 2 MiB test thread at S3; proven in the
  artifact via wasm-dis `__stack_pointer`).
- **`just weal-engine-build` hard-pins BOTH tools** (wasm-bindgen-cli 0.2.127 == the crate's
  exact dep pin; binaryen wasm-opt 124) and fails loudly on mismatch; two runs are
  byte-identical (hashes in `e09695f`). `gen/` is CJS (`{"type":"commonjs"}` marker re-written
  by the recipe); the ESM wrapper loads it via createRequire and synthesizes
  `{ok:false, stage:"fuel"}` from wasm traps.
- **D32-15 doubled the trailing value** — renderText already ends `= value`; the literal embed
  template appended the backticked headline again (`…kh3 = 15 = \`15\``). Live-found; the field
  replaces the trailing plain value (`2dd2cea`).
- **lazyCounter metrics don't exist in SigNoz until first increment** — `weal.v2.errors` /
  `weal.v2.fuel_aborts` absent from the metric list is NOT a wiring bug while no error/fuel
  case has fired live ([[telemetry-coverage-pass]] mechanism, reconfirmed here).
- **Fuel wall times (m6, measured on the committed wasm):** realistic macros ≤ 15 ms; `30d20`
  266 ms; abort paths mostly fast (10000d10000 → 222 ms transitions) **except `1000d1000` =
  1.7 s to hit the `states` counter** — adversarial only, accepted residue; a retune = engine
  rebuild.
- v1 `funcs` (11 rows) is a dead archive by design — saves did NOT migrate; `funcs_v2` starts
  EMPTY (boot log "loaded 0/0 saved weal v2 sources" is correct, not a load failure).
- D32-8 AMENDED at S4: eval_pool iterates descending SORTED order (rank-baked non-numeric
  faces make that ≡ face order).

**▶ OPEN — the live-gate residue (D/E/F ◐):** one Discord pass by a rostered player (the
15-message checklist in RESUME: coercion, strikethrough, labels, atom die + overlay `display`,
type-error caret, `lol`/`:p` silence, `save`→callable+suffix, fuel abort, plot PNG, giant-Str
truncation) + one bot restart (saved fn survives; hand-inserted stale funcs_v2 row → exactly a
WARN) + confirm `weal.v2.errors`/`weal.v2.fuel_aborts` born in SigNoz. Builds on
[[weal-0009-gotchas]].
