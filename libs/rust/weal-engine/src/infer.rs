//! The S2 checker + elaborator: rank-1 HM with let-generalization plus the
//! pinned D32-3 extensions (singleton-atom unions with per-position variance,
//! match-driven param inference, exhaustiveness/redundancy, monomorphic
//! recursion, lifted die comparisons, deferred equatable constraints), the
//! D32-4 sum coercion, and D32-5 die-suffix resolution.
//!
//! # The S3 input contract — [`CoreExpr`]
//!
//! `check(&Expr, &SpanTree, extra_env)` elaborates the S1 AST into a
//! [`CoreExpr`], which is what the S3 interpreter consumes:
//!
//! - **No [`crate::ast::DieSuffix`] remains.** `CoreExpr::Die` is a bare
//!   `(count, sides)` literal: `count: None` = a single die (`Die[Num]`),
//!   `count: Some(n)` = an OPEN `Pool[Num]` of n dice (D32-5). Every die
//!   suffix has been elaborated into explicit calls: die-shape suffixes wrap
//!   the underlying die (`4d6e2` → `pool(4, explode(d6, 2))`), pool-shape
//!   suffixes wrap the pool (`4d6e2kh3` → `kh(pool(4, explode(d6, 2)), 3)`).
//!   The suffix alias `e` is canonicalized to `explode`; `r` is its own
//!   prelude function. A pool-shape suffix on a count-less die wraps it as a
//!   1-die pool (`d6kh3` → `kh(pool(1, d6), 3)`).
//! - **Checker-inserted prelude references use [`CoreExpr::Prelude`]**, which
//!   is immune to user shadowing (`let sum = 5; 2d6kh1 + sum` still sums the
//!   pool). User-written identifiers stay [`CoreExpr::Ident`] and resolve
//!   through the runtime environment (which includes the prelude).
//! - **Explicit `sum` calls** (D32-4): wherever a `Pool[Num]` met a position
//!   demanding a die/number-ish type (arithmetic/comparison operands, unary
//!   negation, a `Die[_]`-demanding call argument, a `[label]`, min/max/roll
//!   arguments, and the TOP-LEVEL result), the elaborated tree carries
//!   `Prelude("sum")` applied to the pool. A `Pool[T ≠ Num]` in such a
//!   position is the pinned targeted error.
//! - **dm literal face order** (D32-4): `CoreExpr::Call.dm_literal_order` is
//!   `true` exactly when the call is to the (unshadowed) prelude `dm` AND its
//!   first argument is syntactically a dict literal — the interpreter then
//!   takes face order from that literal's entry order (which `CoreExpr::Dict`
//!   preserves). It is `false` for every other call, including `dm` applied
//!   to a non-literal dict value (face sort order fallback).
//! - Type annotations are dropped (already checked); patterns and match arms
//!   are carried over verbatim from the AST.
//!
//! # Spans
//!
//! The AST is span-free (S1 round-trip Eq), so the checker threads the
//! parallel [`SpanTree`] produced by `lower_root_spanned` and every
//! [`TypeError`] carries a byte-accurate span into the original source
//! (D32-11).
//!
//! # Documented decisions within the pinned envelope
//!
//! - Arithmetic/comparison on two UNRESOLVED type variables defaults both to
//!   `Num` (no type classes; annotate or seed a literal for Dec/Float).
//! - Die-shape and pool-shape suffixes commute in the engine's pool
//!   representation `(count, die, keep-tuple)`, so a die-shape suffix
//!   appearing AFTER a pool-shape one still maps the underlying die
//!   (`4d6kh3e2` ≡ `4d6e2kh3`).
//! - Suffix names resolve against prelude + `extra_env` (saves) ONLY — local
//!   `let`-bindings are not suffix-eligible.
//! - Overloaded builtins (`min`/`max`/`float`/`abs`) resolve overloads only
//!   when called DIRECTLY with their full argument count; used first-class
//!   (or partially applied) they take their primary signature (`Num`-based).
//!   `roll` used first-class is `T -> Unit` (function-free `T`).
//! - `min`/`max` are `Num`/`Die[Num]` only (D32-19) — no Dec/Float overloads.
//! - A `LetFn` return annotation is a CHECK on the inferred type, not a
//!   widening.

use crate::ast::{BinOp, CmpOp, Expr, MatchPat, Pattern};
use crate::lower::{Span, SpanTree};
use crate::types::{ArithConstraint, EquatableConstraint, EquatableSite, Scheme, Type};
use std::collections::{BTreeSet, HashMap};

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/// A type error with a byte span into the original source (D32-11).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeError {
    pub message: String,
    pub span: Span,
}

/// The elaborated expression tree — the S3 interpreter's input. See the
/// module docs for the full contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreExpr {
    Let {
        pattern: Pattern,
        value: Box<CoreExpr>,
        body: Box<CoreExpr>,
    },
    LetFn {
        name: String,
        params: Vec<String>,
        value: Box<CoreExpr>,
        body: Box<CoreExpr>,
    },
    Match {
        scrutinee: Box<CoreExpr>,
        arms: Vec<(MatchPat, CoreExpr)>,
    },
    Lambda {
        params: Vec<String>,
        body: Box<CoreExpr>,
    },
    /// Binary comparison (chains were rejected at type stage).
    Cmp {
        op: CmpOp,
        lhs: Box<CoreExpr>,
        rhs: Box<CoreExpr>,
    },
    Binary {
        op: BinOp,
        lhs: Box<CoreExpr>,
        rhs: Box<CoreExpr>,
    },
    Neg(Box<CoreExpr>),
    Call {
        callee: Box<CoreExpr>,
        args: Vec<CoreExpr>,
        /// D32-4 dm face-order metadata — see the module docs.
        dm_literal_order: bool,
    },
    Label {
        expr: Box<CoreExpr>,
        word: String,
    },
    /// A bare die literal. `count: Some(n)` = an open `Pool[Num]` of n dice;
    /// `count: None` = a single `Die[Num]`. Digits stay strings (arbitrary
    /// precision is S3's business).
    Die {
        count: Option<String>,
        sides: String,
    },
    Num(String),
    Dec(String),
    Float(String),
    Str(String),
    Atom(String),
    Unit,
    /// A user-written identifier (resolved through the runtime env).
    Ident(String),
    /// A checker-inserted prelude reference — immune to user shadowing.
    Prelude(&'static str),
    List(Vec<CoreExpr>),
    /// Dict literal entries in SOURCE order (feeds dm face order).
    Dict(Vec<(CoreExpr, CoreExpr)>),
    Tuple(Vec<CoreExpr>),
}

/// How a prelude name types (D32-19).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreludeEntry {
    /// One scheme.
    One(Scheme),
    /// A closed overload set, primary first (checker-special-cased on direct
    /// full-arity calls; primary used first-class).
    Overloaded(Vec<Scheme>),
    /// `roll`: 1+ arguments of function-free types, `Unit` result
    /// (checker-special-cased; first-class form is `T -> Unit`).
    RollVariadic,
}

/// The D32-19 prelude type signatures.
pub fn prelude_types() -> Vec<(&'static str, PreludeEntry)> {
    let t = || Type::Var(0);
    let s = || Type::Var(1);
    let poolshape = |ret: Type| Type::arrows(vec![Type::pool(t()), Type::Num], ret);
    let one = PreludeEntry::One;
    let dnum = Type::die(Type::Num);
    let minmax = || {
        PreludeEntry::Overloaded(vec![
            Scheme::mono(Type::arrows(vec![Type::Num, Type::Num], Type::Num)),
            Scheme::mono(Type::arrows(
                vec![Type::die(Type::Num), Type::die(Type::Num)],
                Type::die(Type::Num),
            )),
            Scheme::mono(Type::arrows(
                vec![Type::die(Type::Num), Type::Num],
                Type::die(Type::Num),
            )),
            Scheme::mono(Type::arrows(
                vec![Type::Num, Type::die(Type::Num)],
                Type::die(Type::Num),
            )),
        ])
    };
    vec![
        ("kh", one(Scheme::poly(vec![0], poolshape(Type::pool(t()))))),
        ("kl", one(Scheme::poly(vec![0], poolshape(Type::pool(t()))))),
        (
            "sum",
            one(Scheme::mono(Type::arrow(
                Type::pool(Type::Num),
                dnum.clone(),
            ))),
        ),
        (
            "pool",
            one(Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::Num, Type::die(t())], Type::pool(t())),
            )),
        ),
        (
            "dl",
            one(Scheme::poly(
                vec![0],
                Type::arrow(Type::list(t()), Type::die(t())),
            )),
        ),
        (
            "dm",
            one(Scheme {
                vars: vec![0],
                constraints: vec![EquatableConstraint {
                    ty: t(),
                    site: EquatableSite::DictKey,
                }],
                arith: Vec::new(),
                ty: Type::arrow(Type::dict(t(), Type::Num), Type::die(t())),
            }),
        ),
        (
            "evaluate",
            one(Scheme {
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
        ),
        (
            "label",
            one(Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::die(t()), Type::Atom], Type::die(t())),
            )),
        ),
        (
            "explode",
            one(Scheme::mono(Type::arrows(
                vec![dnum.clone(), Type::Num],
                dnum.clone(),
            ))),
        ),
        (
            "e",
            one(Scheme::mono(Type::arrows(
                vec![dnum.clone(), Type::Num],
                dnum.clone(),
            ))),
        ),
        (
            "reroll",
            one(Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::die(t()), Type::list(t())], Type::die(t())),
            )),
        ),
        (
            "r",
            one(Scheme::mono(Type::arrows(
                vec![dnum.clone(), Type::Num],
                dnum.clone(),
            ))),
        ),
        (
            "successes",
            one(Scheme::mono(Type::arrows(
                vec![Type::pool(Type::Num), Type::Num],
                dnum.clone(),
            ))),
        ),
        // -- the list toolkit (2026-08-10 amendment: repeat/concat/map/filter/fold).
        // Data-first argument order throughout, mirroring `evaluate(pool, init, fn)`.
        (
            "repeat",
            one(Scheme::poly(
                vec![0],
                Type::arrows(vec![t(), Type::Num], Type::list(t())),
            )),
        ),
        (
            "concat",
            one(Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::list(t()), Type::list(t())], Type::list(t())),
            )),
        ),
        (
            "map",
            one(Scheme::poly(
                vec![0, 1],
                Type::arrows(
                    vec![Type::list(t()), Type::arrow(t(), s())],
                    Type::list(s()),
                ),
            )),
        ),
        (
            "filter",
            one(Scheme::poly(
                vec![0],
                Type::arrows(
                    vec![Type::list(t()), Type::arrow(t(), Type::bool())],
                    Type::list(t()),
                ),
            )),
        ),
        (
            "fold",
            one(Scheme::poly(
                vec![0, 1],
                Type::arrows(
                    vec![Type::list(t()), s(), Type::arrows(vec![s(), t()], s())],
                    s(),
                ),
            )),
        ),
        (
            "reduce",
            one(Scheme::poly(
                vec![0],
                Type::arrows(
                    vec![Type::list(t()), Type::arrows(vec![t(), t()], t())],
                    t(),
                ),
            )),
        ),
        (
            "len",
            one(Scheme::poly(
                vec![0],
                Type::arrow(Type::list(t()), Type::Num),
            )),
        ),
        ("min", minmax()),
        ("max", minmax()),
        ("dec", one(Scheme::mono(Type::arrow(Type::Num, Type::Dec)))),
        (
            "float",
            PreludeEntry::Overloaded(vec![
                Scheme::mono(Type::arrow(Type::Num, Type::Float)),
                Scheme::mono(Type::arrow(Type::Dec, Type::Float)),
            ]),
        ),
        ("num", one(Scheme::mono(Type::arrow(Type::Dec, Type::Num)))),
        (
            "round",
            one(Scheme::mono(Type::arrow(Type::Dec, Type::Num))),
        ),
        (
            "floor",
            one(Scheme::mono(Type::arrow(Type::Dec, Type::Num))),
        ),
        ("ceil", one(Scheme::mono(Type::arrow(Type::Dec, Type::Num)))),
        (
            "abs",
            PreludeEntry::Overloaded(vec![
                Scheme::mono(Type::arrow(Type::Num, Type::Num)),
                Scheme::mono(Type::arrow(Type::Dec, Type::Dec)),
            ]),
        ),
        ("roll", PreludeEntry::RollVariadic),
        (
            "plot",
            one(Scheme::poly(
                vec![0],
                Type::arrow(Type::die(t()), Type::Unit),
            )),
        ),
        (
            "save",
            one(Scheme::poly(
                vec![0],
                Type::arrows(vec![Type::Atom, t()], Type::Unit),
            )),
        ),
    ]
}

