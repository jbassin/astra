//! The S1 round-trip property: for every AST `a` the parser produces (and any
//! hand-built one), `lower(parse(print(a))) == a` — and printed source parses
//! with zero errors.

use weal_engine::ast::{BinOp, CmpOp, DieSuffix, Expr, MatchPat, Pattern};
use weal_engine::{parse, parse_to_ast, print};

#[track_caller]
fn roundtrip_src(src: &str) {
    let a1 = parse_to_ast(src).unwrap_or_else(|e| panic!("{src:?} failed to parse: {e:?}"));
    roundtrip_ast(&a1);
}

#[track_caller]
fn roundtrip_ast(a: &Expr) {
    let printed = print(a);
    let a2 = parse_to_ast(&printed)
        .unwrap_or_else(|e| panic!("printed source {printed:?} failed to parse: {e:?}"));
    assert_eq!(*a, a2, "round-trip mismatch through {printed:?}");
}

/// Every golden input from the lexer/parser suites round-trips.
#[test]
fn all_golden_inputs_roundtrip() {
    let inputs = [
        "d6",
        "4d6kh3",
        "d6kh3",
        "2d6e2r1",
        "1_000",
        "0.100_120",
        "1.0f",
        ":kebab-case",
        "[:]",
        "[]",
        "[1, 2, 4]",
        r#"["good": 1, "bad": 3]"#,
        "{1, 2}",
        "match x | 1 -> match y | 2 -> a | _ -> b | _ -> c",
        "let first = let second = 2; second + 1; first - 2",
        "2d20kh1 + 7",
        "2d8[fire] + 1d6[slashing]",
        "f(_ + g(_))",
        "f(_ + _)",
        "f(_ + ph0)",
        "twice(_ * 2, 3)",
        "a < b < c",
        "match x | -1 -> y | _ -> z",
        "d20 + 7",
        "4d6kh3",
        "let smite(n) = sum(pool(n, d8)) + 5; smite(3)",
        "dl([:fine, :good, :great])",
        "2d6e2",
        "d20 + 3*2",
        "4d6kh",
        "1_0d1_00",
        "let x Num = 1; let {a, b} = {x, 2}; a",
        "(|a, b| a + b)(1)(2)",
        "f((), [])",
        "f([1, 2,], {3, 4,}, [:a: 1,],)",
        "(* lead *) d6 (* mid (* deep *) *) + 1 (* tail *)",
        "-d6 * 2",
        "(2d8 + 4)[slashing]",
        "match x | 1 -> |a| a | _ -> 2",
        r#""a\"b\\c\nd""#,
        "evaluate(pool(4, d6), 0, |state, outcome, count| state + outcome * count)",
        "match {x, y} | {1, -2} -> :hit | {a, _} -> :miss | _ -> :other",
        "1 - -2",
        "5 - (1 + 2)",
        "6 / (2 * 3)",
        "(a < b) < c",
        "1 + (let x = 2; x)",
        "|| 1",
    ];
    for src in inputs {
        roundtrip_src(src);
    }
}

// --- hand-built AST corpus (shapes the printer must parenthesize/format) ---

fn n(digits: &str) -> Expr {
    Expr::Num(digits.into())
}

fn id(name: &str) -> Expr {
    Expr::Ident(name.into())
}

fn die(count: Option<&str>, sides: &str, suffixes: &[(&str, Option<&str>)]) -> Expr {
    Expr::Die {
        count: count.map(Into::into),
        sides: sides.into(),
        suffixes: suffixes
            .iter()
            .map(|(name, arg)| DieSuffix {
                name: (*name).into(),
                arg: arg.map(Into::into),
            })
            .collect(),
    }
}

fn bin(op: BinOp, lhs: Expr, rhs: Expr) -> Expr {
    Expr::Binary {
        op,
        lhs: Box::new(lhs),
        rhs: Box::new(rhs),
    }
}

fn call(callee: Expr, args: Vec<Expr>) -> Expr {
    Expr::Call {
        callee: Box::new(callee),
        args,
    }
}

fn lambda(params: &[&str], body: Expr) -> Expr {
    Expr::Lambda {
        params: params.iter().map(|p| (*p).into()).collect(),
        body: Box::new(body),
    }
}

fn matche(scrutinee: Expr, arms: Vec<(MatchPat, Expr)>) -> Expr {
    Expr::Match {
        scrutinee: Box::new(scrutinee),
        arms,
    }
}

