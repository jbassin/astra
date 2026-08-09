# 0032 — weal v2: dice language + engine + roll presentation (spec)

**Status:** FINAL after the adversarial pair (language/engine lens: 5 blockers + 6 majors;
integration/deploy lens: 1 blocker + 10 majors; all folded below, overlaps merged; minors batched
in). Ready to build.
**Scope doc:** `thoughts/shared/research/2026-08-08-weal-v2-0032-thoughts.md` (R1–R25 all resolved)
**Out of scope:** hosts/flavor banks/roster/seed-as-UI/speak API/webhook identity (0009, unchanged);
joint multi-pool evaluators (R18); user-programmable output formatting (R2); browser-side wasm reuse
(register). The v1 TS roller (`apps/weal-bot/src/roller/`) is REPLACED wholesale; v1 `funcs` rows do
not migrate (R21).

## 1. Product

A rostered player types a weal v2 expression in Discord; the bot replies with a host embed showing a
**concise roll trace** (intermediate die faces at their sites, labels, collapse of die-free math), or
a **distribution plot PNG** for `plot(…)`, or a readable **save confirmation**. The language is a
small strict, inferred, expression-based functional language; dice are exact distributions computed
by an icepool-style engine in Rust compiled to WASM. Parse failures stay silent (chat noise);
type/eval errors get a visible reply (R9) — gated so ordinary chat can never trigger one (D32-14).

## 2. Decisions

### Language

- **D32-1 — Lexical.** Comments `(* … *)`, nestable, anywhere. Insignificant whitespace.
  Ident `[a-z][a-zA-Z0-9_]*`; reserved: `let`, `match`. Atom `:` + `[a-z][a-z0-9-]*` (kebab in
  atoms only). Num `[0-9][0-9_]*` (arbitrary precision). Dec `[0-9][0-9_]*\.[0-9][0-9_]*`
  (fixed-point 19.6: i128 scaled 10^6; enforced range ±10^19 — any op leaving it = visible eval
  error, checked post-op). Float = Dec form + `f` (f64). Str `"…"` (`\"` `\\` `\n` only). Unit
  `()`. **Die token (review B3 — one fat token):**
  `([0-9][0-9_]*)?d[0-9][0-9_]*([a-z]+[0-9]*)*` — die literal + optional suffix run lex as a
  SINGLE logos token with priority over ident; the parser splits it into (count, sides,
  suffix-chain). So `d6`, `4d6kh3`, `d6kh3`, `2d6e2r1` all lex correctly and an identifier can
  never shadow a die form. Count/sides validity (count ≥ 1, sides ≥ 1) checked at construction →
  visible eval error. Tokenizer = **logos**; CST = **rowan** (lossless, trivia preserved —
  span-carrying errors + future formatter).
