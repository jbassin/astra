//! The D32-12 fuel counters owned by S3: interpreter steps, interpreter
//! recursion depth, and the construction caps (pool count, explode depth).
//! The S4 distribution counters (DP transitions, state-map entries, support
//! size, bigint bits) live with the dist engine.
//!
//! A **step** = one `Interp::eval` node visit. **Depth** = the `eval`
//! recursion depth, which counts BOTH expression nesting and closure
//! applications (a closure application evaluates its body inside the call's
//! frame) — one counter catches a deeply-nested paren bomb AND unbounded
//! `let f(x) = f(x)` recursion (documented choice). Exhaustion is an
//! [`EvalError`] with `kind = Fuel` naming the counter.

use crate::lower::Span;
use crate::value::EvalError;

/// Interpreter step budget (D32-12; compile-time const, tuned at S7).
pub const INTERP_STEPS: u64 = 2_000_000;
/// Construction cap: pool count (checked BEFORE allocation).
pub const POOL_COUNT_CAP: u64 = 10_000;
/// Construction cap: explode depth.
pub const EXPLODE_DEPTH_CAP: u64 = 8;
/// Interpreter recursion depth cap.
pub const RECURSION_DEPTH_CAP: u32 = 256;

/// The mutable fuel state threaded through one interpretation.
#[derive(Debug, Clone)]
pub struct Fuel {
    steps_remaining: u64,
    depth: u32,
}

impl Fuel {
    /// A fuel budget with a custom step count (the D32-11 `budget` scales
    /// interpreter steps only; depth/construction caps stay fixed).
    pub fn new(steps: u64) -> Fuel {
        Fuel {
            steps_remaining: steps,
            depth: 0,
        }
    }

    /// Burn one interpreter step.
    pub fn step(&mut self, span: Option<Span>) -> Result<(), EvalError> {
        if self.steps_remaining == 0 {
            return Err(EvalError::fuel("interpreter steps", span));
        }
        self.steps_remaining -= 1;
        Ok(())
    }

    /// Enter one interpreter recursion frame.
    pub fn enter(&mut self, span: Option<Span>) -> Result<(), EvalError> {
        if self.depth >= RECURSION_DEPTH_CAP {
            return Err(EvalError::fuel("recursion depth", span));
        }
        self.depth += 1;
        Ok(())
    }

    /// Leave one interpreter recursion frame.
    pub fn exit(&mut self) {
        self.depth = self.depth.saturating_sub(1);
    }

    /// Construction cap: pool count ≤ 10,000, checked before any allocation.
    pub fn check_pool_count(count: u64, span: Option<Span>) -> Result<(), EvalError> {
        if count > POOL_COUNT_CAP {
            return Err(EvalError::fuel("pool count", span));
        }
        Ok(())
    }

    /// Construction cap: `repeat` list length ≤ the pool-count cap (same constant —
    /// both bound how many things one expression materializes before allocation).
    pub fn check_list_len(count: u64, span: Option<Span>) -> Result<(), EvalError> {
        if count > POOL_COUNT_CAP {
            return Err(EvalError::fuel("list length", span));
        }
        Ok(())
    }

    /// Construction cap: explode depth ≤ 8.
    pub fn check_explode_depth(depth: u64, span: Option<Span>) -> Result<(), EvalError> {
        if depth > EXPLODE_DEPTH_CAP {
            return Err(EvalError::fuel("explode depth", span));
        }
        Ok(())
    }
}

impl Default for Fuel {
    fn default() -> Fuel {
        Fuel::new(INTERP_STEPS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::ErrorKind;

    #[test]
    fn step_exhaustion_names_the_counter() {
        let mut fuel = Fuel::new(2);
        assert!(fuel.step(None).is_ok());
        assert!(fuel.step(None).is_ok());
        let e = fuel.step(Some((3, 7))).unwrap_err();
        assert_eq!(e.kind, ErrorKind::Fuel);
        assert!(e.message.contains("interpreter steps"));
        assert_eq!(e.span, Some((3, 7)));
    }

    #[test]
    fn depth_cap_names_the_counter() {
        let mut fuel = Fuel::default();
        for _ in 0..RECURSION_DEPTH_CAP {
            fuel.enter(None).unwrap();
        }
        let e = fuel.enter(None).unwrap_err();
        assert_eq!(e.kind, ErrorKind::Fuel);
        assert!(e.message.contains("recursion depth"));
        fuel.exit();
        assert!(fuel.enter(None).is_ok());
    }

    #[test]
    fn construction_caps_are_boundary_exact() {
        assert!(Fuel::check_pool_count(POOL_COUNT_CAP, None).is_ok());
        let e = Fuel::check_pool_count(POOL_COUNT_CAP + 1, None).unwrap_err();
        assert!(e.message.contains("pool count"));
        assert!(Fuel::check_explode_depth(EXPLODE_DEPTH_CAP, None).is_ok());
        let e = Fuel::check_explode_depth(EXPLODE_DEPTH_CAP + 1, None).unwrap_err();
        assert!(e.message.contains("explode depth"));
        assert_eq!(e.kind, ErrorKind::Fuel);
    }
}
