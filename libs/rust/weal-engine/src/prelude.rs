//! The prelude: the ONE builtin registry.
//!
//! Every builtin is defined once, as a row of [`BUILTINS`]: its name, its
//! curried arity, how the checker types it ([`Typing`]), its native
//! implementation, and the one-line description the player guide prints.
//! Everything else derives from that row: the checker's environment
//! ([`crate::infer::prelude_types`]), the interpreter's dispatch and partial
//! application, the "is this name a builtin" lookup ([`Builtin::from_name`])
//! that save serialization and the bot's save guard use, and the generated
//! reference (`gen/weal_builtins.json` and the player guide's built-in list,
//! pinned by the `builtin_reference_is_current` test).
//!
//! Going native was a judgment call: every v2.0 prelude entry is either a
//! tree constructor or a scalar primitive, so a weal-source layer would add
//! an interpretation cost with no expressiveness gain.
//!
//! Saturated calls run through [`dispatch`] (currying and partial
//! application are `Interp::apply`'s job). Runtime shape checks are
//! DEFENSIVE — the checker guarantees well-typedness — and surface as
//! `Internal` errors; user-reachable failures (construction validity, caps,
//! save-name validation, effects-in-evaluate) are proper eval/fuel errors.

use crate::fuel::Fuel;
use crate::infer::PreludeEntry;
use crate::interp::{Interp, append_display, serialize_value};
use crate::lower::Span;
use crate::types::{EquatableConstraint, EquatableSite, Scheme, Type};
use crate::value::{
    DEC_SCALE, DieTree, EvalError, Keep, MinMaxOp, PoolTree, SaveCmd, Value, dec_check_big,
    total_cmp,
};
use num_bigint::{BigInt, BigUint};

/// A builtin. The discriminant indexes [`BUILTINS`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Builtin {
    Kh,
    Kl,
    Sum,
    Pool,
    Dl,
    Dm,
    Evaluate,
    Label,
    Explode,
    E,
    Reroll,
    R,
    Successes,
    Repeat,
    Concat,
    Map,
    Filter,
    Fold,
    Reduce,
    Len,
    Min,
    Max,
    Dec,
    Float,
    Num,
    Round,
    Floor,
    Ceil,
    Abs,
    Roll,
    Plot,
    Save,
}

/// How the checker types a builtin.
#[derive(Clone, Copy)]
pub enum Typing {
    /// One scheme, for direct calls, first-class uses and die suffixes.
    Scheme(fn() -> Scheme),
    /// `min`/`max`: a direct two-argument call lifts over dice (Num or
    /// `Die[Num]` operands, a die result if either is one). As a die suffix
    /// every overload is tried; first-class, the first overload is used.
    MinMax(fn() -> Vec<Scheme>),
    /// `float`/`abs`: a direct one-argument call picks the overload by the
    /// argument (Num or Dec). First-class and as a suffix, only the first.
    Cast(fn() -> Vec<Scheme>),
    /// `roll`: a direct call takes one or more function-free values; the
    /// first-class form is `T -> Unit`.
    Roll,
}

/// A saturated call, as the implementation sees it.
#[derive(Debug, Clone, Copy)]
pub struct Call {
    /// Which builtin runs (rows that share an implementation tell apart by it).
    pub builtin: Builtin,
    /// True only for a DIRECT `dm` call whose argument was syntactically a
    /// dict literal.
    pub dm_literal: bool,
    pub span: Option<Span>,
}

