//! S4 property tests (seeded exhaustive small-space loops, no proptest):
//! denominator invariants, support bounds, keep-1 closed form ≡ pool
//! recursion, explode/reroll identities, and the u128→BigUint promotion
//! boundary.

use num_bigint::BigUint;
use weal_engine::dist::{
    Budget, Dist, DistError, KeepTuple, Weight, combine, eval_pool, explode, highest_1, lowest_1,
    mix, reroll_faces, sum_pool,
};

fn b() -> Budget {
    Budget::default()
}

fn d(n: i64) -> Dist<i64> {
    Dist::uniform((1..=n).collect(), &b()).unwrap()
}

fn weighted_die() -> Dist<i64> {
    Dist::weighted(
        vec![(1, Weight::from_u128(1)), (2, Weight::from_u128(3))],
        &b(),
    )
    .unwrap()
}

/// Sum of entry weights == cached denominator.
fn assert_denominator_invariant(dist: &Dist<i64>) {
    let mut sum = Weight::zero();
    for (_, w) in dist.entries() {
        sum = sum.checked_add(w, u64::MAX).unwrap();
        assert!(!w.is_zero(), "no zero-weight entries");
    }
    assert_eq!(&sum, dist.denominator());
}

#[test]
fn denominator_invariant_everywhere() {
    for n in [2i64, 4, 6, 20] {
        assert_denominator_invariant(&d(n));
    }
    // combine multiplies denominators.
    let c = combine(&d(6), &d(4), &b(), |x, y| x + y).unwrap();
    assert_denominator_invariant(&c);
    assert_eq!(c.denominator(), &Weight::from_u128(24));
    // mixture, explode, reroll, pools.
    assert_denominator_invariant(
        &mix(
            &[(d(6), Weight::from_u128(1)), (d(4), Weight::from_u128(1))],
            &b(),
        )
        .unwrap(),
    );
    assert_denominator_invariant(&explode(&d(6), 2, &b()).unwrap());
    assert_denominator_invariant(&reroll_faces(&d(6), &[1, 2], &b()).unwrap());
    for count in 1..=4u64 {
        let s = sum_pool(&d(6), count, &KeepTuple::all(count), &mut b()).unwrap();
        assert_denominator_invariant(&s);
        // Pool denominator = D^count.
        assert_eq!(
            s.denominator(),
            &Weight::from_u128(6).checked_pow(count, u64::MAX).unwrap()
        );
    }
}

#[test]
fn support_bounds_grid() {
    for die in [d(4), d(6), weighted_die()] {
        let (lo, hi) = (*die.min_face(), *die.max_face());
        for count in 1..=5u64 {
            for keep in [
                KeepTuple::all(count),
                KeepTuple::keep_highest(count, 2),
                KeepTuple::keep_lowest(count, 2),
            ] {
                let kept: i64 = keep.as_slice().iter().sum();
                let s = sum_pool(&die, count, &keep, &mut b()).unwrap();
                assert!(*s.min_face() >= kept * lo, "min bound");
                assert!(*s.max_face() <= kept * hi, "max bound");
                // Full-pool sums additionally sit within count*[lo, hi].
                if keep == KeepTuple::all(count) {
                    assert!(*s.min_face() == count as i64 * lo);
                    assert!(*s.max_face() == count as i64 * hi);
                }
            }
        }
    }
}

#[test]
fn keep_1_closed_forms_match_pool_recursion() {
    // The closed forms must be weight-for-weight identical (same D^n
    // denominator, no simplify needed) to the generic DP across a
    // die/count grid.
    for die in [d(2), d(4), d(6), weighted_die()] {
        for count in 1..=5u64 {
            let mut cb = |s: &i64, f: &i64, c: i64| Ok::<_, DistError>(s + f * c);
            let hi_pool = eval_pool(
                &die,
                count,
                &KeepTuple::keep_highest(count, 1),
                0i64,
                &mut cb,
                &mut b(),
            )
            .unwrap();
            let hi_closed = highest_1(&die, count, &mut b()).unwrap();
            assert_eq!(hi_closed, hi_pool, "highest_1 {count}");

            let mut cb = |s: &i64, f: &i64, c: i64| Ok::<_, DistError>(s + f * c);
            let lo_pool = eval_pool(
                &die,
                count,
                &KeepTuple::keep_lowest(count, 1),
                0i64,
                &mut cb,
                &mut b(),
            )
            .unwrap();
            let lo_closed = lowest_1(&die, count, &mut b()).unwrap();
            assert_eq!(lo_closed, lo_pool, "lowest_1 {count}");
        }
    }
    // And sum_pool dispatches to them (same result through the public API).
    let via_sum = sum_pool(&d(20), 2, &KeepTuple::keep_highest(2, 1), &mut b()).unwrap();
    assert_eq!(via_sum, highest_1(&d(20), 2, &mut b()).unwrap());
}

#[test]
fn ascending_and_descending_orders_agree_on_sums() {
    // kl-shaped keeps route the internal DP ascending; forcing the pinned
    // descending path via eval_pool must agree exactly.
    for (count, keep) in [
        (5u64, KeepTuple::keep_lowest(5, 2)),
        (4, KeepTuple::keep_highest(4, 3)),
        (5, KeepTuple::from_vec(vec![0, 1, 1, 1, 0])),
        (5, KeepTuple::from_vec(vec![-1, 0, 0, 0, 1])),
    ] {
        let mut cb = |s: &i64, f: &i64, c: i64| Ok::<_, DistError>(s + f * c);
        let via_eval = eval_pool(&d(6), count, &keep, 0i64, &mut cb, &mut b()).unwrap();
        let via_sum = sum_pool(&d(6), count, &keep, &mut b()).unwrap();
        assert_eq!(via_eval, via_sum);
    }
}

#[test]
fn explode_depth_zero_identity_and_reroll_absent_identity_grid() {
    for die in [d(4), d(6), weighted_die()] {
        assert_eq!(explode(&die, 0, &b()).unwrap(), die);
        assert_eq!(reroll_faces(&die, &[999], &b()).unwrap(), die);
    }
}

#[test]
fn promotion_boundary_200d2_exceeds_u128() {
    // 200d2: denominator 2^200 (201 bits) cannot fit u128 — the pool DP
    // must promote exactly. Weight of the all-1s sum (200) is exactly 1;
    // weight of sum 201 is C(200,1) = 200.
    let s = sum_pool(&d(2), 200, &KeepTuple::all(200), &mut b()).unwrap();
    let two_pow_200 = Weight::from_biguint(BigUint::from(1u32) << 200);
    assert!(two_pow_200.bits() > 128);
    assert_eq!(s.denominator(), &two_pow_200);
    assert_eq!(s.weight_of(&200), Weight::from_u128(1));
    assert_eq!(s.weight_of(&201), Weight::from_u128(200));
    assert_eq!(s.weight_of(&400), Weight::from_u128(1));
    assert_denominator_invariant(&s);
}
