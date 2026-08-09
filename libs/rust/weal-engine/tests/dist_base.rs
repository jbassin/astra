//! S4 unit tests for `Dist` core: constructors, D32-4 face-order semantics,
//! combine/map/mix, simplify, statistics helpers.

use weal_engine::dist::{
    Budget, Dist, DistError, Weight, combine, mean_decimal, mean_rational, mix, quantity_ge,
    quantity_le, std_decimal, try_combine, variance_rational,
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

#[test]
fn uniform_duplicates_merge_first_occurrence_fixes_order() {
    // dl([:a, :b, :a, :c]) analogue with i64 faces 5, 2, 5, 9.
    let die = Dist::uniform(vec![5, 2, 5, 9], &b()).unwrap();
    assert_eq!(die.face_order(), &[5, 2, 9]);
    assert_eq!(die.weight_of(&5), w(2));
    assert_eq!(die.weight_of(&2), w(1));
    assert_eq!(die.denominator(), &w(4));
    assert_eq!(die.support().copied().collect::<Vec<_>>(), vec![2, 5, 9]);
    assert_eq!(die.position_of(&9), Some(2));
    assert_eq!(die.position_of(&7), None);
}

#[test]
fn weighted_rejects_zero_and_empty() {
    assert_eq!(
        Dist::<i64>::weighted(vec![(1, Weight::zero())], &b()),
        Err(DistError::ZeroWeight)
    );
    assert_eq!(Dist::<i64>::uniform(vec![], &b()), Err(DistError::Empty));
    assert_eq!(Dist::<i64>::weighted(vec![], &b()), Err(DistError::Empty));
}

#[test]
fn constant_and_min_max() {
    let c = Dist::constant(7i64);
    assert_eq!(c.support_len(), 1);
    assert_eq!(c.denominator(), &w(1));
    let die = d(20);
    assert_eq!(die.min_face(), &1);
    assert_eq!(die.max_face(), &20);
}

#[test]
fn combine_add_matches_hand_computation() {
    // d4 + d4: P(5) has weight 4 over 16.
    let s = combine(&d(4), &d(4), &b(), |x, y| x + y).unwrap();
    assert_eq!(s.denominator(), &w(16));
    assert_eq!(s.weight_of(&2), w(1));
    assert_eq!(s.weight_of(&5), w(4));
    assert_eq!(s.weight_of(&8), w(1));
    let total: u128 = (2..=8)
        .map(|f| match s.weight_of(&f) {
            v if v == w(1) => 1,
            v if v == w(2) => 2,
            v if v == w(3) => 3,
            v if v == w(4) => 4,
            _ => panic!(),
        })
        .sum();
    assert_eq!(total, 16);
}

#[test]
fn combine_face_order_is_first_production_order() {
    // Left die with descending custom order; op returns the left face, so
    // the result order should be the left order.
    let l = Dist::uniform(vec![3, 1, 2], &b()).unwrap();
    let r = d(2);
    let out = combine(&l, &r, &b(), |x, _| *x).unwrap();
    assert_eq!(out.face_order(), &[3, 1, 2]);
    // A comparison collapses to a 2-outcome dist ordered by first production.
    let cmp = combine(&d(20), &Dist::constant(10), &b(), |x, y| i64::from(x > y)).unwrap();
    assert_eq!(cmp.support_len(), 2);
    // d20 face order is 1..20: face 1 > 10 is false, so 0 is produced first.
    assert_eq!(cmp.face_order(), &[0, 1]);
    assert_eq!(cmp.weight_of(&0), w(10));
    assert_eq!(cmp.weight_of(&1), w(10));
}

#[test]
fn try_combine_propagates_op_error() {
    // Division with a zero in the right support: pre-checkable via Err.
    let r = Dist::uniform(vec![0, 1], &b()).unwrap();
    let out = try_combine::<i64, i64, DistError, _>(&d(4), &r, &b(), |x, y| {
        if *y == 0 {
            Err(DistError::External {
                message: "division by zero".into(),
            })
        } else {
            Ok(x / y)
        }
    });
    assert_eq!(
        out,
        Err(DistError::External {
            message: "division by zero".into()
        })
    );
}

#[test]
fn map_merges_collisions_in_source_order() {
    // |x| x/2 on d6 (integer div): images 0,1,1,2,2,3.
    let h = d(6).map(&b(), |x| x / 2).unwrap();
    assert_eq!(h.face_order(), &[0, 1, 2, 3]);
    assert_eq!(h.weight_of(&1), w(2));
    assert_eq!(h.denominator(), &w(6));
}

#[test]
fn mix_weighted_lcm_minimal_denominator() {
    // mix(d6:1, d4:1): scales 2 and 3, den 24 (hand-computed).
    let m = mix(&[(d(6), w(1)), (d(4), w(1))], &b()).unwrap();
    assert_eq!(m.denominator(), &w(24));
    assert_eq!(m.weight_of(&1), w(5)); // 2 + 3
    assert_eq!(m.weight_of(&5), w(2)); // d6 only
    // Zero-weight components are dropped; all-zero errors.
    let m2 = mix(&[(d(6), w(0)), (d(4), w(1))], &b()).unwrap();
    assert_eq!(m2.simplify(), d(4));
    assert_eq!(mix(&[(d(6), w(0))], &b()), Err(DistError::Empty));
}

#[test]
fn mix_face_order_component_then_unseen() {
    // Components' face orders concatenate with first-occurrence dedup.
    let a = Dist::uniform(vec![2, 1], &b()).unwrap();
    let c = Dist::uniform(vec![3, 1], &b()).unwrap();
    let m = mix(&[(a, w(1)), (c, w(1))], &b()).unwrap();
    assert_eq!(m.face_order(), &[2, 1, 3]);
}

#[test]
fn simplify_gcd_reduces_and_preserves_order() {
    let die = Dist::weighted(vec![(2, w(4)), (1, w(2))], &b()).unwrap();
    let s = die.simplify();
    assert_eq!(s.weight_of(&2), w(2));
    assert_eq!(s.weight_of(&1), w(1));
    assert_eq!(s.denominator(), &w(3));
    assert_eq!(s.face_order(), &[2, 1]);
    // Already-reduced dists round-trip unchanged.
    assert_eq!(s.simplify(), s);
}

#[test]
fn stats_exact_rationals_and_decimals() {
    // mean(d6) = 7/2; var(d6) = 35/12.
    let die = d(6);
    let (mn, md) = mean_rational(&die);
    assert_eq!((mn, md), (7.into(), 2u32.into()));
    let (vn, vd) = variance_rational(&die);
    assert_eq!((vn, vd), (35.into(), 12u32.into()));
    assert_eq!(mean_decimal(&die), "3.500000");
    // std(d6) = sqrt(35/12) = 1.7078251...
    assert_eq!(std_decimal(&die), "1.707825");
    // Negative mean formats with sign.
    let neg = Dist::uniform(vec![-2i64, -1], &b()).unwrap();
    assert_eq!(mean_decimal(&neg), "-1.500000");
}

#[test]
fn quantity_cumulatives() {
    let die = d(6);
    assert_eq!(quantity_le(&die, &4), w(4));
    assert_eq!(quantity_le(&die, &0), w(0));
    assert_eq!(quantity_le(&die, &99), w(6));
    assert_eq!(quantity_ge(&die, &5), w(2));
    assert_eq!(quantity_ge(&die, &-3), w(6));
}

#[test]
fn support_budget_aborts_constructors_and_combine() {
    let small = Budget::with_limits(u64::MAX, u64::MAX, 5, Budget::DEFAULT_WEIGHT_BITS);
    assert_eq!(
        Dist::uniform((1..=6i64).collect(), &small),
        Err(DistError::Budget { counter: "support" })
    );
    // d4 x d4 sums produce 7 faces > 5.
    assert_eq!(
        combine(&d(4), &d(4), &small, |x, y| x + y),
        Err(DistError::Budget { counter: "support" })
    );
}

#[test]
fn weight_bits_budget_aborts_combine() {
    let tiny = Budget::with_limits(u64::MAX, u64::MAX, u64::MAX, 10);
    let heavy = Dist::weighted(vec![(1i64, w(64)), (2, w(64))], &tiny).unwrap();
    assert_eq!(
        combine(&heavy, &heavy, &tiny, |x, y| x + y),
        Err(DistError::Budget {
            counter: "weight_bits"
        })
    );
}
