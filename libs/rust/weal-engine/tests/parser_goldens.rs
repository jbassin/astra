//! Parser goldens (D32-2/D32-5/D32-6): lowered-AST debug-format expected
//! strings, covering the slice's pinned cases plus every §3 input.

use weal_engine::parse_to_ast;

#[track_caller]
fn check(src: &str, expected: &str) {
    let ast = parse_to_ast(src).unwrap_or_else(|e| panic!("{src:?} failed to parse: {e:?}"));
    assert_eq!(format!("{ast:?}"), expected, "AST mismatch for {src:?}");
}

#[test]
fn empty_dict() {
    check("[:]", r#"Dict([])"#);
}

#[test]
fn list_literal() {
    check("[1, 2, 4]", r#"List([Num("1"), Num("2"), Num("4")])"#);
}

#[test]
fn dict_literal() {
    check(
        r#"["good": 1, "bad": 3]"#,
        r#"Dict([(Str("good"), Num("1")), (Str("bad"), Num("3"))])"#,
    );
}

#[test]
fn tuple_literal() {
    check("{1, 2}", r#"Tuple([Num("1"), Num("2")])"#);
}

/// Nearest-match binding (D32-2): in `match x | 1 -> match y | …`, every
/// subsequent arm belongs to the INNER match — the outer match keeps exactly
/// one arm. Parenthesize the inner match to break out.
#[test]
fn nested_match_arms_bind_to_nearest() {
    check(
        "match x | 1 -> match y | 2 -> a | _ -> b | _ -> c",
        r#"Match { scrutinee: Ident("x"), arms: [(Num { neg: false, digits: "1" }, Match { scrutinee: Ident("y"), arms: [(Num { neg: false, digits: "2" }, Ident("a")), (Wildcard, Ident("b")), (Wildcard, Ident("c"))] })] }"#,
    );
}

#[test]
fn nested_let_value() {
    check(
        "let first = let second = 2; second + 1; first - 2",
        r#"Let { pattern: Ident("first"), annot: None, value: Let { pattern: Ident("second"), annot: None, value: Num("2"), body: Binary { op: Add, lhs: Ident("second"), rhs: Num("1") } }, body: Binary { op: Sub, lhs: Ident("first"), rhs: Num("2") } }"#,
    );
}

#[test]
fn die_suffix_plus_num() {
    check(
        "2d20kh1 + 7",
        r#"Binary { op: Add, lhs: Die { count: Some("2"), sides: "20", suffixes: [DieSuffix { name: "kh", arg: Some("1") }] }, rhs: Num("7") }"#,
    );
}

#[test]
fn labeled_dice_sum() {
    check(
        "2d8[fire] + 1d6[slashing]",
        r#"Binary { op: Add, lhs: Label { expr: Die { count: Some("2"), sides: "8", suffixes: [] }, word: "fire" }, rhs: Label { expr: Die { count: Some("1"), sides: "6", suffixes: [] }, word: "slashing" } }"#,
    );
}

/// Placeholder desugaring (D32-2): each `_` binds to the smallest enclosing
/// syntactic argument — the outer `_` becomes the parameter of `f`'s argument
/// lambda, the inner `_` the parameter of `g`'s argument lambda: TWO separate
/// single-parameter lambdas, not one.
#[test]
fn placeholders_form_two_separate_lambdas() {
    check(
        "f(_ + g(_))",
        r#"Call { callee: Ident("f"), args: [Lambda { params: ["ph0"], body: Binary { op: Add, lhs: Ident("ph0"), rhs: Call { callee: Ident("g"), args: [Lambda { params: ["ph1"], body: Ident("ph1") }] } } }] }"#,
    );
}

/// `_`s sharing one argument form ONE lambda, params in occurrence order.
#[test]
fn placeholders_sharing_an_argument_form_one_lambda() {
    check(
        "f(_ + _)",
        r#"Call { callee: Ident("f"), args: [Lambda { params: ["ph0", "ph1"], body: Binary { op: Add, lhs: Ident("ph0"), rhs: Ident("ph1") } }] }"#,
    );
}

/// Generated placeholder params skip identifiers already used in the source.
#[test]
fn placeholder_params_avoid_user_names() {
    check(
        "f(_ + ph0)",
        r#"Call { callee: Ident("f"), args: [Lambda { params: ["ph1"], body: Binary { op: Add, lhs: Ident("ph1"), rhs: Ident("ph0") } }] }"#,
    );
}

/// Comparison chains PARSE into one flat chain node (rejection happens at the
/// type stage, never at parse — D32-2 review m6).
#[test]
fn comparison_chain_parses_flat() {
    check(
        "a < b < c",
        r#"Cmp { first: Ident("a"), rest: [(Lt, Ident("b")), (Lt, Ident("c"))] }"#,
    );
}

/// Negative literals are legal match patterns.
#[test]
fn negative_pattern_literal() {
    check(
        "match x | -1 -> y | _ -> z",
        r#"Match { scrutinee: Ident("x"), arms: [(Num { neg: true, digits: "1" }, Ident("y")), (Wildcard, Ident("z"))] }"#,
    );
}

// --- every §3 input-column entry ---

#[test]
fn s3_d20_plus_7() {
    check(
        "d20 + 7",
        r#"Binary { op: Add, lhs: Die { count: None, sides: "20", suffixes: [] }, rhs: Num("7") }"#,
    );
}

#[test]
fn s3_2d20kh1_plus_7() {
    check(
        "2d20kh1 + 7",
        r#"Binary { op: Add, lhs: Die { count: Some("2"), sides: "20", suffixes: [DieSuffix { name: "kh", arg: Some("1") }] }, rhs: Num("7") }"#,
    );
}

#[test]
fn s3_4d6kh3() {
    check(
        "4d6kh3",
        r#"Die { count: Some("4"), sides: "6", suffixes: [DieSuffix { name: "kh", arg: Some("3") }] }"#,
    );
}

#[test]
fn s3_labeled_sum() {
    check(
        "2d8[fire] + 1d6[slashing]",
        r#"Binary { op: Add, lhs: Label { expr: Die { count: Some("2"), sides: "8", suffixes: [] }, word: "fire" }, rhs: Label { expr: Die { count: Some("1"), sides: "6", suffixes: [] }, word: "slashing" } }"#,
    );
}

#[test]
fn s3_smite_fn_sugar() {
    check(
        "let smite(n) = sum(pool(n, d8)) + 5; smite(3)",
        r#"LetFn { name: "smite", params: ["n"], annot: None, value: Binary { op: Add, lhs: Call { callee: Ident("sum"), args: [Call { callee: Ident("pool"), args: [Ident("n"), Die { count: None, sides: "8", suffixes: [] }] }] }, rhs: Num("5") }, body: Call { callee: Ident("smite"), args: [Num("3")] } }"#,
    );
}

#[test]
fn s3_dl_atom_list() {
    check(
        "dl([:fine, :good, :great])",
        r#"Call { callee: Ident("dl"), args: [List([Atom("fine"), Atom("good"), Atom("great")])] }"#,
    );
}

#[test]
fn s3_2d6e2() {
    check(
        "2d6e2",
        r#"Die { count: Some("2"), sides: "6", suffixes: [DieSuffix { name: "e", arg: Some("2") }] }"#,
    );
}

#[test]
fn s3_d20_plus_3_times_2() {
    check(
        "d20 + 3*2",
        r#"Binary { op: Add, lhs: Die { count: None, sides: "20", suffixes: [] }, rhs: Binary { op: Mul, lhs: Num("3"), rhs: Num("2") } }"#,
    );
}

// --- assorted grammar corners ---

#[test]
fn die_suffix_chain_splits_left_to_right() {
    check(
        "2d6e2r1",
        r#"Die { count: Some("2"), sides: "6", suffixes: [DieSuffix { name: "e", arg: Some("2") }, DieSuffix { name: "r", arg: Some("1") }] }"#,
    );
}

#[test]
fn digit_less_suffix_parses() {
    // `4d6kh` PARSES; "every suffix takes its Num" is a TYPE-stage error
    // (D32-5), not a parse error.
    check(
        "4d6kh",
        r#"Die { count: Some("4"), sides: "6", suffixes: [DieSuffix { name: "kh", arg: None }] }"#,
    );
}

#[test]
fn underscored_die_numbers_normalize() {
    check(
        "1_0d1_00",
        r#"Die { count: Some("10"), sides: "100", suffixes: [] }"#,
    );
}

#[test]
fn let_with_annotation_and_tuple_pattern() {
    check(
        "let x Num = 1; let {a, b} = {x, 2}; a",
        r#"Let { pattern: Ident("x"), annot: Some("Num"), value: Num("1"), body: Let { pattern: Tuple([Ident("a"), Ident("b")]), annot: None, value: Tuple([Ident("x"), Num("2")]), body: Ident("a") } }"#,
    );
}

#[test]
fn lambda_and_curried_call() {
    check(
        "(|a, b| a + b)(1)(2)",
        r#"Call { callee: Call { callee: Lambda { params: ["a", "b"], body: Binary { op: Add, lhs: Ident("a"), rhs: Ident("b") } }, args: [Num("1")] }, args: [Num("2")] }"#,
    );
}

#[test]
fn unit_and_empty_list() {
    check(
        "f((), [])",
        r#"Call { callee: Ident("f"), args: [Unit, List([])] }"#,
    );
}

#[test]
fn trailing_commas_everywhere() {
    check(
        "f([1, 2,], {3, 4,}, [:a: 1,],)",
        r#"Call { callee: Ident("f"), args: [List([Num("1"), Num("2")]), Tuple([Num("3"), Num("4")]), Dict([(Atom("a"), Num("1"))])] }"#,
    );
}

#[test]
fn comments_are_trivia_anywhere() {
    check(
        "(* lead *) d6 (* mid (* deep *) *) + 1 (* tail *)",
        r#"Binary { op: Add, lhs: Die { count: None, sides: "6", suffixes: [] }, rhs: Num("1") }"#,
    );
}

#[test]
fn unary_neg_binds_tighter_than_mul() {
    check(
        "-d6 * 2",
        r#"Binary { op: Mul, lhs: Neg(Die { count: None, sides: "6", suffixes: [] }), rhs: Num("2") }"#,
    );
}

#[test]
fn label_on_parenthesized_expression() {
    check(
        "(2d8 + 4)[slashing]",
        r#"Label { expr: Binary { op: Add, lhs: Die { count: Some("2"), sides: "8", suffixes: [] }, rhs: Num("4") }, word: "slashing" }"#,
    );
}

#[test]
fn match_arm_lambda_body_then_next_arm() {
    // Arm-`|` vs lambda-`|`: the lambda's `|`s are consumed by the lambda;
    // the following `| _ ->` is the next arm of the match.
    check(
        "match x | 1 -> |a| a | _ -> 2",
        r#"Match { scrutinee: Ident("x"), arms: [(Num { neg: false, digits: "1" }, Lambda { params: ["a"], body: Ident("a") }), (Wildcard, Num("2"))] }"#,
    );
}
