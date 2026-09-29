# Weal v2

A new version of the weal language. It doesn't need to have full parity or reimplementation of most of the indosyncracies of v1. We don't need to carry over the ast or compatibility with the former json or any of that from the previous verison.

## Syntax

### Types

Unit: `()`; unit is only inhabited by a single item, `()`.
Num: `1`, `1_000`; integer literals, underscores allowed between digits. likely need to support integers of arbitary length.
Dec: `1.0`, `0.12`, `0.100_120`; fixed-point decimal literals, underscores allowed between digits, must have at least one digit before `.`
Float: `1.0f`; floating-point decimal literals, same rules as `Dec` but suffixed with an `f`.
Str: `"foobar"`; unicode strings
Atom: `:atom`, `:kebab-case`; an atom, all atoms of a given value equal atoms of the same value, like in erlang/elixir
Tuple: `{:ok, 1.0f}`; an n-sized bag of heterogenous types. typed by its contents, i.e. the example tuple is type `{:ok, Flt}` and a tuple of `{"hello", 1, 1.}` is type `{Str, Num, Dec}`
List: `[1, 2, 4]`; a homogenous bag of objects. typed by its contents, i.e. the example list is `List[Num]`
Dict: `["good": 1, "bad": 3]`; a mapping from from key to value. typed by its contents, i.e. the example is `Dict[Str, Num]`

weal is strongly, strictly typed. It has type inference, and generic lists and dictionaries. Since users can't define their own generic types, and all functions should be well formed, I think type inference should effectively prevent a user from ever needing to specify types manually.

#### Dice

Dice are a special type case in weal_v2. Dice (and the language as a whole) will be used for two primary purposes: rolling dice and plotting probabilities. I'd like dice on the backend to be implemented using the `icepool` algorithm, as defined by the python repository at `/home/jbassin/icepool` and the pdf in `/home/jbassin/icepool/papers/icepool_preprint.pdf`. (but we're planning on doing a reimplementation in rust, not calling into the python)

Dice will be able to be constructed in a few ways by the user:

To make a die with $n$ sides of equal probability, you can prefix a Num with `d` and optional quantity, e.g. `2d6` or `d20`. When the quantity is omitted, it can be assumed to be one.

For more complex dice there will be a function constructor.
To make a die with with a set of sides of equal probability you give it a list of values, e.g. `dl([1,3,5])` or `dl([:fine, :good, :great, :bad-again])`.
To make a die with a set of sides of different relative probabilities you give it a dict with values mapped to number of sides, e.g. `dm([1: 1, 2: 3])` is equal to `dl([1,2,2,2])`.

#### Functions

Functions take exactly one input and return exactly one output. Functions that look like they take more than one input are actually curried automatically to be inputs. A function that takes two numbers and returns a float would have the type `Num -> Num -> Float`. Functions are first class, so a function that takes a list of numbers and a function that takes a number and outputs a number and returns a list of numbers looks like `List[Num] -> (Num -> Num) -> List[Num]`.

Functions look like: `foo(x, y) = x + y`. Functions can be called with parentheses, like `foo(1, 2)`. Functions two special anonymous forms. First is with pipe syntax, `|a, b| a + b` is equivalent to `add(a, b) = a + b`. Second is when in function calls, the function `twice(f, x) = f(x) + f(x)` can be called like `twice(_ * 2, 3)` which is equivalent to `twice(|x| x * 2, 3)`. Functions do capture their environment.

### Control Flow

#### Comments

Comments are defined by `(* comment here *)` and can be placed anywhere within a weal script.

#### Assignments

weal_v2 is an expression based language. Variables are defined with starting-lowercase `[a-z][a-zA-Z0-9_]*`. They can be defined as such: `let foo_bar = 12; foo_bar`. Since weal_v2 is expression based, assignments can be chained but need to end in a value. `let first = let second = 2; second + 1; first - 2` is valid, but is easier to read with proper formatting (using insignificant whitespace):

```weal
let first =
  let second = 2;
  second + 1;
first - 2
```

which resolves to 1.

Assignments have a special sugar for defining functions: `let foo = |x, y| x + y; foo(1, 2)` is the same as `let foo(x, y) = x + y; foo(1, 2)`.

Assignments have support for destructuring: `let {x, y} = {1, 2}; x` will resolve to 1.

Assignments have support for specifying their type with `let x Num = 1; x`

#### Match

Match expressions allow for conditionals and general form handling.

```weal
let x = 1;
match x
  | 1 -> :good
  | _ -> :bad (* the _ in a case arm like this means "otherwise" or default. it could also define a variable like `a` and its value would be bound within the arm's expression. *)
```

This resolves to `:good`.

Match expression can be assigned to a variable as with other expression. Match expressions also allow for destructuring in cases.

```weal
match {1, 2}
  | {1, x} -> x + x
  | {x, _} -> x * x
```

#### Die-Suffixes

Functions with the type `Die -> T -> Die` can be used as a special die-suffix to make rolling easier. Given `kh(d, n) = (* keep highest n of d *)`, then the form 2d6kh1 is lowered to `kh(2d6, 1)`.

## Semantics

The most important thing that I care about weal being able to support are the roll representations and the plotting. The results notation being concise where possible but showing intermediate die rolls instead of just being the whole request blob is pretty important to the user experience. I don't have a good idea for how we can encode that, so that a user can write a function and have it output it in a more human readable format with dies represented in the slots.

Similarly, I feel that this needs to support plotting, especially with the icepool-like support for good die processing. I don't have a good idea for how that would be represented or output.

There should be a prelude of functions available already preloaded, with things like keep highest/lowest and min/max etc, but there should also be a way in the bot to add to the prelude, in a similar vein like `save` from v1.

The unused seed needs to be present in the discord ui, but it doesn't actually need to make it into the roller, the roller should use proper randomness. the seed is just a ui element for fun.

## Technology

We're going to stay in rust for weal_v2. I'd like tokenization to be by logos, cst construction by rowan. things like graph generation, if they happen in rust, I'm happy to take suggestions on.
