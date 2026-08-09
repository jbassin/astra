//! The S3 ↔ S4 seam: everything in the interpreter that needs an actual
//! DISTRIBUTION goes through [`dist_of`], which S4's `dist.rs` will
//! implement. Until then it returns `EvalError::internal("dist engine lands
//! at S4")` — S3 tests avoid distribution-demanding paths.
//!
//! # The contract S4 implements
//!
//! - `dist_of(tree)` computes the exact distribution of a [`DieTree`]:
//!   a `Dist` = `BTreeMap<Face, Weight>` (D32-10: `Face` = ordered
//!   `Num(BigInt) | Dec(i128) | Atom(interned u32) | Bool`; `Weight` = u128
//!   fast path with checked `BigUint` promotion) **plus the D32-4 face-order
//!   vector** (a `Vec<Value>` in display order: `Leaf` numeric ascending,
//!   `Dl`/`Dm` their stored face order, mixture/binary-op = left operand's
//!   order then unseen right faces in their order). Goodness, `evaluate`
//!   iteration, and render all read the face-order vector, never the
//!   BTreeMap key order.
//! - Pool evaluation (`Sum`/`Successes`/`Evaluate` nodes) runs the icepool
//!   pool recursion over `(pool.count, pool.die, pool.keep)` — the keep
//!   chain folds into a keep-tuple (each `Keep` re-keeps the currently-kept
//!   contiguous window).
//! - `DieTree::Evaluate` calls the user transition closure through
//!   [`dist_of_with`]'s callback — an
//!   `FnMut(&Value /*state*/, &Value /*face*/, u64 /*count*/) ->
//!   Result<Value, EvalError>` that S3 provides via
//!   `Interp::run_evaluator_step` (which arms the D32-7 effect guard and
//!   applies the closure). Iteration order over faces is DESCENDING
//!   face-order (D32-8). States are weal values under structural eq/hash
//!   ([`Value`]'s `Eq`/`Hash`/`total_cmp`).
//! - Plain `dist_of` (no callback) must fail on `Evaluate` nodes; the
//!   interpreter routes evaluator-bearing trees through [`dist_of_with`].
//! - Errors: div-by-zero in a divisor's support, the D32-12 distribution
//!   counters (DP transitions, state-map entries, support size, bigint
//!   bits) = `EvalError` with the matching kind (`Eval` / `Fuel`).

use crate::value::{DieTree, EvalError, Value};

/// The evaluator-transition callback type (D32-8). Arguments: current state,
/// face value, count of dice showing that face; returns the next state.
pub type EvaluatorCallback<'a> = &'a mut dyn FnMut(&Value, &Value, u64) -> Result<Value, EvalError>;

/// Opaque handle to a computed distribution. S4 replaces this with its real
/// `Dist` (ordered faces + weights + face-order vector); it is deliberately
/// uninhabitable-by-construction until then.
#[derive(Debug)]
pub struct DistHandle {
    _s4: (),
}

/// Compute the exact distribution of `tree`. **Stub until S4.**
pub fn dist_of(tree: &DieTree) -> Result<DistHandle, EvalError> {
    let _ = tree;
    Err(EvalError::internal("dist engine lands at S4"))
}

/// [`dist_of`] with the evaluator callback for `DieTree::Evaluate` nodes.
/// **Stub until S4.**
pub fn dist_of_with(
    tree: &DieTree,
    evaluator: EvaluatorCallback<'_>,
) -> Result<DistHandle, EvalError> {
    let _ = evaluator;
    dist_of(tree)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::ErrorKind;

    #[test]
    fn dist_of_is_stubbed_until_s4() {
        let e = dist_of(&DieTree::Leaf { count: 1, sides: 6 }).unwrap_err();
        assert_eq!(e.kind, ErrorKind::Internal);
        assert!(e.message.contains("S4"));
    }
}
