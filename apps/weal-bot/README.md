# weal-bot — the dice bot

The campaign's Discord dice bot (`0009` surface, `0032` language + engine): rostered players type
**weal** expressions in chat and the bot replies as a host with a roll trace, a distribution plot,
or a save confirmation. The language is weal v2 — a small, strict, type-inferred expression
language where dice are exact probability distributions, evaluated by a Rust engine compiled to
wasm (`libs/rust/weal-engine`, consumed as the committed `@astra/weal-engine` artifact).

Spec: `thoughts/astra/specs/0032-weal-v2-spec.md` (D32-1..20). Engine internals:
`libs/rust/weal-engine/README.md`.

## How the bot listens

Every message from a rostered player is a roll candidate. Code fences (and a leading `ocaml`
language tag) are trimmed first, so pasting a macro in a fence works. Then:

- **Messages that don't parse are silently ignored** — ordinary chat is not an error.
- **Messages that parse but fail type-check or evaluation get a visible error reply** (a
  "that didn't check out" embed with the engine message and a caret pointing at the offending
  span) — but only if the message looks like it was *meant* as code: it contains a die token,
  `let`/`match`, an operator, or a saved-macro name. A bare `lol` or `:p` stays silent even
  though the engine rejects it.
- `reseed()` re-rolls the **cosmetic** seed shown in embed footers. It never affects actual
  rolls — the engine takes fresh entropy every time.
- A lone atom (`:ready`) evaluates fine but is suppressed as chat noise.

A roll reply's title is `{character}: {result}` (plus `[Crit!]`/`[Fumble!]`), and the Results
field shows the trace: every die's sampled faces at the spot they were rolled, with dropped dice
struck through and die-free math collapsed to its value.

## The weal language

### Rolling dice

```
d20 + 7        →  d20 ⟪17⟫ + 7 = 24
4d6            →  4d6 ⟪5,5,1,5⟫ = 16
d20 + 3*2      →  d20 ⟪17⟫ + 6 = 23
```

`NdM` rolls N M-sided dice (lowercase `d` only). Die-free arithmetic collapses in the trace
(`3*2` shows as `6`). Comments `(* like this *)` are allowed anywhere and nest.

### Literals

- **Num** — arbitrary-precision integers, underscores allowed: `1_000 + 500` → `1500`.
- **Dec** — exact fixed-point decimals (6 fractional digits): `2.5 + 0.75` → `3.25`.
- **Float** — the `f` suffix: `1.5f + 2.0f` → `3.5f`.
- **Str** — `"double-quoted"` (escapes: `\"` `\\` `\n`).
- **Atoms** — `:hit`, `:kebab-case` allowed. `:true`/`:false` are the booleans.

Types never mix implicitly — `1 + "x"` is a visible type error, and Num↔Dec↔Float conversion
goes through `dec`/`float`/`num` (truncating), `round`, `floor`, `ceil`. Num division truncates:
`7 / 2` → `3`.

### Keep, explode, reroll — die suffixes

```
4d6kh3      →  4d6 ⟪5,5,~~1~~,5⟫kh3 = 15        (keep highest 3; dropped die struck)
2d20kh1 + 7 →  2d20 ⟪~~9~~,13⟫kh1 + 7 = 20      (advantage)
2d20kl1     →  2d20 ⟪9,~~13~~⟫kl1 = 9            (disadvantage)
2d6e2       →  2d6e2 ⟪6→2,1⟫ = 9                 (explode: max faces chain, ≤2 extra rolls each)
4d6r1       →  4d6r1 ⟪5,5,1→5,6⟫ = 21           (reroll 1s once, new face kept)
```

Every suffix takes a number (`4d6kh` is a type error), and suffixes chain left-to-right —
`4d6e2kh3` explodes each d6 (depth 2), then keeps the highest 3 *chains*:

```
4d6e2kh3    →  4d6e2 ⟪6→6→2,~~2~~,6→6→6,2⟫kh3 = 34
```

Unknown suffix names are type errors, not silence — and saved functions with the right shape
become suffixes too (below).

### Labels

`[word]` on any die-typed expression names it in the trace — purely cosmetic:

```
2d8[fire] + 1d6[slashing]  →  2d8 ⟪5,5⟫[fire] + d6 ⟪1⟫[slashing] = 11
(2d8 + 4)[slashing]        →  (2d8 ⟪8,2⟫ + 4)[slashing] = 14
```

Label words are lowercase identifiers (no kebab).

### Comparisons

Comparing a die produces a **die of `:true`/`:false`** — the whole check is one roll:

```
d20 + 5 >= 15  →  d20 ⟪9⟫ + 5 >= 15 = :false
d20 == 20      →  d20 ⟪20⟫ == 20 = :true
```

`:false` is the fumble end, `:true` the crit end, so nat-check flavor works. Comparisons don't
chain (`1 < 2 < 3` is rejected — parenthesize).

