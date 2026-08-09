//! S4b seam tests: end-to-end THROUGH THE LANGUAGE (check → interp →
//! `dist_of`/`dist_of_with`) with exact hand-computed weights — node
//! coverage for every `DieTree` kind, the amended-D32-8 face-order
//! semantics, evaluate() with the interpreter callback, keep-chain
//! composition, budget errors, and the `SeamDist` accessors S5 reads.

use num_bigint::{BigInt, BigUint};
use weal_engine::dist::{Budget, Dist, KeepTuple, sum_pool};
use weal_engine::dist_seam::{SeamDist, dist_of, dist_of_with};
use weal_engine::{DieTree, ErrorKind, EvalError, Fuel, Interp, Value, run};

// -- helpers ----------------------------------------------------------------

fn die_of(src: &str) -> DieTree {
    let out = run(src, &[], &mut Fuel::default())
        .unwrap_or_else(|e| panic!("expected `{src}` to run: {e:?}"));
    match out.value {
        Value::Die(t) => t,
        other => panic!("expected `{src}` to produce a die, got {other:?}"),
    }
}

fn dist(src: &str) -> SeamDist {
    dist_of(&die_of(src)).unwrap_or_else(|e| panic!("dist_of(`{src}`) failed: {e:?}"))
}

fn dist_err(src: &str) -> EvalError {
    dist_of(&die_of(src)).expect_err("expected dist_of to fail")
}

/// dist_of_with wired to a real interpreter (effect guard armed).
fn dist_with_interp(tree: &DieTree) -> Result<SeamDist, EvalError> {
    let mut fuel = Fuel::default();
    let mut it = Interp::new(&mut fuel);
    let mut cb = |func: &Value, s: &Value, f: &Value, n: u64| it.run_evaluator_step(func, s, f, n);
    dist_of_with(tree, &mut cb)
}

fn num(n: i64) -> Value {
    Value::num_i64(n)
}

fn atom(name: &str) -> Value {
    Value::Atom(name.to_owned())
}

fn w(n: u64) -> BigUint {
    BigUint::from(n)
}

/// Support as `(i64 face, u64 weight)` pairs (Num faces only), ascending.
fn num_support(d: &SeamDist) -> Vec<(i64, u64)> {
    d.support()
        .into_iter()
        .map(|(v, wt)| {
            let f = match v {
                Value::Num(n) => i64::try_from(&n).expect("small face"),
                other => panic!("expected Num face, got {other:?}"),
            };
            (f, u64::try_from(&wt).expect("small weight"))
        })
        .collect()
}

// -- Leaf / Sum / keep ------------------------------------------------------

#[test]
fn d6_is_uniform_ascending() {
    let d = dist("d6");
    assert_eq!(num_support(&d), (1..=6).map(|f| (f, 1)).collect::<Vec<_>>());
    assert_eq!(d.denominator(), w(6));
    assert_eq!(d.face_order(), (1..=6).map(num).collect::<Vec<_>>());
    assert_eq!(d.min_face(), num(1));
    assert_eq!(d.max_face(), num(6));
}

#[test]
fn two_d6_sums_are_the_triangular_thirty_sixths() {
    let d = dist("2d6");
    assert_eq!(
        num_support(&d),
        vec![
            (2, 1),
            (3, 2),
            (4, 3),
            (5, 4),
            (6, 5),
            (7, 6),
            (8, 5),
            (9, 4),
            (10, 3),
            (11, 2),
            (12, 1),
        ]
    );
    assert_eq!(d.denominator(), w(36));
}

#[test]
fn four_d6_keep_highest_three_spot_weights() {
    let d = dist("4d6kh3");
    assert_eq!(d.denominator(), w(1296));
    assert_eq!(d.weight_of(&num(3)), w(1));
    assert_eq!(d.weight_of(&num(4)), w(4));
    assert_eq!(d.weight_of(&num(18)), w(21));
    assert_eq!(d.min_face(), num(3));
    assert_eq!(d.max_face(), num(18));
}

#[test]
fn keep_lowest_uses_the_low_window() {
    // 2d20kl1: P(k) over 400 = (2(20-k)+1) = 41-2k.
    let d = dist("2d20kl1");
    assert_eq!(d.denominator(), w(400));
    assert_eq!(d.weight_of(&num(1)), w(39));
    assert_eq!(d.weight_of(&num(20)), w(1));
}

