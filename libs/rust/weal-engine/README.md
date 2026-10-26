# weal-engine — the weal v2 language + dice engine

The Rust crate behind weal v2 (spec `thoughts/archive/specs/0032-weal-v2-spec.md`): parser, type
checker, interpreter, exact-distribution engine (an icepool port), render/plot layer, and the
single wasm JSON API. It compiles to `wasm32-unknown-unknown` and ships as a **committed**
artifact under `libs/ts/weal-engine/gen/`, consumed by `apps/weal/bot` via the `@astra/weal-engine`
pnpm member. This is astra's only Rust — deliberately confined here (see the root `CLAUDE.md`
charter note); cargo is needed only when the engine itself changes.

For the player-facing language guide, see `apps/weal/bot/README.md`.

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
  recursion for `let f(x) = …` sugar, deferred equatable checks, and nullary functions as
  `Unit -> T` (`|| e` and `let f() = e` take an implicit `()`, and `f()` elaborates to
  `f(())`, so the body re-runs on every call). Elaborates into `CoreExpr`, the ONE
  post-lowering tree: the interpreter walks it, closures store it, and the save serializer prints
  it back to source. The checker stamps every node with its source span (a checker-inserted node,
  such as a `sum` wrapper or a suffix's `pool` call, takes the span of the source node it
  elaborates), so there is no separate span-attaching pass. Add a construct by adding a
  `CoreKind` variant and handling it in the checker, `eval_inner`, `free_idents`, `all_idents`
  and `core_to_expr`.
- **`value.rs`** / **`interp.rs`** — runtime values (structural eq/hash), the symbolic `DieTree`
  (dice stay symbolic until display), the tree-walking interpreter (currying, captures), the
  runtime effect guard (`roll`/`plot`/`save` illegal inside evaluator closures), and
  `serialize_value` (captures emitted as enclosing `let`s).
- **`pipeline.rs`** — the one parse → lower → check → eval pipeline. Every entry point uses its
  stages: the api's `check` and `run` modes, save loading for both (`load_saves`, `CheckOnly` or
  `Evaluate`), the `run` driver, and the `check_source` / `parse_to_ast` helpers. So they share
  one error staging (`CompileStage::Parse` for parse and lowering errors, `Type` for checker
  errors; a failing save is a `SaveError`) and one set of limits (the parser's nesting cap,
  `fuel_for_budget`, a fresh default fuel per save). Add a new entry point by composing these
  stages, not by calling the parser, lowerer or checker directly.
- **`fuel.rs`** — interpreter-side fuel: step counter, recursion-depth cap, and the
  before-allocation construction caps (pool count, explode depth). Distribution-side budgets
  live in `dist/`.
- **`prelude.rs`** — the D32-19 prelude: the ONE builtin registry. `enum Builtin` plus the
  `BUILTINS` table, one row per builtin: name, curried arity, `Typing` (a scheme, or the
  checker's special case for `min`/`max`, `float`/`abs` and variadic `roll`), the native
  implementation, the suffix alias (`e` elaborates to `explode`) and the player guide's doc line.
  The checker's environment (`prelude_types()`), the interpreter's dispatch and currying,
  `Value::Builtin` (it carries the enum), save serialization and `Builtin::from_name` (the one
  "is this a builtin" lookup) all read it. Add a builtin by adding a row; the
  `rows_are_coherent` test checks each row's arity against its schemes. The build also writes the
  registry to `gen/weal_builtins.json` (the TS wrapper's `BUILTINS` / `isBuiltin`, which the bot's
  save guard uses) and to the built-in list in `apps/weal/bot/README.md`; the
  `builtin_reference_is_current` test fails when either lags.
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
  parse+type-check only; errors carry `stage: parse|type|eval|fuel|prelude|internal`, span,
  and `preludeName` for failing saves. `internal` is an `Internal` engine error (an invariant a
  well-typed program should never break; message prefix `internal error:`), never a player error. The pure
  function is native-tested; the wasm-bindgen wrapper is a one-liner. The response shapes are the
  JSON contract's single source: under `cfg(test)` each derives `ts_rs::TS` (`ts-rs` is a
  dev-dependency only, so it never reaches the wasm), and the `ts_bindings_are_current` test
  compares the declarations with the committed `libs/ts/weal-engine/gen/weal_api.d.ts`, which the
  TS wrapper re-exports. Change a shape, then rebuild; the test fails until you do.

## Build pipeline (the committed artifact)

```
just weal-engine-build
```

