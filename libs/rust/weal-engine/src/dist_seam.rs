//! The S3 ↔ S4 seam: everything in the interpreter (and S5's api layer)
//! that needs an actual DISTRIBUTION goes through [`dist_of`] /
//! [`dist_of_with`], which lower a symbolic [`DieTree`] into S4's generic
//! [`Dist`] engine and hand back a [`SeamDist`] whose faces are plain
//! [`Value`]s again.
//!
//! # Face representation (amended D32-8)
//!
//! Internally every distribution is a `Dist<Face>`:
//!
//! - **Numeric faces** (`Face::Num` = Num/`BigInt`, `Face::Dec` = scaled
//!   i128) carry NO rank: their `Ord` is numeric. The D32-4 face-order
//!   VECTOR still preserves construction order (`dm([3: 1, 1: 2])` keeps
//!   `[3, 1]` for goodness/display), but pool iteration and keep-tuples run
//!   in numeric sorted order — this is the amended-D32-8 behavior: for
//!   numeric dice the evaluator sees faces in DESCENDING NUMERIC order and
//!   `kh`/`kl` keep numerically-highest/lowest dice, regardless of the
//!   display order.
//! - **Non-numeric faces** (`Face::Ranked`) bake the face's D32-4
//!   face-order RANK into the wrapper at construction time, so sorted
//!   (`Ord`) order == face order. `eval_pool`'s descending sorted iteration
//!   is therefore descending FACE-ORDER for atom/str/bool/other dice, and
//!   `kh` keeps the face-order-latest ("best") faces.
//! - Lifted comparison results are Bool dice with the pinned face order
//!   `[:false, :true]` (`:false` = rank 0, the fumble end; `:true` = rank 1,
//!   the crit end) — enforced even when the cartesian product produces
//!   `:true` first.
//! - Pool-evaluation results (`Sum`/`Successes` numeric; `Evaluate` states)
//!   are NEW values with no inherited order: their face order is the
//!   ascending structural [`total_cmp`] order (numeric ascending for
//!   Num/Dec states).
//!
//! # Node mapping
//!
//! `Leaf` = `sum_pool` over the uniform die (the keep-1 closed forms fire
//! via `sum_pool`'s own dispatch); `Const` = a one-face constant; `Dl`/`Dm`
//! = uniform/weighted with rank-baked faces where non-numeric; `BinOp` =
//! `try_combine` with S3's Num semantics (truncating division; a zero in
//! the divisor's support is the same visible "division by zero" eval error
//! S3 raises for constants); `Cmp` = `try_combine` into the Bool die
//! (equality on any equatable faces, ordering on Num faces only — the
//! checker guarantees it); `Neg`/`MinMax` = `map`/`combine` on Num faces;
//! `Explode`/`Reroll`/`RerollFace` = the die-level ops on Num faces (a
//! non-numeric operand is checker-prevented → `Internal`); `Label` is
//! transparent; `Sum`/`Successes`/`Evaluate` fold the pool's keep chain
//! into ONE `KeepTuple` (each `Keep` re-keeps the currently-kept contiguous
//! window of sorted positions) and run the pool engine.
//!
//! # Evaluate + the callback
//!
//! `DieTree::Evaluate` runs the user transition through [`dist_of_with`]'s
//! callback: `(func, state, face, count)` — amended at S4b to carry the
//! node's own transition `func`, so nested/multiple `Evaluate` nodes in one
//! tree each apply their own closure. S3 provides the body via
//! `Interp::run_evaluator_step` (which arms the D32-7 effect guard).
//! Plain [`dist_of`] (no callback) FAILS on `Evaluate` nodes with an
//! `Internal` error — the interpreter/S5 must route evaluator-bearing trees
//! through [`dist_of_with`]. Evaluator `EvalError`s are threaded out of the
//! DP intact (kind/span preserved) via a capture slot around
//! `DistError::External`.
//!
//! # Budgets and errors
//!
//! Each `dist_of`/`dist_of_with` call constructs a fresh
//! [`Budget::default`] (the D32-12 limits) and threads it through the whole
//! lowering. S3's [`crate::fuel::Fuel`] has no distribution counters (they
//! are S4's per D32-12), so there is no shared fuel object — S5 wires the
//! wasm-level budget later. `DistError::Budget { counter }` maps to an
//! `EvalError` with `kind = Fuel` whose message preserves the counter name
//! (`"fuel exhausted: <counter>"`); every other engine error maps to
//! `kind = Eval`.