/// A builtin's native implementation. `args.len()` equals the row's arity.
pub type Impl = fn(&mut Interp<'_>, Vec<Value>, Call) -> Result<Value, EvalError>;

/// One registry row.
pub struct BuiltinDef {
    pub builtin: Builtin,
    pub name: &'static str,
    /// The CURRIED arity used for partial application. `roll` is variadic
    /// when called directly (the interpreter special-cases it) and unary
    /// first-class, matching its checker treatment.
    pub arity: usize,
    pub typing: Typing,
    pub run: Impl,
    /// The die-suffix spelling elaborates to this builtin instead (the `e`
    /// alias canonicalizes to `explode`).
    pub suffix_as: Option<Builtin>,
    /// The player guide's one-line description (markdown).
    pub doc: &'static str,
}

const fn def(
    builtin: Builtin,
    name: &'static str,
    arity: usize,
    typing: Typing,
    run: Impl,
    doc: &'static str,
) -> BuiltinDef {
    BuiltinDef {
        builtin,
        name,
        arity,
        typing,
        run,
        suffix_as: None,
        doc,
    }
}

/// The registry, in [`Builtin`] discriminant order.
pub const BUILTINS: &[BuiltinDef] = &[
    def(
        Builtin::Kh,
        "kh",
        2,
        Typing::Scheme(keep_scheme),
        keep,
        "keep the highest n dice of a pool; the `kh` suffix (`4d6kh3`)",
    ),
    def(
        Builtin::Kl,
        "kl",
        2,
        Typing::Scheme(keep_scheme),
        keep,
        "keep the lowest n dice of a pool; the `kl` suffix (`2d20kl1`)",
    ),
    def(
        Builtin::Sum,
        "sum",
        1,
        Typing::Scheme(|| Scheme::mono(Type::arrow(Type::pool(Type::Num), dnum()))),
        sum,
        "total a numeric pool into one die (a pool in a die position sums by itself)",
    ),
    def(
        Builtin::Pool,
        "pool",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::Num, Type::die(t())], Type::pool(t())),
            )
        }),
        pool,
        "n copies of a die, before summing (`pool(4, d6)` is `4d6`)",
    ),
    def(
        Builtin::Dl,
        "dl",
        1,
        Typing::Scheme(|| Scheme::poly(vec![0], Type::arrow(Type::list(t()), Type::die(t())))),
        dl,
        "an equal-weight die from a list of faces, worst first",
    ),
    def(
        Builtin::Dm,
        "dm",
        1,
        Typing::Scheme(|| Scheme {
            vars: vec![0],
            constraints: vec![EquatableConstraint {
                ty: t(),
                site: EquatableSite::DictKey,
            }],
            arith: Vec::new(),
            ty: Type::arrow(Type::dict(t(), Type::Num), Type::die(t())),
        }),
        dm,
        "a weighted die from a `face: weight` dict, worst face first",
    ),
    def(
        Builtin::Evaluate,
        "evaluate",
        3,
        Typing::Scheme(|| Scheme {
            vars: vec![0, 1],
            constraints: vec![EquatableConstraint {
                ty: s(),
                site: EquatableSite::EvaluatorState,
            }],
            arith: Vec::new(),
            ty: Type::arrows(
                vec![
                    Type::pool(t()),
                    s(),
                    Type::arrows(vec![s(), t(), Type::Num], s()),
                ],
                Type::die(s()),
            ),
        }),
        evaluate,
        "fold a pool's rolled faces (highest first, with counts) into a die of states",
    ),
    def(
        Builtin::Label,
        "label",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::die(t()), Type::Atom], Type::die(t())),
            )
        }),
        label,
        "name a die in the trace, like `[word]`",
    ),
    def(
        Builtin::Explode,
        "explode",
        2,
        Typing::Scheme(die_num_scheme),
        explode,
        "roll again on the top face, at most n extra rolls; the `e` suffix",
    ),
    BuiltinDef {
        suffix_as: Some(Builtin::Explode),
        ..def(
            Builtin::E,
            "e",
            2,
            Typing::Scheme(die_num_scheme),
            explode,
            "`explode`, short",
        )
    },
    def(
        Builtin::Reroll,
        "reroll",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::die(t()), Type::list(t())], Type::die(t())),
            )
        }),
        reroll,
        "reroll any of the listed faces once, keeping the new face",
    ),
    def(
        Builtin::R,
        "r",
        2,
        Typing::Scheme(die_num_scheme),
        reroll_face,
        "reroll one face once, keeping the new face; the `r` suffix (`4d6r1`)",
    ),
    def(
        Builtin::Successes,
        "successes",
        2,
        Typing::Scheme(|| {
            Scheme::mono(Type::arrows(vec![Type::pool(Type::Num), Type::Num], dnum()))
        }),
        successes,
        "count the dice in a pool that meet a target",
    ),
    // -- the list toolkit (2026-08-10 amendment). Data-first argument order
    // throughout, mirroring `evaluate(pool, init, fn)`.
    def(
        Builtin::Repeat,
        "repeat",
        2,
        Typing::Scheme(|| {
            Scheme::poly(vec![0], Type::arrows(vec![t(), Type::Num], Type::list(t())))
        }),
        repeat,
        "a list of n copies; dice in it roll independently",
    ),
    def(
        Builtin::Concat,
        "concat",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::list(t()), Type::list(t())], Type::list(t())),
            )
        }),
        concat,
        "join two lists",
    ),
    def(
        Builtin::Map,
        "map",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0, 1],
                Type::arrows(
                    vec![Type::list(t()), Type::arrow(t(), s())],
                    Type::list(s()),
                ),
            )
        }),
        map,
        "apply a function to each element",
    ),
    def(
        Builtin::Filter,
        "filter",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0],
                Type::arrows(
                    vec![Type::list(t()), Type::arrow(t(), Type::bool())],
                    Type::list(t()),
                ),
            )
        }),
        filter,
        "keep the elements whose predicate is `:true`",
    ),
    def(
        Builtin::Fold,
        "fold",
        3,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0, 1],
                Type::arrows(
                    vec![Type::list(t()), s(), Type::arrows(vec![s(), t()], s())],
                    s(),
                ),
            )
        }),
        fold,
        "thread an accumulator through a list",
    ),
    def(
        Builtin::Reduce,
        "reduce",
        2,
        Typing::Scheme(|| {
            Scheme::poly(
                vec![0],
                Type::arrows(
                    vec![Type::list(t()), Type::arrows(vec![t(), t()], t())],
                    t(),
                ),
            )
        }),
        reduce,
        "fold seeded by the first element (needs at least one)",
    ),
    def(
        Builtin::Len,
        "len",
        1,
        Typing::Scheme(|| Scheme::poly(vec![0], Type::arrow(Type::list(t()), Type::Num))),
        len,
        "count a list's elements",
    ),
    def(
        Builtin::Min,
        "min",
        2,
        Typing::MinMax(minmax_schemes),
        min_max,
        "the smaller of two numbers or dice",
    ),
    def(
        Builtin::Max,
        "max",
        2,
        Typing::MinMax(minmax_schemes),
        min_max,
        "the larger of two numbers or dice",
    ),
    def(
        Builtin::Dec,
        "dec",
        1,
        Typing::Scheme(|| Scheme::mono(Type::arrow(Type::Num, Type::Dec))),
        dec,
        "a Num as an exact decimal",
    ),
    def(
        Builtin::Float,
        "float",
        1,
        Typing::Cast(|| {
            vec![
                Scheme::mono(Type::arrow(Type::Num, Type::Float)),
                Scheme::mono(Type::arrow(Type::Dec, Type::Float)),
            ]
        }),
        float,
        "a Num or Dec as a float",
    ),
    def(
        Builtin::Num,
        "num",
        1,
        Typing::Scheme(dec_to_num_scheme),
        num,
        "a Dec as a Num, truncating toward zero",
    ),
    def(
        Builtin::Round,
        "round",
        1,
        Typing::Scheme(dec_to_num_scheme),
        round,
        "a Dec to the nearest Num, halves away from zero",
    ),
    def(
        Builtin::Floor,
        "floor",
        1,
        Typing::Scheme(dec_to_num_scheme),
        floor,
        "a Dec down to a Num",
    ),
    def(
        Builtin::Ceil,
        "ceil",
        1,
        Typing::Scheme(dec_to_num_scheme),
        ceil,
        "a Dec up to a Num",
    ),
    def(
        Builtin::Abs,
        "abs",
        1,
        Typing::Cast(|| {
            vec![
                Scheme::mono(Type::arrow(Type::Num, Type::Num)),
                Scheme::mono(Type::arrow(Type::Dec, Type::Dec)),
            ]
        }),
        abs,
        "absolute value of a Num or Dec",
    ),
    def(
        Builtin::Roll,
        "roll",
        1,
        Typing::Roll,
        roll,
        "show each value as its own roll",
    ),
    def(
        Builtin::Plot,
        "plot",
        1,
        Typing::Scheme(|| Scheme::poly(vec![0], Type::arrow(Type::die(t()), Type::Unit))),
        plot,
        "reply with the die's exact probability chart",
    ),
    def(
        Builtin::Save,
        "save",
        2,
        Typing::Scheme(|| Scheme::poly(vec![0], Type::arrows(vec![Type::Atom, t()], Type::Unit))),
        save,
        "store a value under a name for every later message (a macro)",
    ),
];

