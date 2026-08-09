//! The pool algorithm (D32-10): icepool's pop-extreme recursion with the
//! weighted-Pascal `comb_row`, the keep-tuple, per-level memoization, and
//! the `skip_weight` all-remaining dump — flattened to an iterative
//! per-face level map (equivalent to the memoized forward recursion of
//! `multiset_evaluator_base.py::evaluate_forward`; the level map IS the
//! (keep-tuple, state) memo for the current face index, so recursion depth
//! never scales with support size).
//!
//! Iteration order: [`eval_pool`] visits faces in DESCENDING `Ord` order
//! (D32-8). Note the keep-tuple is defined over SORTED positions, so `Ord`
//! order is the only coherent iteration order — for dice whose D32-4
//! face-order vector differs from sorted order (`dl`/`dm`), the evaluator
//! still sees sorted-descending faces. The transition callback sees EVERY
//! face of the die exactly once, with the kept count of dice showing it
//! (possibly 0, and negative under negative keep-tuple entries).

use std::collections::BTreeMap;

use super::base::{Dist, SumFace};
use super::budget::{Budget, DistError};
use super::keep::KeepTuple;
use super::weight::Weight;

/// The pool transition callback: `(state, face, kept_count) -> new state`.
/// `kept_count` is signed (negative keep-tuple entries count dice
/// negatively).
pub type NextState<'a, F, S> = &'a mut dyn FnMut(&S, &F, i64) -> Result<S, DistError>;

/// Cached weighted-Pascal rows for one per-face weight `b`:
/// `row(n)[k] == C(n, k) * b^k` (icepool `math.py::comb_row`).
struct CombRows {
    b: Weight,
    rows: Vec<Vec<Weight>>,
}

impl CombRows {
    fn new(b: Weight) -> CombRows {
        CombRows {
            b,
            rows: vec![vec![Weight::one()]],
        }
    }

    /// The row for `n` dice, built incrementally. Each freshly computed cell
    /// charges one transition (the rows are the DP's other super-linear
    /// cost, so they must be metered too).
    fn row(&mut self, n: usize, budget: &mut Budget) -> Result<&[Weight], DistError> {
        let bits = budget.weight_bits;
        while self.rows.len() <= n {
            let prev = &self.rows[self.rows.len() - 1];
            budget.charge_transitions(prev.len() as u64 + 1)?;
            let mut next = Vec::with_capacity(prev.len() + 1);
            next.push(Weight::one());
            for k in 1..prev.len() {
                let t = self.b.checked_mul(&prev[k - 1], bits)?;
                next.push(prev[k].checked_add(&t, bits)?);
            }
            next.push(self.b.checked_mul(&prev[prev.len() - 1], bits)?);
            self.rows.push(next);
        }
        Ok(&self.rows[n])
    }
}

/// Accumulate a weighted branch into the next level map, charging the
/// states budget before the map grows.
fn accumulate<K: Ord>(
    level: &mut BTreeMap<K, Weight>,
    key: K,
    w: Weight,
    budget: &mut Budget,
) -> Result<(), DistError> {
    match level.get_mut(&key) {
        Some(existing) => {
            *existing = existing.checked_add(&w, budget.weight_bits)?;
        }
        None => {
            budget.check_states(level.len() as u64 + 1)?;
            level.insert(key, w);
        }
    }
    Ok(())
}