- **D32-2 — Grammar (expression language).**
  ```
  expr     := let | match | lambda | binop
  let      := "let" pattern annot? "=" expr ";" expr          (";" is OCaml's "in" — R12)
             | "let" ident "(" params ")" annot? "=" expr ";" expr   (function sugar; D32-3 recursion)
  pattern  := ident | "_" | "{" pattern ("," pattern)* ","? "}"
  annot    := type-name (Num | Dec | Float | Str | Atom | Bool | …)
  match    := "match" expr ("|" mpat "->" expr)+
  mpat     := "-"? num-lit | "-"? dec-lit | str-lit | atom | ident | "_"
             | "{" mpat ("," mpat)* ","? "}"                  (negative literals allowed — review)
  lambda   := "|" params "|" expr
  binop    := precedence climb: cmp(1) < add,sub(2) < mul,div(3) < unary-neg(4)
              < postfix(5: call "(args)", label "[word]", die-suffix chain)
  atom-expr:= literal | die-tok | ident | "(" expr ")" | list | dict | tuple
  list     := "[" (expr ("," expr)* ","?)? "]"
  dict     := "[:]" | "[" expr ":" expr ("," expr ":" expr)* ","? "]"
  tuple    := "{" expr ("," expr)* ","? "}"
  ```
  `[` fork: parse `[:]` → empty dict; else parse first expr, dispatch on `:`. Comparison CHAINS
  (`a < b < c`) parse fine and are rejected at TYPE stage (visible span reply — a parse-stage
  rejection would be silent per R9; review m6). Nested `match` arms bind to the NEAREST match
  (parenthesize to break out); arm-`|` vs lambda-`|` disambiguated by lookahead (`|` pattern `->`
  vs `|` params `|`). Placeholders (pinned, review m4): each `_` in call-argument position binds
  to the smallest enclosing syntactic argument expression; `_`s sharing that argument form ONE
  lambda with params in occurrence order (`twice(_ * 2, 3)`; `f(_ + _)` = `f(|a,b| a+b)`;
  in `f(_ + g(_))` the inner `_` belongs to `g`'s argument). `_` anywhere else (outside patterns)
  = parse error.
- **D32-3 — Types + inference.** Rank-1 HM with let-generalization; NO user aliases, NO recursive
  types, NO row polymorphism (closed feature set). Types: `Unit, Num, Dec, Float, Str, Atom,
  Bool, Tuple{…}, List[T], Dict[K,V], Die[T], Pool[T], A -> B` (curried).
  **Singleton-atom unions (R14), algorithm pinned (review M1):** `:fire` : `:fire`; unions join
  ONLY when unifying two ground atom/union types; variance is declared per constructor position —
  all covariant EXCEPT the function domain (contravariant: joins there take set INTERSECTION;
  empty intersection = type error — never widen a param, it's unsound); a lambda param matched
  against atom patterns infers the EXACT union of the arms' atoms (a wildcard arm keeps it a
  fresh var); unions generalize as-is at `let`. `Bool = :true | :false` predefined; subsumption =
  subset widening, one-directional. Exhaustiveness + redundancy on singleton/union/Bool
  scrutinees; `Atom`/`Num`/`Str`/`Dec` scrutinees need a wildcard/binder arm; tuples recurse.
  **Recursion (review M2):** the `let f(params) = …` sugar puts `f` in scope in its own body,
  MONOMORPHIC within it (generalized after); the plain `let f = |…| …` form does NOT (no
  `letrec`). Nontermination is the fuel counter's job.
  **Comparisons:** `> >= < <=` on Num/Dec/Float/Str (same type both sides) → `Bool`, PLUS the
  lifted overloads (review B5): `Die[Num] ⊗ Die[Num] → Die[Bool]` and die⊗num/num⊗die — the
  product construction. `==`/`!=`: structural on non-function, non-die types; on ANY die operand
  = LIFTED (`Die[Bool]`) — structural die equality is not exposed. No implicit numeric mixing
  (R6). No match guards in v2.0. **Equatable constraint (review m7):** Dict keys and evaluator
  states must be function-free — checked post-unification on the RESOLVED type at instantiation
  sites (deferred while a type variable), so wrappers around `evaluate` still check.
- **D32-4 — Dice + pools.** `Die[T]` = exact distribution + **an explicit face-order vector**
  (review B1 — the BTreeMap key order is the DP's business; goodness, `evaluate` iteration, and
  render read the face-order vector). Face order: `NdM` numeric ascending; `dl` = list order
  (R4); `dm` = dict-LITERAL insertion order — pinned SYNTACTICALLY (review m8): when `dm`'s
  argument expression is itself a dict literal; any other dict value falls back to face sort
  order (documented). Mixture/binary-op face order = left operand's order, then unseen right
  faces in their order. `Pool[T]` = (count, Die[T], keep-tuple); `pool(Num, Die[T])`; count
  capped (D32-12). **Sum coercion (review B2):** the checker inserts `sum : Pool[Num] → Die[Num]`
  at EVERY position demanding a die/number-ish type, not just display — `2d20kh1 + 7` and
  `4d6kh3 + 2` type-check; `Pool[T≠Num]` outside a pool-consuming position = targeted type error
  ("this pool's faces aren't summable — use evaluate()"). Arithmetic `+ - * /` on `Die[Num]`
  builds the symbolic render tree; distributions combine by product; unequal denominators via
  weighted-lcm; div-by-zero (incl. in support) = visible eval error.
- **D32-5 — Die-suffixes (type-directed, R8; lowering keeps the pool OPEN — review B4).** The
  parser splits the fat die token's suffix run: longest `[a-z]+` = name, following digits = Num
  arg. Resolution at type-check against prelude + saves. Shapes: **pool-shape**
  `Pool[T] -> Num -> Pool[T]` applies to the pool (`kh`/`kl` return a re-kept `Pool`);
  **die-shape** `Die[T] -> Num -> Die[T]` maps the pool's UNDERLYING die, count preserved:
  `NdM s a → pool(N, s(dM, a))` — still a `Pool`. Chains lower left-to-right over the open pool;
  the D32-4 coercion inserts `sum` only where the chain's result meets a die-demanding position.
  `4d6e2kh3` = `kh(pool(4, explode(d6, 2)), 3)`; `2d6e2r1` rerolls face 1 of each exploded d6.
  A name instantiable as BOTH shapes: pool-shape wins (pinned). Digit-less suffix (`4d6kh`) =
  type error (every suffix takes its Num). Suffix names are `[a-z]+` only — an underscore-named
  save is callable but not suffix-eligible (recorded). Unknown name / wrong shape = TYPE error
  (visible), never parse.
- **D32-6 — Labels (R13).** `expr[word]` postfix on die-typed expressions; `word` = ident-charset
  `[a-z][a-z0-9_]*` (NO kebab — a context-free lexer can't scope `-` to brackets; review M3;
  atoms keep kebab). Render-only (`Die[T] -> Die[T]`).
- **D32-7 — Effects.** `roll`, `plot`, `save` are Unit builtins legal only OUTSIDE evaluator
  closures — RUNTIME guard (visible eval error), not an effect type system (v2.0 simplification,
  recorded; the S2 suite types the closure's shape, the S3 suite tests the guard — review m12).
  Top-level display: final value if displayable — Die (rolled; a bare `Pool[Num]` display
  auto-sums via the D32-4 coercion), Num/Dec/Float/Str/Atom ("invented" flow), List/Tuple of
  displayable (flattened, one display each); Unit/closures silent. `roll(…)` appends displays.
- **D32-8 — User evaluators (R17).** `evaluate(Pool[T], S, S -> T -> Num -> S) -> Die[S]`;
  transition closure interpreted inside the DP loop (whole interpreter lives in the wasm module).
  States = weal values, structural eq/hash; the equatable check per D32-3. Iteration =
  **descending SORTED order** *(amended at S4 build: the keep-tuple mechanism is defined over
  sorted positions, so sorted order is the only coherent iteration; for non-numeric faces the
  engine bakes the face-order rank into the sort key, so atom dice iterate in descending
  face-order — the original "face-order vector, reversed" wording holds for atoms and `NdM`,
  and diverges only for `dm` with out-of-insertion-order numeric keys, where numeric order is
  the correct semantics)*, pinned + documented.

### Engine

- **D32-9 — Crate.** `libs/rust/weal-engine/` (R23): standalone crate, `rust-toolchain.toml` pin
  (exact stable recorded at S1), committed `Cargo.lock`. Layout: `lexer.rs`, `cst.rs`,
  `ast.rs`+`lower.rs`, `types.rs`+`infer.rs`, `value.rs`+`interp.rs`, `dist.rs`, `render.rs`,
  `plot.rs`, `api.rs`. Deps: `logos`, `rowan`, `num-bigint`, `wasm-bindgen`, `serde`+
  `serde_json`, **`plotters` with `default-features = false` + `ab_glyph` + bitmap backend**
  (font-kit/system fonts don't exist under wasm32 — review M3-integration) + ONE embedded TTF
  registered via `register_font` (font file committed in the crate; license-checked), `png`,
  `rand_chacha`+`rand_core`. NOT `getrandom` (entropy injected).
- **D32-10 — Distribution core.** Per the verified icepool digests: distribution =
  `BTreeMap<Face, Weight>` + the D32-4 face-order vector; `Face` = ordered enum
  `Num(BigInt) | Dec(i128) | Atom(u32 interned; ORDER comes from the face-order vector, never
  the intern id) | Bool`; `Weight` = `u128` fast path, checked promotion to `BigUint`. Port:
  binary/unary cartesian ops; weighted-lcm mixture; pool recursion (pop-extreme + `comb_row` +
  keep-tuple + per-room memo) with `skip_weight` dump + more-zeros direction heuristic; keep-1
  closed forms; explicit GCD simplify; mean/std exact-rational → Dec strings (numeric faces
  only — null otherwise). SKIP: expression DAG, Deck/hypergeometric, Again/Markov,
  Vector/Symbols, further order negotiation. `explode(die, depth)` / `reroll(die, faces)` /
  `r`-suffix (single-face reroll-once) = bounded die-level expansion/substitution.
- **D32-11 — WASM API (the single seam).** wasm-bindgen `--target nodejs`, ONE export:
  `evaluate(source: string, saves: string /*JSON [[name, source]] in id order*/, seed:
  Uint8Array /*32B*/, budget: u32 /*0 = default*/, mode: string /*"run" | "check"*/) -> string`:
  ```json
  { "ok": true,
    "displays": [{ "kind": "die",
                   "renderText": "2d8 ⟪3,7⟫[fire] + 1d6 ⟪2⟫[slashing] = 12",
                   "value": {"t":"num","v":"12"},
                   "headline": "12",                        // ≤ 80 chars, in-engine ellipsis
                   "goodness": "good",                      // crit|good|okay|bad|fumble|null
                   "standardDice": [[8,3],[8,7],[6,2]] },
                 { "kind": "value", "headline": "…", "renderText": "…" }],
    "plots":    [{ "pngBase64": "…", "title": "4d6kh3", "mean": "12.244598", "std": "2.847077" }],
    "saves":    [{ "name": "smite", "source": "let bonus = 3;\n|x| x + bonus" }],
    "warnings": [] }
  { "ok": false, "stage": "parse" | "type" | "eval" | "fuel" | "prelude",
    "message": "…", "span": {"start": 12, "end": 15}, "preludeName": "smite" }
  ```
  Pins (review m11 + M8-integration): `mode:"check"` parses/type-checks WITHOUT executing (the
  boot-validation path — no dice roll at boot); a bad SAVES entry during a normal run =
  `stage:"prelude"` + `preludeName` + span into that save's source; `budget` is passed by the
  bot (0 = default); `warnings` is reserved (bot ignores; forward-compat); `plots[].mean/std`
  nullable (atom faces); saves compilation is fuel-EXEMPT (bounded by row count; recorded);
  `goodness: null` when the top-level die's support has one face or the display isn't a die —
  bot renders no Crit/Fumble tag and draws from the `okay` bank. Entropy: ChaCha20 from the 32
  host bytes (crypto.randomBytes prod / fixed in tests → deterministic goldens). Goodness
  in-engine from the face-order vector: first face = fumble, last = crit, thirds by position
  between (R24). `standardDice` = EVERY sampled NdM face — kept, dropped, and explosion-chain
  rolls alike (v1-compatible; review M6). Engine recursion (parser/checker/interp) is
  depth-capped (256) → `stage:"fuel"`, and the TS wrapper catches any residual wasm trap and
  synthesizes `stage:"fuel"` (review m14).
- **D32-12 — Fuel (R19).** In-engine counters: interpreter steps (2,000,000), DP transitions
  (1,000,000), state-map entries (200,000), support size per die (50,000), bigint bits per
  weight (16,384), render nodes (10,000), **plus construction caps checked BEFORE allocation**
  (review M4): pool count ≤ 10,000, explode depth ≤ 8, recursion depth 256. Exhaustion =
  `stage:"fuel"` + which counter. Compile-time consts, tuned at S7; `budget` scales interpreter
  steps only.
- **D32-13 — Committed artifact + pnpm member (R22).** `just weal-engine-build`: `cargo build
  --release --target wasm32-unknown-unknown` + `wasm-bindgen --target nodejs` + **`wasm-opt -O2`
  HARD-REQUIRED at a pinned version** (recorded in the recipe; no "if present" — committed bytes
  must be machine-independent; review m5) → committed under `libs/ts/weal-engine/` = pnpm member
  `@astra/weal-engine`. **The glue is CommonJS (review M1-integration):** commit
  `gen/package.json` `{"type":"commonjs"}`; the hand-written ESM `src/index.ts` wrapper loads it
  via `module.createRequire(import.meta.url)` (bypasses Node-ESM parsing AND vitest's transform),
  types via `import type` from `gen/*.d.ts` (`skipLibCheck` keeps tsc off the generated d.ts).
  Member has typecheck/test/build scripts (vp coverage stays 100%). Lint/format: add
  `**/weal-engine/gen/**` to `.oxlintrc.json` AND `.oxfmtrc.json` `ignorePatterns` (review m2 —
  that's where ignores actually live). **NO Dockerfile ripple** (review M2-integration: all 15
  app Dockerfiles `COPY libs/ts ./libs/ts` wholesale — the ripple convention is for `apps/*`
  members only); prove with one weal-bot image build. Update the stale "21 members" comment in
  `ci.yml` (→ 22). One vitest test loads the real wasm + rolls seeded `2d6` (guards a
  stale/corrupt artifact in CI without cargo). Cargo tests local-only (register: CI drift job).

### Bot surface

- **D32-14 — Roller swap.** `apps/weal-bot/src/roller/` DELETED; surviving consumers rewired
  (review M5-integration): a new small `src/rng.ts` keeps the `choose`-style flavor RNG
  (handler/hosts/gateway line picks); `HandlerDeps` gains `seed(): Uint8Array` (crypto in
  gateway, fixed in tests); `hostSays`/embed builders take `goodness` directly (engine-computed);
  `diceToPersist` re-typed to consume `standardDice` pairs. `src/engine.ts` wraps
  `@astra/weal-engine`: classification (`trimContent`, `reseed()`, every-message-candidate)
  unchanged; `doRoll` → `evaluate(text, saves, seed(), 0, "run")`.
  **Error visibility + the noise gate (review B1-integration):** `stage:"parse"` = silent.
  Type/eval/fuel/prelude errors are visible ONLY if the source contains at least one of: a die
  token, `let`, `match`, an operator, or a call/reference to a known prelude-or-saved name —
  a bare unknown identifier (`lol`, `brb`) or bare atom (`:p`) stays SILENT. Visible error =
  Knife host, title `that didn't check out`, description = engine message + span excerpt in a
  code fence (fence delimiter lengthened past any backtick run in the excerpt; review m3),
  `weal.v2.errors{stage}` counter. **Panic containment (review M6-integration):** engine.ts
  wraps every call in try/catch — a wasm trap/panic → visible "engine fault" reply, WARN log
  (NEVER ERROR — Class-A pages on ERROR), `weal.v2.errors{stage:"panic"}`, and the wasm module
  is RE-INSTANTIATED (post-panic state is undefined; doubles as the memory high-water release).
- **D32-15 — Roll embed.** Die display: title `{characterName}: {headline}` + `[Crit!]`/
  `[Fumble!]` (headline ≤ 80 in-engine; goodness null → no tag, okay bank); description =
  flavor line (all five banks live, R24); field `Results: {renderText} = \`{headline}\`` —
  renderText ≤ 900 in-engine, PLUS a defensive bot-side truncate to Discord's 1024-char field /
  256-char title limits with a boundary unit test (review M7-integration). Str faces and any
  engine-rendered user text are markdown-escaped in renderText (backtick runs, `*`, `~~`, `_`;
  review m3). Non-die displays keep the Knife "invented" flow `{source} = \`{headline}\``.
  Multiple displays = multiple embeds. Saves: Knife `{name} saved!` + source in a weal fence.
- **D32-16 — Plot embed.** `plot(die)` → GSR embed, image via `attachment://plot.png` —
  `OutgoingMessage` gains an optional `files` field and `sendEmbed` forwards it (webhooks
  support files; the seam change is named here — review m7). Title = die repr; fields mean/std
  (or "—" for atom faces). Plot-only scripts persist nothing and skip the overlay broadcast.
- **D32-17 — Persistence.** `dice` table + guards UNCHANGED (MAX_POOL 30 applied to the
  display's `standardDice` row count, MAX_BASE 100 per die); rows = `standardDice` (all sampled
  NdM faces incl. dropped/explosion — D32-11; dl/dm/atom dice contribute none, R20); only
  roll-resolving scripts write. **Saves: `funcs_v2(id bigserial primary key, name text not null,
  source text not null)`** — DDL appended to the idempotent `SCHEMA` in `db.ts` (run by
  `ensureSchema()` at boot), loaded `ORDER BY id`, latest-per-name wins by map overwrite
  (review M4-integration). **Boot algorithm:** validate rows in id order — each row
  `evaluate(row.source, priorValidRows, zeroSeed, 0, "check")`; a failing row is SKIPPED with a
  WARN log (never pages, never crashes boot); the runtime save-set is exactly the validated
  list. v1 `funcs` kept as a dead archive.
- **D32-18 — Overlay/dice-feed.** Payload keeps the v1 numeric shape; adds `display: string`
  (the headline) — atom rolls send `display` with `total: 0` + goodness-derived flags. The
  `expression` field carries the PLAIN SOURCE TEXT (never renderText — OBS would show raw
  `~~`/`⟪⟫`; review m1). Overlay change = `RollEvent`+`parseRollEvent` (schema.ts), `ticker.ts`,
  `RollRow.tsx` render `display` when present (~3 files, in scope). Dice-feed line uses
  `headline`.
- **D32-19 — Prelude (R25 + core).** Weal source compiled into the engine, self-checked by a
  cargo test: `kh(p, n)` / `kl(p, n)` (pool-shape) · `sum(p)` · `pool(n, d)` · `dl` · `dm` ·
  `evaluate` · `label` · `explode(d, depth)` (die-shape; suffix `e`) · `reroll(d, faces)` ·
  `r`-suffix (die-shape single-face reroll-once) · `successes(p, target)` · `min`/`max` (Num +
  Die[Num]) · `dec`/`float`/`num`(truncating)/`round`/`floor`/`ceil`/`abs` · `roll`/`plot` ·
  **`save(name: Atom, value: T)`** — the atom must match the IDENT regex (no kebab: `:my-macro`
  would be unreferenceable) → visible eval error otherwise (review m10). Saved fns with
  matching shapes are suffix-eligible (`[a-z]+` names only, D32-5). `dl`/`dm`/`evaluate` are
  LEAF CONSTRUCTORS in the render tree (bespoke reprs, exempt from function transparency —
  review m13).
- **D32-20 — Telemetry.** Existing plumbing stays; add `weal.v2.errors` (attr `stage`, incl.
  `panic`) + `weal.v2.fuel_aborts`; roll span gains `weal.goodness` + `weal.engine_ms`. No new
  services; no config.kdl changes.

## 3. Render tree + worked examples (the S5 contract)

Leaves = die literals + the constructor leaves (`dl`/`dm`/`evaluate`, bespoke reprs); nodes =
operators, suffix applications, labels. Faces attach at sample time; leaves sample left-to-right
in source order. Policy, applied in order until ≤ 900 chars: (1) die-free subtrees collapse to
their value; (2) user function application is TRANSPARENT (no call-site node — labels name
things; constructor leaves exempt); (3) pools show faces with dropped dice struck through;
(4) beyond depth 4 or the cap, innermost subtrees collapse to `{label-or-dice-summary} = value`;
(5) floor: `= value`. Pinned examples (seeded goldens at S5):

| Input | Render |
|---|---|
| `d20 + 7` | `d20 ⟪14⟫ + 7 = 21` |
| `2d20kh1 + 7` | `2d20 ⟪17,~~3~~⟫kh1 + 7 = 24` |
| `4d6kh3` | `4d6 ⟪5,4,~~1~~,4⟫kh3 = 13` |
| `2d8[fire] + 1d6[slashing]` | `2d8 ⟪3,7⟫[fire] + 1d6 ⟪2⟫[slashing] = 12` |
| `let smite(n) = sum(pool(n, d8)) + 5; smite(3)` | `3d8 ⟪2,7,4⟫ + 5 = 18` |
| `dl([:fine, :good, :great])` | `dl(:fine,:good,:great) ⟪:good⟫ = :good` |
| `2d6e2` | `2d6e2 ⟪5,6→3⟫ = 14` (explosion chains `face→face`) |
| `d20 + 3*2` | `d20 ⟪14⟫ + 6 = 20` |

`evaluate()` renders `evaluate(NdM) ⟪sampled pool faces⟫ = state-value`.

## 4. Slices (sonnet engineers unless noted; each CI-green + committed)

- **S1 — crate scaffold + syntax.** Crate (toolchain pin, Cargo.lock), logos lexer (fat die
  token w/ priority), rowan CST parser (recoverable, spans), AST lowering, suffix-chain split,
  placeholder + label + `[`-fork + nested-match parsing, pretty-printer (R21 serializer;
  round-trip property `parse(print(v)) == v`). Goldens incl. `d6`, `d6kh3`, `[:]`, `[1, 2, 4]`,
  nested match, `f(_ + g(_))`. Pure cargo — both repo lanes untouched (prove by running them).
- **S2 — type checker.** HM + union lattice per D32-3 (variance, domain-intersection joins,
  arm-pattern param inference, monomorphic recursion, equatable-deferred, lifted die
  comparisons, sum coercion, suffix resolution both shapes + pool-wins + digit-less error,
  comparison-chain rejection). Accept/reject ≥ 60 cases incl. `:ture` unreachable, missing-arm,
  mixing violations, `2d20kh1 + 7` ACCEPTS, `dl([:a]) == dl([:a])` lifts, Pool[Atom] misuse
  message, evaluator-state closure rejection at instantiation.
- **S3 — values + interpreter + prelude.** Values (structural eq/hash), closures/currying,
  fuel counters + construction caps + depth cap, effect runtime guard, save serialization
  (capture → `let`s) + name validation, prelude source + self-check. Tests: semantics suite,
  fuel/giant-pool/depth aborts, effect-in-evaluator, capture round-trips.
- **S4 — distribution engine.** D32-10 port (face-order vector threading incl. mixtures) +
  explode/reroll/successes + property tests (denominator invariants, support bounds, keep-1 ≡
  pool recursion) + **icepool oracle fixtures**: `fixtures/oracle.json` generated once by
  `tools/gen_oracle.py` against `/home/jbassin/icepool` (`33e7e650`; script + regen doc
  committed) — exact weight equality on ≥ 25 cases (NdM sums, kh/kl incl. middle/negative
  keep-tuples, dm weighted, mixed-denominator, explode, `4d6e2kh3`, successes,
  comparisons-as-Die[Bool]).
- **S5 — render + plot + wasm + member.** Render tree/sampling/collapse + §3 goldens (seeded) +
  markdown escaping + headline cap; plotters (`ab_glyph`, embedded font) PMF chart → PNG
  (800×450, atom labels; a golden asserts label PIXELS are drawn — blank-text regression);
  goodness incl. null cases; `api.rs` (mode/check, prelude-stage attribution, trap-safe);
  `just weal-engine-build` (pinned wasm-opt); committed `libs/ts/weal-engine/` member (CJS
  gen/package.json + createRequire wrapper + rc-file ignores + wasm smoke vitest + ci.yml
  comment). NO Dockerfile edits; prove with one weal-bot image build.
- **S6 — bot integration (TS).** D32-14..18: engine.ts (noise gate, panic catch +
  re-instantiate, seed dep), rng.ts relocation + roller/ deletion (grep-proven no dangling
  imports), error replies (fence-safe), plot files seam, funcs_v2 DDL + ordered boot-load +
  skip-on-stale, defensive embed truncation + boundary test, overlay 3-file change + plain
  `expression`, dice-feed headline, telemetry adds. Vitest on the REAL wasm (seeded): handler
  suite, error-reply goldens, noise-gate cases (`lol`, `:p` silent; `lte x = 4` visible),
  panic fixture → WARN + reply, funcs_v2 load/skip, persistence guards.
- **S7 — deploy + live acceptance (orchestrator).** `just up` weal-bot + overlay; live gates
  D–F; fuel tuning vs real macros (record worst-case wall time — sync evaluate blocks the
  gateway; review m6); READMEs (`apps/weal-bot/README.md` language guide;
  `libs/rust/weal-engine/README.md` build/regen/oracle); **CLAUDE.md + CONTRIBUTING.md charter
  amendment (the Rust engine lane — review M9)**; RESUME/memory checkpoint; §6 build record.

## 5. Acceptance gates

- **A** Cargo: `cargo fmt --check && cargo clippy -- -D warnings && cargo test` green at HEAD
  (recorded — no CI lane, R22).
- **B** Both repo CI lanes green locally (pnpm incl. member + wasm smoke; uv run to prove
  untouched).
- **C** Oracle fixtures exact; §3 goldens byte-exact under the fixed seed; printer round-trip
  property; plot label-pixel golden.
- **D** Live Discord: `d20+7` trace + goodness; `2d20kh1 + 7` (the coercion case); `4d6kh3`
  strikethrough; label roll; atom-die roll (title atom, overlay `display`); type-error reply w/
  span; **`lol` and `:p` produce NO reply** (noise gate); parse failure silent; `save` → source
  embed → callable + suffix-eligible next message; fuel abort on `10000d10000`; plot PNG w/
  mean/std; a giant-Str-face roll stays within embed limits (truncation path).
- **E** Persistence + boot: `dice` rows only for standard-dice cases (atom/dl rolls write
  none; dropped dice DO write); `funcs_v2` populated; v1 `funcs` untouched; **bot restart →
  saved fn still callable; one hand-inserted stale row skipped with exactly a WARN, no page**
  (review M10).
- **F** SigNoz: existing weal spans/counters + `weal.v2.errors`/`weal.v2.fuel_aborts` visible;
  0 ERROR logs in the deploy window (stale-save + panic WARNs excluded by design).
- **G** Docs + charter amendment + checkpoint per S7.

## 6. Build record

- **S1** `798f8e3` (sonnet): crate + logos lexer (fat die token w/ priority) + rowan lossless CST
  + recoverable parser + AST/lowering (placeholder desugaring, suffix split) + canonical printer;
  54 tests; toolchain pinned stable 1.96.0. Spec gap closed in-slice: a `TYPE_NAME` token
  (D32-2's `annot` needed it, D32-1's list omitted it).
- **S2** `bc8049d` (sonnet): checker + elaborator per D32-3/4/5 — union lattice w/ contravariant
  domain intersection, exhaustiveness/redundancy (Maranget usefulness), sum coercion, both-shape
  suffix resolution (pool-wins), monomorphic recursion, equatable-deferred; CoreExpr contract +
  parallel SpanTree (the S1 span gap closed without touching AST equality); 146 tests total.
  In-envelope calls recorded in module docs (two-var arithmetic defaults Num; `4d6kh3e2` ≡
  `4d6e2kh3` — the suffix classes commute in the pool representation).
- **S3** `500179f` (sonnet, resumed cleanly after a session-limit kill): values + symbolic
  DieTree + interpreter (currying, captures, monomorphic recursion) + fuel (incl. construction
  caps + depth 256) + effect guard + native prelude w/ prelude_types drift test + the R21 save
  serializer (capture→`let`s, prelude-collision renames); 231 tests total. Keeps live on
  `PoolTree.keep` (window chain), not Kh/Kl tree nodes — (count, die, keep) recoverable as
  pinned. Flag for S5: depth-256 needs a sized wasm stack (debug frames overflowed a 2 MiB
  test thread).
- **S4** `a060c4b` (sonnet, worktree, resumed after the same kill; merge `cd70b41`): the icepool
  port — Weight u128→BigUint, Dist w/ explicit face-order vector, pool DP (comb_row cache,
  keep-tuples incl. negative, room memo, skip_weight w/ the count-0 contract, lo_hi_skip),
  keep-1 closed forms (property-proven ≡ pool recursion), explode/reroll (laws verified against
  icepool source), successes, exact mean/std; Budget w/ D32-12 defaults (transitions also meter
  comb_row cells). **Oracle: 32/32 exact** vs Python icepool v2.2.2 `33e7e650` (gate C half
  met at S4). 193 tests in-worktree. **D32-8 AMENDED** (see the decision): eval_pool iterates
  descending SORTED order; rank-baked non-numeric faces make that ≡ face order. Repo trap
  fixed at merge: root `.gitignore`'s unanchored `dist/` swallowed `src/dist/` — negation added.
- **S4b** `52c8984` (sonnet): dist_seam wired — Face enum (rankless numeric / rank-baked
  Ranked), every DieTree kind lowered, keep-chain→single-KeepTuple (5d10kh3kl1 ≡ middle
  window proven), evaluate() end-to-end through the language (binomial over `dl([:hit,:miss])`,
  kept-pool count-0 contract, effect-guard surfacing), Cmp face order forced `[:false,:true]`,
  SeamDist accessor surface for S5 (plain-Value faces; Dec-face mean/std included); Budget
  fresh-per-call (S5 wires the wasm budget); 319 tests total. Callback amended to 4-arg
  (per-node evaluator funcs — nested evaluate support).
- **S5** `7875cbb` crate half + `e09695f` member half (sonnet): render.rs (ChaCha20 seeded
  sampling, keep-window strikethrough, `face→face` chains, §3 collapse policy incl. depth-4 +
  900-char progressive collapse, markdown escaping, headline ≤ 80, goodness thirds-by-position;
  goldens under seed `[77u8; 32]`; recorded deviation: count-1 dice render `d6` not `1d6`);
  plot.rs (**recorded DEVIATION from D32-9's letter:** plotters 0.3.7 cfg-OUTS the ab_glyph
  backend on wasm32 and hard-selects a browser-DOM backend — a Node trap — so plotters draws
  geometry only and text is rasterized directly via ab_glyph over the one embedded
  DejaVuSans.ttf; identical pixels native/wasm; label-pixel goldens guard blank text; base64
  hand-rolled); api.rs per D32-11; `.cargo/config.toml` wasm32 `-zstack-size=8388608` (the S3
  depth-256 flag, proven via wasm-dis `__stack_pointer`). Member: `just weal-engine-build`
  (wasm-bindgen-cli 0.2.127 + binaryen wasm-opt 124 both HARD-pinned, fails loudly;
  determinism proven — two runs byte-identical, hashes in the commit); committed `gen/` (CJS
  glue + 1.9 MB wasm + `{"type":"commonjs"}` marker); ESM wrapper via createRequire w/
  wasm-trap catch → `{ok:false, stage:"fuel"}`; vitest smoke on the REAL artifact; oxlint/oxfmt
  ignores; ci.yml member count 21→22; NO Dockerfile edits (libs/ts COPY'd wholesale, proven
  with a weal-bot image build). 381 cargo tests total.
- **S6** `40c7dde` (sonnet): the bot swap — engine.ts (noise gate, panic catch +
  `reinstantiate()`, seed dep, `weal.v2.errors{stage:"panic"}`), rng.ts relocation + the entire
  v1 `roller/` DELETED (13 files, −2,440 lines; grep-proven no dangling imports), error replies
  (fence-safe caret spans), plot file seam, funcs_v2 DDL + ordered boot-load + skip-on-stale,
  defensive embed truncation + boundary test, overlay 3-file change (plain `expression`,
  `display` headline), telemetry adds (`weal.v2.errors`/`weal.v2.fuel_aborts` lazyCounters).
  Vitest on the real wasm: 70 tests (handler suite, error-reply goldens, noise-gate cases,
  panic fixture → WARN + reply, funcs_v2 load/skip, persistence guards).
- **S7** `2dd2cea` fix + `2fa5d93` docs + deploy (orchestrator, two sessions): `just up`
  rebuilt + recreated weal-bot/weal-overlay (bot boot 2026-08-09 10:49 UTC — clean connect,
  "loaded 0/0 saved weal v2 sources"). Live rolls in the window found the ONE defect:
  D32-15's literal Results template appended the backticked headline after renderText's own
  trailing `= value` (`…kh3 = 15 = \`15\``) → field now replaces the trailing plain value with
  the backticked one (`2dd2cea`), naive-append fallback kept for tail divergence — D32-15
  clarified to that reading. Docs: `apps/weal-bot/README.md` language guide +
  `libs/rust/weal-engine/README.md` + the CLAUDE.md/CONTRIBUTING.md Rust-lane charter
  amendment (M9). **Fuel tuning (m6) recorded** vs the committed wasm on the deploy host:
  every realistic macro ≤ 15 ms (adv/bless/smite/successes/explode ≤ 8 ms warm); heaviest
  legal case measured `30d20` = 266 ms, `plot(30d20)` = 148 ms; abort paths: `10000d10000`
  222 ms (transitions), explode-depth/recursion < 1 ms, **worst case `1000d1000` = 1.7 s
  hitting the `states` counter** — adversarial input only, two orders above any real macro;
  accepted as residue (a states-cap retune would need an engine rebuild — revisit only if a
  player actually hits it).

### Gate record (S7 close, 2026-08-09)

- **A ✅** at HEAD `2fa5d93`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D
  warnings` clean, **381 tests / 16 suites** green.
- **B ✅ (scoped)** at HEAD: `@astra/weal-engine` wasm smoke + `@astra/weal-bot` 70 tests +
  typecheck green; full repo lanes were reproduced per-slice before each push (commit
  discipline); uv lane untouched by 0032 (no Python files in any slice).
- **C ✅** oracle 32/32 exact (S4); §3 render goldens + printer round-trip property +
  plot label-pixel golden all inside the gate-A suite at HEAD.
- **D ◐ PARTIAL** — the deploy-window live pass (17 `weal.handleMessage` spans, 12:54–13:11
  UTC, real rolls w/ goodness INFO logs; noise-gated messages span < 1 ms with no reply;
  the Results-field defect found + fixed live). NOT yet formally exercised live:
  the per-case checklist (coercion, strikethrough, labels, atom die + overlay `display`,
  type-error caret, `lol`/`:p` silence, `save` → callable + suffix, fuel abort, plot PNG,
  giant-Str truncation). The 15-message checklist is written up in RESUME — one Discord
  pass + one bot restart closes it.
- **E ◐ PARTIAL** — `dice` rows written w/ guards (24 rows in-window incl. dropped dice);
  v1 `funcs` untouched (11 rows); funcs_v2 boot-load runs. NOT yet: a live `save`
  (funcs_v2 still empty), restart → still-callable, the hand-inserted stale-row WARN test.
- **F ◐ PARTIAL** — `astra.weal.rolls{goodness}` live in SigNoz (bad/okay/good series born
  in-window); **0 ERROR logs** in the deploy window ✅. `weal.v2.errors`/`weal.v2.fuel_aborts`
  are lazyCounters that have never fired live, so the metrics don't exist yet — they're born
  with the gate-D error cases.
- **G ✅** READMEs + charter amendment (`2fa5d93`); RESUME/memory checkpoint = this commit.