#[test]
fn hand_built_corpus_roundtrips() {
    let corpus: Vec<Expr> = vec![
        // Label on a binary expression — needs parens: `(2d8 + 4)[slashing]`.
        Expr::Label {
            expr: Box::new(bin(BinOp::Add, die(Some("2"), "8", &[]), n("4"))),
            word: "slashing".into(),
        },
        // Chained labels and calls.
        Expr::Label {
            expr: Box::new(Expr::Label {
                expr: Box::new(die(None, "6", &[])),
                word: "a".into(),
            }),
            word: "b".into(),
        },
        call(call(id("f"), vec![n("1")]), vec![n("2")]),
        // Match in a NON-final arm body must be parenthesized on print, or the
        // following arm would re-bind to it (nearest-match).
        matche(
            id("x"),
            vec![
                (
                    MatchPat::Num {
                        neg: false,
                        digits: "1".into(),
                    },
                    matche(
                        id("y"),
                        vec![(
                            MatchPat::Num {
                                neg: false,
                                digits: "2".into(),
                            },
                            id("a"),
                        )],
                    ),
                ),
                (MatchPat::Wildcard, id("c")),
            ],
        ),
        // Same, one level deeper: a lambda body ending in an open match.
        matche(
            id("x"),
            vec![
                (
                    MatchPat::Num {
                        neg: false,
                        digits: "1".into(),
                    },
                    lambda(&["a"], matche(id("a"), vec![(MatchPat::Wildcard, n("2"))])),
                ),
                (MatchPat::Wildcard, n("3")),
            ],
        ),
        // Double negation prints `--1` and reparses.
        Expr::Neg(Box::new(Expr::Neg(Box::new(n("1"))))),
        // Neg of a sub-expression that binds looser.
        Expr::Neg(Box::new(bin(BinOp::Add, n("1"), n("2")))),
        // Lambda as a callee needs parens.
        call(lambda(&["x"], id("x")), vec![n("3")]),
        // Zero-parameter lambda.
        lambda(&[], n("1")),
        // Comparison with a comparison operand (type-invalid, must still
        // round-trip syntactically): `(a < b) < c`.
        Expr::Cmp {
            first: Box::new(Expr::Cmp {
                first: Box::new(id("a")),
                rest: vec![(CmpOp::Lt, id("b"))],
            }),
            rest: vec![(CmpOp::Lt, id("c"))],
        },
        // Match as a comparison operand needs parens.
        Expr::Cmp {
            first: Box::new(matche(id("x"), vec![(MatchPat::Wildcard, n("1"))])),
            rest: vec![(CmpOp::EqEq, n("1"))],
        },
        // Let as a binary operand needs parens.
        bin(
            BinOp::Add,
            n("1"),
            Expr::Let {
                pattern: Pattern::Ident("x".into()),
                annot: None,
                value: Box::new(n("2")),
                body: Box::new(id("x")),
            },
        ),
        // Right-nested same-precedence needs parens: `5 - (1 + 2)`.
        bin(BinOp::Sub, n("5"), bin(BinOp::Add, n("1"), n("2"))),
        bin(BinOp::Div, n("6"), bin(BinOp::Mul, n("2"), n("3"))),
        // Left-nested stays flat: `1 - 2 - 3`.
        bin(BinOp::Sub, bin(BinOp::Sub, n("1"), n("2")), n("3")),
        // Dict with atom keys; tuple pattern let with annotation.
        Expr::Dict(vec![
            (Expr::Atom("fine".into()), n("1")),
            (Expr::Atom("good".into()), n("2")),
        ]),
        Expr::Let {
            pattern: Pattern::Tuple(vec![Pattern::Ident("x".into()), Pattern::Wildcard]),
            annot: Some("Num".into()),
            value: Box::new(Expr::Tuple(vec![n("1"), n("2")])),
            body: Box::new(id("x")),
        },
        Expr::LetFn {
            name: "f".into(),
            params: vec!["a".into(), "b".into()],
            annot: Some("Num".into()),
            value: Box::new(bin(BinOp::Add, id("a"), id("b"))),
            body: Box::new(call(id("f"), vec![n("1"), n("2")])),
        },
        // Match pattern zoo: negatives, strings, atoms, tuples, binders.
        matche(
            id("x"),
            vec![
                (
                    MatchPat::Num {
                        neg: true,
                        digits: "3".into(),
                    },
                    n("1"),
                ),
                (
                    MatchPat::Dec {
                        neg: true,
                        text: "1.5".into(),
                    },
                    n("2"),
                ),
                (MatchPat::Str("hit\n\"quote\"".into()), n("3")),
                (MatchPat::Atom("crit".into()), n("4")),
                (
                    MatchPat::Tuple(vec![
                        MatchPat::Ident("a".into()),
                        MatchPat::Wildcard,
                        MatchPat::Num {
                            neg: false,
                            digits: "0".into(),
                        },
                    ]),
                    n("5"),
                ),
                (MatchPat::Ident("other".into()), id("other")),
            ],
        ),
        // Literal zoo.
        Expr::Tuple(vec![
            Expr::Dec("0.100120".into()),
            Expr::Float("1.0".into()),
            Expr::Str("a\"b\\c\nd".into()),
            Expr::Atom("kebab-case".into()),
            Expr::Unit,
            Expr::List(vec![]),
            Expr::Dict(vec![]),
        ]),
        // Die shapes incl. digit-less suffix and suffix chains.
        die(None, "6", &[]),
        die(Some("4"), "6", &[("kh", Some("3"))]),
        die(Some("2"), "6", &[("e", Some("2")), ("r", Some("1"))]),
        die(Some("4"), "6", &[("kh", None)]),
        // Neg die under mul.
        bin(BinOp::Mul, Expr::Neg(Box::new(die(None, "6", &[]))), n("2")),
    ];
    for ast in &corpus {
        roundtrip_ast(ast);
    }
}

/// The CST is lossless: `syntax().text()` reproduces the source byte-for-byte,
/// trivia (whitespace + nested comments) included.
#[test]
fn cst_is_lossless() {
    let inputs = [
        "(* lead *) d6 (* mid (* deep *) *) + 1 (* tail *)",
        "let smite(n) = sum(pool(n, d8)) + 5; smite(3)",
        "  [ 1 ,\n 2 , ]  ",
    ];
    for src in inputs {
        let parsed = parse(src);
        assert!(parsed.errors.is_empty(), "{src:?} should parse cleanly");
        assert_eq!(
            parsed.syntax().text().to_string(),
            src,
            "lossless CST for {src:?}"
        );
    }
}
