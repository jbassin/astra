//! S3 runtime values (spec 0032 §4 S3).
//!
//! Dice are SYMBOLIC TREES in v2: evaluating a die expression builds a
//! [`DieTree`] describing the distribution; the actual distribution math is
//! S4's (`dist.rs`, reached through [`crate::dist_seam`]) and the render tree
//! is S5's (derived from these trees).
//!
//! # Equality, ordering, hashing
//!
//! - [`Value`] equality is STRUCTURAL. `Float` equality is **bit equality**
//!   (`f64::to_bits`): `NaN == NaN` for identical bit patterns and
//!   `0.0 != -0.0` — documented, and consistent with hashing. `Dict`
//!   equality is content-based (insertion order is preserved for iteration
//!   but ignored by `==`). Closures compare by `Rc` pointer identity
//!   (structural function equality is not exposed to the language — the
//!   checker rejects it; this is the defensive fallback).
//! - [`total_cmp`] is a TOTAL, panic-free structural order on function-free
//!   values, used for `dm` face sorting (D32-4) and future evaluate-state
//!   distributions. Cross-variant order is the variant rank listed on
//!   [`Value`]; floats order by `f64::total_cmp`; dicts compare their
//!   entries sorted by key. On function-BEARING values it degrades to a
//!   total preorder (all closures rank equal) so it never panics — but it is
//!   then inconsistent with `==`, which is why `Value` does not implement
//!   `std::cmp::Ord`.

use crate::ast::{BinOp, CmpOp};
use crate::lower::Span;
use num_bigint::{BigInt, BigUint};
use std::cmp::Ordering;
use std::hash::{Hash, Hasher};
use std::rc::Rc;

// ---------------------------------------------------------------------------
// Dec fixed-point (D32-1: 19.6 — i128 scaled 10^6, range ±10^19)
// ---------------------------------------------------------------------------

/// The Dec scale factor: values are stored as `i128` multiples of 10^-6.
pub const DEC_SCALE: i128 = 1_000_000;
/// The Dec range bound on the SCALED representation: ±10^19 × 10^6 = ±10^25.
pub const DEC_LIMIT: i128 = 10_000_000_000_000_000_000_000_000;

/// Range-check a scaled Dec (post-op, D32-1). Out of range = visible eval
/// error.
pub fn dec_check(scaled: i128, span: Option<Span>) -> Result<i128, EvalError> {
    if scaled.abs() > DEC_LIMIT {
        Err(EvalError::eval("Dec value out of range (±10^19)", span))
    } else {
        Ok(scaled)
    }
}

/// Range-check a Dec computed in `BigInt` (Mul/Div intermediates overflow
/// i128) and narrow it.
pub fn dec_check_big(scaled: &BigInt, span: Option<Span>) -> Result<i128, EvalError> {
    match i128::try_from(scaled) {
        Ok(v) => dec_check(v, span),
        Err(_) => Err(EvalError::eval("Dec value out of range (±10^19)", span)),
    }
}

/// Parse a normalized `int.frac` Dec literal text into the scaled i128.
/// Fractional digits beyond the 6 the 19.6 format carries are truncated
/// toward zero (documented). Out-of-range literals = visible eval error.
pub fn dec_from_text(text: &str, span: Option<Span>) -> Result<i128, EvalError> {
    let (int_part, frac_part) = text.split_once('.').unwrap_or((text, ""));
    let int: BigInt = int_part
        .parse()
        .map_err(|_| EvalError::internal("bad Dec literal"))?;
    let mut frac_digits: String = frac_part.chars().take(6).collect();
    while frac_digits.len() < 6 {
        frac_digits.push('0');
    }
    let frac: i128 = frac_digits.parse().expect("six decimal digits fit i128");
    let scaled = int * DEC_SCALE + BigInt::from(frac);
    dec_check_big(&scaled, span)
}