#[test]
fn keep_chain_composes_to_the_middle_window() {
    // 5d10kh3kl1 = the single middle (3rd-highest) position of 5 sorted
    // dice: keep-tuple [0, 0, 1, 0, 0].
    let d = dist("5d10kh3kl1");
    let mut budget = Budget::default();
    let d10: Dist<BigInt> = Dist::uniform((1..=10).map(BigInt::from).collect(), &budget).unwrap();
    let expected = sum_pool(
        &d10,
        5,
        &KeepTuple::from_vec(vec![0, 0, 1, 0, 0]),
        &mut budget,
    )
    .unwrap();
    let got = num_support(&d);
    let want: Vec<(i64, u64)> = expected
        .entries()
        .map(|(f, wt)| {
            (
                i64::try_from(f).unwrap(),
                u64::try_from(&wt.to_biguint()).unwrap(),
            )
        })
        .collect();
    assert_eq!(got, want);
    assert_eq!(d.denominator(), w(100_000));
}

// -- Dl / Dm face order (D32-4) --------------------------------------------

#[test]
fn dl_atoms_keep_list_order_and_rank() {
    let d = dist("dl([:fine, :good, :great])");
    let faces = vec![atom("fine"), atom("good"), atom("great")];
    assert_eq!(d.face_order(), faces);
    assert_eq!(d.position_of(&atom("fine")), Some(0));
    assert_eq!(d.position_of(&atom("great")), Some(2));
    assert_eq!(d.position_of(&atom("missing")), None);
    // Sorted order == face order for ranked faces (amended D32-8).
    let support: Vec<Value> = d.support().into_iter().map(|(v, _)| v).collect();
    assert_eq!(support, faces);
    assert_eq!(d.min_face(), atom("fine"));
    assert_eq!(d.max_face(), atom("great"));
    assert_eq!(d.denominator(), w(3));
}

#[test]
fn dl_duplicate_faces_merge_onto_the_first_occurrence() {
    let d = dist("dl([:fine, :good, :fine])");
    assert_eq!(d.face_order(), vec![atom("fine"), atom("good")]);
    assert_eq!(d.weight_of(&atom("fine")), w(2));
    assert_eq!(d.weight_of(&atom("good")), w(1));
}

#[test]
fn dm_literal_keeps_insertion_order_while_support_sorts_numerically() {
    let d = dist("dm([3: 1, 1: 2])");
    // The face-order VECTOR keeps dict-literal insertion order (D32-4)…
    assert_eq!(d.face_order(), vec![num(3), num(1)]);
    assert_eq!(d.position_of(&num(3)), Some(0));
    // …while the sorted support (pool iteration, min/max) is numeric.
    assert_eq!(num_support(&d), vec![(1, 2), (3, 1)]);
    assert_eq!(d.min_face(), num(1));
    assert_eq!(d.max_face(), num(3));
}

#[test]
fn dm_non_literal_argument_falls_back_to_sorted_face_order() {
    let d = dist("let m = [3: 1, 1: 2]; dm(m)");
    assert_eq!(d.face_order(), vec![num(1), num(3)]);
}

#[test]
fn dl_numeric_faces_keep_insertion_order_in_the_vector() {
    let d = dist("dl([3, 1, 2])");
    assert_eq!(d.face_order(), vec![num(3), num(1), num(2)]);
    assert_eq!(num_support(&d), vec![(1, 1), (2, 1), (3, 1)]);
}

// -- BinOp / Const / Neg / MinMax ------------------------------------------

#[test]
fn die_plus_constant_shifts_faces() {
    let d = dist("d6 + 1");
    assert_eq!(num_support(&d), (2..=7).map(|f| (f, 1)).collect::<Vec<_>>());
    assert_eq!(d.face_order(), (2..=7).map(num).collect::<Vec<_>>());
}

#[test]
fn die_division_truncates_toward_zero() {
    let d = dist("d6 / 2");
    assert_eq!(num_support(&d), vec![(0, 1), (1, 2), (2, 2), (3, 1)]);
}

#[test]
fn zero_in_the_divisor_support_is_a_visible_eval_error() {
    let e = dist_err("d6 / (d6 - 3)");
    assert_eq!(e.kind, ErrorKind::Eval);
    assert!(e.message.contains("division by zero"), "{}", e.message);
}

