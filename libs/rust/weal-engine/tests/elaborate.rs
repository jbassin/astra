//! Elaboration-shape assertions: the CoreExpr contract S3 consumes —
//! suffix lowering (D32-5), inserted sum calls (D32-4), dm literal-order
//! metadata, and shadow-proof Prelude nodes.

use weal_engine::ast::BinOp;
use weal_engine::infer::CoreExpr;
use weal_engine::{Scheme, Type, check_source};

fn core(src: &str) -> CoreExpr {
    check_source(src, &[])
        .unwrap_or_else(|e| panic!("expected accept for `{src}`: {} @ {:?}", e.message, e.span))
        .0
}

fn call(callee: CoreExpr, args: Vec<CoreExpr>) -> CoreExpr {
    CoreExpr::Call {
        callee: Box::new(callee),
        args,
        dm_literal_order: false,
    }
}

fn num(d: &str) -> CoreExpr {
    CoreExpr::Num(d.to_owned())
}

fn die(count: Option<&str>, sides: &str) -> CoreExpr {
    CoreExpr::Die {
        count: count.map(str::to_owned),
        sides: sides.to_owned(),
    }
}

fn sum(inner: CoreExpr) -> CoreExpr {
    call(CoreExpr::Prelude("sum"), vec![inner])
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
        CoreExpr::Prelude("kh"),
        vec![
            call(CoreExpr::Prelude("pool"), vec![num("2"), die(None, "20")]),
            num("1"),
        ],
    );
    assert_eq!(
        core("2d20kh1 + 7"),
        CoreExpr::Binary {
            op: BinOp::Add,
            lhs: Box::new(sum(kh)),
            rhs: Box::new(num("7")),
        }
    );
}

#[test]
fn suffix_chain_lowers_keeping_the_pool_open() {
    // The pinned lowering: 4d6e2kh3 = kh(pool(4, explode(d6, 2)), 3),
    // closed by the top-level sum only.
    let explode = call(CoreExpr::Prelude("explode"), vec![die(None, "6"), num("2")]);
    let pool = call(CoreExpr::Prelude("pool"), vec![num("4"), explode]);
    let kh = call(CoreExpr::Prelude("kh"), vec![pool, num("3")]);
    assert_eq!(core("4d6e2kh3"), sum(kh));
}

#[test]
fn die_shape_suffixes_fold_left_to_right() {
    // 2d6e2r1: r wraps the exploded die, all inside the pool.
    let explode = call(CoreExpr::Prelude("explode"), vec![die(None, "6"), num("2")]);
    let r = call(CoreExpr::Prelude("r"), vec![explode, num("1")]);
    let pool = call(CoreExpr::Prelude("pool"), vec![num("2"), r]);
    assert_eq!(core("2d6e2r1"), sum(pool));
}

#[test]
fn die_shape_on_a_countless_die_needs_no_pool() {
    assert_eq!(
        core("d6e2"),
        call(CoreExpr::Prelude("explode"), vec![die(None, "6"), num("2")])
    );
}

#[test]
fn pool_shape_on_a_countless_die_wraps_a_one_die_pool() {
    let pool = call(CoreExpr::Prelude("pool"), vec![num("1"), die(None, "6")]);
    let kh = call(CoreExpr::Prelude("kh"), vec![pool, num("3")]);
    assert_eq!(core("d6kh3"), sum(kh));
}

#[test]
fn inserted_sum_is_shadow_proof() {
    // `let sum = 5; 2d6kh1 + sum` — the inserted coercion is a Prelude node;
    // the user's `sum` stays an Ident.
    let c = core("let sum = 5; 2d6kh1 + sum");
    let CoreExpr::Let { body, .. } = c else {
        panic!("expected let, got {c:?}");
    };
    let CoreExpr::Binary { lhs, rhs, .. } = *body else {
        panic!("expected binary body");
    };
    let CoreExpr::Call { callee, .. } = *lhs else {
        panic!("expected inserted sum call");
    };
    assert_eq!(*callee, CoreExpr::Prelude("sum"));
    assert_eq!(*rhs, CoreExpr::Ident("sum".to_owned()));
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
    let pool = call(CoreExpr::Prelude("pool"), vec![num("2"), die(None, "6")]);
    let zz_call = call(CoreExpr::Ident("zz".to_owned()), vec![pool, num("1")]);
    assert_eq!(
        c,
        CoreExpr::Binary {
            op: BinOp::Add,
            lhs: Box::new(sum(zz_call)),
            rhs: Box::new(num("1")),
        }
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
    let yy_call = call(
        CoreExpr::Ident("yy".to_owned()),
        vec![die(None, "6"), num("1")],
    );
    let pool = call(CoreExpr::Prelude("pool"), vec![num("2"), yy_call]);
    assert_eq!(c, sum(pool));
}

#[test]
fn dm_literal_argument_carries_face_order_metadata() {
    let c = core("dm([:a : 1, :b : 2])");
    let CoreExpr::Call {
        dm_literal_order, ..
    } = c
    else {
        panic!("expected dm call");
    };
    assert!(dm_literal_order, "literal dict argument must set the flag");
}

#[test]
fn dm_variable_argument_has_no_face_order_metadata() {
    let c = core("let w = [:a : 1]; dm(w)");
    let CoreExpr::Let { body, .. } = c else {
        panic!("expected let");
    };
    let CoreExpr::Call {
        dm_literal_order, ..
    } = *body
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
        CoreExpr::Prelude("kh"),
        vec![
            call(CoreExpr::Prelude("pool"), vec![num("2"), die(None, "6")]),
            num("1"),
        ],
    );
    assert_eq!(
        core("2d6kh1[boom]"),
        CoreExpr::Label {
            expr: Box::new(sum(kh)),
            word: "boom".to_owned(),
        }
    );
}

#[test]
fn comparison_operands_coerce_pools() {
    let c = core("2d20kh1 > 15");
    let CoreExpr::Cmp { lhs, .. } = c else {
        panic!("expected cmp");
    };
    let CoreExpr::Call { callee, .. } = *lhs else {
        panic!("expected inserted sum");
    };
    assert_eq!(*callee, CoreExpr::Prelude("sum"));
}

#[test]
fn pool_ident_coerces_at_use_site() {
    let c = core("let p = 2d20kh1; p + 7");
    let CoreExpr::Let { value, body, .. } = c else {
        panic!("expected let");
    };
    // The let-bound value keeps the pool OPEN (no sum inside).
    let CoreExpr::Call { callee, .. } = *value else {
        panic!("expected kh call as the value");
    };
    assert_eq!(*callee, CoreExpr::Prelude("kh"));
    // The use site wraps the ident.
    let CoreExpr::Binary { lhs, .. } = *body else {
        panic!("expected binary body");
    };
    assert_eq!(*lhs, sum(CoreExpr::Ident("p".to_owned())));
}