/// Render a scaled Dec as canonical `int.frac` source text (positive values
/// only — the serializer wraps negatives in unary minus). Trailing zeros are
/// trimmed but at least one fractional digit is kept (the Dec literal
/// grammar requires digits on both sides of the dot).
pub fn dec_to_text(scaled: i128) -> String {
    debug_assert!(scaled >= 0);
    let int = scaled / DEC_SCALE;
    let frac = (scaled % DEC_SCALE).unsigned_abs();
    let mut frac_str = format!("{frac:06}");
    while frac_str.len() > 1 && frac_str.ends_with('0') {
        frac_str.pop();
    }
    format!("{int}.{frac_str}")
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Distinguishes the wasm API's error stages (D32-11): ordinary evaluation
/// errors vs fuel/cap exhaustion. `Internal` marks engine seams that are not
/// implemented yet (the S4 dist stub) or invariant violations — it should
/// never surface from a well-typed program once S4 lands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    Eval,
    Fuel,
    Internal,
}

/// A runtime error with an optional byte span into the original source.
/// Spans are best-effort: the interpreter runs on a span-annotated core tree
/// (see `interp::attach_spans`); nodes the checker synthesized inherit the
/// span of the source node they elaborate, and values that outlive their
/// source (e.g. a save applied from a later message) may carry `None`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvalError {
    pub message: String,
    pub span: Option<Span>,
    pub kind: ErrorKind,
}

impl EvalError {
    pub fn eval(message: impl Into<String>, span: Option<Span>) -> EvalError {
        EvalError {
            message: message.into(),
            span,
            kind: ErrorKind::Eval,
        }
    }

    /// A fuel/cap exhaustion error; `counter` names the exhausted counter
    /// (D32-12).
    pub fn fuel(counter: &str, span: Option<Span>) -> EvalError {
        EvalError {
            message: format!("fuel exhausted: {counter}"),
            span,
            kind: ErrorKind::Fuel,
        }
    }

    pub fn internal(message: impl Into<String>) -> EvalError {
        EvalError {
            message: message.into(),
            span: None,
            kind: ErrorKind::Internal,
        }
    }
}

// ---------------------------------------------------------------------------
// Die trees (the S4/S5 seam)
// ---------------------------------------------------------------------------

/// `min` vs `max` over `Die[Num]` operands (symbolic — S4 computes it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MinMaxOp {
    Min,
    Max,
}

/// One applied keep-spec (D32-5 pool-shape suffixes). Keeps chain: each
/// re-keep applies to the currently-kept dice, so the kept set is always a
/// contiguous window of sorted positions — S4 folds the chain into its
/// keep-tuple.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Keep {
    /// Keep the highest `n` of the currently-kept dice (`kh`).
    High(u64),
    /// Keep the lowest `n` of the currently-kept dice (`kl`).
    Low(u64),
}

impl Keep {
    pub fn n(self) -> u64 {
        match self {
            Keep::High(n) | Keep::Low(n) => n,
        }
    }
}

/// A pool: `count` copies of one die plus the applied keep chain (empty =
/// keep all). (count, underlying die, keep-spec) are all directly
/// recoverable for S4 (distribution) and S5 (render) — this is the pinned
/// pool-bearing shape; `kh`/`kl` push onto `keep` rather than wrapping the
/// tree in dedicated nodes.
#[derive(Debug, Clone, PartialEq)]
pub struct PoolTree {
    pub count: u64,
    pub die: Box<DieTree>,
    /// Applied keep-specs, in application order (left-to-right).
    pub keep: Vec<Keep>,
}

impl PoolTree {
    /// How many dice are currently kept after the keep chain.
    pub fn kept_count(&self) -> u64 {
        self.keep.last().map_or(self.count, |k| k.n())
    }
}

