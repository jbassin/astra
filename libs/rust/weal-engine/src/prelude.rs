//! The D32-19 prelude, implemented as NATIVE builtins.
//!
//! The spec's "weal source compiled into the engine, self-checked by a cargo
//! test" is satisfied by a native table whose SIGNATURES are exactly
//! [`crate::infer::prelude_types`] — the `native_table_matches_prelude_types`
//! test pins the two 1:1 (same name set, same arity) so they cannot drift.
//! Going native was a judgment call: every v2.0 prelude entry is either a
//! tree constructor or a scalar primitive, so a weal-source layer would add
//! an interpretation cost with no expressiveness gain.
//!
//! Dispatch happens through [`dispatch`] once a builtin is saturated
//! (currying/partial application is handled by `Interp::apply`). Runtime
//! shape checks are DEFENSIVE — the S2 checker guarantees well-typedness —
//! and surface as `Internal` errors; user-reachable failures (construction
//! validity, caps, save-name validation, effects-in-evaluate) are proper
//! eval/fuel errors.

use crate::fuel::Fuel;
use crate::interp::{Interp, append_display, serialize_value};
use crate::lower::Span;
use crate::value::{
    DEC_SCALE, DieTree, EvalError, Keep, MinMaxOp, PoolTree, SaveCmd, Value, dec_check_big,
    total_cmp,
};
use num_bigint::{BigInt, BigUint};

/// The native table: `(name, arity)`. Arity is the CURRIED arity used for
/// partial application; `roll` is variadic when called directly (the
/// interpreter special-cases it) and unary first-class, matching its
/// checker treatment.
pub const BUILTINS: &[(&str, usize)] = &[
    ("kh", 2),
    ("kl", 2),
    ("sum", 1),
    ("pool", 2),
    ("dl", 1),
    ("dm", 1),
    ("evaluate", 3),
    ("label", 2),
    ("explode", 2),
    ("e", 2),
    ("reroll", 2),
    ("r", 2),
    ("successes", 2),
    ("repeat", 2),
    ("concat", 2),
    ("map", 2),
    ("filter", 2),
    ("fold", 3),
    ("reduce", 2),
    ("len", 1),
    ("min", 2),
    ("max", 2),
    ("dec", 1),
    ("float", 1),
    ("num", 1),
    ("round", 1),
    ("floor", 1),
    ("ceil", 1),
    ("abs", 1),
    ("roll", 1),
    ("plot", 1),
    ("save", 2),
];

/// The static-str prelude name, if `name` is a prelude builtin.
pub fn static_name(name: &str) -> Option<&'static str> {
    BUILTINS.iter().map(|(n, _)| *n).find(|n| *n == name)
}

/// A builtin's curried arity.
pub fn arity_of(name: &str) -> Option<usize> {
    BUILTINS.iter().find(|(n, _)| *n == name).map(|(_, a)| *a)
}

// -- argument extraction (defensive — checker-guaranteed shapes) ------------

fn internal(msg: &str) -> EvalError {
    EvalError::internal(format!("{msg} — the checker should have rejected this"))
}

fn as_num(v: &Value, what: &str) -> Result<BigInt, EvalError> {
    match v {
        Value::Num(n) => Ok(n.clone()),
        _ => Err(internal(&format!("{what} must be a Num"))),
    }
}

fn as_dec(v: &Value, what: &str) -> Result<i128, EvalError> {
    match v {
        Value::Dec(d) => Ok(*d),
        _ => Err(internal(&format!("{what} must be a Dec"))),
    }
}

fn as_die(v: Value, what: &str) -> Result<DieTree, EvalError> {
    match v {
        Value::Die(t) => Ok(t),
        _ => Err(internal(&format!("{what} must be a die"))),
    }
}

fn as_pool(v: Value, what: &str) -> Result<PoolTree, EvalError> {
    match v {
        Value::Pool(p) => Ok(p),
        _ => Err(internal(&format!("{what} must be a pool"))),
    }
}

fn as_list(v: Value, what: &str) -> Result<Vec<Value>, EvalError> {
    match v {
        Value::List(items) => Ok(items),
        _ => Err(internal(&format!("{what} must be a list"))),
    }
}