runs, from the repo root: `cargo build --release --target wasm32-unknown-unknown` →
`wasm-bindgen --target nodejs` into `libs/ts/weal-engine/gen/` → `wasm-opt -O2` in place →
rewrites `gen/package.json` to `{"type":"commonjs"}` (wasm-bindgen won't; the CJS marker is what
lets the ESM wrapper `createRequire` the glue) → regenerates `gen/weal_api.d.ts`, `gen/weal_builtins.json`
and the player guide's built-in list (the `ts_bindings_are_current` and `builtin_reference_is_current`
tests with `WEAL_WRITE_TS_BINDINGS=1`) → writes the staleness stamp
`gen/SOURCE_SHA256` (`tools/gen-stamp.sh write`) → prints sha256s.

- **Pinned tools, hard-required** (committed bytes must be machine-independent; the recipe
  fails fast on a missing or wrong-version tool):
  - Rust **1.96.0** via `rust-toolchain.toml` (rustfmt + clippy components).
  - **wasm-bindgen-cli 0.2.127** — must equal the crate's `wasm-bindgen = "=0.2.127"` pin
    (`mise.toml` installs it).
  - **binaryen wasm-opt version 124** (`mise.toml` installs it).
- **Determinism and machine independence:** two runs produce a byte-identical `gen/`, and so
  does a build with a different `CARGO_HOME` (checked 2026-10-23). The recipe passes
  `--remap-path-prefix=$CARGO_HOME=/cargo` through `cargo --config`, so the dependency panic
  locations read `/cargo/registry/...` instead of the builder's home directory, and it fails if
  `$HOME` still appears in the wasm. Use `--config`, not `RUSTFLAGS`: the env var replaces the
  `.cargo/config.toml` rustflags (dropping the stack flag), while `--config` appends to them. The
  crate's own paths are already relative and std's already read `/rustc/<hash>`. If your rebuild
  diffs without a source change, suspect tool versions.
- **Committed-artifact policy:** `gen/` is a build product that lives in git — never hand-edit
  it, always regenerate via the recipe. `just weal-engine-hash-check` (in `just check`, `just ci`
  and CI, no Rust needed) fails when `gen/` is stale: it recomputes the hash of `src/**`,
  `fonts/**`, `Cargo.toml`, `Cargo.lock`, `.cargo/config.toml`, `rust-toolchain.toml` and the
  recipe's tool pins, and the sha256 of every `gen/` file, and compares both with
  `gen/SOURCE_SHA256`. A new build input outside that list (a `build.rs`, say) must be added to
  `tools/gen-stamp.sh`. A vitest smoke in `libs/ts/weal-engine` also loads the real wasm and
  rolls a seeded `2d6`, guarding a corrupt artifact.
- **wasm stack sizing:** the 256-frame recursion cap needs an 8 MiB stack under wasm32
  (`-C link-arg=-zstack-size=8388608`), target-scoped in `.cargo/config.toml` so it applies no
  matter who invokes cargo and native builds are untouched.

## The oracle (icepool cross-check)

`tests/dist_oracle.rs` asserts **exact weight equality** on 32 constructions (NdM sums, kh/kl
incl. middle/negative keep-tuples, weighted `dm`, mixed denominators, explode, `4d6e2kh3`,
successes, comparisons-as-`Die[Bool]`) against fixtures generated by the REAL Python icepool:

```
cd libs/rust/weal-engine
uv run --script tools/gen_oracle.py
```

The script declares its icepool pin inline (PEP 723: `icepool==2.2.2`, upstream commit `33e7e650`),
so `uv` fetches it on any machine, and it emits both `fixtures/oracle.json` (human-readable record) and
`fixtures/oracle_gen.rs` (a dependency-free Rust array the test `include!`s — serde isn't a test
dependency). **Regenerate only when adding oracle cases or deliberately moving the icepool pin**;
a semantics change in `dist/` should make the existing fixtures FAIL, not prompt a regen.

## Running the tests

```
just weal-engine-rust
```