/// The pool DP over `count` copies of `die`, iterating faces in the given
/// direction. `descending` is the D32-8 public contract; ascending is used
/// internally only for order-agnostic callbacks (sums, successes) when the
/// keep-tuple's zero-skew prefers it (icepool's `lo_hi_skip` heuristic).
fn eval_pool_ordered<F, S>(
    die: &Dist<F>,
    count: u64,
    keep: &KeepTuple,
    init: S,
    next: NextState<'_, F, S>,
    budget: &mut Budget,
    descending: bool,
) -> Result<Dist<S>, DistError>
where
    F: Ord + Clone,
    S: Ord + Clone,
{
    if keep.len() as u64 != count {
        return Err(DistError::KeepLen {
            expected: count,
            got: keep.len() as u64,
        });
    }
    // Faces in evaluation order, with tail[i] = total weight of the faces
    // AFTER position i (the remaining pool's per-die denominator, used by
    // the skip_weight dump).
    let mut faces: Vec<(&F, &Weight)> = die.entries().collect();
    if descending {
        faces.reverse();
    }
    let m = faces.len();
    let mut tail = vec![Weight::zero(); m];
    for i in (0..m.saturating_sub(1)).rev() {
        tail[i] = tail[i + 1].checked_add(faces[i + 1].1, budget.weight_bits)?;
    }

    // comb_row caches keyed by per-face weight (uniform dice share one).
    let mut comb: BTreeMap<Weight, CombRows> = BTreeMap::new();

    let mut level: BTreeMap<(KeepTuple, S), Weight> = BTreeMap::new();
    level.insert((keep.clone(), init), Weight::one());

    for (i, (face, w)) in faces.iter().enumerate() {
        let is_last = i + 1 == m;
        let mut next_level: BTreeMap<(KeepTuple, S), Weight> = BTreeMap::new();
        for ((kt, state), path_w) in &level {
            let n = kt.len();
            if n == 0 {
                // No dice left (post-dump): the callback still sees the
                // face, with count 0 (the multiset-evaluator contract).
                budget.charge_transitions(1)?;
                let s2 = next(state, face, 0)?;
                accumulate(
                    &mut next_level,
                    (KeepTuple::empty(), s2),
                    path_w.clone(),
                    budget,
                )?;
                continue;
            }
            // At the last face every remaining die must hit it (icepool
            // `iter_die_pop_max` popped-die-empty case).
            let hit_min = if is_last { n } else { 0 };
            let row = comb
                .entry((*w).clone())
                .or_insert_with(|| CombRows::new((*w).clone()))
                .row(n, budget)?
                .to_vec();
            let mut skip_acc: Option<Weight> = None;
            for (hits, comb_w) in row.iter().enumerate().take(n + 1).skip(hit_min) {
                let (kt2, kept) = if descending {
                    kt.pop_max(hits)
                } else {
                    kt.pop_min(hits)
                };
                if kt2.is_all_zero() {
                    // skip_weight dump (icepool PoolSource.pop): every
                    // remaining keep entry is zero, so all misses can be
                    // dumped at once in exchange for the remaining
                    // denominator tail^(n-hits). All dumped branches share
                    // kept == kt.sum() (the unpopped entries sum to 0).
                    let dump = comb_w.checked_mul(
                        &tail[i].checked_pow((n - hits) as u64, budget.weight_bits)?,
                        budget.weight_bits,
                    )?;
                    skip_acc = Some(match skip_acc {
                        Some(acc) => acc.checked_add(&dump, budget.weight_bits)?,
                        None => dump,
                    });
                } else {
                    budget.charge_transitions(1)?;
                    let s2 = next(state, face, kept)?;
                    let bw = path_w.checked_mul(comb_w, budget.weight_bits)?;
                    accumulate(&mut next_level, (kt2, s2), bw, budget)?;
                }
            }
            if let Some(sw) = skip_acc {
                budget.charge_transitions(1)?;
                let s2 = next(state, face, kt.sum())?;
                let bw = path_w.checked_mul(&sw, budget.weight_bits)?;
                accumulate(&mut next_level, (KeepTuple::empty(), s2), bw, budget)?;
            }
        }
        level = next_level;
    }

    // Every die has been popped: fold the level into the result. The
    // result's face order is the ascending structural (`Ord`) order of `S`
    // (pinned — pool results are new values with no inherited order).
    let mut entries: BTreeMap<S, Weight> = BTreeMap::new();
    for ((kt, s), pw) in level {
        debug_assert!(kt.is_empty());
        match entries.get_mut(&s) {
            Some(existing) => *existing = existing.checked_add(&pw, budget.weight_bits)?,
            None => {
                budget.check_support(entries.len() as u64 + 1)?;
                entries.insert(s, pw);
            }
        }
    }
    if entries.is_empty() {
        return Err(DistError::Empty);
    }
    let face_order: Vec<S> = entries.keys().cloned().collect();
    Ok(Dist::from_parts(entries, face_order))
}

/// Evaluate a pool of `count` copies of `die` under `keep` with a
/// user-style transition (D32-8).
///
/// Faces are visited in DESCENDING `Ord` order, each exactly once; the
/// callback receives the kept count of dice showing that face (0 and
/// negative counts included). The result's face order is the ascending
/// `Ord` order of the states.
pub fn eval_pool<F, S>(
    die: &Dist<F>,
    count: u64,
    keep: &KeepTuple,
    init: S,
    next: NextState<'_, F, S>,
    budget: &mut Budget,
) -> Result<Dist<S>, DistError>
where
    F: Ord + Clone,
    S: Ord + Clone,
{
    eval_pool_ordered(die, count, keep, init, next, budget, true)
}

