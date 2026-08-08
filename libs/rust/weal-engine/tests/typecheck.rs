//! The S2 accept/reject suite (spec §4 S2): typing, the D32-3 union
//! lattice, exhaustiveness/redundancy, monomorphic recursion, equatable
//! deferral, lifted die comparisons, numeric-mixing rejection, and spans.

use weal_engine::infer::CoreExpr;
use weal_engine::{Scheme, Type, TypeError, check_source};

fn ok(src: &str) -> (CoreExpr, Type) {
    check_source(src, &[])
        .unwrap_or_else(|e| panic!("expected accept for `{src}`: {} @ {:?}", e.message, e.span))
}

fn ty(src: &str) -> String {
    ok(src).1.to_string()
}

fn err(src: &str) -> TypeError {
    match check_source(src, &[]) {
        Err(e) => {
            assert!(
                !e.message.starts_with("parse error"),
                "`{src}` must reach the TYPE stage, but failed to parse: {}",
                e.message
            );
            e
        }
        Ok((_, t)) => panic!("expected reject for `{src}`, got type {t}"),
    }
}

// -- literals + basics ------------------------------------------------------

#[test]
fn literal_types() {
    assert_eq!(ty("1"), "Num");
    assert_eq!(ty("1.5"), "Dec");
    assert_eq!(ty("1.5f"), "Float");
    assert_eq!(ty("\"x\""), "Str");
    assert_eq!(ty("()"), "Unit");
    assert_eq!(ty(":fire"), ":fire");
}

#[test]
fn arbitrary_length_num_literal_infers_without_panicking() {
    assert_eq!(
        ty("123456789012345678901234567890123456789012345678901234567890 + 1"),
        "Num"
    );
}

#[test]
fn dice_and_pool_types() {
    assert_eq!(ty("d20"), "Die[Num]");
    // A bare NdM is an open Pool[Num]; the top level sums it (D32-7).
    assert_eq!(ty("2d6"), "Die[Num]");
    assert_eq!(ty("dl([:fine, :good])"), "Die[:fine | :good]");
}

#[test]
fn collections() {
    assert_eq!(ty("{1, :a}"), "{Num, :a}");
    assert_eq!(ty("[1, 2, 3]"), "List[Num]");
    assert_eq!(ty("[dl([:a]), dl([:b])]"), "List[Die[:a | :b]]");
    assert_eq!(ty("[:a : 1, :b : 2]"), "Dict[:a | :b, Num]");
}

#[test]
fn list_element_mismatch_rejected() {
    let e = err("[1, :a]");
    assert!(e.message.contains("mismatch"), "{}", e.message);
}

// -- numeric mixing (R6) ----------------------------------------------------

#[test]
fn num_plus_dec_rejected() {
    let e = err("1 + 1.5");
    assert!(
        e.message.contains("Num") && e.message.contains("Dec"),
        "{}",
        e.message
    );
}

#[test]
fn dec_lt_float_rejected() {
    let e = err("1.5 < 1.5f");
    assert!(
        e.message.contains("Dec") && e.message.contains("Float"),
        "{}",
        e.message
    );
}

#[test]
fn num_plus_float_rejected() {
    err("1 + 1.5f");
}

#[test]
fn same_type_arithmetic_accepted() {
    assert_eq!(ty("1 + 2 * 3"), "Num");
    assert_eq!(ty("1.5 + 2.5"), "Dec");
    assert_eq!(ty("float(1) + float(1.5)"), "Float");
}

#[test]
fn str_arithmetic_rejected() {
    let e = err("\"a\" + \"b\"");
    assert!(e.message.contains("Str"), "{}", e.message);
}

// -- comparisons ------------------------------------------------------------

#[test]
fn scalar_comparisons_are_bool() {
    assert_eq!(ty("1 < 2"), "Bool");
    assert_eq!(ty("1.5 <= 2.5"), "Bool");
    assert_eq!(ty("\"a\" < \"b\""), "Bool");
    assert_eq!(ty("1 == 1"), "Bool");
    assert_eq!(ty(":a == :b"), "Bool");
}

#[test]
fn lifted_die_comparisons() {
    assert_eq!(ty("d20 > 15"), "Die[Bool]");
    assert_eq!(ty("3 >= d6"), "Die[Bool]");
    assert_eq!(ty("d6 <= d6"), "Die[Bool]");
    assert_eq!(ty("d6 != d6"), "Die[Bool]");
    // The pinned case: any die operand lifts ==.
    assert_eq!(ty("dl([:a]) == dl([:a])"), "Die[Bool]");
    // Pools sum-coerce into the lifted comparison.
    assert_eq!(ty("2d20kh1 > 15"), "Die[Bool]");
    assert_eq!(ty("2d6 == 7"), "Die[Bool]");
}