impl Builtin {
    /// This builtin's registry row.
    pub fn def(self) -> &'static BuiltinDef {
        &BUILTINS[self as usize]
    }

    pub fn name(self) -> &'static str {
        self.def().name
    }

    /// The builtin that owns `name`, if any. This is THE "is this name a
    /// builtin" lookup.
    pub fn from_name(name: &str) -> Option<Builtin> {
        BUILTINS.iter().find(|d| d.name == name).map(|d| d.builtin)
    }
}

impl BuiltinDef {
    /// How the checker's environment binds this name.
    pub fn prelude_entry(&self) -> PreludeEntry {
        match self.typing {
            Typing::Scheme(scheme) => PreludeEntry::One(scheme()),
            Typing::MinMax(schemes) | Typing::Cast(schemes) => PreludeEntry::Overloaded(schemes()),
            Typing::Roll => PreludeEntry::RollVariadic,
        }
    }

    /// The scheme a first-class use instantiates: the first overload, or
    /// `roll`'s `T -> Unit` (its argument must be function-free).
    pub fn primary_scheme(&self) -> Scheme {
        match self.typing {
            Typing::Scheme(scheme) => scheme(),
            Typing::MinMax(schemes) | Typing::Cast(schemes) => schemes()
                .into_iter()
                .next()
                .expect("an overload set is never empty"),
            Typing::Roll => Scheme {
                vars: vec![0],
                constraints: vec![EquatableConstraint {
                    ty: Type::Var(0),
                    site: EquatableSite::RollArgument,
                }],
                arith: Vec::new(),
                ty: Type::arrow(Type::Var(0), Type::Unit),
            },
        }
    }

