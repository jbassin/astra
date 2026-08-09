//! S4 unit tests for the pool DP: hand-checked small pools, the D32-8
//! descending-order contract, keep semantics, successes, die-level ops, and
//! per-counter budget aborts.

use weal_engine::dist::{
    Budget, Dist, DistError, KeepTuple, Weight, eval_pool, explode, reroll_face, reroll_faces,
    successes, sum_pool,
};

fn b() -> Budget {
    Budget::default()
}

fn d(n: i64) -> Dist<i64> {
    Dist::uniform((1..=n).collect(), &b()).unwrap()
}

fn w(v: u128) -> Weight {
    Weight::from_u128(v)
}

fn sum_cb(s: &i64, f: &i64, c: i64) -> Result<i64, DistError> {
    Ok(s + f * c)
}

#[test]
fn two_d6_sum_hand_checked() {
    let s = sum_pool(&d(6), 2, &KeepTuple::all(2), &mut b()).unwrap();
    assert_eq!(s.denominator(), &w(36));
    assert_eq!(s.weight_of(&2), w(1));
    assert_eq!(s.weight_of(&7), w(6));
    assert_eq!(s.weight_of(&12), w(1));
    assert_eq!(s.min_face(), &2);
    assert_eq!(s.max_face(), &12);
    // Result face order = ascending structural order.
    assert_eq!(s.face_order(), (2..=12).collect::<Vec<_>>().as_slice());
}

#[test]
fn keep_len_mismatch_errors() {
    assert_eq!(
        sum_pool(&d(6), 3, &KeepTuple::all(2), &mut b()),
        Err(DistError::KeepLen {
            expected: 3,
            got: 2
        })
    );
    let mut dyn_cb = |s: &i64, f: &i64, c: i64| sum_cb(s, f, c);
    assert_eq!(
        eval_pool(&d(6), 1, &KeepTuple::all(2), 0i64, &mut dyn_cb, &mut b()),
        Err(DistError::KeepLen {
            expected: 1,
            got: 2
        })
    );
}

#[test]
fn eval_pool_sees_every_face_descending_exactly_once() {
    // State = the sequence of faces seen: every final state must be the
    // full support in descending order, regardless of the dice counts.
    let mut cb = |s: &Vec<i64>, f: &i64, _c: i64| {
        let mut v = s.clone();
        v.push(*f);
        Ok(v)
    };
    let out = eval_pool(
        &d(4),
        3,
        &KeepTuple::keep_highest(3, 2),
        Vec::new(),
        &mut cb,
        &mut b(),
    )
    .unwrap();
    assert_eq!(out.support_len(), 1);
    assert_eq!(out.support().next().unwrap(), &vec![4, 3, 2, 1]);
    assert_eq!(out.denominator(), &w(64));
}

#[test]
fn eval_pool_counts_are_kept_counts() {
    // 2d2kh1: state = list of (face, count) pairs. With keep [0,1] the
    // kept count of the higher face is 1 and the lower 0.
    let mut cb = |s: &Vec<(i64, i64)>, f: &i64, c: i64| {
        let mut v = s.clone();
        v.push((*f, c));
        Ok(v)
    };
    let out = eval_pool(
        &d(2),
        2,
        &KeepTuple::keep_highest(2, 1),
        Vec::new(),
        &mut cb,
        &mut b(),
    )
    .unwrap();
    // Branches: both dice 2 (w1): [(2,1),(1,0)]; one 2 one 1 (w2):
    // [(2,1),(1,0)]; both 1 (w1): [(2,0),(1,1)].
    assert_eq!(out.weight_of(&vec![(2, 1), (1, 0)]), w(3));
    assert_eq!(out.weight_of(&vec![(2, 0), (1, 1)]), w(1));
}

#[test]
fn kh_kl_hand_checked_2d2() {
    let hi = sum_pool(&d(2), 2, &KeepTuple::keep_highest(2, 1), &mut b()).unwrap();
    assert_eq!(hi.weight_of(&1), w(1));
    assert_eq!(hi.weight_of(&2), w(3));
    let lo = sum_pool(&d(2), 2, &KeepTuple::keep_lowest(2, 1), &mut b()).unwrap();
    assert_eq!(lo.weight_of(&1), w(3));
    assert_eq!(lo.weight_of(&2), w(1));
}

#[test]
fn negative_keep_highest_minus_lowest_2d6() {
    // [-1, 1] on 2d6 = high - low: P(0) = 6/36, P(5) = 2/36.
    let diff = sum_pool(&d(6), 2, &KeepTuple::from_vec(vec![-1, 1]), &mut b()).unwrap();
    assert_eq!(diff.denominator(), &w(36));
    assert_eq!(diff.weight_of(&0), w(6));
    assert_eq!(diff.weight_of(&5), w(2));
    assert_eq!(diff.min_face(), &0);
    assert_eq!(diff.max_face(), &5);
}