use std::cmp::Ordering;
use std::collections::BTreeMap;

use num_bigint::{BigInt, BigUint};

use crate::ast::{BinOp, CmpOp};
use crate::dist::{
    self, Budget, Dist, DistError, KeepTuple, Weight, eval_pool, rational_to_decimal, reroll_faces,
    try_combine,
};
use crate::value::{DEC_SCALE, DieTree, EvalError, Keep, MinMaxOp, PoolTree, Value, total_cmp};

// ---------------------------------------------------------------------------
// Error mapping (D32-12 counters → fuel-kind EvalErrors)
// ---------------------------------------------------------------------------

impl From<DistError> for EvalError {
    fn from(e: DistError) -> EvalError {
        match e {
            DistError::Budget { counter } => EvalError::fuel(counter, None),
            other => EvalError::eval(other.to_string(), None),
        }
    }
}

// ---------------------------------------------------------------------------
// The internal face wrapper
// ---------------------------------------------------------------------------

/// The seam's face type (module docs): numeric faces order numerically,
/// non-numeric faces order by their baked D32-4 face-order rank.
#[derive(Debug, Clone)]
pub(crate) enum Face {
    Num(BigInt),
    /// A Dec face, as its scaled-i128 representation.
    Dec(i128),
    /// A non-numeric face with its face-order rank baked in.
    Ranked {
        rank: u32,
        value: Value,
    },
}

impl Face {
    fn kind(&self) -> u8 {
        match self {
            Face::Num(_) => 0,
            Face::Dec(_) => 1,
            Face::Ranked { .. } => 2,
        }
    }

    /// Unwrap back to the plain runtime [`Value`].
    fn value(&self) -> Value {
        match self {
            Face::Num(n) => Value::Num(n.clone()),
            Face::Dec(d) => Value::Dec(*d),
            Face::Ranked { value, .. } => value.clone(),
        }
    }

    /// Does this face carry exactly the given runtime value?
    fn matches(&self, v: &Value) -> bool {
        match self {
            Face::Num(n) => matches!(v, Value::Num(m) if m == n),
            Face::Dec(d) => matches!(v, Value::Dec(x) if x == d),
            Face::Ranked { value, .. } => value == v,
        }
    }
}

impl Ord for Face {
    fn cmp(&self, other: &Face) -> Ordering {
        match (self, other) {
            (Face::Num(a), Face::Num(b)) => a.cmp(b),
            (Face::Dec(a), Face::Dec(b)) => a.cmp(b),
            (Face::Ranked { rank: a, value: va }, Face::Ranked { rank: b, value: vb }) => {
                a.cmp(b).then_with(|| total_cmp(va, vb))
            }
            _ => self.kind().cmp(&other.kind()),
        }
    }
}