#[test]
fn functions_cannot_be_compared() {
    let e = err("(|x| x) == (|y| y)");
    assert!(e.message.contains("function-free"), "{}", e.message);
}

#[test]
fn eq_operand_type_mismatch_rejected() {
    err("1 == :a");
}

#[test]
fn comparison_chain_rejected_with_span() {
    let e = err("1 < 2 < 3");
    assert_eq!(e.message, "comparisons don't chain — parenthesize");
    assert_eq!(e.span, (0, 9));
    err("1 == 2 == 3");
}

#[test]
fn unresolved_comparison_defaults_num() {
    assert_eq!(ty("|x, y| x < y"), "Num -> Num -> Bool");
}

// -- unions, variance, match-driven param inference -------------------------

#[test]
fn lambda_param_infers_exact_union_from_arms() {
    assert_eq!(ty("|x| match x | :a -> 1 | :b -> 2"), "(:a | :b) -> Num");
}

#[test]
fn wildcard_arm_keeps_param_open() {
    let t = ty("|x| match x | :a -> 1 | _ -> 2");
    assert!(t.ends_with("-> Num"), "{t}");
    assert!(!t.contains(":a"), "param stayed open: {t}");
}

#[test]
fn union_subsumption_at_calls() {
    // singleton <= union accepted; outside the union rejected.
    assert_eq!(ty("let g = |x| match x | :a -> 1 | :b -> 2; g(:a)"), "Num");
    let e = err("let g = |x| match x | :a -> 1 | :b -> 2; g(:c)");
    assert!(e.message.contains(":c"), "{}", e.message);
}

#[test]
fn union_result_join_across_arms() {
    assert_eq!(ty("match 5 | 1 -> :a | _ -> :b"), ":a | :b");
}

#[test]
fn die_covariance_join_across_arms() {
    assert_eq!(
        ty("match 1 | 1 -> dl([:a, :b]) | _ -> dl([:b, :c])"),
        "Die[:a | :b | :c]"
    );
}

#[test]
fn contravariant_domain_intersection() {
    // (:a -> Num) joined with (:a | :b -> Num) intersects to :a -> Num.
    let t = ty("let b Bool = 1 == 1; \
         match b | :true -> (|x| match x | :a -> 1) \
                 | :false -> (|y| match y | :a -> 1 | :b -> 2)");
    assert_eq!(t, ":a -> Num");
}

#[test]
fn empty_domain_intersection_rejected() {
    let e = err("let b Bool = 1 == 1; \
         match b | :true -> (|x| match x | :a -> 1) \
                 | :false -> (|y| match y | :b -> 1)");
    assert!(e.message.contains("no common atoms"), "{}", e.message);
}

#[test]
fn params_are_never_widened() {
    // g's domain is pinned by its first use; a second atom cannot widen it.
    err("|g| {g(:a), g(:b)}");
}

#[test]
fn union_generalizes_as_is_at_let() {
    assert_eq!(ty("let u = dl([:a, :b]); u == u"), "Die[Bool]");
    assert_eq!(ty("let a = :x; a"), ":x");
}

// -- exhaustiveness + redundancy --------------------------------------------

#[test]
fn ture_unreachable_arm() {
    let e = err("let b Bool = 1 == 1; match b | :true -> 1 | :ture -> 2 | :false -> 3");
    assert!(e.message.contains(":ture"), "{}", e.message);
    assert!(e.message.contains("unreachable"), "{}", e.message);
}

#[test]
fn missing_arm_names_the_missing_atom() {
    let e = err("let b Bool = 1 == 1; match b | :true -> 1");
    assert!(e.message.contains(":false"), "{}", e.message);
    assert!(e.message.contains("non-exhaustive"), "{}", e.message);
}

#[test]
fn bool_match_exhaustive_accepted() {
    assert_eq!(
        ty("let b Bool = 1 == 1; match b | :true -> 1 | :false -> 2"),
        "Num"
    );
}

#[test]
fn duplicate_atom_arm_unreachable() {
    let e = err("let b Bool = 1 == 1; match b | :true -> 1 | :true -> 2 | :false -> 3");
    assert!(e.message.contains("unreachable"), "{}", e.message);
}

