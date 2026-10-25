//! Elaboration-shape assertions: the CoreExpr contract the interpreter consumes —
//! suffix lowering, inserted sum calls, dm literal-order
//! metadata, and shadow-proof Prelude nodes.

use weal_engine::ast::BinOp;
use weal_engine::infer::{CoreExpr, CoreKind};
use weal_engine::prelude::Builtin;
use weal_engine::{Scheme, Type, check_source};

/// The elaborated core with its spans zeroed (shape assertions); the spans
/// themselves are asserted in `inserted_nodes_take_their_source_spans`.
fn core(src: &str) -> CoreExpr {
    spanned(src).without_spans()
}

fn spanned(src: &str) -> CoreExpr {
    check_source(src, &[])
        .unwrap_or_else(|e| panic!("expected accept for `{src}`: {} @ {:?}", e.message, e.span))
        .0
}

const Z: (usize, usize) = (0, 0);

fn call(callee: CoreExpr, args: Vec<CoreExpr>) -> CoreExpr {
    CoreKind::Call {
        callee: Box::new(callee),
        args,
        dm_literal_order: false,
    }
    .at(Z)
}

fn num(d: &str) -> CoreExpr {
    CoreKind::Num(d.to_owned()).at(Z)
}

fn die(count: Option<&str>, sides: &str) -> CoreExpr {
    CoreKind::Die {
        count: count.map(str::to_owned),
        sides: sides.to_owned(),
    }
    .at(Z)
}

fn pre(b: Builtin) -> CoreExpr {
    CoreKind::Prelude(b).at(Z)
}

fn ident(name: &str) -> CoreExpr {
    CoreKind::Ident(name.to_owned()).at(Z)
}

fn sum(inner: CoreExpr) -> CoreExpr {
    call(pre(Builtin::Sum), vec![inner])
}

#[test]
fn bare_die_and_pool_literals() {
    // d20 stays a bare die; 2d6 is an open pool closed by the top-level sum.
    assert_eq!(core("d20"), die(None, "20"));
    assert_eq!(core("2d6"), sum(die(Some("2"), "6")));
}

#[test]
fn pool_plus_num_inserts_sum() {
    // The pinned case: 2d20kh1 + 7 elaborates with an explicit sum.
    let kh = call(
        pre(Builtin::Kh),
        vec![
            call(pre(Builtin::Pool), vec![num("2"), die(None, "20")]),
            num("1"),
        ],
    );
    assert_eq!(
        core("2d20kh1 + 7"),
        CoreKind::Binary {
            op: BinOp::Add,
            lhs: Box::new(sum(kh)),
            rhs: Box::new(num("7")),
        }
        .at(Z)
    );
}

#[test]
fn suffix_chain_lowers_keeping_the_pool_open() {
    // The pinned lowering: 4d6e2kh3 = kh(pool(4, explode(d6, 2)), 3),
    // closed by the top-level sum only.
    let explode = call(pre(Builtin::Explode), vec![die(None, "6"), num("2")]);
    let pool = call(pre(Builtin::Pool), vec![num("4"), explode]);
    let kh = call(pre(Builtin::Kh), vec![pool, num("3")]);
    assert_eq!(core("4d6e2kh3"), sum(kh));
}

#[test]
fn die_shape_suffixes_fold_left_to_right() {
    // 2d6e2r1: r wraps the exploded die, all inside the pool.
    let explode = call(pre(Builtin::Explode), vec![die(None, "6"), num("2")]);
    let r = call(pre(Builtin::R), vec![explode, num("1")]);
    let pool = call(pre(Builtin::Pool), vec![num("2"), r]);
    assert_eq!(core("2d6e2r1"), sum(pool));
}

#[test]
fn die_shape_on_a_countless_die_needs_no_pool() {
    assert_eq!(
        core("d6e2"),
        call(pre(Builtin::Explode), vec![die(None, "6"), num("2")])
    );
}

#[test]
fn pool_shape_on_a_countless_die_wraps_a_one_die_pool() {
    let pool = call(pre(Builtin::Pool), vec![num("1"), die(None, "6")]);
    let kh = call(pre(Builtin::Kh), vec![pool, num("3")]);
    assert_eq!(core("d6kh3"), sum(kh));
}

#[test]
fn inserted_sum_is_shadow_proof() {
    // `let sum = 5; 2d6kh1 + sum` — the inserted coercion is a Prelude node;
    // the user's `sum` stays an Ident.
    let c = core("let sum = 5; 2d6kh1 + sum");
    let CoreKind::Let { body, .. } = c.kind else {
        panic!("expected let, got {c:?}");
    };
    let CoreKind::Binary { lhs, rhs, .. } = body.kind else {
        panic!("expected binary body");
    };
    let CoreKind::Call { callee, .. } = lhs.kind else {
        panic!("expected inserted sum call");
    };
    assert_eq!(callee.kind, CoreKind::Prelude(Builtin::Sum));
    assert_eq!(rhs.kind, CoreKind::Ident("sum".to_owned()));
}