    /// The schemes a die suffix tries: every overload for `min`/`max`, the
    /// primary scheme otherwise.
    pub fn suffix_schemes(&self) -> Vec<Scheme> {
        match self.typing {
            Typing::MinMax(schemes) => schemes(),
            _ => vec![self.primary_scheme()],
        }
    }

    /// The player-facing signatures: one per overload, type variables named
    /// `a` and `b`.
    pub fn signatures(&self) -> Vec<String> {
        let schemes = match self.typing {
            Typing::Roll => return vec!["a, … -> Unit".to_owned()],
            Typing::Scheme(scheme) => vec![scheme()],
            Typing::MinMax(schemes) | Typing::Cast(schemes) => schemes(),
        };
        schemes
            .iter()
            .map(|s| s.ty.to_string().replace("t0", "a").replace("t1", "b"))
            .collect()
    }
}

// -- type scheme building blocks ---------------------------------------------

fn t() -> Type {
    Type::Var(0)
}

fn s() -> Type {
    Type::Var(1)
}

fn dnum() -> Type {
    Type::die(Type::Num)
}

/// `kh`/`kl`: `Pool[T] -> Num -> Pool[T]`.
fn keep_scheme() -> Scheme {
    Scheme::poly(
        vec![0],
        Type::arrows(vec![Type::pool(t()), Type::Num], Type::pool(t())),
    )
}