#[test]
fn arm_after_wildcard_unreachable() {
    let e = err("match 1 | _ -> 1 | 2 -> 3");
    assert!(e.message.contains("unreachable"), "{}", e.message);
}

#[test]
fn num_scrutinee_needs_wildcard() {
    let e = err("match 5 | 1 -> :a");
    assert!(e.message.contains("wildcard"), "{}", e.message);
    assert_eq!(ty("match 5 | 1 -> :a | _ -> :b"), ":a | :b");
}

#[test]
fn atom_top_scrutinee_needs_wildcard() {
    let e = err("let a Atom = :x; match a | :x -> 1");
    assert!(e.message.contains("wildcard"), "{}", e.message);
    assert_eq!(ty("let a Atom = :x; match a | :x -> 1 | _ -> 0"), "Num");
}

#[test]
fn str_and_dec_scrutinees() {
    assert_eq!(ty("match \"x\" | \"x\" -> 1 | _ -> 2"), "Num");
    assert_eq!(ty("match 1.5 | 1.5 -> 1 | _ -> 2"), "Num");
    err("match \"x\" | \"x\" -> 1");
}

#[test]
fn tuple_patterns_recurse_with_witness() {
    let e = err("let b Bool = 1 == 1; match {b, b} | {:true, :true} -> 1 | {:false, _} -> 2");
    assert!(e.message.contains("{:true, :false}"), "{}", e.message);
    assert_eq!(
        ty("let b Bool = 1 == 1; \
            match {b, b} | {:true, :true} -> 1 | {:false, _} -> 2 | {:true, :false} -> 3"),
        "Num"
    );
}

#[test]
fn literal_pattern_against_wrong_scrutinee_type_rejected() {
    // Dec pattern on a Num scrutinee = numeric mixing at the pattern.
    let e = err("match 5 | 1.5 -> 1 | _ -> 2");
    assert!(e.message.contains("Dec"), "{}", e.message);
}

// -- let, annotations, generalization, recursion ----------------------------

#[test]
fn annotation_checking() {
    assert_eq!(ty("let x Num = 1; x"), "Num");
    assert_eq!(ty("let b Bool = 1 == 1; b"), "Bool");
    let e = err("let x Num = 1.5; x");
    assert!(
        e.message.contains("Num") && e.message.contains("Dec"),
        "{}",
        e.message
    );
    assert_eq!(e.span, (12, 15), "span should cover the value `1.5`");
}

#[test]
fn unknown_annotation_rejected() {
    let e = err("let x Foo = 1; x");
    assert!(e.message.contains("Foo"), "{}", e.message);
}

#[test]
fn let_generalization() {
    assert_eq!(ty("let id = |x| x; {id(1), id(:a)}"), "{Num, :a}");
}

#[test]
fn letfn_generalizes_after_the_binding() {
    assert_eq!(ty("let id(x) = x; {id(1), id(:a)}"), "{Num, :a}");
}

#[test]
fn monomorphic_recursion_accepted() {
    assert_eq!(
        ty("let f(n) = match n | 0 -> 0 | _ -> f(n - 1); f(3)"),
        "Num"
    );
}

#[test]
fn recursion_is_monomorphic_within_the_body() {
    // f used at two types inside its own body: rejected.
    err("let f(x) = {f(1), f(:a)}; 1");
}

#[test]
fn plain_let_lambda_self_reference_rejected() {
    let e = err("let f = |n| f(n); f(1)");
    assert!(
        e.message.contains("unbound identifier `f`"),
        "{}",
        e.message
    );
}

#[test]
fn letfn_return_annotation() {
    assert_eq!(ty("let f(x) Num = x + 1; f(2)"), "Num");
    err("let f(x) Num = dec(x); f(2)");
}

#[test]
fn tuple_destructuring_let() {
    assert_eq!(ty("let {a, b} = {1, :x}; a + 1"), "Num");
    err("let {a, b} = 1; a");
}

#[test]
fn occurs_check() {
    let e = err("|x| x(x)");
    assert!(e.message.contains("infinite type"), "{}", e.message);
}

#[test]
fn unbound_identifier_with_span() {
    let e = err("foo + 1");
    assert!(
        e.message.contains("unbound identifier `foo`"),
        "{}",
        e.message
    );
    assert_eq!(e.span, (0, 3));
}

// -- sum coercion + pools (D32-4) -------------------------------------------

#[test]
fn pool_plus_num_accepts_via_sum() {
    assert_eq!(ty("2d20kh1 + 7"), "Die[Num]");
    assert_eq!(ty("4d6kh3 + 2"), "Die[Num]");
}