#[test]
fn pool_wins_ambiguity_applies_to_the_pool() {
    // zz fits both shapes; pool-shape wins, so zz receives the POOL.
    let zz = Scheme::poly(
        vec![0],
        Type::arrows(vec![Type::Var(0), Type::Num], Type::Var(0)),
    );
    let extra = vec![("zz".to_owned(), zz)];
    let (c, _) = check_source("2d6zz1 + 1", &extra).expect("accepts");
    let pool = call(pre(Builtin::Pool), vec![num("2"), die(None, "6")]);
    let zz_call = call(ident("zz"), vec![pool, num("1")]);
    assert_eq!(
        c.without_spans(),
        CoreKind::Binary {
            op: BinOp::Add,
            lhs: Box::new(sum(zz_call)),
            rhs: Box::new(num("1")),
        }
        .at(Z)
    );
}

#[test]
fn die_shape_extra_env_suffix_maps_the_underlying_die() {
    let yy = Scheme::mono(Type::arrows(
        vec![Type::die(Type::Num), Type::Num],
        Type::die(Type::Num),
    ));
    let extra = vec![("yy".to_owned(), yy)];
    let (c, _) = check_source("2d6yy1", &extra).expect("accepts");
    let yy_call = call(ident("yy"), vec![die(None, "6"), num("1")]);
    let pool = call(pre(Builtin::Pool), vec![num("2"), yy_call]);
    assert_eq!(c.without_spans(), sum(pool));
}

#[test]
fn dm_literal_argument_carries_face_order_metadata() {
    let c = core("dm([:a : 1, :b : 2])");
    let CoreKind::Call {
        dm_literal_order, ..
    } = c.kind
    else {
        panic!("expected dm call");
    };
    assert!(dm_literal_order, "literal dict argument must set the flag");
}

#[test]
fn dm_variable_argument_has_no_face_order_metadata() {
    let c = core("let w = [:a : 1]; dm(w)");
    let CoreKind::Let { body, .. } = c.kind else {
        panic!("expected let");
    };
    let CoreKind::Call {
        dm_literal_order, ..
    } = body.kind
    else {
        panic!("expected dm call");
    };
    assert!(
        !dm_literal_order,
        "non-literal argument must NOT set the flag"
    );
}

#[test]
fn label_on_a_pool_sums_first() {
    let kh = call(
        pre(Builtin::Kh),
        vec![
            call(pre(Builtin::Pool), vec![num("2"), die(None, "6")]),
            num("1"),
        ],
    );
    assert_eq!(
        core("2d6kh1[boom]"),
        CoreKind::Label {
            expr: Box::new(sum(kh)),
            word: "boom".to_owned(),
        }
        .at(Z)
    );
}

#[test]
fn comparison_operands_coerce_pools() {
    let c = core("2d20kh1 > 15");
    let CoreKind::Cmp { lhs, .. } = c.kind else {
        panic!("expected cmp");
    };
    let CoreKind::Call { callee, .. } = lhs.kind else {
        panic!("expected inserted sum");
    };
    assert_eq!(callee.kind, CoreKind::Prelude(Builtin::Sum));
}

#[test]
fn pool_ident_coerces_at_use_site() {
    let c = core("let p = 2d20kh1; p + 7");
    let CoreKind::Let { value, body, .. } = c.kind else {
        panic!("expected let");
    };
    // The let-bound value keeps the pool OPEN (no sum inside).
    let CoreKind::Call { callee, .. } = value.kind else {
        panic!("expected kh call as the value");
    };
    assert_eq!(callee.kind, CoreKind::Prelude(Builtin::Kh));
    // The use site wraps the ident.
    let CoreKind::Binary { lhs, .. } = body.kind else {
        panic!("expected binary body");
    };
    assert_eq!(*lhs, sum(ident("p")));
}

#[test]
fn inserted_nodes_take_their_source_spans() {
    // `2d6kh1 + 7`: the inserted sum, its callee and the whole suffix
    // elaboration (kh, pool, their numeric arguments, the bare die) take the
    // die literal's span; `7` and the `+` node keep their own.
    let c = spanned("2d6kh1 + 7");
    assert_eq!(c.span, (0, 10));
    let CoreKind::Binary { lhs, rhs, .. } = &c.kind else {
        panic!("expected binary, got {c:?}");
    };
    assert_eq!(rhs.span, (9, 10));
    fn all_spans(e: &CoreExpr, out: &mut Vec<(usize, usize)>) {
        out.push(e.span);
        if let CoreKind::Call { callee, args, .. } = &e.kind {
            all_spans(callee, out);
            for a in args {
                all_spans(a, out);
            }
        }
    }
    let mut spans = Vec::new();
    all_spans(lhs, &mut spans);
    assert_eq!(spans.len(), 9, "sum(kh(pool(2, d6), 1)) has nine nodes");
    assert!(spans.iter().all(|s| *s == (0, 6)), "{spans:?}");

    // `f()`: the implicit unit argument takes the call's span.
    let c = spanned("let f() = 1; f()");
    let CoreKind::LetFn { body, .. } = &c.kind else {
        panic!("expected let fn, got {c:?}");
    };
    let CoreKind::Call { callee, args, .. } = &body.kind else {
        panic!("expected call, got {body:?}");
    };
    assert_eq!((body.span, callee.span), ((13, 16), (13, 14)));
    assert_eq!(args[0].kind, CoreKind::Unit);
    assert_eq!(args[0].span, (13, 16));
}