/// Check + elaborate. `extra_env` = the saves' type schemes (name → scheme);
/// they shadow prelude names and are suffix-eligible (D32-5).
pub fn check(
    expr: &Expr,
    spans: &SpanTree,
    extra_env: &[(String, Scheme)],
) -> Result<(CoreExpr, Type), TypeError> {
    let mut env = Env::base(extra_env);
    let mut ck = Checker::default();
    let (core, ty) = ck.infer(expr, spans, &mut env)?;
    // D32-7: a bare top-level Pool[Num] display auto-sums via the D32-4
    // coercion; a top-level Pool[T ≠ Num] is the targeted error.
    let (core, ty) = ck.sum_if_pool(core, ty, spans.span)?;
    ck.solve_arith()?;
    ck.check_deferred()?;
    Ok((core, ck.zonk(&ty)))
}

/// Parse + lower + check in one step (test/tooling convenience).
pub fn check_source(
    src: &str,
    extra_env: &[(String, Scheme)],
) -> Result<(CoreExpr, Type), TypeError> {
    let parsed = crate::parser::parse(src);
    if let Some(e) = parsed.errors.first() {
        return Err(TypeError {
            message: format!("parse error: {}", e.message),
            span: e.span,
        });
    }
    let (expr, spans) =
        crate::lower::lower_root_spanned(&parsed.syntax()).map_err(|e| TypeError {
            message: e.message,
            span: (0, src.len()),
        })?;
    check(&expr, &spans, extra_env)
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Origin {
    Prelude,
    Extra,
    Local,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpecialBuiltin {
    Min,
    Max,
    FloatCast,
    Abs,
    Roll,
}

#[derive(Debug, Clone)]
enum Binding {
    Mono(Type),
    Poly(Scheme),
    Special(SpecialBuiltin),
}

struct Env {
    entries: Vec<(String, Binding, Origin)>,
}

impl Env {
    fn base(extra: &[(String, Scheme)]) -> Env {
        let mut entries = Vec::new();
        for (name, entry) in prelude_types() {
            let binding = match entry {
                PreludeEntry::One(s) => Binding::Poly(s),
                PreludeEntry::Overloaded(_) | PreludeEntry::RollVariadic => {
                    Binding::Special(match name {
                        "min" => SpecialBuiltin::Min,
                        "max" => SpecialBuiltin::Max,
                        "float" => SpecialBuiltin::FloatCast,
                        "abs" => SpecialBuiltin::Abs,
                        "roll" => SpecialBuiltin::Roll,
                        other => unreachable!("unmapped special builtin {other}"),
                    })
                }
            };
            entries.push((name.to_owned(), binding, Origin::Prelude));
        }
        for (name, scheme) in extra {
            entries.push((name.clone(), Binding::Poly(scheme.clone()), Origin::Extra));
        }
        Env { entries }
    }

    fn lookup(&self, name: &str) -> Option<(Binding, Origin)> {
        self.entries
            .iter()
            .rev()
            .find(|(n, _, _)| n == name)
            .map(|(_, b, o)| (b.clone(), *o))
    }

    /// Suffix resolution sees prelude + saves only (module docs).
    fn lookup_nonlocal(&self, name: &str) -> Option<(Binding, Origin)> {
        self.entries
            .iter()
            .rev()
            .filter(|(_, _, o)| *o != Origin::Local)
            .find(|(n, _, _)| n == name)
            .map(|(_, b, o)| (b.clone(), *o))
    }

    fn push(&mut self, name: String, binding: Binding) {
        self.entries.push((name, binding, Origin::Local));
    }

    fn mark(&self) -> usize {
        self.entries.len()
    }

    fn truncate(&mut self, mark: usize) {
        self.entries.truncate(mark);
    }
}

fn prelude_static_name(name: &str) -> Option<&'static str> {
    prelude_types()
        .into_iter()
        .map(|(n, _)| n)
        .find(|n| *n == name)
}

fn primary_scheme(sb: SpecialBuiltin) -> Scheme {
    match sb {
        SpecialBuiltin::Min | SpecialBuiltin::Max => {
            Scheme::mono(Type::arrows(vec![Type::Num, Type::Num], Type::Num))
        }
        SpecialBuiltin::FloatCast => Scheme::mono(Type::arrow(Type::Num, Type::Float)),
        SpecialBuiltin::Abs => Scheme::mono(Type::arrow(Type::Num, Type::Num)),
        SpecialBuiltin::Roll => Scheme {
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

fn special_schemes(sb: SpecialBuiltin) -> Vec<Scheme> {
    match sb {
        SpecialBuiltin::Min | SpecialBuiltin::Max => match prelude_types()
            .into_iter()
            .find(|(n, _)| *n == "min")
            .map(|(_, e)| e)
        {
            Some(PreludeEntry::Overloaded(v)) => v,
            _ => vec![primary_scheme(sb)],
        },
        SpecialBuiltin::FloatCast | SpecialBuiltin::Abs | SpecialBuiltin::Roll => {
            vec![primary_scheme(sb)]
        }
    }
}

// ---------------------------------------------------------------------------
// Checker core
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Deferred {
    ty: Type,
    span: Span,
    site: EquatableSite,
}

/// A pending die-lifting arithmetic decision (the 2026-08-10 D32-4
/// amendment): created whenever an operand's shape is still a Var (so
/// `Num` vs `Die[Num]` is undecidable at the operator), solved in
/// [`Checker::solve_arith`] after inference — by which point outer
/// context (a call site, a list element join) has usually resolved it.
/// Still-unresolved operands take the documented `Num` default.
#[derive(Debug, Clone)]
struct ArithPending {
    l: Type,
    /// `None` = unary negation (shape-preserving: Dec/Float legal).
    r: Option<Type>,
    ret: Type,
    lspan: Span,
    rspan: Span,
    span: Span,
}

#[derive(Default)]
struct Checker {
    subst: HashMap<u32, Type>,
    next_var: u32,
    deferred: Vec<Deferred>,
    arith: Vec<ArithPending>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JoinMode {
    /// Covariant merge — union of atom sets.
    Join,
    /// Contravariant merge (function domains) — intersection of atom sets;
    /// empty = type error (never widen a param).
    Meet,
}

impl JoinMode {
    fn flip(self) -> JoinMode {
        match self {
            JoinMode::Join => JoinMode::Meet,
            JoinMode::Meet => JoinMode::Join,
        }
    }
}

fn is_numeric_scalar(t: &Type) -> bool {
    matches!(t, Type::Num | Type::Dec | Type::Float)
}

fn mixing_hint(a: &Type, b: &Type) -> &'static str {
    if is_numeric_scalar(a) && is_numeric_scalar(b) && a != b {
        " (no implicit numeric mixing — convert with dec()/float()/num())"
    } else {
        ""
    }
}

impl Checker {
    fn fresh(&mut self) -> Type {
        // Prelude schemes use small fixed var ids; start user vars high
        // enough that they can never collide in free-var bookkeeping.
        if self.next_var < 16 {
            self.next_var = 16;
        }
        let v = self.next_var;
        self.next_var += 1;
        Type::Var(v)
    }

    /// Shallow-resolve: follow the substitution at the root only.
    fn resolve(&self, t: &Type) -> Type {
        let mut t = t.clone();
        while let Type::Var(v) = t {
            match self.subst.get(&v) {
                Some(u) => t = u.clone(),
                None => return Type::Var(v),
            }
        }
        t
    }

    /// Deep-resolve.
    fn zonk(&self, t: &Type) -> Type {
        match self.resolve(t) {
            Type::Tuple(ts) => Type::Tuple(ts.iter().map(|t| self.zonk(t)).collect()),
            Type::List(t) => Type::list(self.zonk(&t)),
            Type::Die(t) => Type::die(self.zonk(&t)),
            Type::Pool(t) => Type::pool(self.zonk(&t)),
            Type::Dict(k, v) => Type::dict(self.zonk(&k), self.zonk(&v)),
            Type::Arrow(d, c) => Type::arrow(self.zonk(&d), self.zonk(&c)),
            other => other,
        }
    }

    fn bind(&mut self, v: u32, t: &Type, span: Span) -> Result<(), TypeError> {
        let zt = self.zonk(t);
        if zt == Type::Var(v) {
            return Ok(());
        }
        let mut fv = Vec::new();
        zt.free_vars(&mut fv);
        if fv.contains(&v) {
            return Err(TypeError {
                message: format!("cannot construct the infinite type t{v} = {zt}"),
                span,
            });
        }
        self.subst.insert(v, zt);
        Ok(())
    }

    fn instantiate(&mut self, s: &Scheme, span: Span) -> Type {
        let map: HashMap<u32, Type> = s.vars.iter().map(|v| (*v, self.fresh())).collect();
        for c in &s.constraints {
            self.deferred.push(Deferred {
                ty: apply_map(&c.ty, &map),
                span,
                site: c.site,
            });
        }
        for a in &s.arith {
            self.arith.push(ArithPending {
                l: apply_map(&a.l, &map),
                r: a.r.as_ref().map(|r| apply_map(r, &map)),
                ret: apply_map(&a.ret, &map),
                lspan: span,
                rspan: span,
                span,
            });
        }
        apply_map(&s.ty, &map)
    }

    fn generalize(&mut self, env: &Env, ty: &Type) -> Scheme {
        let zty = self.zonk(ty);
        let mut tvars = Vec::new();
        zty.free_vars(&mut tvars);
        if tvars.is_empty() {
            return Scheme::mono(zty);
        }
        let mut evars = Vec::new();
        for (_, binding, _) in &env.entries {
            match binding {
                Binding::Mono(t) => self.zonk(t).free_vars(&mut evars),
                Binding::Poly(s) => {
                    let mut f = Vec::new();
                    self.zonk(&s.ty).free_vars(&mut f);
                    evars.extend(f.into_iter().filter(|v| !s.vars.contains(v)));
                }
                Binding::Special(_) => {}
            }
        }
        let qvars: Vec<u32> = tvars.into_iter().filter(|v| !evars.contains(v)).collect();
        if qvars.is_empty() {
            return Scheme::mono(zty);
        }
        // Migrate deferred constraints that mention quantified vars into the
        // scheme so every instantiation re-checks them (generic wrappers
        // around evaluate — D32-3).
        let mut kept = Vec::new();
        let mut moved = Vec::new();
        for d in std::mem::take(&mut self.deferred) {
            let zc = self.zonk(&d.ty);
            let mut f = Vec::new();
            zc.free_vars(&mut f);
            if f.iter().any(|v| qvars.contains(v)) {
                moved.push(EquatableConstraint {
                    ty: zc,
                    site: d.site,
                });
            } else {
                kept.push(Deferred { ty: zc, ..d });
            }
        }
        self.deferred = kept;
        // Same migration for pending arith constraints — this is what makes a
        // let-bound `|x| x + 1` lift independently per call site instead of
        // pinning at its first use.
        let mut arith_kept = Vec::new();
        let mut arith_moved = Vec::new();
        for a in std::mem::take(&mut self.arith) {
            let zl = self.zonk(&a.l);
            let zr = a.r.as_ref().map(|r| self.zonk(r));
            let zret = self.zonk(&a.ret);
            let mut f = Vec::new();
            zl.free_vars(&mut f);
            if let Some(r) = &zr {
                r.free_vars(&mut f);
            }
            zret.free_vars(&mut f);
            if f.iter().any(|v| qvars.contains(v)) {
                arith_moved.push(ArithConstraint {
                    l: zl,
                    r: zr,
                    ret: zret,
                });
            } else {
                arith_kept.push(ArithPending {
                    l: zl,
                    r: zr,
                    ret: zret,
                    ..a
                });
            }
        }
        self.arith = arith_kept;
        Scheme {
            vars: qvars,
            constraints: moved,
            arith: arith_moved,
            ty: zty,
        }
    }

    /// Solve every pending die-lifting arithmetic constraint (run after
    /// inference, before the equatable sweep — solving binds vars those
    /// checks zonk through). FIFO = creation order = inner-expressions
    /// first, which is dependency order for chained arithmetic.
    fn solve_arith(&mut self) -> Result<(), TypeError> {
        for c in std::mem::take(&mut self.arith) {
            match &c.r {
                Some(r) => {
                    let rl = self.resolve(&c.l);
                    let rr = self.resolve(r);
                    if matches!(rl, Type::Die(_)) || matches!(rr, Type::Die(_)) {
                        for (t, s) in [(&rl, c.lspan), (&rr, c.rspan)] {
                            match t {
                                Type::Die(e) => {
                                    self.merge(e, &Type::Num, JoinMode::Join, s)?;
                                }
                                other => self.subsume(other, &Type::Num, s)?,
                            }
                        }
                        self.merge(&c.ret, &Type::die(Type::Num), JoinMode::Join, c.span)?;
                    } else {
                        // No die materialized: the documented Num default.
                        for (t, s) in [(&rl, c.lspan), (&rr, c.rspan)] {
                            self.subsume(t, &Type::Num, s)?;
                        }
                        self.merge(&c.ret, &Type::Num, JoinMode::Join, c.span)?;
                    }
                }
                None => match self.resolve(&c.l) {
                    Type::Die(e) => {
                        self.merge(&e, &Type::Num, JoinMode::Join, c.lspan)?;
                        self.merge(&c.ret, &Type::die(Type::Num), JoinMode::Join, c.span)?;
                    }
                    t @ (Type::Num | Type::Dec | Type::Float) => {
                        self.merge(&c.ret, &t, JoinMode::Join, c.span)?;
                    }
                    Type::Var(v) => {
                        self.bind(v, &Type::Num, c.lspan)?;
                        self.merge(&c.ret, &Type::Num, JoinMode::Join, c.span)?;
                    }
                    other => {
                        return Err(TypeError {
                            message: format!("cannot negate `{}`", self.zonk(&other)),
                            span: c.lspan,
                        });
                    }
                },
            }
        }
        Ok(())
    }

    fn check_deferred(&self) -> Result<(), TypeError> {
        for d in &self.deferred {
            let z = self.zonk(&d.ty);
            if z.contains_arrow() {
                return Err(TypeError {
                    message: format!("{} must be function-free — found `{z}`", d.site.describe()),
                    span: d.span,
                });
            }
        }
        Ok(())
    }

    fn mismatch(&self, a: &Type, b: &Type, span: Span) -> TypeError {
        let (za, zb) = (self.zonk(a), self.zonk(b));
        TypeError {
            message: format!("type mismatch: `{za}` vs `{zb}`{}", mixing_hint(&za, &zb)),
            span,
        }
    }

    fn expected(&self, sup: &Type, sub: &Type, span: Span) -> TypeError {
        let (zsup, zsub) = (self.zonk(sup), self.zonk(sub));
        TypeError {
            message: format!(
                "expected `{zsup}`, found `{zsub}`{}",
                mixing_hint(&zsup, &zsub)
            ),
            span,
        }
    }

    /// Variance-aware merge of two types (D32-3): `Join` in covariant
    /// positions (atom unions take the set UNION), `Meet` in function
    /// domains (set INTERSECTION; empty = error). Returns the merged type.
    fn merge(&mut self, a: &Type, b: &Type, mode: JoinMode, span: Span) -> Result<Type, TypeError> {
        let ra = self.resolve(a);
        let rb = self.resolve(b);
        match (&ra, &rb) {
            (Type::Var(v), _) => {
                self.bind(*v, &rb, span)?;
                Ok(rb)
            }
            (_, Type::Var(v)) => {
                self.bind(*v, &ra, span)?;
                Ok(ra)
            }
            (Type::Unit, Type::Unit)
            | (Type::Num, Type::Num)
            | (Type::Dec, Type::Dec)
            | (Type::Float, Type::Float)
            | (Type::Str, Type::Str)
            | (Type::Atom, Type::Atom) => Ok(ra),
            (Type::Union(s1), Type::Union(s2)) => match mode {
                JoinMode::Join => Ok(Type::Union(s1.union(s2).cloned().collect())),
                JoinMode::Meet => {
                    let inter: BTreeSet<String> = s1.intersection(s2).cloned().collect();
                    if inter.is_empty() {
                        Err(TypeError {
                            message: format!(
                                "no common atoms between `{ra}` and `{rb}` — a parameter is never widened"
                            ),
                            span,
                        })
                    } else {
                        Ok(Type::Union(inter))
                    }
                }
            },
            (Type::Union(s), Type::Atom) | (Type::Atom, Type::Union(s)) => match mode {
                JoinMode::Join => Ok(Type::Atom),
                JoinMode::Meet => Ok(Type::Union(s.clone())),
            },
            (Type::Tuple(t1), Type::Tuple(t2)) if t1.len() == t2.len() => {
                let ts = t1
                    .iter()
                    .zip(t2)
                    .map(|(x, y)| self.merge(x, y, mode, span))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(Type::Tuple(ts))
            }
            (Type::List(x), Type::List(y)) => Ok(Type::list(self.merge(x, y, mode, span)?)),
            (Type::Die(x), Type::Die(y)) => Ok(Type::die(self.merge(x, y, mode, span)?)),
            (Type::Pool(x), Type::Pool(y)) => Ok(Type::pool(self.merge(x, y, mode, span)?)),
            (Type::Dict(k1, v1), Type::Dict(k2, v2)) => Ok(Type::dict(
                self.merge(k1, k2, mode, span)?,
                self.merge(v1, v2, mode, span)?,
            )),
            (Type::Arrow(d1, c1), Type::Arrow(d2, c2)) => Ok(Type::arrow(
                self.merge(d1, d2, mode.flip(), span)?,
                self.merge(c1, c2, mode, span)?,
            )),
            _ => Err(self.mismatch(&ra, &rb, span)),
        }
    }

    /// One-directional subsumption `sub ≤ sup` (D32-3 subset widening:
    /// singleton ≤ union ≤ Atom), contravariant in function domains.
    /// Unresolved variables on either side bind to the other type.
    fn subsume(&mut self, sub: &Type, sup: &Type, span: Span) -> Result<(), TypeError> {
        let rsub = self.resolve(sub);
        let rsup = self.resolve(sup);
        match (&rsub, &rsup) {
            (Type::Var(v), _) => self.bind(*v, &rsup, span),
            (_, Type::Var(v)) => self.bind(*v, &rsub, span),
            (Type::Unit, Type::Unit)
            | (Type::Num, Type::Num)
            | (Type::Dec, Type::Dec)
            | (Type::Float, Type::Float)
            | (Type::Str, Type::Str)
            | (Type::Atom, Type::Atom)
            | (Type::Union(_), Type::Atom) => Ok(()),
            (Type::Union(s1), Type::Union(s2)) => {
                if s1.is_subset(s2) {
                    Ok(())
                } else {
                    Err(self.expected(&rsup, &rsub, span))
                }
            }
            (Type::Tuple(t1), Type::Tuple(t2)) if t1.len() == t2.len() => {
                for (x, y) in t1.iter().zip(t2) {
                    self.subsume(x, y, span)?;
                }
                Ok(())
            }
            (Type::List(x), Type::List(y))
            | (Type::Die(x), Type::Die(y))
            | (Type::Pool(x), Type::Pool(y)) => self.subsume(x, y, span),
            (Type::Dict(k1, v1), Type::Dict(k2, v2)) => {
                self.subsume(k1, k2, span)?;
                self.subsume(v1, v2, span)
            }
            (Type::Arrow(d1, c1), Type::Arrow(d2, c2)) => {
                self.subsume(d2, d1, span)?;
                self.subsume(c1, c2, span)
            }
            _ => Err(self.expected(&rsup, &rsub, span)),
        }
    }

    // -- D32-4 sum coercion -------------------------------------------------

    fn sum_call(inner: CoreExpr) -> CoreExpr {
        CoreExpr::Call {
            callee: Box::new(CoreExpr::Prelude("sum")),
            args: vec![inner],
            dm_literal_order: false,
        }
    }

    /// If `ty` is a pool, close it with an inserted `sum` (D32-4). A pool of
    /// non-Num faces in a die-demanding position is the pinned targeted
    /// error. Non-pool types pass through untouched.
    fn sum_if_pool(
        &mut self,
        core: CoreExpr,
        ty: Type,
        span: Span,
    ) -> Result<(CoreExpr, Type), TypeError> {
        match self.resolve(&ty) {
            Type::Pool(elem) => match self.resolve(&elem) {
                Type::Num => Ok((Self::sum_call(core), Type::die(Type::Num))),
                Type::Var(v) => {
                    self.bind(v, &Type::Num, span)?;
                    Ok((Self::sum_call(core), Type::die(Type::Num)))
                }
                _ => Err(TypeError {
                    message: "this pool's faces aren't summable — use evaluate()".to_owned(),
                    span,
                }),
            },
            other => Ok((core, other)),
        }
    }

    // -- inference ---------------------------------------------------------

    fn infer(
        &mut self,
        e: &Expr,
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        match e {
            Expr::Num(d) => Ok((CoreExpr::Num(d.clone()), Type::Num)),
            Expr::Dec(d) => Ok((CoreExpr::Dec(d.clone()), Type::Dec)),
            Expr::Float(d) => Ok((CoreExpr::Float(d.clone()), Type::Float)),
            Expr::Str(s) => Ok((CoreExpr::Str(s.clone()), Type::Str)),
            Expr::Atom(a) => Ok((CoreExpr::Atom(a.clone()), Type::atom(a))),
            Expr::Unit => Ok((CoreExpr::Unit, Type::Unit)),
            Expr::Ident(name) => {
                let ty = match env.lookup(name) {
                    Some((Binding::Mono(t), _)) => t,
                    Some((Binding::Poly(s), _)) => self.instantiate(&s, sp.span),
                    Some((Binding::Special(sb), _)) => {
                        self.instantiate(&primary_scheme(sb), sp.span)
                    }
                    None => {
                        return Err(TypeError {
                            message: format!("unbound identifier `{name}`"),
                            span: sp.span,
                        });
                    }
                };
                Ok((CoreExpr::Ident(name.clone()), ty))
            }
            Expr::List(items) => {
                let mut cores = Vec::new();
                let mut elem = self.fresh();
                for (i, item) in items.iter().enumerate() {
                    let isp = &sp.children[i];
                    let (c, t) = self.infer(item, isp, env)?;
                    elem = self.merge(&elem, &t, JoinMode::Join, isp.span)?;
                    cores.push(c);
                }
                Ok((CoreExpr::List(cores), Type::list(elem)))
            }
            Expr::Dict(entries) => {
                let mut cores = Vec::new();
                let mut kt = self.fresh();
                let mut vt = self.fresh();
                for (i, (k, v)) in entries.iter().enumerate() {
                    let ksp = &sp.children[2 * i];
                    let vsp = &sp.children[2 * i + 1];
                    let (kc, k_ty) = self.infer(k, ksp, env)?;
                    let (vc, v_ty) = self.infer(v, vsp, env)?;
                    kt = self.merge(&kt, &k_ty, JoinMode::Join, ksp.span)?;
                    vt = self.merge(&vt, &v_ty, JoinMode::Join, vsp.span)?;
                    cores.push((kc, vc));
                }
                // D32-3 equatable: dict keys must be function-free (deferred
                // while a type var).
                self.deferred.push(Deferred {
                    ty: kt.clone(),
                    span: sp.span,
                    site: EquatableSite::DictKey,
                });
                Ok((CoreExpr::Dict(cores), Type::dict(kt, vt)))
            }
            Expr::Tuple(items) => {
                let mut cores = Vec::new();
                let mut tys = Vec::new();
                for (i, item) in items.iter().enumerate() {
                    let (c, t) = self.infer(item, &sp.children[i], env)?;
                    cores.push(c);
                    tys.push(t);
                }
                Ok((CoreExpr::Tuple(cores), Type::Tuple(tys)))
            }
            Expr::Lambda { params, body } => {
                let mark = env.mark();
                let mut ptys = Vec::new();
                for p in params {
                    let v = self.fresh();
                    env.push(p.clone(), Binding::Mono(v.clone()));
                    ptys.push(v);
                }
                let (bc, bty) = self.infer(body, &sp.children[0], env)?;
                env.truncate(mark);
                Ok((
                    CoreExpr::Lambda {
                        params: params.clone(),
                        body: Box::new(bc),
                    },
                    Type::arrows(ptys, bty),
                ))
            }
            Expr::Neg(inner) => {
                let isp = &sp.children[0];
                let (c, t) = self.infer(inner, isp, env)?;
                let (c, t) = self.sum_if_pool(c, t, isp.span)?;
                let ty = match self.resolve(&t) {
                    Type::Num | Type::Dec | Type::Float => self.resolve(&t),
                    Type::Die(e) => {
                        self.merge(&e, &Type::Num, JoinMode::Join, isp.span)?;
                        Type::die(Type::Num)
                    }
                    v @ Type::Var(_) => {
                        // Same D32-4 amendment as infer_binary: negation is
                        // shape-preserving, so defer the Num-vs-Die[Num] choice.
                        let ret = self.fresh();
                        self.arith.push(ArithPending {
                            l: v,
                            r: None,
                            ret: ret.clone(),
                            lspan: isp.span,
                            rspan: isp.span,
                            span: sp.span,
                        });
                        ret
                    }
                    other => {
                        return Err(TypeError {
                            message: format!("cannot negate `{}`", self.zonk(&other)),
                            span: isp.span,
                        });
                    }
                };
                Ok((CoreExpr::Neg(Box::new(c)), ty))
            }
            Expr::Binary { op, lhs, rhs } => self.infer_binary(*op, lhs, rhs, sp, env),
            Expr::Cmp { first, rest } => self.infer_cmp(first, rest, sp, env),
            Expr::Label { expr, word } => {
                let isp = &sp.children[0];
                let (c, t) = self.infer(expr, isp, env)?;
                let (c, t) = self.sum_if_pool(c, t, isp.span)?;
                let ty = match self.resolve(&t) {
                    Type::Die(e) => Type::die(*e),
                    Type::Var(v) => {
                        let elem = self.fresh();
                        self.bind(v, &Type::die(elem.clone()), isp.span)?;
                        Type::die(elem)
                    }
                    other => {
                        return Err(TypeError {
                            message: format!(
                                "`[{word}]` labels apply to die values, found `{}`",
                                self.zonk(&other)
                            ),
                            span: sp.span,
                        });
                    }
                };
                Ok((
                    CoreExpr::Label {
                        expr: Box::new(c),
                        word: word.clone(),
                    },
                    ty,
                ))
            }
            Expr::Die {
                count,
                sides,
                suffixes,
            } => self.infer_die(count, sides, suffixes, sp, env),
            Expr::Call { callee, args } => self.infer_call(callee, args, sp, env),
            Expr::Let {
                pattern,
                annot,
                value,
                body,
            } => {
                let vsp = &sp.children[0];
                let (vc, vty) = self.infer(value, vsp, env)?;
                let bound = match annot {
                    Some(name) => {
                        let aty = parse_annot(name, sp.span)?;
                        self.subsume(&vty, &aty, vsp.span)?;
                        aty
                    }
                    None => vty,
                };
                let mark = env.mark();
                self.bind_let_pattern(pattern, &bound, env, vsp.span)?;
                let (bc, bty) = self.infer(body, &sp.children[1], env)?;
                env.truncate(mark);
                Ok((
                    CoreExpr::Let {
                        pattern: pattern.clone(),
                        value: Box::new(vc),
                        body: Box::new(bc),
                    },
                    bty,
                ))
            }
            Expr::LetFn {
                name,
                params,
                annot,
                value,
                body,
            } => {
                let vsp = &sp.children[0];
                // D32-3 monomorphic recursion: the name is in scope in its
                // own body at a MONOTYPE; generalized only afterwards.
                let mut ptys = Vec::new();
                for _ in params {
                    ptys.push(self.fresh());
                }
                let ret = self.fresh();
                let fn_ty = Type::arrows(ptys.clone(), ret.clone());
                let mark = env.mark();
                env.push(name.clone(), Binding::Mono(fn_ty.clone()));
                for (p, t) in params.iter().zip(&ptys) {
                    env.push(p.clone(), Binding::Mono(t.clone()));
                }
                let (vc, vty) = self.infer(value, vsp, env)?;
                self.merge(&vty, &ret, JoinMode::Join, vsp.span)?;
                if let Some(a) = annot {
                    let aty = parse_annot(a, sp.span)?;
                    self.subsume(&vty, &aty, vsp.span)?;
                }
                env.truncate(mark);
                let scheme = self.generalize(env, &fn_ty);
                env.push(name.clone(), Binding::Poly(scheme));
                let (bc, bty) = self.infer(body, &sp.children[1], env)?;
                env.truncate(mark);
                Ok((
                    CoreExpr::LetFn {
                        name: name.clone(),
                        params: params.clone(),
                        value: Box::new(vc),
                        body: Box::new(bc),
                    },
                    bty,
                ))
            }
            Expr::Match { scrutinee, arms } => self.infer_match(scrutinee, arms, sp, env),
        }
    }

    fn bind_let_pattern(
        &mut self,
        pat: &Pattern,
        ty: &Type,
        env: &mut Env,
        span: Span,
    ) -> Result<(), TypeError> {
        match pat {
            Pattern::Wildcard => Ok(()),
            Pattern::Ident(name) => {
                let scheme = self.generalize(env, ty);
                env.push(name.clone(), Binding::Poly(scheme));
                Ok(())
            }
            Pattern::Tuple(ps) => {
                let slots: Vec<Type> = ps.iter().map(|_| self.fresh()).collect();
                self.merge(ty, &Type::Tuple(slots.clone()), JoinMode::Join, span)?;
                for (p, t) in ps.iter().zip(&slots) {
                    self.bind_let_pattern(p, t, env, span)?;
                }
                Ok(())
            }
        }
    }

    fn infer_binary(
        &mut self,
        op: BinOp,
        lhs: &Expr,
        rhs: &Expr,
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        let (lsp, rsp) = (&sp.children[0], &sp.children[1]);
        let (lc, lt) = self.infer(lhs, lsp, env)?;
        let (rc, rt) = self.infer(rhs, rsp, env)?;
        // Arithmetic is a die/number-demanding position: pools close (D32-4).
        let (lc, lt) = self.sum_if_pool(lc, lt, lsp.span)?;
        let (rc, rt) = self.sum_if_pool(rc, rt, rsp.span)?;
        let rl = self.resolve(&lt);
        let rr = self.resolve(&rt);
        // D32-4 amendment (2026-08-10): a Var operand whose partner is Num,
        // Die, or another Var can still go EITHER way (scalar or lifted) —
        // defer the decision instead of pinning Num at the operator, so
        // `map([d6], _ + 1)` / `let f(d) = d + 1; f(d6)` lift once the
        // context resolves the operand. A Dec/Float/other partner still
        // decides eagerly below (no die can carry those faces).
        let liftable = |t: &Type| matches!(t, Type::Var(_) | Type::Num | Type::Die(_));
        if (matches!(rl, Type::Var(_)) || matches!(rr, Type::Var(_)))
            && liftable(&rl)
            && liftable(&rr)
        {
            let ret = self.fresh();
            self.arith.push(ArithPending {
                l: rl,
                r: Some(rr),
                ret: ret.clone(),
                lspan: lsp.span,
                rspan: rsp.span,
                span: sp.span,
            });
            return Ok((
                CoreExpr::Binary {
                    op,
                    lhs: Box::new(lc),
                    rhs: Box::new(rc),
                },
                ret,
            ));
        }
        let lifted = matches!(rl, Type::Die(_)) || matches!(rr, Type::Die(_));
        let ty = if lifted {
            for (t, s) in [(&rl, lsp.span), (&rr, rsp.span)] {
                match t {
                    Type::Die(e) => {
                        self.merge(e, &Type::Num, JoinMode::Join, s)?;
                    }
                    other => self.subsume(other, &Type::Num, s)?,
                }
            }
            Type::die(Type::Num)
        } else {
            match (&rl, &rr) {
                (Type::Var(_), Type::Var(_)) => {
                    // Documented default: unresolved arithmetic pins Num.
                    self.subsume(&rl, &Type::Num, lsp.span)?;
                    self.subsume(&rr, &Type::Num, rsp.span)?;
                    Type::Num
                }
                (Type::Var(_), g) if is_numeric_scalar(g) => {
                    self.subsume(&rl, g, lsp.span)?;
                    g.clone()
                }
                (g, Type::Var(_)) if is_numeric_scalar(g) => {
                    self.subsume(&rr, g, rsp.span)?;
                    g.clone()
                }
                (a, b) if is_numeric_scalar(a) && a == b => a.clone(),
                (a, b) if is_numeric_scalar(a) && is_numeric_scalar(b) => {
                    return Err(self.mismatch(a, b, sp.span));
                }
                (a, b) => {
                    let bad = if !is_numeric_scalar(a) && !matches!(a, Type::Var(_)) {
                        a
                    } else {
                        b
                    };
                    return Err(TypeError {
                        message: format!("arithmetic isn't defined on `{}`", self.zonk(bad)),
                        span: sp.span,
                    });
                }
            }
        };
        Ok((
            CoreExpr::Binary {
                op,
                lhs: Box::new(lc),
                rhs: Box::new(rc),
            },
            ty,
        ))
    }

    fn infer_cmp(
        &mut self,
        first: &Expr,
        rest: &[(CmpOp, Expr)],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        if rest.len() > 1 {
            return Err(TypeError {
                message: "comparisons don't chain — parenthesize".to_owned(),
                span: sp.span,
            });
        }
        let (op, rhs) = &rest[0];
        let (lsp, rsp) = (&sp.children[0], &sp.children[1]);
        let (lc, lt) = self.infer(first, lsp, env)?;
        let (rc, rt) = self.infer(rhs, rsp, env)?;
        let rl = self.resolve(&lt);
        let rr = self.resolve(&rt);
        let dieish = |t: &Type| matches!(t, Type::Die(_) | Type::Pool(_));
        let lifted = dieish(&rl) || dieish(&rr);
        let (lc, lt) = if lifted {
            self.sum_if_pool(lc, lt, lsp.span)?
        } else {
            (lc, lt)
        };
        let (rc, rt) = if lifted {
            self.sum_if_pool(rc, rt, rsp.span)?
        } else {
            (rc, rt)
        };
        let is_eq = matches!(op, CmpOp::EqEq | CmpOp::NotEq);
        let ty = if lifted {
            // D32-3: ANY die operand lifts to Die[Bool] — the product
            // construction. Ordering needs numeric faces; equality joins the
            // face/scalar types structurally.
            let rl = self.resolve(&lt);
            let rr = self.resolve(&rt);
            if is_eq {
                let elem = |t: &Type| match t {
                    Type::Die(e) => (**e).clone(),
                    other => other.clone(),
                };
                let joined = self.merge(&elem(&rl), &elem(&rr), JoinMode::Join, sp.span)?;
                self.deferred.push(Deferred {
                    ty: joined,
                    span: sp.span,
                    site: EquatableSite::CmpOperand,
                });
            } else {
                for (t, s) in [(&rl, lsp.span), (&rr, rsp.span)] {
                    match t {
                        Type::Die(e) => {
                            self.merge(e, &Type::Num, JoinMode::Join, s)?;
                        }
                        other => self.subsume(other, &Type::Num, s)?,
                    }
                }
            }
            Type::die(Type::bool())
        } else if is_eq {
            // Structural equality on non-die, non-function types.
            let joined = self.merge(&lt, &rt, JoinMode::Join, sp.span)?;
            self.deferred.push(Deferred {
                ty: joined,
                span: sp.span,
                site: EquatableSite::CmpOperand,
            });
            Type::bool()
        } else {
            // Ordering: Num/Dec/Float/Str, same type both sides.
            let driver = [&rl, &rr]
                .into_iter()
                .find(|t| matches!(t, Type::Num | Type::Dec | Type::Float | Type::Str))
                .cloned();
            match driver {
                Some(d) => {
                    self.subsume(&rl, &d, lsp.span)?;
                    self.subsume(&rr, &d, rsp.span)?;
                }
                None => match (&rl, &rr) {
                    (Type::Var(_), Type::Var(_)) => {
                        // Documented default: unresolved comparisons pin Num.
                        self.subsume(&rl, &Type::Num, lsp.span)?;
                        self.subsume(&rr, &Type::Num, rsp.span)?;
                    }
                    (bad, _) => {
                        let bad = if matches!(bad, Type::Var(_)) {
                            &rr
                        } else {
                            &rl
                        };
                        return Err(TypeError {
                            message: format!(
                                "`{}` isn't defined on `{}`",
                                op.as_str(),
                                self.zonk(bad)
                            ),
                            span: sp.span,
                        });
                    }
                },
            }
            Type::bool()
        };
        Ok((
            CoreExpr::Cmp {
                op: *op,
                lhs: Box::new(lc),
                rhs: Box::new(rc),
            },
            ty,
        ))
    }

    // -- calls --------------------------------------------------------------

    fn infer_call(
        &mut self,
        callee: &Expr,
        args: &[Expr],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        // Special-cased builtins (overloads/variadics — D32-19), only when
        // called DIRECTLY through their unshadowed prelude name.
        if let Expr::Ident(name) = callee
            && let Some((Binding::Special(sb), _)) = env.lookup(name)
        {
            match sb {
                SpecialBuiltin::Roll => return self.call_roll(name, args, sp, env),
                SpecialBuiltin::Min | SpecialBuiltin::Max if args.len() == 2 => {
                    return self.call_min_max(name, args, sp, env);
                }
                SpecialBuiltin::FloatCast | SpecialBuiltin::Abs if args.len() == 1 => {
                    return self.call_cast(sb, name, args, sp, env);
                }
                _ => {} // wrong arity: fall through to the primary scheme
            }
        }
        // D32-4 dm literal-order metadata (syntactic rule).
        let dm_literal_order = matches!(callee, Expr::Ident(n) if n == "dm")
            && matches!(env.lookup("dm"), Some((_, Origin::Prelude)))
            && matches!(args.first(), Some(Expr::Dict(_)));
        let (ccore, mut fty) = self.infer(callee, &sp.children[0], env)?;
        let mut cargs = Vec::new();
        for (i, arg) in args.iter().enumerate() {
            let asp = &sp.children[i + 1];
            let (ac, aty) = self.infer(arg, asp, env)?;
            let rf = self.resolve(&fty);
            match rf {
                Type::Arrow(dom, cod) => {
                    // D32-4: a pool meeting a Die-demanding parameter closes
                    // with sum; other domains keep the pool open (D32-5).
                    let (ac, aty) = if matches!(self.resolve(&aty), Type::Pool(_))
                        && matches!(self.resolve(&dom), Type::Die(_))
                    {
                        self.sum_if_pool(ac, aty, asp.span)?
                    } else {
                        (ac, aty)
                    };
                    self.subsume(&aty, &dom, asp.span)?;
                    cargs.push(ac);
                    fty = *cod;
                }
                Type::Var(v) => {
                    let ret = self.fresh();
                    self.bind(v, &Type::arrow(aty, ret.clone()), asp.span)?;
                    cargs.push(ac);
                    fty = ret;
                }
                other => {
                    return Err(TypeError {
                        message: format!(
                            "this isn't a function (it has type `{}`), so it can't take more arguments",
                            self.zonk(&other)
                        ),
                        span: asp.span,
                    });
                }
            }
        }
        Ok((
            CoreExpr::Call {
                callee: Box::new(ccore),
                args: cargs,
                dm_literal_order,
            },
            fty,
        ))
    }

    fn call_roll(
        &mut self,
        name: &str,
        args: &[Expr],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        if args.is_empty() {
            return Err(TypeError {
                message: "roll needs at least one argument".to_owned(),
                span: sp.span,
            });
        }
        let mut cargs = Vec::new();
        for (i, arg) in args.iter().enumerate() {
            let asp = &sp.children[i + 1];
            let (ac, aty) = self.infer(arg, asp, env)?;
            let (ac, aty) = self.sum_if_pool(ac, aty, asp.span)?;
            self.deferred.push(Deferred {
                ty: aty,
                span: asp.span,
                site: EquatableSite::RollArgument,
            });
            cargs.push(ac);
        }
        Ok((
            CoreExpr::Call {
                callee: Box::new(CoreExpr::Ident(name.to_owned())),
                args: cargs,
                dm_literal_order: false,
            },
            Type::Unit,
        ))
    }

    fn call_min_max(
        &mut self,
        name: &str,
        args: &[Expr],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        let mut cargs = Vec::new();
        let mut tys = Vec::new();
        for (i, arg) in args.iter().enumerate() {
            let asp = &sp.children[i + 1];
            let (ac, aty) = self.infer(arg, asp, env)?;
            let (ac, aty) = self.sum_if_pool(ac, aty, asp.span)?;
            cargs.push(ac);
            tys.push((aty, asp.span));
        }
        let any_die = tys
            .iter()
            .any(|(t, _)| matches!(self.resolve(t), Type::Die(_)));
        for (t, s) in &tys {
            match self.resolve(t) {
                Type::Die(e) => {
                    self.merge(&e, &Type::Num, JoinMode::Join, *s)?;
                }
                other => self.subsume(&other, &Type::Num, *s)?,
            }
        }
        let ty = if any_die {
            Type::die(Type::Num)
        } else {
            Type::Num
        };
        Ok((
            CoreExpr::Call {
                callee: Box::new(CoreExpr::Ident(name.to_owned())),
                args: cargs,
                dm_literal_order: false,
            },
            ty,
        ))
    }

    fn call_cast(
        &mut self,
        sb: SpecialBuiltin,
        name: &str,
        args: &[Expr],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        let asp = &sp.children[1];
        let (ac, aty) = self.infer(&args[0], asp, env)?;
        let is_dec = matches!(self.resolve(&aty), Type::Dec);
        if !is_dec {
            self.subsume(&aty, &Type::Num, asp.span)?;
        }
        let ty = match (sb, is_dec) {
            (SpecialBuiltin::FloatCast, _) => Type::Float,
            (SpecialBuiltin::Abs, true) => Type::Dec,
            (SpecialBuiltin::Abs, false) => Type::Num,
            _ => unreachable!("call_cast is float/abs only"),
        };
        Ok((
            CoreExpr::Call {
                callee: Box::new(CoreExpr::Ident(name.to_owned())),
                args: vec![ac],
                dm_literal_order: false,
            },
            ty,
        ))
    }

    // -- die suffixes (D32-5) ----------------------------------------------

    fn infer_die(
        &mut self,
        count: &Option<String>,
        sides: &str,
        suffixes: &[crate::ast::DieSuffix],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        if suffixes.is_empty() {
            let core = CoreExpr::Die {
                count: count.clone(),
                sides: sides.to_owned(),
            };
            let ty = if count.is_some() {
                Type::pool(Type::Num) // open pool (D32-5)
            } else {
                Type::die(Type::Num)
            };
            return Ok((core, ty));
        }
        #[derive(Clone, Copy, PartialEq)]
        enum Shape {
            PoolShape,
            DieShape,
        }
        // Resolve + classify each suffix (pool-shape wins on ambiguity).
        let mut resolved = Vec::new();
        for (i, sfx) in suffixes.iter().enumerate() {
            let span = sp.aux[i];
            let arg = sfx.arg.clone().ok_or_else(|| TypeError {
                message: format!("die suffix `{}` is missing its numeric argument", sfx.name),
                span,
            })?;
            let (schemes, callee) = match env.lookup_nonlocal(&sfx.name) {
                Some((Binding::Poly(s), Origin::Prelude)) => {
                    // Canonicalize the `e` alias to `explode` (D32-19).
                    let canonical = if sfx.name == "e" {
                        "explode"
                    } else {
                        sfx.name.as_str()
                    };
                    let stat = prelude_static_name(canonical)
                        .expect("prelude binding implies a static name");
                    (vec![s], CoreExpr::Prelude(stat))
                }
                Some((Binding::Poly(s), _)) => (vec![s], CoreExpr::Ident(sfx.name.clone())),
                Some((Binding::Special(sb), _)) => {
                    (special_schemes(sb), CoreExpr::Ident(sfx.name.clone()))
                }
                Some((Binding::Mono(t), _)) => {
                    (vec![Scheme::mono(t)], CoreExpr::Ident(sfx.name.clone()))
                }
                None => {
                    return Err(TypeError {
                        message: format!("unknown die suffix `{}`", sfx.name),
                        span,
                    });
                }
            };
            let mut shape = None;
            'shapes: for candidate in [Shape::PoolShape, Shape::DieShape] {
                for scheme in &schemes {
                    let snap = self.subst.clone();
                    let dlen = self.deferred.len();
                    let inst = self.instantiate(scheme, span);
                    let a = self.fresh();
                    let target = match candidate {
                        Shape::PoolShape => Type::arrows(
                            vec![Type::pool(a.clone()), Type::Num],
                            Type::pool(a.clone()),
                        ),
                        Shape::DieShape => Type::arrows(
                            vec![Type::die(a.clone()), Type::Num],
                            Type::die(a.clone()),
                        ),
                    };
                    let ok = self.merge(&inst, &target, JoinMode::Join, span).is_ok();
                    self.subst = snap;
                    self.deferred.truncate(dlen);
                    if ok {
                        shape = Some(candidate);
                        break 'shapes;
                    }
                }
            }
            let shape = shape.ok_or_else(|| TypeError {
                message: format!(
                    "die suffix `{}` has the wrong shape — need `Pool[T] -> Num -> Pool[T]` or `Die[T] -> Num -> Die[T]`",
                    sfx.name
                ),
                span,
            })?;
            let scheme = schemes
                .into_iter()
                .next()
                .expect("non-empty by construction");
            resolved.push((shape, scheme, callee, arg, span));
        }
        // Build: die-shape suffixes map the UNDERLYING die; pool-shape ones
        // wrap the (materialized) pool. The two classes commute in the
        // engine's (count, die, keep-tuple) pool representation, so a
        // die-shape suffix after a pool-shape one still reaches the die.
        let mut die_core = CoreExpr::Die {
            count: None,
            sides: sides.to_owned(),
        };
        let mut die_ty = Type::die(Type::Num);
        for (shape, scheme, callee, arg, span) in &resolved {
            if *shape == Shape::DieShape {
                let fty = self.instantiate(scheme, *span);
                let t1 = self.apply(&fty, &die_ty, *span)?;
                let t2 = self.apply(&t1, &Type::Num, *span)?;
                let elem = self.fresh();
                self.merge(&t2, &Type::die(elem), JoinMode::Join, *span)?;
                die_ty = self.resolve(&t2);
                die_core = CoreExpr::Call {
                    callee: Box::new(callee.clone()),
                    args: vec![die_core, CoreExpr::Num(arg.clone())],
                    dm_literal_order: false,
                };
            }
        }
        let has_pool_shape = resolved.iter().any(|(s, ..)| *s == Shape::PoolShape);
        if count.is_none() && !has_pool_shape {
            // e.g. `d6e2` — still a single die, no pool at all.
            return Ok((die_core, die_ty));
        }
        let n = count.clone().unwrap_or_else(|| "1".to_owned());
        let elem = self.fresh();
        self.merge(&die_ty, &Type::die(elem.clone()), JoinMode::Join, sp.span)?;
        let mut pool_ty = Type::pool(elem);
        let mut pool_core = CoreExpr::Call {
            callee: Box::new(CoreExpr::Prelude("pool")),
            args: vec![CoreExpr::Num(n), die_core],
            dm_literal_order: false,
        };
        for (shape, scheme, callee, arg, span) in &resolved {
            if *shape == Shape::PoolShape {
                let fty = self.instantiate(scheme, *span);
                let t1 = self.apply(&fty, &pool_ty, *span)?;
                let t2 = self.apply(&t1, &Type::Num, *span)?;
                let elem = self.fresh();
                self.merge(&t2, &Type::pool(elem), JoinMode::Join, *span)?;
                pool_ty = self.resolve(&t2);
                pool_core = CoreExpr::Call {
                    callee: Box::new(callee.clone()),
                    args: vec![pool_core, CoreExpr::Num(arg.clone())],
                    dm_literal_order: false,
                };
            }
        }
        Ok((pool_core, pool_ty))
    }

    /// Apply one argument type to a function type.
    fn apply(&mut self, fty: &Type, arg: &Type, span: Span) -> Result<Type, TypeError> {
        match self.resolve(fty) {
            Type::Arrow(dom, cod) => {
                self.subsume(arg, &dom, span)?;
                Ok(*cod)
            }
            Type::Var(v) => {
                let ret = self.fresh();
                self.bind(v, &Type::arrow(arg.clone(), ret.clone()), span)?;
                Ok(ret)
            }
            other => Err(TypeError {
                message: format!("`{}` isn't a function", self.zonk(&other)),
                span,
            }),
        }
    }

    // -- match (D32-3) -----------------------------------------------------

    fn infer_match(
        &mut self,
        scrutinee: &Expr,
        arms: &[(MatchPat, Expr)],
        sp: &SpanTree,
        env: &mut Env,
    ) -> Result<(CoreExpr, Type), TypeError> {
        let ssp = &sp.children[0];
        let (score, sty) = self.infer(scrutinee, ssp, env)?;
        // A lambda param (or other var) scrutinee infers its type from the
        // arm patterns: EXACT union of the arms' atoms, wildcard keeps it a
        // fresh var (D32-3).
        if let Type::Var(v) = self.resolve(&sty) {
            let pats: Vec<&MatchPat> = arms.iter().map(|(p, _)| p).collect();
            if let Some(demanded) = self.demand_from_pats(&pats, sp.span)? {
                self.bind(v, &demanded, sp.span)?;
            }
        }
        let rsty = self.zonk(&sty);
        let mut core_arms = Vec::new();
        let mut result: Option<Type> = None;
        for (i, (pat, body)) in arms.iter().enumerate() {
            let pat_span = sp.aux[i];
            let bsp = &sp.children[i + 1];
            let mark = env.mark();
            self.pat_bind_check(pat, &rsty, env, pat_span)?;
            let (bc, bty) = self.infer(body, bsp, env)?;
            env.truncate(mark);
            result = Some(match result {
                None => bty,
                Some(acc) => self.merge(&acc, &bty, JoinMode::Join, bsp.span)?,
            });
            core_arms.push((pat.clone(), bc));
        }
        // Exhaustiveness + redundancy on the RESOLVED scrutinee type.
        let rsty = self.zonk(&rsty);
        self.check_arms(arms, &rsty, sp)?;
        Ok((
            CoreExpr::Match {
                scrutinee: Box::new(score),
                arms: core_arms,
            },
            result.expect("parser guarantees at least one arm"),
        ))
    }

    /// The D32-3 pattern-driven scrutinee type: `Some(union)` for all-atom
    /// arms, `None` (stays a fresh var) when a wildcard/binder arm exists
    /// alongside atoms, ground literal/tuple demands otherwise.
    fn demand_from_pats(
        &mut self,
        pats: &[&MatchPat],
        span: Span,
    ) -> Result<Option<Type>, TypeError> {
        let tops: Vec<&&MatchPat> = pats
            .iter()
            .filter(|p| !matches!(p, MatchPat::Wildcard | MatchPat::Ident(_)))
            .collect();
        if tops.is_empty() {
            return Ok(None);
        }
        let has_open = tops.len() < pats.len();
        if tops.iter().all(|p| matches!(p, MatchPat::Atom(_))) {
            if has_open {
                return Ok(None);
            }
            let set: BTreeSet<String> = tops
                .iter()
                .filter_map(|p| match p {
                    MatchPat::Atom(a) => Some(a.clone()),
                    _ => None,
                })
                .collect();
            return Ok(Some(Type::Union(set)));
        }
        if tops.iter().all(|p| matches!(p, MatchPat::Num { .. })) {
            return Ok(Some(Type::Num));
        }
        if tops.iter().all(|p| matches!(p, MatchPat::Dec { .. })) {
            return Ok(Some(Type::Dec));
        }
        if tops.iter().all(|p| matches!(p, MatchPat::Str(_))) {
            return Ok(Some(Type::Str));
        }
        if tops.iter().all(|p| matches!(p, MatchPat::Tuple(_))) {
            let arity = match tops[0] {
                MatchPat::Tuple(ps) => ps.len(),
                _ => unreachable!(),
            };
            let mut slots = Vec::new();
            for k in 0..arity {
                let mut col = Vec::new();
                for p in &tops {
                    match p {
                        MatchPat::Tuple(ps) if ps.len() == arity => col.push(&ps[k]),
                        MatchPat::Tuple(_) => {
                            return Err(TypeError {
                                message: "tuple patterns have different lengths".to_owned(),
                                span,
                            });
                        }
                        _ => unreachable!(),
                    }
                }
                let slot = match self.demand_from_pats(&col, span)? {
                    Some(t) => t,
                    None => self.fresh(),
                };
                slots.push(slot);
            }
            return Ok(Some(Type::Tuple(slots)));
        }
        Err(TypeError {
            message: "match arm patterns have incompatible types".to_owned(),
            span,
        })
    }

    /// Type-check one arm pattern against the scrutinee type, pushing binder
    /// bindings. The `:ture`-style impossible atom is rejected here.
    fn pat_bind_check(
        &mut self,
        pat: &MatchPat,
        ty: &Type,
        env: &mut Env,
        span: Span,
    ) -> Result<(), TypeError> {
        let rty = self.resolve(ty);
        match pat {
            MatchPat::Wildcard => Ok(()),
            MatchPat::Ident(name) => {
                env.push(name.clone(), Binding::Mono(rty));
                Ok(())
            }
            MatchPat::Atom(a) => match &rty {
                Type::Union(s) => {
                    if s.contains(a) {
                        Ok(())
                    } else {
                        Err(TypeError {
                            message: format!(
                                "unreachable arm: `:{a}` is not a possible value of `{}`",
                                self.zonk(&rty)
                            ),
                            span,
                        })
                    }
                }
                Type::Atom | Type::Var(_) => Ok(()),
                other => Err(TypeError {
                    message: format!(
                        "this pattern is an atom but the scrutinee has type `{}`",
                        self.zonk(other)
                    ),
                    span,
                }),
            },
            MatchPat::Num { .. } => self.lit_pat_ty(&rty, Type::Num, span),
            MatchPat::Dec { .. } => self.lit_pat_ty(&rty, Type::Dec, span),
            MatchPat::Str(_) => self.lit_pat_ty(&rty, Type::Str, span),
            MatchPat::Tuple(ps) => match &rty {
                Type::Tuple(ts) if ts.len() == ps.len() => {
                    for (p, t) in ps.iter().zip(ts) {
                        self.pat_bind_check(p, t, env, span)?;
                    }
                    Ok(())
                }
                Type::Tuple(_) => Err(TypeError {
                    message: format!(
                        "this tuple pattern has {} elements but the scrutinee has type `{}`",
                        ps.len(),
                        self.zonk(&rty)
                    ),
                    span,
                }),
                Type::Var(v) => {
                    let slots: Vec<Type> = ps.iter().map(|_| self.fresh()).collect();
                    self.bind(*v, &Type::Tuple(slots.clone()), span)?;
                    for (p, t) in ps.iter().zip(&slots) {
                        self.pat_bind_check(p, t, env, span)?;
                    }
                    Ok(())
                }
                other => Err(TypeError {
                    message: format!(
                        "this pattern is a tuple but the scrutinee has type `{}`",
                        self.zonk(other)
                    ),
                    span,
                }),
            },
        }
    }

    fn lit_pat_ty(&mut self, scrutinee: &Type, want: Type, span: Span) -> Result<(), TypeError> {
        match scrutinee {
            t if *t == want => Ok(()),
            Type::Var(v) => self.bind(*v, &want, span),
            other => Err(TypeError {
                message: format!(
                    "this pattern has type `{want}` but the scrutinee has type `{}`{}",
                    self.zonk(other),
                    mixing_hint(&want, &self.zonk(other))
                ),
                span,
            }),
        }
    }

    /// Exhaustiveness + redundancy (D32-3) via pattern usefulness.
    fn check_arms(
        &self,
        arms: &[(MatchPat, Expr)],
        sty: &Type,
        sp: &SpanTree,
    ) -> Result<(), TypeError> {
        let rows: Vec<Vec<DPat>> = arms.iter().map(|(p, _)| vec![DPat::from_pat(p)]).collect();
        let tys = [sty.clone()];
        for i in 0..rows.len() {
            if useful(&rows[..i], &rows[i], &tys, self).is_none() {
                return Err(TypeError {
                    message: "unreachable arm: already covered by earlier arms".to_owned(),
                    span: sp.aux[i],
                });
            }
        }
        if let Some(witness) = useful(&rows, &[DPat::Wild], &tys, self) {
            let message = match sty {
                Type::Union(s) => {
                    let covered: BTreeSet<String> = arms
                        .iter()
                        .filter_map(|(p, _)| match p {
                            MatchPat::Atom(a) => Some(a.clone()),
                            _ => None,
                        })
                        .collect();
                    let missing: Vec<String> =
                        s.difference(&covered).map(|a| format!(":{a}")).collect();
                    format!("non-exhaustive match: missing {}", missing.join(", "))
                }
                Type::Num | Type::Dec | Type::Str | Type::Atom => {
                    format!("match on `{sty}` needs a wildcard or binder arm")
                }
                Type::Tuple(_) => format!(
                    "non-exhaustive match: `{}` not covered",
                    witness[0].render()
                ),
                other => format!("match on `{other}` needs a wildcard or binder arm"),
            };
            return Err(TypeError {
                message,
                span: sp.span,
            });
        }
        Ok(())
    }
}

fn apply_map(t: &Type, m: &HashMap<u32, Type>) -> Type {
    match t {
        Type::Var(v) => m.get(v).cloned().unwrap_or(Type::Var(*v)),
        Type::Tuple(ts) => Type::Tuple(ts.iter().map(|t| apply_map(t, m)).collect()),
        Type::List(t) => Type::list(apply_map(t, m)),
        Type::Die(t) => Type::die(apply_map(t, m)),
        Type::Pool(t) => Type::pool(apply_map(t, m)),
        Type::Dict(k, v) => Type::dict(apply_map(k, m), apply_map(v, m)),
        Type::Arrow(d, c) => Type::arrow(apply_map(d, m), apply_map(c, m)),
        other => other.clone(),
    }
}

fn parse_annot(name: &str, span: Span) -> Result<Type, TypeError> {
    match name {
        "Num" => Ok(Type::Num),
        "Dec" => Ok(Type::Dec),
        "Float" => Ok(Type::Float),
        "Str" => Ok(Type::Str),
        "Atom" => Ok(Type::Atom),
        "Bool" => Ok(Type::bool()),
        "Unit" => Ok(Type::Unit),
        other => Err(TypeError {
            message: format!("unknown type annotation `{other}`"),
            span,
        }),
    }
}

// ---------------------------------------------------------------------------
// Pattern usefulness (Maranget-style, over the closed weal pattern domain)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
enum DPat {
    Wild,
    Atom(String),
    Num(String),
    Dec(String),
    Str(String),
    Tuple(Vec<DPat>),
}

impl DPat {
    fn from_pat(p: &MatchPat) -> DPat {
        match p {
            MatchPat::Wildcard | MatchPat::Ident(_) => DPat::Wild,
            MatchPat::Atom(a) => DPat::Atom(a.clone()),
            MatchPat::Num { neg, digits } => DPat::Num(signed(*neg, digits)),
            MatchPat::Dec { neg, text } => DPat::Dec(signed(*neg, text)),
            MatchPat::Str(s) => DPat::Str(s.clone()),
            MatchPat::Tuple(ps) => DPat::Tuple(ps.iter().map(DPat::from_pat).collect()),
        }
    }

    fn render(&self) -> String {
        match self {
            DPat::Wild => "_".to_owned(),
            DPat::Atom(a) => format!(":{a}"),
            DPat::Num(s) | DPat::Dec(s) => s.clone(),
            DPat::Str(s) => format!("{s:?}"),
            DPat::Tuple(ps) => format!(
                "{{{}}}",
                ps.iter().map(DPat::render).collect::<Vec<_>>().join(", ")
            ),
        }
    }
}

fn signed(neg: bool, digits: &str) -> String {
    if neg {
        format!("-{digits}")
    } else {
        digits.to_owned()
    }
}

/// Specialize a row by a head constructor; `None` = row drops.
fn specialize_row(row: &[DPat], head: &DPat) -> Option<Vec<DPat>> {
    let arity = match head {
        DPat::Tuple(ps) => ps.len(),
        _ => 0,
    };
    let (h, rest) = row.split_first().expect("non-empty row");
    match h {
        DPat::Wild => {
            let mut out = vec![DPat::Wild; arity];
            out.extend_from_slice(rest);
            Some(out)
        }
        DPat::Tuple(ps) if matches!(head, DPat::Tuple(_)) => {
            let mut out = ps.clone();
            out.extend_from_slice(rest);
            Some(out)
        }
        _ if h == head => Some(rest.to_vec()),
        _ => None,
    }
}

fn default_row(row: &[DPat]) -> Option<Vec<DPat>> {
    let (h, rest) = row.split_first().expect("non-empty row");
    if matches!(h, DPat::Wild) {
        Some(rest.to_vec())
    } else {
        None
    }
}

/// Is `q` useful w.r.t. `matrix` (matches some value no matrix row matches)?
/// Returns a witness value-pattern when useful.
fn useful(matrix: &[Vec<DPat>], q: &[DPat], tys: &[Type], ck: &Checker) -> Option<Vec<DPat>> {
    if q.is_empty() {
        return if matrix.is_empty() {
            Some(Vec::new())
        } else {
            None
        };
    }
    let t0 = ck.zonk(&tys[0]);
    let sub_tys = |head: &DPat| -> Vec<Type> {
        let elems: Vec<Type> = match (&t0, head) {
            (Type::Tuple(ts), _) => ts.clone(),
            (_, DPat::Tuple(ps)) => ps.iter().map(|_| Type::Atom).collect(),
            _ => Vec::new(),
        };
        elems.into_iter().chain(tys[1..].iter().cloned()).collect()
    };
    let q0 = &q[0];
    match q0 {
        DPat::Wild => {
            let heads: Vec<&DPat> = matrix
                .iter()
                .filter(|r| !matches!(r[0], DPat::Wild))
                .map(|r| &r[0])
                .collect();
            let complete = match &t0 {
                Type::Union(s) => {
                    let present: BTreeSet<&str> = heads
                        .iter()
                        .filter_map(|h| match h {
                            DPat::Atom(a) => Some(a.as_str()),
                            _ => None,
                        })
                        .collect();
                    s.iter().all(|a| present.contains(a.as_str()))
                }
                Type::Tuple(_) => true,
                _ => false,
            };
            if complete {
                match &t0 {
                    Type::Union(s) => {
                        for a in s {
                            let head = DPat::Atom(a.clone());
                            let sm: Vec<Vec<DPat>> = matrix
                                .iter()
                                .filter_map(|r| specialize_row(r, &head))
                                .collect();
                            if let Some(mut w) = useful(&sm, &q[1..], &tys[1..], ck) {
                                w.insert(0, head);
                                return Some(w);
                            }
                        }
                        None
                    }
                    Type::Tuple(ts) => {
                        let head = DPat::Tuple(vec![DPat::Wild; ts.len()]);
                        let sm: Vec<Vec<DPat>> = matrix
                            .iter()
                            .filter_map(|r| specialize_row(r, &head))
                            .collect();
                        let mut sq = vec![DPat::Wild; ts.len()];
                        sq.extend_from_slice(&q[1..]);
                        let stys = sub_tys(&head);
                        useful(&sm, &sq, &stys, ck).map(|w| {
                            let (elems, rest) = w.split_at(ts.len());
                            let mut out = vec![DPat::Tuple(elems.to_vec())];
                            out.extend_from_slice(rest);
                            out
                        })
                    }
                    _ => unreachable!("complete implies union or tuple"),
                }
            } else {
                let dm: Vec<Vec<DPat>> = matrix.iter().filter_map(|r| default_row(r)).collect();
                useful(&dm, &q[1..], &tys[1..], ck).map(|mut w| {
                    let head = match &t0 {
                        Type::Union(s) => {
                            let present: BTreeSet<&str> = heads
                                .iter()
                                .filter_map(|h| match h {
                                    DPat::Atom(a) => Some(a.as_str()),
                                    _ => None,
                                })
                                .collect();
                            s.iter()
                                .find(|a| !present.contains(a.as_str()))
                                .map(|a| DPat::Atom(a.clone()))
                                .unwrap_or(DPat::Wild)
                        }
                        _ => DPat::Wild,
                    };
                    w.insert(0, head);
                    w
                })
            }
        }
        head => {
            let (sub_arity, ctor_head) = match head {
                DPat::Tuple(ps) => (ps.len(), DPat::Tuple(vec![DPat::Wild; ps.len()])),
                other => (0, other.clone()),
            };
            let sm: Vec<Vec<DPat>> = matrix
                .iter()
                .filter_map(|r| specialize_row(r, &ctor_head))
                .collect();
            let mut sq: Vec<DPat> = match head {
                DPat::Tuple(ps) => ps.clone(),
                _ => Vec::new(),
            };
            sq.extend_from_slice(&q[1..]);
            let stys = sub_tys(head);
            useful(&sm, &sq, &stys, ck).map(|w| {
                let (elems, rest) = w.split_at(sub_arity);
                let head_w = match head {
                    DPat::Tuple(_) => DPat::Tuple(elems.to_vec()),
                    other => other.clone(),
                };
                let mut out = vec![head_w];
                out.extend_from_slice(rest);
                out
            })
        }
    }
}
