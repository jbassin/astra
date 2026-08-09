//! The exact-distribution engine (S4) — the icepool port (D32-10).
//!
//! Pure and value-agnostic: everything is generic over a face type
//! `F: Ord + Clone` and never touches the interpreter's `Value`. The
//! orchestrator wires the interpreter's die seam to this module at merge.
//!
//! Contents:
//! - [`Weight`] — exact nonnegative integer weights, `u128` fast path with
//!   checked promotion to `BigUint`, bit-length capped (D32-12).
//! - [`Dist`] — a distribution: sorted `BTreeMap<F, Weight>` entries plus an
//!   **explicit face-order vector** (D32-4) and a cached denominator.
//! - [`combine`]/[`try_combine`]/[`Dist::map`]/[`mix`] — cartesian binary
//!   ops, unary remap, and the weighted-lcm mixture.
//! - [`KeepTuple`] + [`eval_pool`] — the pool recursion (pop-extreme +
//!   weighted-Pascal `comb_row` + keep-tuple + level memo + `skip_weight`
//!   dump), iterating faces in DESCENDING `Ord` order (D32-8).
//! - [`sum_pool`] (with the keep-1 closed forms [`highest_1`]/[`lowest_1`])
//!   and [`successes`].
//! - [`explode`] / [`reroll_faces`] / [`reroll_face`] — bounded die-level
//!   expansion / substitution.
//! - Numeric-face statistics: exact-rational mean/variance, 6-place decimal
//!   mean/std, `quantity_le`/`quantity_ge`.
//!
//! Budgets (D32-12): every allocation/growth point checks a [`Budget`] the
//! caller threads **before** growing; exhaustion is
//! `DistError::Budget { counter }`.
//!
//! Ported-from inventory (icepool `33e7e650`, v2.2.2):
//! `math.py::comb_row`/`weighted_lcm`, `creation_args.py::merge_weights_lcm`,
//! `generator/pool.py::PoolSource.pop` + `iter_die_pop_max`,
//! `generator/keep.py::pop_{min,max}_from_keep_tuple`,
//! `order.py::lo_hi_skip`, `evaluator/multiset_evaluator_base.py` (the
//! forward DP shape, flattened to an iterative per-face level map),
//! `population/keep.py::_highest_single`/`_lowest_single`,
//! `population/die.py::reroll` (depth=1) / `explode`.

mod base;
mod budget;
mod die_ops;
mod keep;
mod pool;
mod stats;
mod weight;

pub use base::{Dist, SumFace, combine, mix, try_combine};
pub use budget::{Budget, DistError};
pub use die_ops::{explode, reroll_face, reroll_faces};
pub use keep::KeepTuple;
pub use pool::{eval_pool, highest_1, lowest_1, successes, sum_pool};
pub use stats::{
    NumFace, mean_decimal, mean_rational, quantity_ge, quantity_le, std_decimal, variance_rational,
};
pub use weight::Weight;