#[test]
fn pool_through_a_let_still_coerces_at_use() {
    assert_eq!(ty("let p = 2d20kh1; p + 7"), "Die[Num]");
}

#[test]
fn pool_atom_misuse_pinned_message() {
    let e = err("pool(2, dl([:a])) + 1");
    assert_eq!(
        e.message,
        "this pool's faces aren't summable — use evaluate()"
    );
    // Same targeted error at the top level (not a displayable pool).
    let e = err("pool(2, dl([:a]))");
    assert_eq!(
        e.message,
        "this pool's faces aren't summable — use evaluate()"
    );
}

#[test]
fn negation_coerces_pools() {
    assert_eq!(ty("-d6"), "Die[Num]");
    assert_eq!(ty("-(2d6kh1)"), "Die[Num]");
    err("-(:a)");
}

// -- die suffixes (D32-5) ---------------------------------------------------

#[test]
fn suffix_chains_type_check() {
    assert_eq!(ty("4d6kh3"), "Die[Num]"); // top-level sum closes the pool
    assert_eq!(ty("4d6e2kh3"), "Die[Num]");
    assert_eq!(ty("2d6e2r1"), "Die[Num]");
    assert_eq!(ty("d6e2"), "Die[Num]");
    assert_eq!(ty("d6kh3"), "Die[Num]"); // 1-die pool
}

#[test]
fn digitless_suffix_rejected() {
    let e = err("4d6kh");
    assert!(
        e.message.contains("missing its numeric argument"),
        "{}",
        e.message
    );
    assert!(e.message.contains("kh"), "{}", e.message);
}

#[test]
fn unknown_suffix_rejected_with_span() {
    let e = err("4d6xz2");
    assert_eq!(e.message, "unknown die suffix `xz`");
    assert_eq!(e.span, (3, 5), "span should cover exactly `xz`");
}

#[test]
fn wrong_shape_suffix_rejected() {
    // sum : Pool[Num] -> Die[Num] fits neither suffix shape.
    let e = err("4d6sum2");
    assert!(e.message.contains("wrong shape"), "{}", e.message);
}

#[test]
fn pool_wins_ambiguity_via_extra_env() {
    // zz : forall a. a -> Num -> a instantiates as BOTH shapes; pool wins.
    let zz = Scheme::poly(
        vec![0],
        Type::arrows(vec![Type::Var(0), Type::Num], Type::Var(0)),
    );
    let extra = vec![("zz".to_owned(), zz)];
    let (_, t) = check_source("2d6zz1 + 1", &extra).expect("pool-shape accepts");
    assert_eq!(t.to_string(), "Die[Num]");
}

#[test]
fn die_shape_suffix_via_extra_env() {
    let yy = Scheme::mono(Type::arrows(
        vec![Type::die(Type::Num), Type::Num],
        Type::die(Type::Num),
    ));
    let extra = vec![("yy".to_owned(), yy)];
    let (_, t) = check_source("2d6yy1", &extra).expect("die-shape accepts");
    assert_eq!(t.to_string(), "Die[Num]");
}

// -- labels (D32-6) ---------------------------------------------------------

#[test]
fn labels_apply_to_dice() {
    assert_eq!(ty("d20[fire]"), "Die[Num]");
    assert_eq!(ty("2d8[fire] + 1d6[slashing]"), "Die[Num]");
    let e = err("1[fire]");
    assert!(
        e.message.contains("labels apply to die values"),
        "{}",
        e.message
    );
}

// -- prelude signatures (D32-19) --------------------------------------------

#[test]
fn prelude_core_signatures() {
    assert_eq!(ty("sum(pool(2, d6))"), "Die[Num]");
    assert_eq!(ty("explode(d6, 2)"), "Die[Num]");
    assert_eq!(ty("r(d6, 1)"), "Die[Num]");
    assert_eq!(ty("reroll(d6, [1])"), "Die[Num]");
    assert_eq!(ty("reroll(dl([:a]), [:a])"), "Die[:a]");
    assert_eq!(ty("successes(pool(3, d6), 5)"), "Die[Num]");
    assert_eq!(ty("label(d6, :fire)"), "Die[Num]");
    assert_eq!(ty("dm([:a : 1, :b : 2])"), "Die[:a | :b]");
    assert_eq!(ty("kh(pool(4, d6), 3)"), "Die[Num]"); // top-level sum
}

#[test]
fn reroll_face_list_must_match_die() {
    err("reroll(dl([:a]), [1])");
}