/// `explode`/`e`/`r`: `Die[Num] -> Num -> Die[Num]`.
fn die_num_scheme() -> Scheme {
    Scheme::mono(Type::arrows(vec![dnum(), Type::Num], dnum()))
}

/// `num`/`round`/`floor`/`ceil`: `Dec -> Num`.
fn dec_to_num_scheme() -> Scheme {
    Scheme::mono(Type::arrow(Type::Dec, Type::Num))
}

fn minmax_schemes() -> Vec<Scheme> {
    vec![
        Scheme::mono(Type::arrows(vec![Type::Num, Type::Num], Type::Num)),
        Scheme::mono(Type::arrows(vec![dnum(), dnum()], dnum())),
        Scheme::mono(Type::arrows(vec![dnum(), Type::Num], dnum())),
        Scheme::mono(Type::arrows(vec![Type::Num, dnum()], dnum())),
    ]
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

/// Run a saturated builtin. `args.len()` equals the row's arity.
/// `dm_literal` is true only for a DIRECT `dm` call whose argument was
/// syntactically a dict literal.
pub fn dispatch(
    interp: &mut Interp<'_>,
    builtin: Builtin,
    args: Vec<Value>,
    dm_literal: bool,
    span: Option<Span>,
) -> Result<Value, EvalError> {
    let call = Call {
        builtin,
        dm_literal,
        span,
    };
    (builtin.def().run)(interp, args, call)
}

// -- implementations --------------------------------------------------------

fn keep(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let n = as_num(&args[1], "the keep count")?;
    let pool = as_pool(args.swap_remove(0), "kh/kl's first argument")?;
    apply_keep(call.builtin.name(), pool, &n, call.span)
}

fn sum(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let pool = as_pool(args.swap_remove(0), "sum's argument")?;
    Ok(sum_pool(pool))
}

fn pool(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let span = call.span;
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

fn dl(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let faces = as_list(args.swap_remove(0), "dl's argument")?;
    if faces.is_empty() {
        return Err(EvalError::eval("dl needs at least one face", call.span));
    }
    require_function_free(&faces, "dl", call.span)?;
    // Duplicate faces are legal; order = list order.
    Ok(Value::Die(DieTree::Dl { faces }))
}

fn dm(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let span = call.span;
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
    if !call.dm_literal {
        // Face SORT order fallback via the total structural order.
        faces.sort_by(|a, b| total_cmp(&a.0, &b.0));
    }
    Ok(Value::Die(DieTree::Dm { faces }))
}

fn evaluate(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let func = args.pop().expect("arity 3");
    let init = args.pop().expect("arity 3");
    let pool = as_pool(args.pop().expect("arity 3"), "evaluate's first argument")?;
    if !matches!(func, Value::Closure(_) | Value::Builtin(_)) {
        return Err(internal("evaluate's transition must be a function"));
    }
    // Symbolic until needed — the DP runs through dist_seam::dist_of_with when a
    // distribution is demanded.
    Ok(Value::Die(DieTree::Evaluate {
        pool,
        init: Box::new(init),
        func: Box::new(func),
    }))
}

fn label(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let word = as_atom(&args[1], "label's second argument")?;
    let die = as_die(args.swap_remove(0), "label's first argument")?;
    Ok(Value::Die(DieTree::Label {
        word,
        inner: Box::new(die),
    }))
}

fn explode(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let span = call.span;
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

fn reroll(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let faces = as_list(args.swap_remove(1), "reroll's second argument")?;
    require_function_free(&faces, "reroll", call.span)?;
    let die = as_die(args.swap_remove(0), "reroll's first argument")?;
    Ok(Value::Die(DieTree::Reroll {
        inner: Box::new(die),
        faces,
    }))
}

fn reroll_face(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let face = as_num(&args[1], "r's face")?;
    let die = as_die(args.swap_remove(0), "r's first argument")?;
    Ok(Value::Die(DieTree::RerollFace {
        inner: Box::new(die),
        face,
    }))
}

fn successes(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let target = as_num(&args[1], "the successes target")?;
    let pool = as_pool(args.swap_remove(0), "successes' first argument")?;
    Ok(Value::Die(DieTree::Successes { pool, target }))
}

// -- the list toolkit. Die values are symbolic trees that re-sample per
// occurrence, so `repeat(d20, 3)` is three INDEPENDENT dice by the same rule
// that makes `let x = d20; [x, x, x]` three. The closure-taking entries
// re-enter the interpreter through `apply` (ordinary calls — fuel-metered,
// and effects behave exactly as in any user function, unlike `evaluate`'s
// DP-guarded closures).

fn repeat(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let span = call.span;
    let n = as_num(&args[1], "the repeat count")?;
    if n.sign() == num_bigint::Sign::Minus {
        return Err(EvalError::eval("repeat count can't be negative", span));
    }
    let count = num_to_u64(&n, "repeat count", span)?;
    Fuel::check_list_len(count, span)?;
    let item = args.swap_remove(0);
    Ok(Value::List(vec![item; count as usize]))
}

fn concat(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let b = as_list(args.swap_remove(1), "concat's second argument")?;
    let mut a = as_list(args.swap_remove(0), "concat's first argument")?;
    a.extend(b);
    Ok(Value::List(a))
}

fn map(interp: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let f = args.swap_remove(1);
    let items = as_list(args.swap_remove(0), "map's first argument")?;
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        out.push(interp.apply(f.clone(), vec![item], false, call.span)?);
    }
    Ok(Value::List(out))
}

fn filter(interp: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let pred = args.swap_remove(1);
    let items = as_list(args.swap_remove(0), "filter's first argument")?;
    let mut out = Vec::new();
    for item in items {
        match interp.apply(pred.clone(), vec![item.clone()], false, call.span)? {
            Value::Atom(a) if a == "true" => out.push(item),
            Value::Atom(a) if a == "false" => {}
            _ => return Err(internal("filter's predicate must return a Bool")),
        }
    }
    Ok(Value::List(out))
}

fn fold(interp: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let f = args.swap_remove(2);
    let init = args.swap_remove(1);
    let items = as_list(args.swap_remove(0), "fold's first argument")?;
    let mut acc = init;
    for item in items {
        acc = interp.apply(f.clone(), vec![acc, item], false, call.span)?;
    }
    Ok(acc)
}

fn reduce(interp: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    // fold seeded by the first element — the homogeneous cousin
    // (`reduce([d20, d20], |x, y| x + y)` needs no dl([0]) zero-die).
    let f = args.swap_remove(1);
    let items = as_list(args.swap_remove(0), "reduce's first argument")?;
    let mut iter = items.into_iter();
    let Some(mut acc) = iter.next() else {
        return Err(EvalError::eval(
            "reduce needs at least one element",
            call.span,
        ));
    };
    for item in iter {
        acc = interp.apply(f.clone(), vec![acc, item], false, call.span)?;
    }
    Ok(acc)
}

fn len(_: &mut Interp<'_>, mut args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let items = as_list(args.swap_remove(0), "len's argument")?;
    Ok(Value::Num(BigInt::from(items.len())))
}

fn min_max(_: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let is_min = call.builtin == Builtin::Min;
    let b = args.pop().expect("arity 2");
    let a = args.pop().expect("arity 2");
    match (&a, &b) {
        (Value::Num(x), Value::Num(y)) => Ok(Value::Num(if is_min {
            x.min(y).clone()
        } else {
            x.max(y).clone()
        })),
        _ if matches!(a, Value::Die(_)) || matches!(b, Value::Die(_)) => {
            Ok(Value::Die(DieTree::MinMax {
                op: if is_min { MinMaxOp::Min } else { MinMaxOp::Max },
                lhs: operand(a),
                rhs: operand(b),
            }))
        }
        _ => Err(internal("min/max take Num or Die[Num] arguments")),
    }
}

fn dec(_: &mut Interp<'_>, args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let n = as_num(&args[0], "dec's argument")?;
    let scaled = n * DEC_SCALE;
    Ok(Value::Dec(dec_check_big(&scaled, call.span)?))
}

fn float(_: &mut Interp<'_>, args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    match &args[0] {
        // BigInt → f64 through the string parser (correctly rounded; no
        // num-traits dependency).
        Value::Num(n) => Ok(Value::Float(
            n.to_string().parse().expect("digits parse as f64"),
        )),
        Value::Dec(d) => Ok(Value::Float(*d as f64 / DEC_SCALE as f64)),
        _ => Err(internal("float's argument must be Num or Dec")),
    }
}

fn num(_: &mut Interp<'_>, args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    // Truncates toward zero (i128 division semantics; documented).
    let d = as_dec(&args[0], "num's argument")?;
    Ok(Value::Num(BigInt::from(d / DEC_SCALE)))
}

fn round(_: &mut Interp<'_>, args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
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

fn floor(_: &mut Interp<'_>, args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let d = as_dec(&args[0], "floor's argument")?;
    let q = if d >= 0 {
        d / DEC_SCALE
    } else {
        (d - (DEC_SCALE - 1)) / DEC_SCALE
    };
    Ok(Value::Num(BigInt::from(q)))
}

fn ceil(_: &mut Interp<'_>, args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    let d = as_dec(&args[0], "ceil's argument")?;
    let q = if d >= 0 {
        (d + (DEC_SCALE - 1)) / DEC_SCALE
    } else {
        d / DEC_SCALE
    };
    Ok(Value::Num(BigInt::from(q)))
}

fn abs(_: &mut Interp<'_>, args: Vec<Value>, _: Call) -> Result<Value, EvalError> {
    match &args[0] {
        Value::Num(n) => Ok(Value::Num(n.magnitude().clone().into())),
        Value::Dec(d) => Ok(Value::Dec(d.abs())),
        _ => Err(internal("abs's argument must be Num or Dec")),
    }
}

fn roll(interp: &mut Interp<'_>, args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    // First-class unary form; the direct variadic form is handled in the
    // interpreter's Call evaluation.
    interp.effect_guard(call.span)?;
    append_display(&mut interp.cmd, &args[0]);
    Ok(Value::Unit)
}

fn plot(interp: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    interp.effect_guard(call.span)?;
    let die = as_die(args.swap_remove(0), "plot's argument")?;
    interp.cmd.plots.push(die);
    Ok(Value::Unit)
}

fn save(interp: &mut Interp<'_>, mut args: Vec<Value>, call: Call) -> Result<Value, EvalError> {
    let span = call.span;
    interp.effect_guard(span)?;
    let value = args.pop().expect("arity 2");
    let name_atom = as_atom(&args[0], "save's first argument")?;
    // The atom must match the IDENT regex `[a-z][a-zA-Z0-9_]*`. Atom
    // charset is `[a-z][a-z0-9-]*`, so in practice this rejects kebab names —
    // but check the full regex defensively.
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

// -- the generated reference ------------------------------------------------

/// `gen/weal_builtins.json`: the registry as data for the TS side (the bot's
/// save guard asks it whether a name is a builtin's).
pub fn reference_json() -> String {
    let rows: Vec<serde_json::Value> = BUILTINS
        .iter()
        .map(|d| {
            serde_json::json!({
                "name": d.name,
                "arity": d.arity,
                "signatures": d.signatures(),
                "doc": d.doc,
            })
        })
        .collect();
    let mut out = serde_json::to_string_pretty(&rows).expect("plain JSON values serialize");
    out.push('\n');
    out
}

/// The player guide's built-in list (markdown), between the markers in
/// `apps/weal/bot/README.md`.
pub fn reference_markdown() -> String {
    let mut out = String::new();
    for d in BUILTINS {
        let sigs: Vec<String> = d.signatures().iter().map(|s| format!("`{s}`")).collect();
        out.push_str(&format!(
            "- `{}` : {} — {}\n",
            d.name,
            sigs.join(" or "),
            d.doc
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arrow_arity(ty: &Type) -> usize {
        match ty {
            Type::Arrow(_, cod) => 1 + arrow_arity(cod),
            _ => 0,
        }
    }

    /// Each row is coherent: it sits at its discriminant, its name is
    /// unique, and its curried arity is its schemes' arrow depth (every
    /// overload agrees; `roll` is unary first-class).
    #[test]
    fn rows_are_coherent() {
        for (i, d) in BUILTINS.iter().enumerate() {
            assert_eq!(d.builtin as usize, i, "`{}` is out of order", d.name);
            assert_eq!(Builtin::from_name(d.name), Some(d.builtin));
            let arities: Vec<usize> = match d.prelude_entry() {
                PreludeEntry::One(s) => vec![arrow_arity(&s.ty)],
                PreludeEntry::Overloaded(v) => v.iter().map(|s| arrow_arity(&s.ty)).collect(),
                PreludeEntry::RollVariadic => vec![arrow_arity(&d.primary_scheme().ty)],
            };
            assert!(
                arities.iter().all(|a| *a == d.arity),
                "arity drift for `{}`: row says {}, schemes say {arities:?}",
                d.name,
                d.arity
            );
        }
    }

    #[test]
    fn name_lookups() {
        assert_eq!(Builtin::from_name("kh"), Some(Builtin::Kh));
        assert_eq!(Builtin::from_name("nope"), None);
        assert_eq!(Builtin::Evaluate.def().arity, 3);
        assert_eq!(Builtin::E.def().suffix_as, Some(Builtin::Explode));
    }

    #[test]
    fn signatures_name_their_type_variables() {
        assert_eq!(
            Builtin::Kh.def().signatures(),
            ["Pool[a] -> Num -> Pool[a]"]
        );
        assert_eq!(
            Builtin::Map.def().signatures(),
            ["List[a] -> (a -> b) -> List[b]"]
        );
        assert_eq!(Builtin::Float.def().signatures().len(), 2);
        for d in BUILTINS {
            for s in d.signatures() {
                assert!(
                    !s.contains("t0") && !s.contains("t1") && !s.contains("t2"),
                    "{s}"
                );
            }
        }
    }

    const REFERENCE_JSON: &str = "../../ts/weal-engine/gen/weal_builtins.json";
    const PLAYER_GUIDE: &str = "../../../apps/weal/bot/README.md";
    const GUIDE_START: &str = "<!-- weal-builtins:start (generated from libs/rust/weal-engine/src/prelude.rs; `just weal-engine-build`) -->\n";
    const GUIDE_END: &str = "<!-- weal-builtins:end -->";

    /// Fails when `gen/weal_builtins.json` or the player guide's built-in
    /// list lags the registry. `just weal-engine-build` runs it with
    /// `WEAL_WRITE_TS_BINDINGS=1`, which rewrites both instead.
    #[test]
    fn builtin_reference_is_current() {
        let json = reference_json();
        let guide = std::fs::read_to_string(PLAYER_GUIDE).expect("read the player guide");
        let start = guide
            .find(GUIDE_START)
            .expect("the guide has the start marker")
            + GUIDE_START.len();
        let end = guide[start..]
            .find(GUIDE_END)
            .expect("the guide has the end marker")
            + start;
        let want_guide = format!(
            "{}{}{}",
            &guide[..start],
            reference_markdown(),
            &guide[end..]
        );
        if std::env::var_os("WEAL_WRITE_TS_BINDINGS").is_some() {
            std::fs::write(REFERENCE_JSON, &json).expect("write gen/weal_builtins.json");
            std::fs::write(PLAYER_GUIDE, &want_guide).expect("write the player guide");
            return;
        }
        let have = std::fs::read_to_string(REFERENCE_JSON).unwrap_or_default();
        assert!(
            have == json,
            "libs/ts/weal-engine/gen/weal_builtins.json is stale: run `just weal-engine-build`"
        );
        assert!(
            guide == want_guide,
            "the built-in list in apps/weal/bot/README.md is stale: run `just weal-engine-build`"
        );
    }
}