#[test]
fn die_times_die_is_the_cartesian_product() {
    let d = dist("d2 * d2");
    assert_eq!(num_support(&d), vec![(1, 1), (2, 2), (4, 1)]);
    assert_eq!(d.denominator(), w(4));
    // Face order = first production while walking left-then-right order:
    // 1*1=1, 1*2=2, 2*1=2 (seen), 2*2=4.
    assert_eq!(d.face_order(), vec![num(1), num(2), num(4)]);
}

#[test]
fn negation_mirrors_the_support() {
    let d = dist("-d6");
    assert_eq!(
        num_support(&d),
        (-6..=-1).map(|f| (f, 1)).collect::<Vec<_>>()
    );
    // Face order = image walk of the original 1..6 order.
    assert_eq!(d.face_order(), (1..=6).map(|f| num(-f)).collect::<Vec<_>>());
}

#[test]
fn min_of_two_d6_is_exact() {
    let d = dist("min(d6, d6)");
    assert_eq!(
        num_support(&d),
        vec![(1, 11), (2, 9), (3, 7), (4, 5), (5, 3), (6, 1)]
    );
    assert_eq!(d.denominator(), w(36));
}

#[test]
fn max_of_two_d6_is_exact() {
    let d = dist("max(d6, d6)");
    assert_eq!(
        num_support(&d),
        vec![(1, 1), (2, 3), (3, 5), (4, 7), (5, 9), (6, 11)]
    );
}

// -- lifted comparisons (Cmp) ----------------------------------------------

#[test]
fn d20_over_10_is_half_true() {
    let d = dist("d20 > 10");
    assert_eq!(d.face_order(), vec![Value::bool(false), Value::bool(true)]);
    assert_eq!(d.weight_of(&Value::bool(true)), w(10));
    assert_eq!(d.weight_of(&Value::bool(false)), w(10));
    assert_eq!(d.denominator(), w(20));
}

#[test]
fn cmp_face_order_is_false_then_true_even_when_true_is_produced_first() {
    // d20 < 10: face 1 (the first walked) compares TRUE — the pinned
    // [:false, :true] order must hold anyway.
    let d = dist("d20 < 10");
    assert_eq!(d.face_order(), vec![Value::bool(false), Value::bool(true)]);
    assert_eq!(d.weight_of(&Value::bool(true)), w(9));
    assert_eq!(d.weight_of(&Value::bool(false)), w(11));
    // :false ranks below :true (fumble end first).
    assert_eq!(d.min_face(), Value::bool(false));
    assert_eq!(d.max_face(), Value::bool(true));
}

#[test]
fn an_always_true_comparison_has_a_single_face() {
    let d = dist("d6 > 0");
    assert_eq!(d.face_order(), vec![Value::bool(true)]);
    assert_eq!(d.denominator(), w(6));
}

#[test]
fn lifted_equality_works_on_atom_dice() {
    let d = dist("dl([:a, :b]) == :a");
    assert_eq!(d.face_order(), vec![Value::bool(false), Value::bool(true)]);
    assert_eq!(d.weight_of(&Value::bool(true)), w(1));
    assert_eq!(d.weight_of(&Value::bool(false)), w(1));
}

#[test]
fn kept_pool_comparison_goes_through_the_inserted_sum() {
    // 2d20kh1 >= 15: P = 1 - (14/20)^2 → 204/400 true.
    let d = dist("2d20kh1 >= 15");
    assert_eq!(d.weight_of(&Value::bool(true)), w(204));
    assert_eq!(d.denominator(), w(400));
}

// -- Explode / Reroll / RerollFace / Label ----------------------------------

#[test]
fn explode_depth_one_on_d6() {
    let d = dist("d6e1");
    assert_eq!(d.denominator(), w(36));
    for f in 1..=5 {
        assert_eq!(d.weight_of(&num(f)), w(6), "face {f}");
    }
    assert_eq!(d.weight_of(&num(6)), w(0)); // 6 always explodes
    for f in 7..=12 {
        assert_eq!(d.weight_of(&num(f)), w(1), "face {f}");
    }
    // Mixture face order: non-max faces in die order, then the chain faces.
    assert_eq!(
        d.face_order(),
        [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].map(num).to_vec()
    );
}