fn as_dict(v: Value, what: &str) -> Result<Vec<(Value, Value)>, EvalError> {
    match v {
        Value::Dict(entries) => Ok(entries),
        _ => Err(internal(&format!("{what} must be a dict"))),
    }
}

fn as_atom(v: &Value, what: &str) -> Result<String, EvalError> {
    match v {
        Value::Atom(a) => Ok(a.clone()),
        _ => Err(internal(&format!("{what} must be an atom"))),
    }
}

fn num_to_u64(n: &BigInt, counter: &str, span: Option<Span>) -> Result<u64, EvalError> {
    u64::try_from(n).map_err(|_| EvalError::fuel(counter, span))
}

/// A die-or-const operand for min/max lifting.
fn operand(v: Value) -> Box<DieTree> {
    Box::new(match v {
        Value::Die(t) => t,
        other => DieTree::Const(Box::new(other)),
    })
}

// -- keep application -------------------------------------------------------

fn apply_keep(
    kind: &str,
    pool: PoolTree,
    n: &BigInt,
    span: Option<Span>,
) -> Result<Value, EvalError> {
    if n.sign() != num_bigint::Sign::Plus {
        return Err(EvalError::eval(
            format!("{kind} must keep at least 1 die"),
            span,
        ));
    }
    let kept = pool.kept_count();
    let n = u64::try_from(n).unwrap_or(u64::MAX);
    if n > kept {
        return Err(EvalError::eval(
            format!("{kind}{n} keeps {n} dice but the pool only has {kept}"),
            span,
        ));
    }
    let mut pool = pool;
    pool.keep.push(match kind {
        "kh" => Keep::High(n),
        _ => Keep::Low(n),
    });
    Ok(Value::Pool(pool))
}

/// `sum(pool)` with the documented collapses: a keep-less 1-die pool sums to
/// its die; a keep-less pool of plain leaves collapses to `Leaf{N, M}`.
fn sum_pool(pool: PoolTree) -> Value {
    if pool.keep.is_empty() {
        if pool.count == 1 {
            return Value::Die(*pool.die);
        }
        if let DieTree::Leaf { count: 1, sides } = *pool.die {
            return Value::Die(DieTree::Leaf {
                count: pool.count,
                sides,
            });
        }
    }
    Value::Die(DieTree::Sum { pool })
}

fn require_function_free(faces: &[Value], what: &str, span: Option<Span>) -> Result<(), EvalError> {
    if faces.iter().any(Value::contains_function) {
        return Err(EvalError::eval(
            format!("{what} faces must be function-free"),
            span,
        ));
    }
    Ok(())
}

// -- dispatch ---------------------------------------------------------------