/// A symbolic die: the exact distribution is computed on demand by S4
/// (`dist_seam::dist_of`); S5 derives the render tree from this shape.
///
/// Face order (D32-4) is carried structurally: `Leaf` = numeric ascending,
/// `Dl` = the faces vector's order, `Dm` = the faces vector's order (the
/// interpreter has already applied the dm-literal-order rule when building
/// it), mixtures/binary ops = left order then unseen right faces (S4's job).
#[derive(Debug, Clone, PartialEq)]
pub enum DieTree {
    /// Sum of `count` uniform dice with faces `1..=sides`. Validated at
    /// construction: `count >= 1`, `sides >= 1` (D32-4). `count == 1` is a
    /// plain `dM`.
    Leaf { count: u64, sides: u64 },
    /// A one-face "die" — a constant lifted into die arithmetic (die⊗const
    /// operands, D32-4).
    Const(Box<Value>),
    /// `dl([...])` — equal-weight faces, order = list order (R4). A leaf
    /// constructor in the render tree (D32-19).
    Dl { faces: Vec<Value> },
    /// `dm([face: weight, ...])` — weighted faces. Order = dict-literal
    /// insertion order when the call site was a literal (`dm_literal_order`),
    /// else the [`total_cmp`] structural sort (D32-4). A leaf constructor.
    Dm { faces: Vec<(Value, BigUint)> },
    /// die ⊗ die / die ⊗ const arithmetic (constants appear as [`DieTree::Const`]).
    BinOp {
        op: BinOp,
        lhs: Box<DieTree>,
        rhs: Box<DieTree>,
    },
    /// A LIFTED comparison — `Die[Bool]` by the product construction (D32-3).
    Cmp {
        op: CmpOp,
        lhs: Box<DieTree>,
        rhs: Box<DieTree>,
    },
    /// Unary negation of a `Die[Num]`.
    Neg(Box<DieTree>),
    /// `min`/`max` over `Die[Num]` operands.
    MinMax {
        op: MinMaxOp,
        lhs: Box<DieTree>,
        rhs: Box<DieTree>,
    },
    /// `explode(die, depth)` — bounded die-level expansion (depth ≤ 8,
    /// D32-12).
    Explode { inner: Box<DieTree>, depth: u64 },
    /// `reroll(die, faces)` — reroll-once on any listed face.
    Reroll {
        inner: Box<DieTree>,
        faces: Vec<Value>,
    },
    /// The `r` suffix — single-face reroll-once on a `Die[Num]`.
    RerollFace { inner: Box<DieTree>, face: BigInt },
    /// A render label (D32-6): `Die[T] -> Die[T]`, distribution-transparent.
    Label { word: String, inner: Box<DieTree> },
    /// `sum(pool)` — the D32-4 closing coercion. The interpreter collapses
    /// `sum(pool(N, dM))` (keep-less, plain leaf) to `Leaf{N, M}` and
    /// `sum(pool(1, X))` (keep-less) to `X`; other shapes keep this node.
    Sum { pool: PoolTree },
    /// `successes(pool, target)` — dedicated node (simplest for S4).
    Successes { pool: PoolTree, target: BigInt },
    /// `evaluate(pool, init, func)` — the user-evaluator DP (D32-8). `func`
    /// is a closure value; S4 runs it through the interpreter callback seam
    /// (`dist_seam`). A leaf constructor in the render tree.
    Evaluate {
        pool: PoolTree,
        init: Box<Value>,
        func: Box<Value>,
    },
}