This is the CI job of the same name (path-filtered on `libs/rust/**` and `gen/`; ADR 0027), and
`just ci` runs it too. It runs, in the crate dir, `cargo fmt --check`, `cargo clippy
--all-targets -- -D warnings`, `cargo clippy -- -D warnings -D clippy::unwrap_used` (library code
may not unwrap; tests may) and `cargo test`. `cargo test` runs
the unit suites plus `tests/`: parser/lexer goldens, parse recovery, printer round-trip
properties, the typechecker accept/reject suite, elaboration, the dist property tests
(denominator invariants, keep-1 ≡ pool recursion), the oracle, seam end-to-end, the §3 seeded
render goldens, the api JSON contract (incl. the plot label-pixel golden), the stored-saves
fixture `tests/saves_fixture.rs` (saves are `[name, source]` rows of weal source text;
`fixtures/saves_v1.json`, recorded from the pre-weal-5c engine, pins what `save(...)` prints and
how those rows load and behave, byte for byte; never regenerate it to make the test pass), and the generative
suite `tests/generative.rs`. That suite builds random well-typed programs (rich in nullary and
one-parameter functions, closures and folds) from a seeded generator, and checks each one: the
printer round trip, acceptance at the predicted type, `ok:true` with no `internal error:` and no
panic, the exact value for `Num` programs, a rolled total inside the generator's bounds for die
programs, and a nullary save that round-trips through `save(…)`. It runs 400 cases per property
in about two seconds. A failure prints the program and its seed; rerun one case with
`WEAL_GEN_SEED=<seed> WEAL_GEN_CASES=1 cargo test --test generative`, or search wider with a
larger `WEAL_GEN_CASES` (20,000 run clean in release mode on 2026-10-23).
`cargo run --example dump` prints token streams + lowered ASTs for the golden inputs. The TS
side: `pnpm --filter @astra/weal-engine test` (wasm smoke) and the weal-bot suites run the real
committed wasm.

## Fuel / budget model (D32-12)

All compile-time consts; exhaustion is a visible `stage:"fuel"` error naming the counter. The
wasm `budget` argument scales interpreter steps ONLY (non-zero = the absolute step budget).

| Counter | Default | Where |
|---|---|---|
| interpreter steps | 2,000,000 | `fuel.rs` (`INTERP_STEPS`) |
| recursion depth | 256 | `fuel.rs` — the interpreter's `eval` frames; counts expression nesting AND closure applications, so it catches `let f(x) = f(x)` |
| pool count (construction cap) | 10,000 | `fuel.rs`, checked before allocation |
| `repeat` list length (construction cap) | 10,000 | `fuel.rs` (`check_list_len`, the pool-cap constant), checked before allocation |
| explode depth (construction cap) | 8 | `fuel.rs`, checked before allocation |
| DP transitions (+ `comb_row` cells) | 1,000,000 | `dist/budget.rs` |
| concurrent DP state-map entries | 200,000 | `dist/budget.rs` |
| support size per die | 50,000 | `dist/budget.rs` |
| bigint bits per weight | 16,384 | `dist/budget.rs` |

Source nesting is capped before any of these, in the parser (`MAX_NESTING_DEPTH` = 256 syntax-tree
levels, counting left-associative chains such as `1 + 1 + …`). A deeper source is a single
`stage:"fuel"` error, `fuel exhausted: nesting depth: …` (a `CompileStage::Limit` in the pipeline):
it is code, just too big, so the bot shows it like any other cap. Every later stage
recurses on the tree, so without the cap a paren bomb overflows the host's stack (V8's, under Node)
and traps before fuel can stop it.

(The spec's ninth counter — render nodes 10,000 — was not shipped as a counter; render size is
bounded by the ≤900-char collapse policy instead.)

## Traps

- **The root `.gitignore` ignores every `dist/`.** A negation entry re-includes this crate's
  `src/dist/`; any new source directory named `dist` needs its own negation.
- **plotters cannot render text on wasm32.** Its `ab_glyph` font backend is compiled out on
  `wasm32-unknown-unknown`, and the web backend it picks instead traps under Node. `plot.rs` lets
  plotters draw geometry only and rasterizes all text with the `ab_glyph` crate over the committed
  font; the `title_label_pixels_are_drawn` test in `plot.rs` guards against blank labels.
- **Deep recursion needs the sized wasm stack.** Without the 8 MiB `-zstack-size` flag in
  `.cargo/config.toml`, the 256-frame recursion cap overflows the default stack before fuel can stop
  it.
- **The TS wrapper owns trap containment.** `libs/ts/weal-engine/src/index.ts` loads the CommonJS
  glue with `createRequire`. When a call traps (a Rust panic, or a stack overflow), it drops the
  possibly poisoned instance, re-instantiates the wasm and returns `{ok:false, stage:"internal"}`
  with a message starting `engine trap:`, so the next call runs on a fresh instance. Callers never
  re-instantiate themselves.
- **Some adversarial inputs are slow before fuel stops them.** Realistic macros run in 15 ms or less,
  but `1000d1000` takes about 1.7 s to exhaust the `states` counter. Retuning a budget means a
  rebuild of the committed wasm.