### Bindings: `let` and `;`

`;` closes a binding and introduces the rest of the expression (OCaml's `in`):

```
let mod = 4; d20 + mod
let {a, b} = {1, 2}; a + b            (* tuple destructuring *)
let smite(n) = sum(pool(n, d8)) + 5; smite(3)
                →  3d8 ⟪5,5,5⟫ + 5 = 20
```

Function calls are transparent in the trace — you see the dice, not the call. The `let f(x) = …`
form may recurse (runaway recursion hits the fuel wall, not a hang).

### `match`

```
let sign(n) = match n | 0 -> :zero | _ -> :nonzero; sign(3)   →  :nonzero
```

Matches on atoms are **exhaustiveness- and typo-checked**:

- `match 1 > 0 | :true -> 1` → `non-exhaustive match: missing :false`
- `match :fire | :ice -> 1` → `unreachable arm: :ice is not a possible value of :fire`
- a `:ture` typo in a Bool match surfaces as a type mismatch naming the bogus union
  (`expected `:true | :ture`, found `Bool``) — the checker catches it before anything rolls.

Matching on an open type (any Num/Str/Atom) requires a wildcard or binder arm. No guards; nest a
match on a comparison instead.

### Functions, lambdas, placeholders

Functions are curried; partial application is legal. Anonymous functions are `|a, b| body`, and
`_` in call-argument position is lambda shorthand:

```
let twice(f, x) = f(f(x)); twice(_ * 2, 3)   →  12
```

Each `_` becomes a parameter of the smallest enclosing argument expression.

### Custom dice: `dl` and `dm`

```
dl([:fine, :good, :great])       →  dl(:fine,:good,:great) ⟪:good⟫ = :good
dm([:miss: 5, :hit: 3, :crit: 1]) →  dm(:miss:5,:hit:3,:crit:1) ⟪:miss⟫ = :miss
```

`dl(list)` makes an equal-weight die from a list; `dm(dict)` a weighted die (weights ≥ 1).
**Face order is meaningful: first face = fumble end, last face = crit end.** Write faces
worst-to-best and goodness (crit/fumble tags, host flavor) follows. `dl` uses list order; `dm`
uses the dict literal's insertion order. Faces can be atoms, numbers, strings — `dl([1, 2, 3]) + 1`
does arithmetic like any die.

### Pools and `evaluate` — build your own mechanic

`pool(n, die)` is n dice *before* summing. `kh`/`kl` are really pool functions (`4d6kh3` ≡
`kh(pool(4, d6), 3)`), `sum` collapses a numeric pool, and `evaluate` runs any fold you like over
the rolled dice, producing a real die (exact distribution — you can `plot` it):

```
evaluate(pool(6, d10), 0, |acc, face, count| match face >= 8 | :true -> acc + count | :false -> acc)
    →  evaluate(6d10) ⟪9,3,9,9,10,6⟫ = 4
```

That's a success counter: the closure sees each distinct face (highest first) with how many dice
landed on it, and threads a state. The prelude's `successes(pool(6, d10), 8)` is that exact
mechanic built in. Evaluator closures must be pure — `roll`/`plot`/`save` inside one is an error.
Note a non-numeric pool can't be summed (`sum(pool(2, dl([:a, :b])))` is a type error) — that's
what `evaluate` is for.

### Lists: `repeat`, `concat`, `map`, `filter`, `fold`, `reduce`, `len`

A list of dice displays one roll per element — `repeat(d20, 3)` is three *independent*
d20s (dice re-roll per mention, so `let x = d20; [x, x, x]` is three rolls too):

```
repeat(d20, 3)   →  d20 ⟪17⟫ = 17 · d20 ⟪9⟫ = 9 · d20 ⟪17⟫ = 17
```

The rest of the toolkit takes the list first (like `evaluate`): `concat(a, b)` joins two
lists, `map(list, f)` transforms each element, `filter(list, pred)` keeps elements whose
predicate is `:true`, `fold(list, init, f)` threads an accumulator, `reduce(list, f)`
folds with the first element as the seed (≥1 element required), `len(list)` counts.

```
concat(repeat(d6, 2), [d20])                    (* [d6, d6, d20] — mixed dice *)
map(repeat(d6, 3), _ + 1)                       (* three d6+1 rolls *)
reduce(concat(repeat(d6, 2), [d20]), _ + _)     →  d6 ⟪3⟫ + d6 ⟪3⟫ + d20 ⟪17⟫ = 23
len(filter([1, 2, 3, 4], _ >= 3))               →  2
```

`fold` needs its accumulator to keep one type, so summing dice with a `0` seed rejects
(`Num + Die` is a die — use `reduce`, or seed with the constant die `dl([0])`).

`repeat(x, 0)` is `[]`, a negative count is an error, and the count shares the pool
construction cap. Arithmetic in a lambda lifts over dice like anywhere else — the
checker decides Num-vs-die per call site (`let f = |x| x + 1; {f(1), f(d6)}` gives `2`
and a rolled `d6 + 1`), defaulting to plain numbers when nothing says die. The one
place that pins early: a save's type is fixed when saved, so a saved `|x| x + 1` that
first checks alone stays numeric — save die-flavored macros with the die visible.

### `plot`

`plot(4d6kh3)` replies with the exact probability chart (a PNG), plus mean `12.244599` and std
`2.846844`. Non-numeric dice plot fine but show `—` for mean/std. Plot-only messages don't write
roll history.

### `save` — macros

`save(:name, value)` stores anything — including functions — into the guild's shared prelude:

```
save(:smite, |n| sum(pool(n, d8)) + 5)
(* next message *)  smite(3)   →  3d8 ⟪2,4,3⟫ + 5 = 14
```

Saves are stored as **source text** — the confirmation embed shows exactly what was kept, and
captured bindings are baked in as `let`s (`let bonus = 3; save(:blessed, |x| x + bonus)` stores
`let bonus = 3; |x| x + bonus`). Re-saving a name shadows the old one. Names must be valid
identifiers — `save(:my-macro, …)` is rejected (kebab atoms can't be referenced).

A saved function whose name is all lowercase letters and whose shape fits becomes a **die
suffix**: after `save(:pow, |die, n| explode(die, n))`, both `pow(d6, 2)` and `4d6pow2` work.

### Fuel — what "too expensive" means

Every distribution is exact, so some expressions are genuinely enormous. The engine meters its
own work and aborts with a visible `fuel exhausted: <counter>` error instead of hanging —
`10000d10000` dies on `transitions`, `explode(d6, 9)` on the explode-depth cap (8),
`let f(x) = f(x); f(1)` on recursion depth. If you hit a fuel wall, the expression isn't wrong,
it's too big — shrink the pool or the depth.

### Goodness — how crit/fumble is decided

Every die display gets a five-tier goodness from where the sampled face order landed: **first
face = fumble, last = crit, the span between splits into thirds** (bad / okay / good). It drives
the `[Crit!]`/`[Fumble!]` title tags, the host's flavor line, and the overlay flair. One rule for
everything — `d20`, atom dice, comparisons (`:false` = fumble end), and your `evaluate`
mechanics alike. Note goodness judges against the *whole expression's* distribution: a 15 on
`4d6kh3` is `good`, but a 15 on `4d6e2kh3` (which can reach far higher) is `bad`.

## Differences from weal v1

- **`;` replaces `in`** — `let x = 1; x + 1`, not `let x = 1 in x + 1`.
- **No `.` method sugar** — `pool(4, d6)` style calls only.
- **Errors are visible now** — v1 swallowed everything; v2 replies to type/eval/fuel errors on
  anything that looks like code (parse failures stay silent).
- **Saved v1 macros did not migrate** — the old `funcs` store is a dead archive; re-`save` what
  you use. Saves are now readable source text instead of opaque ASTs.
- Only lowercase `d` in die literals (`D20` no longer lexes as a die).
- The language is typed and inferred — bad expressions are caught before anything rolls, and
  distributions (plots, goodness) are exact rather than sampled.

## Operations

- **Runtime:** a Docker Compose unit (`weal-bot` in `deploy/docker-compose.yml`) + its Postgres
  (`weal-postgres`, bind-mounted under `artifacts/`). Secrets (Discord token, overlay token) come
  from SOPS via `just up` env injection; config via `ontology-config` (`config.kdl`).
- **Deploy:** `just up` from the repo root (rebuild + recreate). The engine wasm is a
  **committed** artifact — changing the language means editing `libs/rust/weal-engine` and
  running `just weal-engine-build` first (see that crate's README); the bot image just copies
  `libs/ts` wholesale.
- **Persistence:** standard `NdM` faces (kept, dropped, and explosion draws alike) write `dice`
  rows (guards: ≤30 dice per roll, faces ≤ d100); `dl`/`dm`/atom dice write none. Saves live in
  `funcs_v2` (append-only; latest per name wins). At boot every row is re-type-checked in order —
  a stale row is skipped with a WARN, never a crash.
- **Overlay:** rolls broadcast to weal-overlay/dice-feed with the plain source text as
  `expression` and the headline as `display` (atom rolls send `total: 0`).
- **Telemetry:** `astra.weal-bot` — roll spans (`weal.goodness`, `weal.engine_ms`),
  `astra.weal.rolls{goodness}`, `weal.v2.errors{stage}` (incl. contained `panic`, which also
  re-instantiates the wasm), `weal.v2.fuel_aborts`. Engine faults log WARN, never ERROR.

## Dev

```
pnpm --filter @astra/weal-bot test         # handler/engine/message/db suites (real wasm, seeded)
pnpm --filter @astra/weal-bot typecheck
pnpm --filter @astra/weal-bot start        # needs env (token, PG) — normally runs via compose
```