impl Eq for DieTree {}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/// A weal v2 runtime value.
///
/// Variant rank for [`total_cmp`] (cross-variant order): Unit < Num < Dec <
/// Float < Str < Atom < Tuple < List < Dict < Die < Pool < Closure <
/// Builtin. (The checker never lets differently-typed values meet a
/// comparison, so cross-variant order only matters for the total order's
/// totality, not for language semantics.)
#[derive(Debug, Clone)]
pub enum Value {
    Unit,
    Num(BigInt),
    /// Fixed-point 19.6 — scaled i128 (see [`DEC_SCALE`]).
    Dec(i128),
    /// f64; equality is bit equality (module docs).
    Float(f64),
    Str(String),
    /// Atom name WITHOUT the leading `:`. Plain `String` (no interning —
    /// structural equality is what matters; S4 interns for its `Face` enum).
    Atom(String),
    Tuple(Vec<Value>),
    List(Vec<Value>),
    /// Insertion-ordered entries; keys unique (a literal repeating a key
    /// overwrites the value in place, keeping the first position —
    /// documented). Equality is content-based, order-insensitive.
    Dict(Vec<(Value, Value)>),
    Die(DieTree),
    /// An OPEN pool (`Pool[T]`) — not yet closed by `sum`/`successes`/
    /// `evaluate`.
    Pool(PoolTree),
    Closure(Rc<crate::interp::ClosureValue>),
    /// A first-class prelude builtin, possibly partially applied.
    Builtin(BuiltinValue),
}

/// A first-class builtin marker: the prelude name plus any already-applied
/// arguments (currying over natives).
#[derive(Debug, Clone)]
pub struct BuiltinValue {
    pub name: &'static str,
    pub args: Vec<Value>,
}

impl Value {
    pub fn num_u64(n: u64) -> Value {
        Value::Num(BigInt::from(n))
    }

    pub fn num_i64(n: i64) -> Value {
        Value::Num(BigInt::from(n))
    }

    /// The runtime Bool (D32-3): atoms `:true` / `:false`.
    pub fn bool(b: bool) -> Value {
        Value::Atom(if b { "true" } else { "false" }.to_owned())
    }

    /// Does this value contain a function anywhere? (Runtime mirror of the
    /// D32-3 equatable check — used defensively for die faces.)
    pub fn contains_function(&self) -> bool {
        match self {
            Value::Closure(_) | Value::Builtin(_) => true,
            Value::Tuple(xs) | Value::List(xs) => xs.iter().any(Value::contains_function),
            Value::Dict(entries) => entries
                .iter()
                .any(|(k, v)| k.contains_function() || v.contains_function()),
            _ => false,
        }
    }

    fn rank(&self) -> u8 {
        match self {
            Value::Unit => 0,
            Value::Num(_) => 1,
            Value::Dec(_) => 2,
            Value::Float(_) => 3,
            Value::Str(_) => 4,
            Value::Atom(_) => 5,
            Value::Tuple(_) => 6,
            Value::List(_) => 7,
            Value::Dict(_) => 8,
            Value::Die(_) => 9,
            Value::Pool(_) => 10,
            Value::Closure(_) => 11,
            Value::Builtin(_) => 12,
        }
    }
}

// -- equality ---------------------------------------------------------------

impl PartialEq for Value {
    fn eq(&self, other: &Value) -> bool {
        match (self, other) {
            (Value::Unit, Value::Unit) => true,
            (Value::Num(a), Value::Num(b)) => a == b,
            (Value::Dec(a), Value::Dec(b)) => a == b,
            (Value::Float(a), Value::Float(b)) => a.to_bits() == b.to_bits(),
            (Value::Str(a), Value::Str(b)) | (Value::Atom(a), Value::Atom(b)) => a == b,
            (Value::Tuple(a), Value::Tuple(b)) | (Value::List(a), Value::List(b)) => a == b,
            (Value::Dict(a), Value::Dict(b)) => {
                // Content-based, order-insensitive; keys are unique.
                a.len() == b.len()
                    && a.iter()
                        .all(|(k, v)| b.iter().any(|(k2, v2)| k == k2 && v == v2))
            }
            (Value::Die(a), Value::Die(b)) => a == b,
            (Value::Pool(a), Value::Pool(b)) => a == b,
            (Value::Closure(a), Value::Closure(b)) => Rc::ptr_eq(a, b),
            (Value::Builtin(a), Value::Builtin(b)) => a.name == b.name && a.args == b.args,
            _ => false,
        }
    }
}

impl Eq for Value {}