/// Run a saturated builtin. `args.len()` equals the table arity.
/// `dm_literal` is true only for a DIRECT `dm` call whose argument was
/// syntactically a dict literal (D32-4).
pub fn dispatch(
    interp: &mut Interp<'_>,
    name: &str,
    mut args: Vec<Value>,
    dm_literal: bool,
    span: Option<Span>,
) -> Result<Value, EvalError> {
    match name {
        "kh" | "kl" => {
            let n = as_num(&args[1], "the keep count")?;
            let pool = as_pool(args.swap_remove(0), "kh/kl's first argument")?;
            apply_keep(name, pool, &n, span)
        }
        "sum" => {
            let pool = as_pool(args.swap_remove(0), "sum's argument")?;
            Ok(sum_pool(pool))
        }
        "pool" => {
            let n = as_num(&args[0], "the pool count")?;
            if n.sign() != num_bigint::Sign::Plus {
                return Err(EvalError::eval("a pool needs at least 1 die", span));
            }
            let count = num_to_u64(&n, "pool count", span)?;
            Fuel::check_pool_count(count, span)?;
            let die = as_die(args.swap_remove(1), "pool's second argument")?;
            Ok(Value::Pool(PoolTree {
                count,
                die: Box::new(die),
                keep: Vec::new(),
            }))
        }
        "dl" => {
            let faces = as_list(args.swap_remove(0), "dl's argument")?;
            if faces.is_empty() {
                return Err(EvalError::eval("dl needs at least one face", span));
            }
            require_function_free(&faces, "dl", span)?;
            // Duplicate faces are legal; order = list order (R4).
            Ok(Value::Die(DieTree::Dl { faces }))
        }
        "dm" => {
            let entries = as_dict(args.swap_remove(0), "dm's argument")?;
            if entries.is_empty() {
                return Err(EvalError::eval("dm needs at least one face", span));
            }
            let mut faces = Vec::with_capacity(entries.len());
            for (face, weight) in entries {
                if face.contains_function() {
                    return Err(EvalError::eval("dm faces must be function-free", span));
                }
                let w = as_num(&weight, "a dm weight")?;
                if w.sign() != num_bigint::Sign::Plus {
                    return Err(EvalError::eval("dm weights must be at least 1", span));
                }
                let w: BigUint = w.to_biguint().expect("sign-checked positive");
                faces.push((face, w));
            }
            if !dm_literal {
                // Face SORT order fallback (D32-4) via the total structural
                // order.
                faces.sort_by(|a, b| total_cmp(&a.0, &b.0));
            }
            Ok(Value::Die(DieTree::Dm { faces }))
        }
        "evaluate" => {
            let func = args.pop().expect("arity 3");
            let init = args.pop().expect("arity 3");
            let pool = as_pool(args.pop().expect("arity 3"), "evaluate's first argument")?;
            if !matches!(func, Value::Closure(_) | Value::Builtin(_)) {
                return Err(internal("evaluate's transition must be a function"));
            }
            // Symbolic until S4 — the DP runs through dist_seam::dist_of_with
            // when a distribution is demanded.
            Ok(Value::Die(DieTree::Evaluate {
                pool,
                init: Box::new(init),
                func: Box::new(func),
            }))
        }
        "label" => {
            let word = as_atom(&args[1], "label's second argument")?;
            let die = as_die(args.swap_remove(0), "label's first argument")?;
            Ok(Value::Die(DieTree::Label {
                word,
                inner: Box::new(die),
            }))
        }
        "explode" | "e" => {
            let depth = as_num(&args[1], "the explode depth")?;
            if depth.sign() == num_bigint::Sign::Minus {
                return Err(EvalError::eval("explode depth can't be negative", span));
            }
            let depth = num_to_u64(&depth, "explode depth", span)?;
            Fuel::check_explode_depth(depth, span)?;
            let die = as_die(args.swap_remove(0), "explode's first argument")?;
            Ok(Value::Die(DieTree::Explode {
                inner: Box::new(die),
                depth,
            }))
        }
        "reroll" => {
            let faces = as_list(args.swap_remove(1), "reroll's second argument")?;
            require_function_free(&faces, "reroll", span)?;
            let die = as_die(args.swap_remove(0), "reroll's first argument")?;
            Ok(Value::Die(DieTree::Reroll {
                inner: Box::new(die),
                faces,
            }))
        }
        "r" => {
            let face = as_num(&args[1], "r's face")?;
            let die = as_die(args.swap_remove(0), "r's first argument")?;
            Ok(Value::Die(DieTree::RerollFace {
                inner: Box::new(die),
                face,
            }))
        }
        "successes" => {
            let target = as_num(&args[1], "the successes target")?;
            let pool = as_pool(args.swap_remove(0), "successes' first argument")?;
            Ok(Value::Die(DieTree::Successes { pool, target }))
        }
        // -- the list toolkit. Die values are symbolic trees that re-sample per
        // occurrence, so `repeat(d20, 3)` is three INDEPENDENT dice by the same
        // rule that makes `let x = d20; [x, x, x]` three. The closure-taking
        // entries re-enter the interpreter through `apply` (ordinary calls —
        // fuel-metered, and effects behave exactly as in any user function,
        // unlike `evaluate`'s DP-guarded closures).
        "repeat" => {
            let n = as_num(&args[1], "the repeat count")?;
            if n.sign() == num_bigint::Sign::Minus {
                return Err(EvalError::eval("repeat count can't be negative", span));
            }
            let count = num_to_u64(&n, "repeat count", span)?;
            Fuel::check_list_len(count, span)?;
            let item = args.swap_remove(0);
            Ok(Value::List(vec![item; count as usize]))
        }
        "concat" => {
            let b = as_list(args.swap_remove(1), "concat's second argument")?;
            let mut a = as_list(args.swap_remove(0), "concat's first argument")?;
            a.extend(b);
            Ok(Value::List(a))
        }
        "map" => {
            let f = args.swap_remove(1);
            let items = as_list(args.swap_remove(0), "map's first argument")?;
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(interp.apply(f.clone(), vec![item], false, span)?);
            }
            Ok(Value::List(out))
        }
        "filter" => {
            let pred = args.swap_remove(1);
            let items = as_list(args.swap_remove(0), "filter's first argument")?;
            let mut out = Vec::new();
            for item in items {
                match interp.apply(pred.clone(), vec![item.clone()], false, span)? {
                    Value::Atom(a) if a == "true" => out.push(item),
                    Value::Atom(a) if a == "false" => {}
                    _ => return Err(internal("filter's predicate must return a Bool")),
                }
            }
            Ok(Value::List(out))
        }
        "fold" => {
            let f = args.swap_remove(2);
            let init = args.swap_remove(1);
            let items = as_list(args.swap_remove(0), "fold's first argument")?;
            let mut acc = init;
            for item in items {
                acc = interp.apply(f.clone(), vec![acc, item], false, span)?;
            }
            Ok(acc)
        }
        "reduce" => {
            // fold seeded by the first element — the homogeneous cousin
            // (`reduce([d20, d20], |x, y| x + y)` needs no dl([0]) zero-die).
            let f = args.swap_remove(1);
            let items = as_list(args.swap_remove(0), "reduce's first argument")?;
            let mut iter = items.into_iter();
            let Some(mut acc) = iter.next() else {
                return Err(EvalError::eval("reduce needs at least one element", span));
            };
            for item in iter {
                acc = interp.apply(f.clone(), vec![acc, item], false, span)?;
            }
            Ok(acc)
        }
        "len" => {
            let items = as_list(args.swap_remove(0), "len's argument")?;
            Ok(Value::Num(BigInt::from(items.len())))
        }
        "min" | "max" => {
            let b = args.pop().expect("arity 2");
            let a = args.pop().expect("arity 2");
            match (&a, &b) {
                (Value::Num(x), Value::Num(y)) => Ok(Value::Num(if name == "min" {
                    x.min(y).clone()
                } else {
                    x.max(y).clone()
                })),
                _ if matches!(a, Value::Die(_)) || matches!(b, Value::Die(_)) => {
                    Ok(Value::Die(DieTree::MinMax {
                        op: if name == "min" {
                            MinMaxOp::Min
                        } else {
                            MinMaxOp::Max
                        },
                        lhs: operand(a),
                        rhs: operand(b),
                    }))
                }
                _ => Err(internal("min/max take Num or Die[Num] arguments")),
            }
        }
        "dec" => {
            let n = as_num(&args[0], "dec's argument")?;
            let scaled = n * DEC_SCALE;
            Ok(Value::Dec(dec_check_big(&scaled, span)?))
        }
        "float" => match &args[0] {
            // BigInt → f64 through the string parser (correctly rounded; no
            // num-traits dependency).
            Value::Num(n) => Ok(Value::Float(
                n.to_string().parse().expect("digits parse as f64"),
            )),
            Value::Dec(d) => Ok(Value::Float(*d as f64 / DEC_SCALE as f64)),
            _ => Err(internal("float's argument must be Num or Dec")),
        },
        "num" => {
            // Truncates toward zero (i128 division semantics; documented).
            let d = as_dec(&args[0], "num's argument")?;
            Ok(Value::Num(BigInt::from(d / DEC_SCALE)))
        }
        "round" => {
            // Half-away-from-zero (documented).
            let d = as_dec(&args[0], "round's argument")?;
            let q = d / DEC_SCALE;
            let rem = d % DEC_SCALE;
            let bump = if rem.abs() >= DEC_SCALE / 2 {
                d.signum()
            } else {
                0
            };
            Ok(Value::Num(BigInt::from(q + bump)))
        }
        "floor" => {
            let d = as_dec(&args[0], "floor's argument")?;
            let q = if d >= 0 {
                d / DEC_SCALE
            } else {
                (d - (DEC_SCALE - 1)) / DEC_SCALE
            };
            Ok(Value::Num(BigInt::from(q)))
        }
        "ceil" => {
            let d = as_dec(&args[0], "ceil's argument")?;
            let q = if d >= 0 {
                (d + (DEC_SCALE - 1)) / DEC_SCALE
            } else {
                d / DEC_SCALE
            };
            Ok(Value::Num(BigInt::from(q)))
        }
        "abs" => match &args[0] {
            Value::Num(n) => Ok(Value::Num(n.magnitude().clone().into())),
            Value::Dec(d) => Ok(Value::Dec(d.abs())),
            _ => Err(internal("abs's argument must be Num or Dec")),
        },
        "roll" => {
            // First-class unary form; the direct variadic form is handled in
            // the interpreter's Call evaluation.
            interp.effect_guard(span)?;
            append_display(&mut interp.cmd, &args[0]);
            Ok(Value::Unit)
        }
        "plot" => {
            interp.effect_guard(span)?;
            let die = as_die(args.swap_remove(0), "plot's argument")?;
            interp.cmd.plots.push(die);
            Ok(Value::Unit)
        }
        "save" => {
            interp.effect_guard(span)?;
            let value = args.pop().expect("arity 2");
            let name_atom = as_atom(&args[0], "save's first argument")?;
            // D32-19: the atom must match the IDENT regex
            // `[a-z][a-zA-Z0-9_]*`. Atom charset is `[a-z][a-z0-9-]*`, so
            // in practice this rejects kebab names — but check the full
            // regex defensively.
            let mut chars = name_atom.chars();
            let head_ok = chars.next().is_some_and(|c| c.is_ascii_lowercase());
            let tail_ok = chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
            if !head_ok || !tail_ok {
                return Err(EvalError::eval(
                    format!(
                        "save name `:{name_atom}` isn't a valid identifier — \
                         atoms with `-` can't be referenced"
                    ),
                    span,
                ));
            }
            let source = serialize_value(&value).map_err(|mut e| {
                if e.span.is_none() {
                    e.span = span;
                }
                e
            })?;
            interp.cmd.saves.push(SaveCmd {
                name: name_atom,
                source,
            });
            Ok(Value::Unit)
        }
        other => Err(EvalError::internal(format!("unknown builtin `{other}`"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infer::{PreludeEntry, prelude_types};
    use crate::types::Type;

    fn arrow_arity(ty: &Type) -> usize {
        match ty {
            Type::Arrow(_, cod) => 1 + arrow_arity(cod),
            _ => 0,
        }
    }

    /// The D32-19 self-check: the native table matches `prelude_types()`
    /// 1:1 — same name set, same (curried) arity — so the checker's view of
    /// the prelude and the interpreter's implementation cannot drift.
    #[test]
    fn native_table_matches_prelude_types() {
        let typed = prelude_types();
        assert_eq!(
            typed.len(),
            BUILTINS.len(),
            "prelude_types and the native table must list the same names"
        );
        for (name, entry) in &typed {
            let native_arity = arity_of(name)
                .unwrap_or_else(|| panic!("prelude name `{name}` missing from the native table"));
            let expected = match entry {
                PreludeEntry::One(s) => arrow_arity(&s.ty),
                PreludeEntry::Overloaded(schemes) => {
                    let arities: Vec<usize> = schemes.iter().map(|s| arrow_arity(&s.ty)).collect();
                    assert!(
                        arities.iter().all(|a| *a == arities[0]),
                        "overload set for `{name}` must share one arity"
                    );
                    arities[0]
                }
                // roll: variadic direct, unary first-class (checker's
                // primary scheme is `T -> Unit`).
                PreludeEntry::RollVariadic => 1,
            };
            assert_eq!(
                native_arity, expected,
                "arity drift for prelude name `{name}`"
            );
        }
        for (name, _) in BUILTINS {
            assert!(
                typed.iter().any(|(n, _)| n == name),
                "native `{name}` has no prelude_types signature"
            );
        }
    }

    #[test]
    fn static_name_and_arity_lookups() {
        assert_eq!(static_name("kh"), Some("kh"));
        assert_eq!(static_name("nope"), None);
        assert_eq!(arity_of("evaluate"), Some(3));
        assert_eq!(arity_of("nope"), None);
    }
}