/// True when the keep-tuple keeps exactly the single highest position once.
fn is_keep_highest_1(keep: &KeepTuple) -> bool {
    let s = keep.as_slice();
    s.last() == Some(&1) && s[..s.len() - 1].iter().all(|&x| x == 0)
}

/// True when the keep-tuple keeps exactly the single lowest position once.
fn is_keep_lowest_1(keep: &KeepTuple) -> bool {
    let s = keep.as_slice();
    s.first() == Some(&1) && s[1..].iter().all(|&x| x == 0)
}

/// Sum of the kept dice of `count` copies of `die` — the NdM/kh/kl hot
/// path. Dispatches to the keep-1 closed forms when the keep-tuple selects
/// exactly one position at an end; otherwise runs [`eval_pool`] with a
/// summing callback (direction chosen by the `lo_hi_skip` zero-skew
/// heuristic — legal because summation is order-agnostic).
pub fn sum_pool<F: SumFace>(
    die: &Dist<F>,
    count: u64,
    keep: &KeepTuple,
    budget: &mut Budget,
) -> Result<Dist<F>, DistError> {
    if keep.len() as u64 != count {
        return Err(DistError::KeepLen {
            expected: count,
            got: keep.len() as u64,
        });
    }
    if count > 0 {
        if is_keep_highest_1(keep) {
            return highest_1(die, count, budget);
        }
        if is_keep_lowest_1(keep) {
            return lowest_1(die, count, budget);
        }
    }
    let (lo, hi) = keep.lo_hi_skip();
    let descending = lo >= hi;
    let mut cb = |s: &F, f: &F, c: i64| Ok(s.add_scaled(f, c));
    eval_pool_ordered(die, count, keep, F::zero(), &mut cb, budget, descending)
}

/// Keep-1 closed form: the HIGHEST single die of `count` rolls, without
/// pool recursion (icepool `population/keep.py::_highest_single`).
///
/// Law: `weight(f) = Q_le(f)^n - Q_le(prev(f))^n` over ascending faces
/// (cumulative-power trick); denominator `D^n`.
pub fn highest_1<F: SumFace>(
    die: &Dist<F>,
    count: u64,
    budget: &mut Budget,
) -> Result<Dist<F>, DistError> {
    if count == 0 {
        return Err(DistError::Empty);
    }
    let bits = budget.weight_bits;
    let mut entries: BTreeMap<F, Weight> = BTreeMap::new();
    let mut cum = Weight::zero();
    let mut prev_pow = Weight::zero();
    for (f, w) in die.entries() {
        budget.charge_transitions(1)?;
        cum = cum.checked_add(w, bits)?;
        let cp = cum.checked_pow(count, bits)?;
        let fw = cp.sub_exact(&prev_pow);
        entries.insert(f.clone(), fw);
        prev_pow = cp;
    }
    let face_order: Vec<F> = entries.keys().cloned().collect();
    Ok(Dist::from_parts(entries, face_order))
}

/// Keep-1 closed form: the LOWEST single die of `count` rolls
/// (icepool `_lowest_single`): `weight(f) = Q_ge(f)^n - Q_ge(next(f))^n`.
pub fn lowest_1<F: SumFace>(
    die: &Dist<F>,
    count: u64,
    budget: &mut Budget,
) -> Result<Dist<F>, DistError> {
    if count == 0 {
        return Err(DistError::Empty);
    }
    let bits = budget.weight_bits;
    let mut entries: BTreeMap<F, Weight> = BTreeMap::new();
    let mut cum = Weight::zero();
    let mut prev_pow = Weight::zero();
    for (f, w) in die.entries().collect::<Vec<_>>().into_iter().rev() {
        budget.charge_transitions(1)?;
        cum = cum.checked_add(w, bits)?;
        let cp = cum.checked_pow(count, bits)?;
        let fw = cp.sub_exact(&prev_pow);
        entries.insert(f.clone(), fw);
        prev_pow = cp;
    }
    let face_order: Vec<F> = entries.keys().cloned().collect();
    Ok(Dist::from_parts(entries, face_order))
}

/// Count of KEPT dice whose face is `>= target` (via [`eval_pool`] with an
/// indicator callback). Counts are signed: negative keep entries subtract.
pub fn successes<F: Ord + Clone>(
    die: &Dist<F>,
    count: u64,
    keep: &KeepTuple,
    target: &F,
    budget: &mut Budget,
) -> Result<Dist<i64>, DistError> {
    let mut cb = |s: &i64, f: &F, c: i64| Ok(if f >= target { *s + c } else { *s });
    eval_pool(die, count, keep, 0i64, &mut cb, budget)
}