// -- hashing ----------------------------------------------------------------

impl Hash for Value {
    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_u8(self.rank());
        match self {
            Value::Unit => {}
            Value::Num(n) => n.hash(state),
            Value::Dec(d) => d.hash(state),
            Value::Float(f) => f.to_bits().hash(state),
            Value::Str(s) | Value::Atom(s) => s.hash(state),
            Value::Tuple(xs) | Value::List(xs) => xs.hash(state),
            Value::Dict(entries) => {
                // Order-insensitive eq ⇒ hash entries in key-sorted order.
                let mut sorted: Vec<&(Value, Value)> = entries.iter().collect();
                sorted.sort_by(|a, b| total_cmp(&a.0, &b.0));
                for (k, v) in sorted {
                    k.hash(state);
                    v.hash(state);
                }
            }
            Value::Die(t) => t.hash(state),
            Value::Pool(p) => p.hash(state),
            Value::Closure(c) => (Rc::as_ptr(c) as usize).hash(state),
            Value::Builtin(b) => {
                b.name.hash(state);
                b.args.hash(state);
            }
        }
    }
}

impl Hash for PoolTree {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.count.hash(state);
        self.die.hash(state);
        self.keep.hash(state);
    }
}

impl Hash for DieTree {
    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_u8(die_rank(self));
        match self {
            DieTree::Leaf { count, sides } => {
                count.hash(state);
                sides.hash(state);
            }
            DieTree::Const(v) => v.hash(state),
            DieTree::Dl { faces } => faces.hash(state),
            DieTree::Dm { faces } => {
                for (f, w) in faces {
                    f.hash(state);
                    w.hash(state);
                }
            }
            DieTree::BinOp { op, lhs, rhs } => {
                op.as_str().hash(state);
                lhs.hash(state);
                rhs.hash(state);
            }
            DieTree::Cmp { op, lhs, rhs } => {
                op.as_str().hash(state);
                lhs.hash(state);
                rhs.hash(state);
            }
            DieTree::Neg(inner) => inner.hash(state),
            DieTree::MinMax { op, lhs, rhs } => {
                op.hash(state);
                lhs.hash(state);
                rhs.hash(state);
            }
            DieTree::Explode { inner, depth } => {
                inner.hash(state);
                depth.hash(state);
            }
            DieTree::Reroll { inner, faces } => {
                inner.hash(state);
                faces.hash(state);
            }
            DieTree::RerollFace { inner, face } => {
                inner.hash(state);
                face.hash(state);
            }
            DieTree::Label { word, inner } => {
                word.hash(state);
                inner.hash(state);
            }
            DieTree::Sum { pool } => pool.hash(state),
            DieTree::Successes { pool, target } => {
                pool.hash(state);
                target.hash(state);
            }
            DieTree::Evaluate { pool, init, func } => {
                pool.hash(state);
                init.hash(state);
                func.hash(state);
            }
        }
    }
}

// -- total order ------------------------------------------------------------