#[test]
fn reroll_once_reweights_the_matched_faces() {
    // reroll(d6, [1]) over 36: face 1 keeps R*w = 1, others (D+R)*w = 7.
    let d = dist("reroll(d6, [1])");
    assert_eq!(d.denominator(), w(36));
    assert_eq!(d.weight_of(&num(1)), w(1));
    for f in 2..=6 {
        assert_eq!(d.weight_of(&num(f)), w(7), "face {f}");
    }
}

#[test]
fn r_suffix_rerolls_each_die_of_the_pool() {
    // 2d6r1: each die is {1:1, 2..6:7}/36; the sum's extremes pin it.
    let d = dist("2d6r1");
    assert_eq!(d.denominator(), w(1296));
    assert_eq!(d.weight_of(&num(2)), w(1));
    assert_eq!(d.weight_of(&num(12)), w(49));
}

#[test]
fn labels_are_distribution_transparent() {
    let labeled = dist("2d8[fire]");
    let plain = dist("2d8");
    assert_eq!(labeled.support(), plain.support());
    assert_eq!(labeled.face_order(), plain.face_order());
    assert_eq!(labeled.denominator(), plain.denominator());
}

// -- Successes --------------------------------------------------------------

#[test]
fn successes_is_the_exact_binomial() {
    // successes(5d10, 8): p = 3/10, n = 5 → C(5,k)·3^k·7^(5-k) over 10^5.
    let d = dist("successes(5d10, 8)");
    assert_eq!(d.denominator(), w(100_000));
    assert_eq!(
        num_support(&d),
        vec![
            (0, 16807),
            (1, 36015),
            (2, 30870),
            (3, 13230),
            (4, 2835),
            (5, 243),
        ]
    );
}

#[test]
fn successes_respects_the_keep_chain() {
    // successes(2d6kh1, 6): only the highest die counts → P(1) = 11/36.
    let d = dist("successes(2d6kh1, 6)");
    assert_eq!(d.weight_of(&num(1)), w(11));
    assert_eq!(d.weight_of(&num(0)), w(25));
    assert_eq!(d.denominator(), w(36));
}

// -- evaluate() (D32-8) -----------------------------------------------------

#[test]
fn evaluate_hit_counting_is_the_exact_binomial() {
    let tree = die_of(
        "evaluate(pool(3, dl([:hit, :miss])), 0, \
         |s, f, n| match f | :hit -> s + n | _ -> s)",
    );
    let d = dist_with_interp(&tree).unwrap();
    assert_eq!(d.denominator(), w(8));
    assert_eq!(num_support(&d), vec![(0, 1), (1, 3), (2, 3), (3, 1)]);
    // Result face order = ascending structural order of the states.
    assert_eq!(d.face_order(), (0..=3).map(num).collect::<Vec<_>>());
}

#[test]
fn evaluate_iterates_faces_in_descending_face_order() {
    // Encode the visit sequence into the state. The closure fires only for
    // LANDED faces (the D32-8 count-0 amendment), so each path's digits are
    // its distinct faces in descending rank order: {a,b} → 21 (never 12),
    // {a,c} → 31, {b,c} → 32; doubles see one face.
    let tree = die_of(
        "evaluate(pool(2, dl([:a, :b, :c])), 0, \
         |s, f, n| match f | :a -> s * 10 + 1 | :b -> s * 10 + 2 | _ -> s * 10 + 3)",
    );
    let d = dist_with_interp(&tree).unwrap();
    assert_eq!(d.denominator(), w(9));
    assert_eq!(
        num_support(&d),
        vec![(1, 1), (2, 1), (3, 1), (21, 2), (31, 2), (32, 2)]
    );
}

#[test]
fn evaluate_closure_never_sees_count_zero_faces() {
    // The divergence regression (goodness-null root cause): a count-blind
    // fold like `s + f` must fold over the faces that LANDED, not the whole
    // support with count-0 calls (which made every path a constant 21 over
    // 2d6 and collapsed the dist to a single face). Exact dist: doubles
    // {a,a} → a (weight 1 each), pairs {a,b} → a+b (weight 2 each).
    let tree = die_of("evaluate(pool(2, d6), 0, |s, f, n| s + f)");
    let d = dist_with_interp(&tree).unwrap();
    assert_eq!(d.denominator(), w(36));
    assert_eq!(
        num_support(&d),
        vec![
            (1, 1),
            (2, 1),
            (3, 3),
            (4, 3),
            (5, 5),
            (6, 5),
            (7, 6),
            (8, 4),
            (9, 4),
            (10, 2),
            (11, 2),
        ]
    );
}