#[test]
fn zero_count_pool_is_constant_zero() {
    let z = sum_pool(&d(6), 0, &KeepTuple::all(0), &mut b()).unwrap();
    assert_eq!(z, Dist::constant(0i64));
}

#[test]
fn successes_binomial_hand_checked() {
    // 2d6, count >= 5: p = 2/6 per die. P(2) = 4/36, P(1) = 16/36, P(0) = 16/36.
    let s = successes(&d(6), 2, &KeepTuple::all(2), &5, &mut b()).unwrap();
    assert_eq!(s.denominator(), &w(36));
    assert_eq!(s.weight_of(&0), w(16));
    assert_eq!(s.weight_of(&1), w(16));
    assert_eq!(s.weight_of(&2), w(4));
}

#[test]
fn explode_d6_depth_1_hand_checked() {
    // d6e1: faces 1-5 weight 6/36; 7-12 weight 1/36 (6 never survives alone).
    let e = explode(&d(6), 1, &b()).unwrap();
    assert_eq!(e.denominator(), &w(36));
    for f in 1..=5 {
        assert_eq!(e.weight_of(&f), w(6), "face {f}");
    }
    assert_eq!(e.weight_of(&6), w(0));
    for f in 7..=12 {
        assert_eq!(e.weight_of(&f), w(1), "face {f}");
    }
}

#[test]
fn explode_depth_zero_is_identity_and_cap_enforced() {
    assert_eq!(explode(&d(6), 0, &b()).unwrap(), d(6));
    assert_eq!(
        explode(&d(6), 9, &b()),
        Err(DistError::Budget {
            counter: "explode_depth"
        })
    );
}

#[test]
fn explode_single_face_die_chains_to_depth() {
    // A die with one face always explodes: 3 -> 6 -> 9 at depth 2, weight 1.
    let c = Dist::constant(3i64);
    let e = explode(&c, 2, &b()).unwrap();
    assert_eq!(e, Dist::constant(9i64));
}

#[test]
fn reroll_gwf_hand_checked() {
    // d6 reroll {1,2}: matching 2/36 each, others 8/36 each.
    let r = reroll_faces(&d(6), &[1, 2], &b()).unwrap();
    assert_eq!(r.denominator(), &w(36));
    assert_eq!(r.weight_of(&1), w(2));
    assert_eq!(r.weight_of(&2), w(2));
    for f in 3..=6 {
        assert_eq!(r.weight_of(&f), w(8), "face {f}");
    }
    // Single-face variant agrees with the slice form.
    assert_eq!(
        reroll_face(&d(6), &1, &b()).unwrap(),
        reroll_faces(&d(6), &[1], &b()).unwrap()
    );
}

#[test]
fn reroll_absent_face_is_identity() {
    let r = reroll_faces(&d(6), &[7], &b()).unwrap();
    assert_eq!(r, d(6));
    assert_eq!(reroll_faces(&d(6), &[], &b()).unwrap(), d(6));
}

#[test]
fn budget_abort_transitions() {
    let mut tiny = Budget::with_limits(10, u64::MAX, u64::MAX, Budget::DEFAULT_WEIGHT_BITS);
    assert_eq!(
        sum_pool(&d(6), 5, &KeepTuple::all(5), &mut tiny),
        Err(DistError::Budget {
            counter: "transitions"
        })
    );
}

#[test]
fn budget_abort_states() {
    let mut tiny = Budget::with_limits(u64::MAX, 3, u64::MAX, Budget::DEFAULT_WEIGHT_BITS);
    assert_eq!(
        sum_pool(&d(6), 5, &KeepTuple::all(5), &mut tiny),
        Err(DistError::Budget { counter: "states" })
    );
}

#[test]
fn budget_abort_support_on_result() {
    let mut tiny = Budget::with_limits(u64::MAX, u64::MAX, 5, Budget::DEFAULT_WEIGHT_BITS);
    // 3d6 sums span 3..=18 (16 faces) > 5. The die itself (6 faces) also
    // exceeds the cap at construction, so build it under a default budget.
    let die = d(6);
    assert_eq!(
        sum_pool(&die, 3, &KeepTuple::all(3), &mut tiny),
        Err(DistError::Budget { counter: "support" })
    );
}

#[test]
fn budget_abort_weight_bits_in_pool() {
    let mut tiny = Budget::with_limits(u64::MAX, u64::MAX, u64::MAX, 8);
    // 12d6 denominators need 6^12 (~31 bits) > 8.
    assert_eq!(
        sum_pool(&d(6), 12, &KeepTuple::all(12), &mut tiny),
        Err(DistError::Budget {
            counter: "weight_bits"
        })
    );
}

#[test]
fn budget_usage_is_reported() {
    let mut budget = b();
    sum_pool(&d(6), 4, &KeepTuple::keep_highest(4, 3), &mut budget).unwrap();
    assert!(budget.used_transitions() > 0);
    assert!(budget.peak_states() > 0);
}