impl PartialOrd for Face {
    fn partial_cmp(&self, other: &Face) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Face {
    fn eq(&self, other: &Face) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Face {}

/// Structural equality of the UNDERLYING values (lifted `==`/`!=`). Ranks
/// are ignored; cross-kind faces are simply unequal (checker-prevented).
fn faces_eq(a: &Face, b: &Face) -> bool {
    match (a, b) {
        (Face::Num(x), Face::Num(y)) => x == y,
        (Face::Dec(x), Face::Dec(y)) => x == y,
        (Face::Ranked { value: x, .. }, Face::Ranked { value: y, .. }) => x == y,
        _ => false,
    }
}

/// An evaluate-state key: a function-free [`Value`] ordered by
/// [`total_cmp`] (Eq derived FROM the same order so the DP maps stay
/// coherent even on degenerate inputs).
#[derive(Debug, Clone)]
struct StateKey(Value);

impl Ord for StateKey {
    fn cmp(&self, other: &StateKey) -> Ordering {
        total_cmp(&self.0, &other.0)
    }
}

impl PartialOrd for StateKey {
    fn partial_cmp(&self, other: &StateKey) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for StateKey {
    fn eq(&self, other: &StateKey) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for StateKey {}

// ---------------------------------------------------------------------------
// The public callback + result types
// ---------------------------------------------------------------------------

/// The unsized evaluator-transition function type (D32-8, amended at S4b to
/// carry the node's transition function). Arguments: transition func (the
/// `Evaluate` node's closure value), current state, face value, count of
/// kept dice showing that face; returns the next state.
pub type EvaluatorFn<'a> = dyn FnMut(&Value, &Value, &Value, u64) -> Result<Value, EvalError> + 'a;

/// The evaluator callback [`dist_of_with`] takes — S3 provides the body via
/// `Interp::run_evaluator_step` (effect guard armed).
pub type EvaluatorCallback<'a, 'b> = &'a mut EvaluatorFn<'b>;

/// A computed distribution with plain [`Value`] faces — the surface S5's
/// goodness/plot/sample layers read.
///
/// `support`/`min_face`/`max_face`/`quantity_*` follow the SORTED (`Ord`)
/// order; `face_order`/`position_of` follow the D32-4 face-order vector.
#[derive(Debug, Clone)]
pub struct SeamDist(Dist<Face>);

impl SeamDist {
    /// `(face, weight)` pairs in ascending sorted (`Ord`) order.
    pub fn support(&self) -> Vec<(Value, BigUint)> {
        self.0
            .entries()
            .map(|(f, w)| (f.value(), w.to_biguint()))
            .collect()
    }

    /// The denominator (sum of all weights). Never zero.
    pub fn denominator(&self) -> BigUint {
        self.0.denominator().to_biguint()
    }

    /// Number of distinct faces.
    pub fn support_len(&self) -> usize {
        self.0.support_len()
    }

    /// The D32-4 face-order vector, as plain values.
    pub fn face_order(&self) -> Vec<Value> {
        self.0.face_order().iter().map(Face::value).collect()
    }

    /// The face's position in the face-order vector (goodness reads this).
    pub fn position_of(&self, v: &Value) -> Option<usize> {
        self.0.face_order().iter().position(|f| f.matches(v))
    }

    /// The weight of `v` (zero if absent).
    pub fn weight_of(&self, v: &Value) -> BigUint {
        self.0
            .entries()
            .find(|(f, _)| f.matches(v))
            .map(|(_, w)| w.to_biguint())
            .unwrap_or_default()
    }

    /// Smallest face by `Ord` (numeric minimum / face-order-first).
    pub fn min_face(&self) -> Value {
        self.0.min_face().value()
    }

    /// Largest face by `Ord` (numeric maximum / face-order-last).
    pub fn max_face(&self) -> Value {
        self.0.max_face().value()
    }

    /// Exact mean as a 6-place decimal string — `Some` for Num or Dec
    /// faces, `None` otherwise (D32-10).
    pub fn mean_decimal(&self) -> Option<String> {
        if let Some(d) = self.num_projection() {
            return Some(dist::mean_decimal(&d));
        }
        let d = self.dec_projection()?;
        let (num, den) = dist::mean_rational(&d);
        Some(rational_to_decimal(
            &num,
            &(den * BigUint::from(DEC_SCALE as u128)),
        ))
    }

    /// Standard deviation as a 6-place decimal string — `Some` for Num or
    /// Dec faces, `None` otherwise.
    pub fn std_decimal(&self) -> Option<String> {
        if let Some(d) = self.num_projection() {
            return Some(dist::std_decimal(&d));
        }
        let d = self.dec_projection()?;
        let (vn, vd) = dist::variance_rational(&d);
        let vd = vd * BigUint::from(DEC_SCALE as u128).pow(2);
        Some(sqrt_rational_decimal(&vn, &vd))
    }

    /// Total weight of faces `<= v` in `Ord` order (`None` when `v` is a
    /// non-numeric value absent from the support — its rank is unknowable).
    pub fn quantity_le(&self, v: &Value) -> Option<BigUint> {
        let f = self.face_key(v)?;
        Some(dist::quantity_le(&self.0, &f).to_biguint())
    }

    /// Total weight of faces `>= v` in `Ord` order.
    pub fn quantity_ge(&self, v: &Value) -> Option<BigUint> {
        let f = self.face_key(v)?;
        Some(dist::quantity_ge(&self.0, &f).to_biguint())
    }

    /// The internal face for a query value: numeric values convert
    /// directly; non-numeric values must be found in the support to recover
    /// their rank.
    fn face_key(&self, v: &Value) -> Option<Face> {
        match v {
            Value::Num(n) => Some(Face::Num(n.clone())),
            Value::Dec(d) => Some(Face::Dec(*d)),
            _ => self.0.face_order().iter().find(|f| f.matches(v)).cloned(),
        }
    }

    /// Project to a `Dist<BigInt>` when every face is Num.
    fn num_projection(&self) -> Option<Dist<BigInt>> {
        if !self
            .0
            .face_order()
            .iter()
            .all(|f| matches!(f, Face::Num(_)))
        {
            return None;
        }
        self.0
            .map(&Budget::default(), |f| match f {
                Face::Num(n) => n.clone(),
                _ => unreachable!("all-Num checked"),
            })
            .ok()
    }

    /// Project to a scaled `Dist<i128>` when every face is Dec.
    fn dec_projection(&self) -> Option<Dist<i128>> {
        if !self
            .0
            .face_order()
            .iter()
            .all(|f| matches!(f, Face::Dec(_)))
        {
            return None;
        }
        self.0
            .map(&Budget::default(), |f| match f {
                Face::Dec(d) => *d,
                _ => unreachable!("all-Dec checked"),
            })
            .ok()
    }
}

/// `sqrt(vn / vd)` as a 6-place decimal string, round-half-up on the
/// magnitude — the same isqrt scheme as `dist::std_decimal`, generalized to
/// a caller-adjusted denominator (the Dec-face scale correction).
fn sqrt_rational_decimal(vn: &BigInt, vd: &BigUint) -> String {
    let scale2 = BigUint::from(10u32).pow(12);
    let s = (vn.magnitude() * vd * scale2).sqrt();
    let q = (&s * BigUint::from(2u32) + vd) / (vd * BigUint::from(2u32));
    let scale = BigUint::from(10u32).pow(6);
    format!("{}.{:0>6}", &q / &scale, &q % &scale)
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/// Compute the exact distribution of `tree` with a fresh default D32-12
/// budget. Fails with an `Internal` error on [`DieTree::Evaluate`] nodes —
/// route evaluator-bearing trees through [`dist_of_with`].
pub fn dist_of(tree: &DieTree) -> Result<SeamDist, EvalError> {
    let mut budget = Budget::default();
    build(tree, &mut budget, None).map(SeamDist)
}

/// [`dist_of`] with the evaluator callback for [`DieTree::Evaluate`] nodes.
pub fn dist_of_with(
    tree: &DieTree,
    evaluator: EvaluatorCallback<'_, '_>,
) -> Result<SeamDist, EvalError> {
    let mut budget = Budget::default();
    build(tree, &mut budget, Some(evaluator)).map(SeamDist)
}

// ---------------------------------------------------------------------------
// Tree lowering
// ---------------------------------------------------------------------------

fn internal(msg: &str) -> EvalError {
    EvalError::internal(format!("{msg} — the checker should have rejected this"))
}

fn build(
    tree: &DieTree,
    budget: &mut Budget,
    mut ev: Option<&mut EvaluatorFn<'_>>,
) -> Result<Dist<Face>, EvalError> {
    match tree {
        DieTree::Leaf { count, sides } => {
            // Guard BEFORE materializing the face vector (a d10^18 must not
            // allocate).
            budget.check_support(*sides)?;
            let faces: Vec<BigInt> = (1..=*sides).map(BigInt::from).collect();
            let die = Dist::uniform(faces, budget)?;
            let summed = if *count == 1 {
                die
            } else {
                dist::sum_pool(&die, *count, &KeepTuple::all(*count), budget)?
            };
            faces_from_num(summed, budget)
        }
        DieTree::Const(v) => {
            if v.contains_function() {
                return Err(internal("die faces must be function-free"));
            }
            Ok(Dist::constant(const_face(v)))
        }
        DieTree::Dl { faces } => {
            let faces = wrap_faces(faces)?;
            Ok(Dist::uniform(faces, budget)?)
        }
        DieTree::Dm { faces } => {
            let wrapped = wrap_faces(faces.iter().map(|(f, _)| f))?;
            let pairs: Vec<(Face, Weight)> = wrapped
                .into_iter()
                .zip(faces.iter().map(|(_, w)| Weight::from_biguint(w.clone())))
                .collect();
            Ok(Dist::weighted(pairs, budget)?)
        }
        DieTree::BinOp { op, lhs, rhs } => {
            let l = build(lhs, budget, ev.as_deref_mut())?;
            let r = build(rhs, budget, ev.as_deref_mut())?;
            let l = nums_of(&l, budget, "die arithmetic")?;
            let r = nums_of(&r, budget, "die arithmetic")?;
            let op = *op;
            let out: Dist<BigInt> = try_combine(&l, &r, budget, |a, b| match op {
                BinOp::Add => Ok(a + b),
                BinOp::Sub => Ok(a - b),
                BinOp::Mul => Ok(a * b),
                BinOp::Div => {
                    if *b == BigInt::ZERO {
                        // Same visible error S3 raises for constant zero
                        // divisors; zero here sits in the divisor's support.
                        Err(EvalError::eval("division by zero", None))
                    } else {
                        // Num division truncates toward zero (documented).
                        Ok(a / b)
                    }
                }
            })?;
            faces_from_num(out, budget)
        }
        DieTree::Cmp { op, lhs, rhs } => {
            let l = build(lhs, budget, ev.as_deref_mut())?;
            let r = build(rhs, budget, ev.as_deref_mut())?;
            let op = *op;
            let out: Dist<bool> = try_combine(&l, &r, budget, |a, b| cmp_faces(op, a, b))?;
            // Pinned Bool face order [:false, :true] regardless of which
            // outcome the cartesian walk produced first.
            let mut pairs = Vec::new();
            for (b, rank) in [(false, 0u32), (true, 1u32)] {
                let w = out.weight_of(&b);
                if !w.is_zero() {
                    pairs.push((
                        Face::Ranked {
                            rank,
                            value: Value::bool(b),
                        },
                        w,
                    ));
                }
            }
            Ok(Dist::weighted(pairs, budget)?)
        }
        DieTree::Neg(inner) => {
            let d = build(inner, budget, ev.as_deref_mut())?;
            let d = nums_of(&d, budget, "die negation")?;
            let out = d.map(budget, |n| -n.clone())?;
            faces_from_num(out, budget)
        }
        DieTree::MinMax { op, lhs, rhs } => {
            let l = build(lhs, budget, ev.as_deref_mut())?;
            let r = build(rhs, budget, ev.as_deref_mut())?;
            let l = nums_of(&l, budget, "min/max on dice")?;
            let r = nums_of(&r, budget, "min/max on dice")?;
            let pick_min = *op == MinMaxOp::Min;
            let out = dist::combine(&l, &r, budget, |a, b| {
                if (a <= b) == pick_min {
                    a.clone()
                } else {
                    b.clone()
                }
            })?;
            faces_from_num(out, budget)
        }
        DieTree::Explode { inner, depth } => {
            let d = build(inner, budget, ev.as_deref_mut())?;
            let d = nums_of(&d, budget, "explode")?;
            let depth =
                u32::try_from(*depth).map_err(|_| EvalError::fuel("explode_depth", None))?;
            let out = dist::explode(&d, depth, budget)?;
            faces_from_num(out, budget)
        }
        DieTree::Reroll { inner, faces } => {
            let d = build(inner, budget, ev.as_deref_mut())?;
            let d = nums_of(&d, budget, "reroll")?;
            let mut nums = Vec::with_capacity(faces.len());
            for f in faces {
                match f {
                    Value::Num(n) => nums.push(n.clone()),
                    _ => return Err(internal("reroll faces must be Num")),
                }
            }
            let out = reroll_faces(&d, &nums, budget)?;
            faces_from_num(out, budget)
        }
        DieTree::RerollFace { inner, face } => {
            let d = build(inner, budget, ev.as_deref_mut())?;
            let d = nums_of(&d, budget, "reroll")?;
            let out = dist::reroll_face(&d, face, budget)?;
            faces_from_num(out, budget)
        }
        DieTree::Label { inner, .. } => build(inner, budget, ev),
        DieTree::Sum { pool } => {
            let die = build(&pool.die, budget, ev.as_deref_mut())?;
            let die = nums_of(&die, budget, "sum over a pool")?;
            let kt = keep_tuple(pool)?;
            let out = dist::sum_pool(&die, pool.count, &kt, budget)?;
            faces_from_num(out, budget)
        }
        DieTree::Successes { pool, target } => {
            let die = build(&pool.die, budget, ev.as_deref_mut())?;
            let die = nums_of(&die, budget, "successes over a pool")?;
            let kt = keep_tuple(pool)?;
            let out = dist::successes(&die, pool.count, &kt, target, budget)?;
            let out = out.map(budget, |c| BigInt::from(*c))?;
            faces_from_num(out, budget)
        }
        DieTree::Evaluate { pool, init, func } => {
            let die = build(&pool.die, budget, ev.as_deref_mut())?;
            let kt = keep_tuple(pool)?;
            let cb = ev.ok_or_else(|| {
                EvalError::internal(
                    "evaluate() needs the interpreter callback — route through dist_of_with",
                )
            })?;
            run_evaluate(&die, pool.count, &kt, init, func, cb, budget)
        }
    }
}

/// The `Evaluate` DP: wrap the interpreter callback into the pool engine's
/// transition, threading real `EvalError`s out through a capture slot.
fn run_evaluate(
    die: &Dist<Face>,
    count: u64,
    kt: &KeepTuple,
    init: &Value,
    func: &Value,
    cb: &mut EvaluatorFn<'_>,
    budget: &mut Budget,
) -> Result<Dist<Face>, EvalError> {
    let mut captured: Option<EvalError> = None;
    let out = {
        let mut next = |s: &StateKey, f: &Face, c: i64| -> Result<StateKey, DistError> {
            let external = |message: &str| DistError::External {
                message: message.to_owned(),
            };
            let c = u64::try_from(c).map_err(|_| external("negative kept count"))?;
            let face = f.value();
            match cb(func, &s.0, &face, c) {
                Ok(v) => Ok(StateKey(v)),
                Err(e) => {
                    let msg = e.message.clone();
                    captured = Some(e);
                    Err(external(&msg))
                }
            }
        };
        eval_pool(die, count, kt, StateKey(init.clone()), &mut next, budget)
    };
    let out = match out {
        Ok(d) => d,
        Err(e) => return Err(captured.take().unwrap_or_else(|| e.into())),
    };
    // Result face order = ascending structural total_cmp order (pinned):
    // eval_pool's face_order IS the ascending Ord order of the states.
    let mut pairs = Vec::with_capacity(out.support_len());
    for (rank, s) in out.face_order().iter().enumerate() {
        let face = match &s.0 {
            Value::Num(n) => Face::Num(n.clone()),
            Value::Dec(d) => Face::Dec(*d),
            v => Face::Ranked {
                rank: rank as u32,
                value: v.clone(),
            },
        };
        pairs.push((face, out.weight_of(s)));
    }
    Ok(Dist::weighted(pairs, budget)?)
}

/// One lifted comparison on a pair of faces. Equality is structural on the
/// underlying values; ordering is Num-only (the checker joins lifted
/// ordering operands with `Num`).
fn cmp_faces(op: CmpOp, a: &Face, b: &Face) -> Result<bool, EvalError> {
    Ok(match op {
        CmpOp::EqEq => faces_eq(a, b),
        CmpOp::NotEq => !faces_eq(a, b),
        _ => {
            let ord = match (a, b) {
                (Face::Num(x), Face::Num(y)) => x.cmp(y),
                _ => return Err(internal("lifted ordering needs Num faces")),
            };
            match op {
                CmpOp::Lt => ord.is_lt(),
                CmpOp::Le => ord.is_le(),
                CmpOp::Gt => ord.is_gt(),
                CmpOp::Ge => ord.is_ge(),
                CmpOp::EqEq | CmpOp::NotEq => unreachable!("handled above"),
            }
        }
    })
}

// ---------------------------------------------------------------------------
// Face construction + projections
// ---------------------------------------------------------------------------

/// The face for a `Const` node's single value.
fn const_face(v: &Value) -> Face {
    match v {
        Value::Num(n) => Face::Num(n.clone()),
        Value::Dec(d) => Face::Dec(*d),
        other => Face::Ranked {
            rank: 0,
            value: other.clone(),
        },
    }
}

/// Wrap a `dl`/`dm` face list: Num/Dec faces pass through rankless (numeric
/// `Ord`); anything else gets its D32-4 face-order rank baked in
/// (first-occurrence order — duplicates share the first occurrence's rank).
/// Faces are homogeneous by the checker; a mix is an `Internal` error.
fn wrap_faces<'a>(faces: impl IntoIterator<Item = &'a Value>) -> Result<Vec<Face>, EvalError> {
    let faces: Vec<&Value> = faces.into_iter().collect();
    let numeric_kind = faces
        .first()
        .map(|v| matches!(v, Value::Num(_) | Value::Dec(_)));
    let mut ranks: BTreeMap<StateKey, u32> = BTreeMap::new();
    let mut out = Vec::with_capacity(faces.len());
    for v in faces {
        if v.contains_function() {
            return Err(internal("die faces must be function-free"));
        }
        let face = match v {
            Value::Num(n) if numeric_kind == Some(true) => Face::Num(n.clone()),
            Value::Dec(d) if numeric_kind == Some(true) => Face::Dec(*d),
            Value::Num(_) | Value::Dec(_) => {
                return Err(internal("die faces must be one type"));
            }
            other => {
                if numeric_kind == Some(true) {
                    return Err(internal("die faces must be one type"));
                }
                let next = ranks.len() as u32;
                let rank = *ranks.entry(StateKey(other.clone())).or_insert(next);
                Face::Ranked {
                    rank,
                    value: other.clone(),
                }
            }
        };
        out.push(face);
    }
    Ok(out)
}

/// Project a face dist onto `BigInt` faces, or fail (`Internal`) when any
/// face is non-Num — every caller is a checker-guaranteed-Num position.
fn nums_of(d: &Dist<Face>, budget: &Budget, what: &str) -> Result<Dist<BigInt>, EvalError> {
    if !d.face_order().iter().all(|f| matches!(f, Face::Num(_))) {
        return Err(internal(&format!("{what} needs Num faces")));
    }
    Ok(d.map(budget, |f| match f {
        Face::Num(n) => n.clone(),
        _ => unreachable!("all-Num checked"),
    })?)
}

/// Wrap a numeric dist back into faces (order-preserving: `map` walks the
/// face-order vector).
fn faces_from_num(d: Dist<BigInt>, budget: &Budget) -> Result<Dist<Face>, EvalError> {
    Ok(d.map(budget, |n| Face::Num(n.clone()))?)
}

/// Fold a pool's keep chain into ONE keep-tuple: the kept set is always a
/// contiguous window of sorted positions; each `Keep` re-keeps within the
/// current window (S3 validated the bounds at construction — violations
/// here are `Internal`).
fn keep_tuple(pool: &PoolTree) -> Result<KeepTuple, EvalError> {
    let count = usize::try_from(pool.count).map_err(|_| EvalError::fuel("pool_count", None))?;
    let (mut lo, mut hi) = (0usize, count);
    for k in &pool.keep {
        let n = usize::try_from(k.n()).unwrap_or(usize::MAX);
        if n == 0 || n > hi - lo {
            return Err(internal("keep chain out of bounds"));
        }
        match k {
            Keep::High(_) => lo = hi - n,
            Keep::Low(_) => hi = lo + n,
        }
    }
    let mut v = vec![0i64; count];
    for slot in &mut v[lo..hi] {
        *slot = 1;
    }
    Ok(KeepTuple::from_vec(v))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::ErrorKind;

    #[test]
    fn dist_of_computes_a_plain_leaf() {
        let d = dist_of(&DieTree::Leaf { count: 1, sides: 6 }).unwrap();
        assert_eq!(d.support_len(), 6);
        assert_eq!(d.denominator(), BigUint::from(6u32));
        assert_eq!(d.min_face(), Value::num_i64(1));
        assert_eq!(d.max_face(), Value::num_i64(6));
    }

    #[test]
    fn plain_dist_of_still_fails_on_evaluate_nodes() {
        let tree = DieTree::Evaluate {
            pool: PoolTree {
                count: 2,
                die: Box::new(DieTree::Leaf { count: 1, sides: 6 }),
                keep: vec![],
            },
            init: Box::new(Value::num_i64(0)),
            func: Box::new(Value::Builtin(crate::value::BuiltinValue {
                name: "sum",
                args: vec![],
            })),
        };
        let e = dist_of(&tree).unwrap_err();
        assert_eq!(e.kind, ErrorKind::Internal);
        assert!(e.message.contains("dist_of_with"));
    }

    #[test]
    fn budget_errors_map_to_fuel_kind_with_the_counter_name() {
        let e: EvalError = DistError::Budget { counter: "states" }.into();
        assert_eq!(e.kind, ErrorKind::Fuel);
        assert!(e.message.contains("states"));
        let e: EvalError = DistError::Empty.into();
        assert_eq!(e.kind, ErrorKind::Eval);
    }
}
