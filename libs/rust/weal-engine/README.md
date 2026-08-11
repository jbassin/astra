# weal-engine — the weal v2 language + dice engine

The Rust crate behind weal v2 (spec `thoughts/astra/specs/0032-weal-v2-spec.md`): parser, type
checker, interpreter, exact-distribution engine (an icepool port), render/plot layer, and the
single wasm JSON API. It compiles to `wasm32-unknown-unknown` and ships as a **committed**
artifact under `libs/ts/weal-engine/gen/`, consumed by `apps/weal-bot` via the `@astra/weal-engine`
pnpm member. This is astra's only Rust — deliberately confined here (see the root `CLAUDE.md`
charter note); cargo is needed only when the engine itself changes.

For the player-facing language guide, see `apps/weal-bot/README.md`.

## Crate layout (`src/`)

- **`lexer.rs`** — the logos tokenizer (D32-1). The load-bearing trick is the *fat die token*:
  a die literal plus its whole suffix run (`4d6e2kh3`) lexes as ONE token with priority over
  identifiers, so an ident can never shadow a die form; the parser splits it later.
- **`cst.rs`** / **`parser.rs`** — a lossless rowan CST (trivia preserved, byte spans) built by a
  recoverable recursive-descent parser with precedence climbing (D32-2): `let`/`;`, `match`
  (nearest-match arm binding), lambdas vs match-arm `|` by lookahead, the `[` fork
  (list / dict / `[:]`), postfix calls/labels/suffix chains.
- **`ast.rs`** / **`lower.rs`** — the typed AST and CST→AST lowering: fat-die splitting into
  (count, sides, suffix chain), `_` placeholder desugaring (each `_` binds to the smallest
  enclosing call argument), plus `lower_root_spanned` producing the parallel `SpanTree` the
  checker uses for error spans.
- **`printer.rs`** — the canonical pretty-printer; the round-trip property
  `lower(parse(print(a))) == a` holds for every AST, and it is the core of the R21 save
  serializer (saves are stored as source text).
- **`types.rs`** / **`infer.rs`** — rank-1 HM inference with the D32-3 singleton-atom union
  lattice (`Bool = :true | :false`, contravariant function domains take set intersection),
  exhaustiveness/redundancy via Maranget usefulness, the D32-4 `sum` coercion (pools auto-sum in
  die-demanding positions), both-shape die-suffix resolution (pool-shape wins), monomorphic
  recursion for `let f(x) = …` sugar, deferred equatable checks. Elaborates into `CoreExpr`,
  the interpreter's input contract.
- **`value.rs`** / **`interp.rs`** — runtime values (structural eq/hash), the symbolic `DieTree`
  (dice stay symbolic until display), the tree-walking interpreter (currying, captures), the
  runtime effect guard (`roll`/`plot`/`save` illegal inside evaluator closures), and
  `serialize_value` (captures emitted as enclosing `let`s).
- **`fuel.rs`** — interpreter-side fuel: step counter, recursion-depth cap, and the
  before-allocation construction caps (pool count, explode depth). Distribution-side budgets
  live in `dist/`.
- **`prelude.rs`** — the D32-19 prelude as a NATIVE builtin table (`kh`/`kl`/`sum`/`pool`/`dl`/
  `dm`/`evaluate`/`label`/`explode`+`e`/`reroll`/`r`/`successes`/the list toolkit
  `repeat`/`concat`/`map`/`filter`/`fold`/`len` (2026-08-10 amendment)/`min`/`max`/`dec`/
  `float`/`num`/`round`/`floor`/`ceil`/`abs`/`roll`/`plot`/`save`), pinned 1:1 against the checker's
  `prelude_types()` by the `native_table_matches_prelude_types` drift test.
- **`dist/`** (facade **`dist.rs`**) — the exact-distribution engine, generic over any `Ord`
  face: `Weight` (u128 fast path, checked `BigUint` promotion, bit-capped), `Dist`
  (`BTreeMap` + the explicit D32-4 face-order vector), cartesian binary ops, weighted-lcm
  mixtures, the pool DP (pop-extreme + weighted-Pascal `comb_row` + keep-tuple + level memo +
  `skip_weight` dump), keep-1 closed forms, `explode`/`reroll`, exact mean/std. Ported from
  icepool v2.2.2 (`33e7e650`); the module doc carries the file-by-file ported-from inventory.
- **`dist_seam.rs`** — the interpreter↔dist bridge: lowers a symbolic `DieTree` to a
  `Dist<Face>` and back to plain-`Value` faces. Home of the amended-D32-8 face semantics
  (numeric faces sort numerically; non-numeric faces bake their face-order rank into the sort
  key, so pool iteration and `kh`/`kl` are coherent for both), the `[:false, :true]` pinned Bool
  face order, and the `evaluate()` DP re-entry into user closures.
- **`render.rs`** — the §3 render tree: seeded ChaCha20 sampling (leaves left-to-right in source
  order, composites computed from leaf samples), the collapse policy down to ≤900 chars,
  markdown escaping, ≤80-char headlines, `standardDice` extraction, and five-tier goodness from
  face-order position.