/// The total structural order (module docs). Panic-free; on function-bearing
/// values it is a total preorder (closures rank equal among themselves).
pub fn total_cmp(a: &Value, b: &Value) -> Ordering {
    match (a, b) {
        (Value::Unit, Value::Unit) => Ordering::Equal,
        (Value::Num(x), Value::Num(y)) => x.cmp(y),
        (Value::Dec(x), Value::Dec(y)) => x.cmp(y),
        (Value::Float(x), Value::Float(y)) => x.total_cmp(y),
        (Value::Str(x), Value::Str(y)) | (Value::Atom(x), Value::Atom(y)) => x.cmp(y),
        (Value::Tuple(x), Value::Tuple(y)) | (Value::List(x), Value::List(y)) => cmp_seq(x, y),
        (Value::Dict(x), Value::Dict(y)) => {
            fn sort(entries: &[(Value, Value)]) -> Vec<&(Value, Value)> {
                let mut v: Vec<&(Value, Value)> = entries.iter().collect();
                v.sort_by(|p, q| total_cmp(&p.0, &q.0));
                v
            }
            let (xs, ys) = (sort(x), sort(y));
            for (p, q) in xs.iter().zip(&ys) {
                let ord = total_cmp(&p.0, &q.0).then_with(|| total_cmp(&p.1, &q.1));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            xs.len().cmp(&ys.len())
        }
        (Value::Die(x), Value::Die(y)) => die_cmp(x, y),
        (Value::Pool(x), Value::Pool(y)) => pool_cmp(x, y),
        (Value::Closure(_), Value::Closure(_)) => Ordering::Equal,
        (Value::Builtin(x), Value::Builtin(y)) => {
            x.name.cmp(y.name).then_with(|| cmp_seq(&x.args, &y.args))
        }
        _ => a.rank().cmp(&b.rank()),
    }
}

fn cmp_seq(a: &[Value], b: &[Value]) -> Ordering {
    for (x, y) in a.iter().zip(b) {
        let ord = total_cmp(x, y);
        if ord != Ordering::Equal {
            return ord;
        }
    }
    a.len().cmp(&b.len())
}

fn die_rank(t: &DieTree) -> u8 {
    match t {
        DieTree::Leaf { .. } => 0,
        DieTree::Const(_) => 1,
        DieTree::Dl { .. } => 2,
        DieTree::Dm { .. } => 3,
        DieTree::BinOp { .. } => 4,
        DieTree::Cmp { .. } => 5,
        DieTree::Neg(_) => 6,
        DieTree::MinMax { .. } => 7,
        DieTree::Explode { .. } => 8,
        DieTree::Reroll { .. } => 9,
        DieTree::RerollFace { .. } => 10,
        DieTree::Label { .. } => 11,
        DieTree::Sum { .. } => 12,
        DieTree::Successes { .. } => 13,
        DieTree::Evaluate { .. } => 14,
    }
}

fn pool_cmp(a: &PoolTree, b: &PoolTree) -> Ordering {
    a.count
        .cmp(&b.count)
        .then_with(|| die_cmp(&a.die, &b.die))
        .then_with(|| a.keep.cmp(&b.keep))
}

fn die_cmp(a: &DieTree, b: &DieTree) -> Ordering {
    let rank = die_rank(a).cmp(&die_rank(b));
    if rank != Ordering::Equal {
        return rank;
    }
    match (a, b) {
        (
            DieTree::Leaf {
                count: c1,
                sides: s1,
            },
            DieTree::Leaf {
                count: c2,
                sides: s2,
            },
        ) => c1.cmp(c2).then_with(|| s1.cmp(s2)),
        (DieTree::Const(x), DieTree::Const(y)) => total_cmp(x, y),
        (DieTree::Dl { faces: x }, DieTree::Dl { faces: y }) => cmp_seq(x, y),
        (DieTree::Dm { faces: x }, DieTree::Dm { faces: y }) => {
            for ((f1, w1), (f2, w2)) in x.iter().zip(y) {
                let ord = total_cmp(f1, f2).then_with(|| w1.cmp(w2));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            x.len().cmp(&y.len())
        }
        (
            DieTree::BinOp {
                op: o1,
                lhs: l1,
                rhs: r1,
            },
            DieTree::BinOp {
                op: o2,
                lhs: l2,
                rhs: r2,
            },
        ) => o1
            .as_str()
            .cmp(o2.as_str())
            .then_with(|| die_cmp(l1, l2))
            .then_with(|| die_cmp(r1, r2)),
        (
            DieTree::Cmp {
                op: o1,
                lhs: l1,
                rhs: r1,
            },
            DieTree::Cmp {
                op: o2,
                lhs: l2,
                rhs: r2,
            },
        ) => o1
            .as_str()
            .cmp(o2.as_str())
            .then_with(|| die_cmp(l1, l2))
            .then_with(|| die_cmp(r1, r2)),
        (DieTree::Neg(x), DieTree::Neg(y)) => die_cmp(x, y),
        (
            DieTree::MinMax {
                op: o1,
                lhs: l1,
                rhs: r1,
            },
            DieTree::MinMax {
                op: o2,
                lhs: l2,
                rhs: r2,
            },
        ) => (*o1 as u8)
            .cmp(&(*o2 as u8))
            .then_with(|| die_cmp(l1, l2))
            .then_with(|| die_cmp(r1, r2)),
        (
            DieTree::Explode {
                inner: i1,
                depth: d1,
            },
            DieTree::Explode {
                inner: i2,
                depth: d2,
            },
        ) => die_cmp(i1, i2).then_with(|| d1.cmp(d2)),
        (
            DieTree::Reroll {
                inner: i1,
                faces: f1,
            },
            DieTree::Reroll {
                inner: i2,
                faces: f2,
            },
        ) => die_cmp(i1, i2).then_with(|| cmp_seq(f1, f2)),
        (
            DieTree::RerollFace {
                inner: i1,
                face: f1,
            },
            DieTree::RerollFace {
                inner: i2,
                face: f2,
            },
        ) => die_cmp(i1, i2).then_with(|| f1.cmp(f2)),
        (
            DieTree::Label {
                word: w1,
                inner: i1,
            },
            DieTree::Label {
                word: w2,
                inner: i2,
            },
        ) => w1.cmp(w2).then_with(|| die_cmp(i1, i2)),
        (DieTree::Sum { pool: p1 }, DieTree::Sum { pool: p2 }) => pool_cmp(p1, p2),
        (
            DieTree::Successes {
                pool: p1,
                target: t1,
            },
            DieTree::Successes {
                pool: p2,
                target: t2,
            },
        ) => pool_cmp(p1, p2).then_with(|| t1.cmp(t2)),
        (
            DieTree::Evaluate {
                pool: p1,
                init: v1,
                func: f1,
            },
            DieTree::Evaluate {
                pool: p2,
                init: v2,
                func: f2,
            },
        ) => pool_cmp(p1, p2)
            .then_with(|| total_cmp(v1, v2))
            .then_with(|| total_cmp(f1, f2)),
        _ => unreachable!("die_rank matched"),
    }
}

// ---------------------------------------------------------------------------
// The Cmd accumulator (D32-7)
// ---------------------------------------------------------------------------

/// One display: the value to show, plus its die tree when the value is a die
/// (S5 samples/renders from the tree).
#[derive(Debug, Clone, PartialEq)]
pub struct DisplayItem {
    pub value: Value,
    pub die: Option<DieTree>,
}

/// A `save` effect: the validated name and the R21-serialized source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveCmd {
    pub name: String,
    pub source: String,
}

/// The effect accumulator threaded through one interpretation (D32-7):
/// `roll` appends displays, `plot` appends die trees, `save` appends
/// serialized sources; the top-level driver appends the final displayable
/// value last.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Cmd {
    pub displays: Vec<DisplayItem>,
    pub plots: Vec<DieTree>,
    pub saves: Vec<SaveCmd>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::hash_map::DefaultHasher;

    fn hash_of(v: &Value) -> u64 {
        let mut h = DefaultHasher::new();
        v.hash(&mut h);
        h.finish()
    }

    fn num(n: i64) -> Value {
        Value::num_i64(n)
    }

    #[test]
    fn dict_equality_is_order_insensitive() {
        let a = Value::Dict(vec![(num(1), num(10)), (num(2), num(20))]);
        let b = Value::Dict(vec![(num(2), num(20)), (num(1), num(10))]);
        assert_eq!(a, b);
        assert_eq!(hash_of(&a), hash_of(&b));
        let c = Value::Dict(vec![(num(1), num(10)), (num(2), num(99))]);
        assert_ne!(a, c);
    }

    #[test]
    fn float_equality_is_bitwise() {
        assert_ne!(Value::Float(0.0), Value::Float(-0.0));
        assert_eq!(Value::Float(f64::NAN), Value::Float(f64::NAN));
        assert_eq!(Value::Float(1.5), Value::Float(1.5));
    }

    #[test]
    fn total_cmp_orders_across_variants_by_rank() {
        let vals = [
            Value::Unit,
            num(3),
            Value::Dec(1),
            Value::Float(0.5),
            Value::Str("a".into()),
            Value::Atom("a".into()),
        ];
        for w in vals.windows(2) {
            assert_eq!(total_cmp(&w[0], &w[1]), Ordering::Less);
        }
    }

    #[test]
    fn total_cmp_lists_are_lexicographic_then_length() {
        let a = Value::List(vec![num(1), num(2)]);
        let b = Value::List(vec![num(1), num(3)]);
        let c = Value::List(vec![num(1), num(2), num(0)]);
        assert_eq!(total_cmp(&a, &b), Ordering::Less);
        assert_eq!(total_cmp(&a, &c), Ordering::Less);
        assert_eq!(total_cmp(&a, &a), Ordering::Equal);
    }

    #[test]
    fn total_cmp_floats_use_ieee_total_order() {
        assert_eq!(
            total_cmp(&Value::Float(-0.0), &Value::Float(0.0)),
            Ordering::Less
        );
        assert_eq!(
            total_cmp(&Value::Float(1.0), &Value::Float(f64::NAN)),
            Ordering::Less
        );
    }

    #[test]
    fn total_cmp_dicts_compare_key_sorted() {
        let a = Value::Dict(vec![(num(2), num(20)), (num(1), num(10))]);
        let b = Value::Dict(vec![(num(1), num(10)), (num(2), num(20))]);
        assert_eq!(total_cmp(&a, &b), Ordering::Equal);
    }

    #[test]
    fn total_cmp_is_panic_free_on_functions() {
        let b = Value::Builtin(BuiltinValue {
            name: "sum",
            args: vec![],
        });
        assert_eq!(total_cmp(&b, &b), Ordering::Equal);
        assert_eq!(total_cmp(&num(1), &b), Ordering::Less);
    }

    #[test]
    fn die_trees_have_a_structural_order() {
        let a = DieTree::Leaf { count: 1, sides: 6 };
        let b = DieTree::Leaf { count: 1, sides: 8 };
        assert_eq!(die_cmp(&a, &b), Ordering::Less);
        assert_eq!(
            total_cmp(&Value::Die(a.clone()), &Value::Die(a.clone())),
            Ordering::Equal
        );
    }

    #[test]
    fn dec_text_round_trip_and_trim() {
        assert_eq!(dec_to_text(1_500_000), "1.5");
        assert_eq!(dec_to_text(2_000_000), "2.0");
        assert_eq!(dec_to_text(123), "0.000123");
        assert_eq!(dec_from_text("1.5", None).unwrap(), 1_500_000);
        assert_eq!(dec_from_text("0.0000019", None).unwrap(), 1); // 7th digit truncates
    }

    #[test]
    fn dec_literal_out_of_range_is_a_visible_eval_error() {
        let e = dec_from_text("100000000000000000000.0", None).unwrap_err();
        assert_eq!(e.kind, ErrorKind::Eval);
        assert!(e.message.contains("range"));
    }

    #[test]
    fn pool_kept_count_follows_the_keep_chain() {
        let p = PoolTree {
            count: 5,
            die: Box::new(DieTree::Leaf { count: 1, sides: 6 }),
            keep: vec![Keep::High(3), Keep::Low(2)],
        };
        assert_eq!(p.kept_count(), 2);
        let q = PoolTree {
            count: 5,
            die: Box::new(DieTree::Leaf { count: 1, sides: 6 }),
            keep: vec![],
        };
        assert_eq!(q.kept_count(), 5);
    }
}