#[test]
fn evaluate_over_a_kept_pool_sees_kept_counts_and_zeros() {
    // pool(2, dl([:a, :b])) kh1 keeps the rank-highest die (:b beats :a).
    // Counting kept :b dice: P(1) = 3/4 (at least one :b), P(0) = 1/4.
    let tree = die_of(
        "evaluate(kh(pool(2, dl([:a, :b])), 1), 0, \
         |s, f, n| match f | :b -> s + n | _ -> s)",
    );
    let d = dist_with_interp(&tree).unwrap();
    assert_eq!(d.denominator(), w(4));
    assert_eq!(num_support(&d), vec![(0, 1), (1, 3)]);
}

#[test]
fn evaluate_matches_the_sum_engine_on_a_kept_numeric_pool() {
    // Summing transition over 4d6kh3 must reproduce the closed pool sum.
    let tree = die_of("evaluate(4d6kh3, 0, |s, f, n| s + f * n)");
    let d = dist_with_interp(&tree).unwrap();
    let direct = dist("4d6kh3");
    assert_eq!(d.support(), direct.support());
    assert_eq!(d.denominator(), direct.denominator());
}

#[test]
fn evaluate_effects_inside_the_transition_surface_the_guard_error() {
    // S = Unit so the roll() call type-checks; the D32-7 runtime guard must
    // still reject it once the DP applies the closure.
    let tree = die_of("evaluate(pool(1, d6), (), |s, f, n| roll(f))");
    let e = dist_with_interp(&tree).unwrap_err();
    assert_eq!(e.kind, ErrorKind::Eval);
    assert_eq!(e.message, "effect inside evaluate()");
}

#[test]
fn plain_dist_of_refuses_evaluate_trees_but_dist_of_with_runs_them() {
    let tree = die_of("evaluate(pool(2, d6), 0, |s, f, n| s + n)");
    let e = dist_of(&tree).unwrap_err();
    assert_eq!(e.kind, ErrorKind::Internal);
    assert!(e.message.contains("dist_of_with"));
    let d = dist_with_interp(&tree).unwrap();
    // Total kept count is always 2.
    assert_eq!(num_support(&d), vec![(2, 36)]);
}

// -- budget (D32-12) --------------------------------------------------------

#[test]
fn giant_support_is_a_fuel_error_naming_the_counter() {
    let e = dist_err("d60000");
    assert_eq!(e.kind, ErrorKind::Fuel);
    assert!(e.message.contains("support"), "{}", e.message);
}

// -- statistics + quantities ------------------------------------------------

#[test]
fn mean_and_std_on_num_faces() {
    assert_eq!(dist("2d6").mean_decimal().as_deref(), Some("7.000000"));
    let d6 = dist("d6");
    assert_eq!(d6.mean_decimal().as_deref(), Some("3.500000"));
    assert_eq!(d6.std_decimal().as_deref(), Some("1.707825"));
}

#[test]
fn mean_and_std_on_dec_faces_divide_out_the_scale() {
    let d = dist("dl([1.5, 2.5])");
    assert_eq!(d.mean_decimal().as_deref(), Some("2.000000"));
    assert_eq!(d.std_decimal().as_deref(), Some("0.500000"));
}

#[test]
fn mean_and_std_are_none_for_non_numeric_faces() {
    let d = dist("dl([:a, :b])");
    assert_eq!(d.mean_decimal(), None);
    assert_eq!(d.std_decimal(), None);
    let b = dist("d6 > 3");
    assert_eq!(b.mean_decimal(), None);
}

#[test]
fn quantity_le_and_ge_on_d20() {
    let d = dist("d20");
    assert_eq!(d.quantity_le(&num(10)), Some(w(10)));
    assert_eq!(d.quantity_ge(&num(11)), Some(w(10)));
    // Off-support numeric queries still count.
    assert_eq!(d.quantity_le(&num(0)), Some(w(0)));
    assert_eq!(d.quantity_ge(&num(21)), Some(w(0)));
    // Ranked queries need the face in the support.
    let atoms = dist("dl([:a, :b])");
    assert_eq!(atoms.quantity_le(&atom("a")), Some(w(1)));
    assert_eq!(atoms.quantity_le(&atom("zzz")), None);
}