- **`plot.rs`** — the D32-16 PMF chart: plotters with the bitmap backend + the committed
  DejaVuSans font (`fonts/`; no system fonts under wasm32) → 800×450 PNG, base64.
- **`api.rs`** — the D32-11 seam: ONE export,
  `evaluate(source, saves_json, seed, budget, mode) -> String` (JSON). `mode:"check"` =
  parse+type-check only (the bot's boot validation); errors carry
  `stage: parse|type|eval|fuel|prelude`, span, and `preludeName` for failing saves. The pure
  function is native-tested; the wasm-bindgen wrapper is a one-liner.

## Build pipeline (the committed artifact)

```
just weal-engine-build
```

runs, from the repo root: `cargo build --release --target wasm32-unknown-unknown` →
`wasm-bindgen --target nodejs` into `libs/ts/weal-engine/gen/` → `wasm-opt -O2` in place →
rewrites `gen/package.json` to `{"type":"commonjs"}` (wasm-bindgen won't; the CJS marker is what
lets the ESM wrapper `createRequire` the glue) → prints sha256s.

- **Pinned tools, hard-required** (committed bytes must be machine-independent; the recipe
  fails fast on a missing or wrong-version tool):
  - Rust **1.96.0** via `rust-toolchain.toml` (rustfmt + clippy components).
  - **wasm-bindgen-cli 0.2.127** — must equal the crate's `wasm-bindgen = "=0.2.127"` pin
    (`cargo install wasm-bindgen-cli --version 0.2.127 --locked`).
  - **binaryen wasm-opt version 124** (GitHub release binary → `~/.local/bin`).
- **Determinism:** two runs produce a byte-identical `gen/` (recorded at S5). If your rebuild
  diffs without a source change, suspect tool versions.
- **Committed-artifact policy:** `gen/` is a build product that lives in git — never hand-edit
  it, always regenerate via the recipe. CI never runs cargo; a vitest smoke in
  `libs/ts/weal-engine` loads the real wasm and rolls a seeded `2d6`, guarding a stale/corrupt
  artifact.
- **wasm stack sizing:** the 256-frame recursion cap needs an 8 MiB stack under wasm32
  (`-C link-arg=-zstack-size=8388608`), target-scoped in `.cargo/config.toml` so it applies no
  matter who invokes cargo and native builds are untouched.

## The oracle (icepool cross-check)

`tests/dist_oracle.rs` asserts **exact weight equality** on 32 constructions (NdM sums, kh/kl
incl. middle/negative keep-tuples, weighted `dm`, mixed denominators, explode, `4d6e2kh3`,
successes, comparisons-as-`Die[Bool]`) against fixtures generated by the REAL Python icepool:

```
cd libs/rust/weal-engine
uv run --no-project python tools/gen_oracle.py
```

The script imports icepool from the pinned local clone at `/home/jbassin/icepool` (commit
`33e7e650`, tag v2.2.2) and emits both `fixtures/oracle.json` (human-readable record) and
`fixtures/oracle_gen.rs` (a dependency-free Rust array the test `include!`s — serde isn't a test
dependency). **Regenerate only when adding oracle cases or deliberately moving the icepool pin**;
a semantics change in `dist/` should make the existing fixtures FAIL, not prompt a regen.

## Running the tests

```
cd libs/rust/weal-engine
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

That triple is the local gate (recorded per slice — there is no Rust CI lane). `cargo test` runs
the unit suites plus `tests/`: parser/lexer goldens, parse recovery, printer round-trip
properties, the typechecker accept/reject suite, elaboration, the dist property tests
(denominator invariants, keep-1 ≡ pool recursion), the oracle, seam end-to-end, the §3 seeded
render goldens, and the api JSON contract (incl. the plot label-pixel golden).
`cargo run --example dump` prints token streams + lowered ASTs for the golden inputs. The TS
side: `pnpm --filter @astra/weal-engine test` (wasm smoke) and the weal-bot suites run the real
committed wasm.

## Fuel / budget model (D32-12)

All compile-time consts; exhaustion is a visible `stage:"fuel"` error naming the counter. The
wasm `budget` argument scales interpreter steps ONLY (non-zero = the absolute step budget).

| Counter | Default | Where |
|---|---|---|
| interpreter steps | 2,000,000 | `fuel.rs` (`INTERP_STEPS`) |
| recursion depth | 256 | `fuel.rs` — the interpreter's `eval` frames; counts expression nesting AND closure applications, so it catches both paren bombs and `let f(x) = f(x)` |
| pool count (construction cap) | 10,000 | `fuel.rs`, checked before allocation |
| `repeat` list length (construction cap) | 10,000 | `fuel.rs` (`check_list_len`, the pool-cap constant), checked before allocation |
| explode depth (construction cap) | 8 | `fuel.rs`, checked before allocation |
| DP transitions (+ `comb_row` cells) | 1,000,000 | `dist/budget.rs` |
| concurrent DP state-map entries | 200,000 | `dist/budget.rs` |
| support size per die | 50,000 | `dist/budget.rs` |
| bigint bits per weight | 16,384 | `dist/budget.rs` |

(The spec's ninth counter — render nodes 10,000 — was not shipped as a counter; render size is
bounded by the ≤900-char collapse policy instead.)