#[test]
fn casts_and_rounding() {
    assert_eq!(ty("dec(1)"), "Dec");
    assert_eq!(ty("float(1)"), "Float");
    assert_eq!(ty("float(1.5)"), "Float");
    assert_eq!(ty("num(1.5)"), "Num");
    assert_eq!(ty("round(1.5)"), "Num");
    assert_eq!(ty("floor(1.5)"), "Num");
    assert_eq!(ty("ceil(1.5)"), "Num");
    assert_eq!(ty("abs(1)"), "Num");
    assert_eq!(ty("abs(1.5)"), "Dec");
    err("dec(1.5)");
    err("round(1)");
}

#[test]
fn min_max_overloads() {
    assert_eq!(ty("min(1, 2)"), "Num");
    assert_eq!(ty("max(1, 2)"), "Num");
    assert_eq!(ty("min(d20, 5)"), "Die[Num]");
    assert_eq!(ty("max(2d6kh1, d6)"), "Die[Num]"); // pool sum-coerces
    err("min(1.5, 2.5)"); // Num + Die[Num] only (D32-19)
}

#[test]
fn overloaded_builtin_first_class_uses_primary() {
    assert_eq!(ty("let f = min; f(1, 2)"), "Num");
    err("let f = min; f(d6, 5)"); // documented: primary only
}

#[test]
fn roll_variadic() {
    assert_eq!(ty("roll(d20)"), "Unit");
    assert_eq!(ty("roll(d20, 1, \"x\")"), "Unit");
    assert_eq!(ty("roll(2d6)"), "Unit"); // pool sum-coerces
    let e = err("roll(|x| x)");
    assert!(e.message.contains("function-free"), "{}", e.message);
}

#[test]
fn plot_takes_a_die() {
    assert_eq!(ty("plot(d20)"), "Unit");
    assert_eq!(ty("plot(4d6kh3)"), "Unit"); // pool sum-coerces
    err("plot(1)");
}

#[test]
fn save_types_any_atom_and_any_value() {
    assert_eq!(ty("save(:boom, |x| x)"), "Unit"); // functions saveable
    // Kebab atom rejection is S3's RUNTIME job — the checker accepts it.
    assert_eq!(ty("save(:my-macro, 1)"), "Unit");
}

// -- evaluate + equatable-deferred (D32-3 / D32-8) --------------------------

#[test]
fn evaluate_accepts_a_well_shaped_closure() {
    assert_eq!(
        ty("evaluate(pool(2, d6), 0, |acc, f, c| acc + f * c)"),
        "Die[Num]"
    );
}

#[test]
fn evaluate_rejects_wrong_closure_shape() {
    err("evaluate(pool(2, d6), 0, |acc, f| acc)");
}

#[test]
fn evaluator_state_closure_rejected_directly() {
    let e = err("evaluate(pool(2, d6), |q| q, |acc, f, c| acc)");
    assert!(e.message.contains("evaluator states"), "{}", e.message);
    assert!(e.message.contains("function-free"), "{}", e.message);
}

#[test]
fn evaluator_state_closure_rejected_through_generic_wrapper() {
    // The deferred check: the constraint travels through wrap's scheme and
    // fires at wrap's INSTANTIATION site (the second `wrap`).
    let src = "let wrap(s) = evaluate(pool(2, d6), s, |acc, f, c| acc); wrap(|q| q)";
    let e = err(src);
    assert!(e.message.contains("evaluator states"), "{}", e.message);
    assert!(e.message.contains("function-free"), "{}", e.message);
    let call_site = src.rfind("wrap").unwrap();
    assert_eq!(e.span, (call_site, call_site + 4));
}

#[test]
fn dict_keys_must_be_function_free() {
    let e = err("let f = |x| x; [f : 1]");
    assert!(e.message.contains("dict keys"), "{}", e.message);
}

// -- misc pinned ------------------------------------------------------------

#[test]
fn die_free_math_stays_scalar_inside_die_expressions() {
    assert_eq!(ty("d20 + 3 * 2"), "Die[Num]");
}

#[test]
fn user_shadowing_of_prelude_names() {
    assert_eq!(ty("let sum = 5; sum + 1"), "Num");
    // Inserted coercion still works while `sum` is shadowed (elaborate.rs
    // asserts the Prelude node).
    assert_eq!(ty("let sum = 5; 2d6kh1 + sum"), "Die[Num]");
}

#[test]
fn curried_partial_application() {
    assert_eq!(ty("let k = kh(pool(2, d6)); k(1)"), "Die[Num]");
}
