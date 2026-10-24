//! The S3 tree-walking interpreter (spec 0032 §4 S3): eager, environment-
//! based, capture-by-value closures with currying, the D32-7 effect
//! accumulator + runtime guard, D32-12 fuel, and the R21 save serializer.
//!
//! # Spans
//!
//! The interpreter walks the checker's [`CoreExpr`] directly. Every node
//! already carries its source span (see `infer`'s "Spans" docs, including
//! the spans of checker-inserted nodes), and closures store their core body,
//! so an error inside a closure applied later still points into the defining
//! source. Errors without a span come from synthesized applications (the S4
//! evaluator callback), the distribution engine and save serialization.
//!
//! # Environments and recursion
//!
//! The environment is an immutable persistent list (`Rc`-shared); closures
//! capture it by reference-to-immutable = capture-by-value semantics.
//! `let f(x) = …` recursion uses v1-style name-rebinding at application
//! time (the closure remembers `self_name` and re-binds itself into its own
//! environment on every application) — no `Rc` cycles exist, which also
//! keeps save-serialization cycle detection a pure defensive check.
//!
//! # Save serialization (R21, scoping doc §5.5)
//!
//! `save(:name, v)` serializes `v` to SOURCE via the S1 printer: literals
//! directly; containers recursively; die trees as canonical constructor
//! calls (`kh(pool(4, d6), 3)` — suffix chains don't survive, the
//! constructor form re-parses and re-checks identically); closures as
//! `|params| body` with captured bindings emitted as enclosing `let`s
//! (nested captured closures serialize the same way, in place, as
//! let-wrapped lambda expressions); a recursive function serializes as
//! `let f(params) = …; f`. Free prelude names don't serialize (ambient).
//! Captures/params whose names collide with prelude names are RENAMED
//! (with free-occurrence rewriting) so that checker-inserted `Prelude`
//! references — which print as bare idents — can't be re-captured on
//! reload. Documented limitation: an OPEN `Pool` value serializes as its
//! constructor chain, and the D32-7 top-level sum coercion closes it on
//! reload (`Pool[Num]` comes back as `Die[Num]`) — inherent to the
//! source-text save contract.

use crate::ast::{BinOp, CmpOp, Expr, MatchPat, Pattern};
use crate::fuel::Fuel;
use crate::infer::{CoreExpr, CoreKind};
use crate::lower::Span;
use crate::prelude::{self, Builtin};
use crate::value::{
    BuiltinValue, Cmd, DieTree, DisplayItem, EvalError, Keep, PoolTree, Value, dec_from_text,
};
use num_bigint::BigInt;
use std::collections::HashMap;
use std::rc::Rc;

pub use crate::pipeline::{RunError, RunOutput, run};

// ---------------------------------------------------------------------------
// Environment + closures
// ---------------------------------------------------------------------------

/// An immutable persistent environment (`Rc`-shared cons list).
pub type Env = Rc<EnvNode>;

pub enum EnvNode {
    Nil,
    Cons {
        name: String,
        value: Value,
        next: Env,
    },
}

/// The empty environment.
pub fn env_nil() -> Env {
    Rc::new(EnvNode::Nil)
}

/// Extend an environment (persistent — the old env is untouched).
pub fn env_bind(env: &Env, name: String, value: Value) -> Env {
    Rc::new(EnvNode::Cons {
        name,
        value,
        next: env.clone(),
    })
}

/// Innermost binding lookup.
pub fn env_lookup<'a>(env: &'a Env, name: &str) -> Option<&'a Value> {
    let mut cur: &EnvNode = env;
    while let EnvNode::Cons {
        name: n,
        value,
        next,
    } = cur
    {
        if n == name {
            return Some(value);
        }
        cur = next;
    }
    None
}

/// A closure value: params, spanned body, the captured environment, and —
/// for `let f(x) = …` functions — the self-reference name re-bound at
/// application time (module docs).
pub struct ClosureValue {
    pub params: Vec<String>,
    pub body: Rc<CoreExpr>,
    pub env: Env,
    pub self_name: Option<String>,
}

impl std::fmt::Debug for ClosureValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClosureValue")
            .field("params", &self.params)
            .field("self_name", &self.self_name)
            .finish_non_exhaustive()
    }
}

// ---------------------------------------------------------------------------
// The interpreter
// ---------------------------------------------------------------------------

/// One interpretation's mutable state: fuel, the effect accumulator, and the
/// D32-7 evaluate-guard depth.
pub struct Interp<'f> {
    pub(crate) fuel: &'f mut Fuel,
    pub(crate) cmd: Cmd,
    pub(crate) evaluate_depth: u32,
}

impl<'f> Interp<'f> {
    pub fn new(fuel: &'f mut Fuel) -> Interp<'f> {
        Interp {
            fuel,
            cmd: Cmd::default(),
            evaluate_depth: 0,
        }
    }

    pub fn into_cmd(self) -> Cmd {
        self.cmd
    }

    /// The D32-7 runtime guard: effects are illegal inside evaluator
    /// closures.
    pub(crate) fn effect_guard(&self, span: Option<Span>) -> Result<(), EvalError> {
        if self.evaluate_depth > 0 {
            return Err(EvalError::eval("effect inside evaluate()", span));
        }
        Ok(())
    }

    /// Run one evaluator transition: apply the user closure to
    /// `(state, face, count)` with the effect guard armed. This is the
    /// callback body S4's DP loop wraps into
    /// [`crate::dist_seam::dist_of_with`].
    ///
    /// The user closure sees ONLY faces that actually landed (count >= 1) —
    /// the language semantic the render sampler and the README define. The
    /// DP loop still transitions through every support face for state
    /// alignment, but a count-0 transition is the identity, never a closure
    /// application (D32-8 amendment at the goodness/dist-divergence fix).
    pub fn run_evaluator_step(
        &mut self,
        func: &Value,
        state: &Value,
        face: &Value,
        count: u64,
    ) -> Result<Value, EvalError> {
        if count == 0 {
            return Ok(state.clone());
        }
        self.evaluate_depth += 1;
        let result = self.apply(
            func.clone(),
            vec![state.clone(), face.clone(), Value::num_u64(count)],
            false,
            None,
        );
        self.evaluate_depth -= 1;
        result
    }

    /// Evaluate one node. Burns one fuel step and one recursion frame.
    pub fn eval(&mut self, e: &CoreExpr, env: &Env) -> Result<Value, EvalError> {
        self.fuel.step(Some(e.span))?;
        self.fuel.enter(Some(e.span))?;
        let result = self.eval_inner(e, env);
        self.fuel.exit();
        result
    }

    fn eval_inner(&mut self, e: &CoreExpr, env: &Env) -> Result<Value, EvalError> {
        let span = Some(e.span);
        match &e.kind {
            CoreKind::Let {
                pattern,
                value,
                body,
            } => {
                let v = self.eval(value, env)?;
                let env = bind_pattern(pattern, v, env)?;
                self.eval(body, &env)
            }
            CoreKind::LetFn {
                name,
                params,
                value,
                body,
            } => {
                let closure = Value::Closure(Rc::new(ClosureValue {
                    params: params.clone(),
                    body: Rc::new((**value).clone()),
                    env: env.clone(),
                    self_name: Some(name.clone()),
                }));
                let env = env_bind(env, name.clone(), closure);
                self.eval(body, &env)
            }
            CoreKind::Match { scrutinee, arms } => {
                let v = self.eval(scrutinee, env)?;
                for (pat, body) in arms {
                    let mut binds = Vec::new();
                    if match_pat(pat, &v, &mut binds, span)? {
                        let mut env = env.clone();
                        for (name, value) in binds {
                            env = env_bind(&env, name, value);
                        }
                        return self.eval(body, &env);
                    }
                }
                // The checker proves exhaustiveness — defensive only.
                Err(EvalError::eval("no match arm matched", span))
            }
            CoreKind::Lambda { params, body } => Ok(Value::Closure(Rc::new(ClosureValue {
                params: params.clone(),
                body: Rc::new((**body).clone()),
                env: env.clone(),
                self_name: None,
            }))),
            CoreKind::Cmp { op, lhs, rhs } => {
                let l = self.eval(lhs, env)?;
                let r = self.eval(rhs, env)?;
                cmp_values(*op, l, r, span)
            }
            CoreKind::Binary { op, lhs, rhs } => {
                let l = self.eval(lhs, env)?;
                let r = self.eval(rhs, env)?;
                arith(*op, l, r, span)
            }
            CoreKind::Neg(inner) => {
                let v = self.eval(inner, env)?;
                match v {
                    Value::Num(n) => Ok(Value::Num(-n)),
                    Value::Dec(d) => Ok(Value::Dec(-d)),
                    Value::Float(f) => Ok(Value::Float(-f)),
                    Value::Die(t) => Ok(Value::Die(DieTree::Neg(Box::new(t)))),
                    other => Err(internal_shape("negate", &other)),
                }
            }
            CoreKind::Call {
                callee,
                args,
                dm_literal_order,
            } => {
                let f = self.eval(callee, env)?;
                // Direct `roll(…)` is variadic (D32-19).
                if let Value::Builtin(b) = &f
                    && b.builtin == Builtin::Roll
                    && b.args.is_empty()
                    && !args.is_empty()
                {
                    self.effect_guard(span)?;
                    for a in args {
                        let v = self.eval(a, env)?;
                        append_display(&mut self.cmd, &v);
                    }
                    return Ok(Value::Unit);
                }
                let mut argv = Vec::with_capacity(args.len());
                for a in args {
                    argv.push(self.eval(a, env)?);
                }
                self.apply(f, argv, *dm_literal_order, span)
            }
            CoreKind::Label { expr, word } => {
                let v = self.eval(expr, env)?;
                match v {
                    Value::Die(t) => Ok(Value::Die(DieTree::Label {
                        word: word.clone(),
                        inner: Box::new(t),
                    })),
                    other => Err(internal_shape("label", &other)),
                }
            }
            CoreKind::Die { count, sides } => eval_die(count.as_deref(), sides, span),
            CoreKind::Num(digits) => Ok(Value::Num(
                digits
                    .parse()
                    .map_err(|_| EvalError::internal("bad Num literal"))?,
            )),
            CoreKind::Dec(text) => Ok(Value::Dec(dec_from_text(text, span)?)),
            CoreKind::Float(text) => Ok(Value::Float(
                text.parse()
                    .map_err(|_| EvalError::internal("bad Float literal"))?,
            )),
            CoreKind::Str(s) => Ok(Value::Str(s.clone())),
            CoreKind::Atom(s) => Ok(Value::Atom(s.clone())),
            CoreKind::Unit => Ok(Value::Unit),
            CoreKind::Ident(name) => {
                if let Some(v) = env_lookup(env, name) {
                    return Ok(v.clone());
                }
                // Unshadowed prelude reference (ambient).
                if let Some(builtin) = Builtin::from_name(name) {
                    return Ok(Value::Builtin(BuiltinValue {
                        builtin,
                        args: Vec::new(),
                    }));
                }
                Err(EvalError::internal(format!("unbound identifier `{name}`")))
            }
            CoreKind::Prelude(builtin) => Ok(Value::Builtin(BuiltinValue {
                builtin: *builtin,
                args: Vec::new(),
            })),
            CoreKind::List(items) => {
                let mut out = Vec::with_capacity(items.len());
                for item in items {
                    out.push(self.eval(item, env)?);
                }
                Ok(Value::List(out))
            }
            CoreKind::Tuple(items) => {
                let mut out = Vec::with_capacity(items.len());
                for item in items {
                    out.push(self.eval(item, env)?);
                }
                Ok(Value::Tuple(out))
            }
            CoreKind::Dict(entries) => {
                let mut out: Vec<(Value, Value)> = Vec::with_capacity(entries.len());
                for (k, v) in entries {
                    let key = self.eval(k, env)?;
                    let value = self.eval(v, env)?;
                    // A repeated key overwrites in place, keeping the first
                    // position (documented in value.rs).
                    if let Some(slot) = out.iter_mut().find(|(k2, _)| *k2 == key) {
                        slot.1 = value;
                    } else {
                        out.push((key, value));
                    }
                }
                Ok(Value::Dict(out))
            }
        }
    }

    /// Apply a function value to arguments: currying + partial application
    /// (fewer args = a smaller closure; more = apply then re-apply).
    pub fn apply(
        &mut self,
        f: Value,
        args: Vec<Value>,
        dm_literal: bool,
        span: Option<Span>,
    ) -> Result<Value, EvalError> {
        let mut f = f;
        let mut queue: std::collections::VecDeque<Value> = args.into();
        loop {
            if queue.is_empty() {
                return Ok(f);
            }
            match f {
                Value::Closure(rc) => {
                    let take = rc.params.len().min(queue.len());
                    let mut env = rc.env.clone();
                    if let Some(self_name) = &rc.self_name {
                        env = env_bind(&env, self_name.clone(), Value::Closure(rc.clone()));
                    }
                    for name in rc.params.iter().take(take) {
                        let v = queue.pop_front().expect("take <= queue.len()");
                        env = env_bind(&env, name.clone(), v);
                    }
                    if rc.params.is_empty() {
                        // WEAL-1: a nullary closure is `Unit -> T`. It consumes
                        // the implicit `()` and runs its body on every call.
                        match queue.pop_front() {
                            Some(Value::Unit) => {}
                            _ => {
                                return Err(EvalError::internal(
                                    "a nullary function was applied to a non-unit argument",
                                ));
                            }
                        }
                    }
                    if take < rc.params.len() {
                        // Partial application: the remaining params close
                        // over the extended env; the self-reference is
                        // already materialized inside it.
                        return Ok(Value::Closure(Rc::new(ClosureValue {
                            params: rc.params[take..].to_vec(),
                            body: rc.body.clone(),
                            env,
                            self_name: None,
                        })));
                    }
                    f = self.eval(&rc.body.clone(), &env)?;
                }
                Value::Builtin(b) => {
                    let arity = b.builtin.def().arity;
                    let have = b.args.len();
                    debug_assert!(have < arity, "a saturated builtin is dispatched eagerly");
                    let need = arity - have;
                    let mut all = b.args;
                    if queue.len() < need {
                        all.extend(queue.drain(..));
                        return Ok(Value::Builtin(BuiltinValue {
                            builtin: b.builtin,
                            args: all,
                        }));
                    }
                    for _ in 0..need {
                        all.push(queue.pop_front().expect("need <= queue.len()"));
                    }
                    let literal = dm_literal && queue.is_empty();
                    f = prelude::dispatch(self, b.builtin, all, literal, span)?;
                }
                other => {
                    return Err(EvalError::eval(
                        format!("this value isn't callable: {}", value_kind(&other)),
                        span,
                    ));
                }
            }
        }
    }
}

fn value_kind(v: &Value) -> &'static str {
    match v {
        Value::Unit => "()",
        Value::Num(_) => "a Num",
        Value::Dec(_) => "a Dec",
        Value::Float(_) => "a Float",
        Value::Str(_) => "a Str",
        Value::Atom(_) => "an Atom",
        Value::Tuple(_) => "a tuple",
        Value::List(_) => "a list",
        Value::Dict(_) => "a dict",
        Value::Die(_) => "a die",
        Value::Pool(_) => "a pool",
        Value::Closure(_) | Value::Builtin(_) => "a function",
    }
}

fn internal_shape(what: &str, v: &Value) -> EvalError {
    EvalError::internal(format!(
        "cannot {what} {} — the checker should have rejected this",
        value_kind(v)
    ))
}

// -- die construction (D32-4 validity + D32-12 caps) ------------------------

fn eval_die(count: Option<&str>, sides: &str, span: Option<Span>) -> Result<Value, EvalError> {
    let sides_big: BigInt = sides
        .parse()
        .map_err(|_| EvalError::internal("bad die sides literal"))?;
    let sides = u64::try_from(&sides_big).map_err(|_| EvalError::fuel("die sides", span))?;
    if sides == 0 {
        return Err(EvalError::eval("a die needs at least 1 side", span));
    }
    let die = DieTree::Leaf { count: 1, sides };
    match count {
        None => Ok(Value::Die(die)),
        Some(c) => {
            let count_big: BigInt = c
                .parse()
                .map_err(|_| EvalError::internal("bad die count literal"))?;
            if count_big == BigInt::ZERO {
                return Err(EvalError::eval("a pool needs at least 1 die", span));
            }
            let count =
                u64::try_from(&count_big).map_err(|_| EvalError::fuel("pool count", span))?;
            Fuel::check_pool_count(count, span)?;
            Ok(Value::Pool(PoolTree {
                count,
                die: Box::new(die),
                keep: Vec::new(),
            }))
        }
    }
}

// -- patterns ---------------------------------------------------------------

fn bind_pattern(pat: &Pattern, v: Value, env: &Env) -> Result<Env, EvalError> {
    match pat {
        Pattern::Wildcard => Ok(env.clone()),
        Pattern::Ident(name) => Ok(env_bind(env, name.clone(), v)),
        Pattern::Tuple(ps) => match v {
            Value::Tuple(items) if items.len() == ps.len() => {
                let mut env = env.clone();
                for (p, item) in ps.iter().zip(items) {
                    env = bind_pattern(p, item, &env)?;
                }
                Ok(env)
            }
            other => Err(internal_shape("destructure", &other)),
        },
    }
}

fn match_pat(
    pat: &MatchPat,
    v: &Value,
    binds: &mut Vec<(String, Value)>,
    span: Option<Span>,
) -> Result<bool, EvalError> {
    match pat {
        MatchPat::Wildcard => Ok(true),
        MatchPat::Ident(name) => {
            binds.push((name.clone(), v.clone()));
            Ok(true)
        }
        MatchPat::Num { neg, digits } => {
            let mut n: BigInt = digits
                .parse()
                .map_err(|_| EvalError::internal("bad Num pattern"))?;
            if *neg {
                n = -n;
            }
            Ok(matches!(v, Value::Num(m) if *m == n))
        }
        MatchPat::Dec { neg, text } => {
            let mut d = dec_from_text(text, span)?;
            if *neg {
                d = -d;
            }
            Ok(matches!(v, Value::Dec(m) if *m == d))
        }
        MatchPat::Str(s) => Ok(matches!(v, Value::Str(m) if m == s)),
        MatchPat::Atom(name) => Ok(matches!(v, Value::Atom(m) if m == name)),
        MatchPat::Tuple(ps) => match v {
            Value::Tuple(items) if items.len() == ps.len() => {
                let checkpoint = binds.len();
                for (p, item) in ps.iter().zip(items) {
                    if !match_pat(p, item, binds, span)? {
                        binds.truncate(checkpoint);
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            _ => Ok(false),
        },
    }
}

// -- comparisons ------------------------------------------------------------

/// A die-arithmetic operand: a die stays a tree, anything else lifts to a
/// one-face constant.
fn die_operand(v: Value) -> Box<DieTree> {
    Box::new(match v {
        Value::Die(t) => t,
        other => DieTree::Const(Box::new(other)),
    })
}

pub(crate) fn cmp_values(
    op: CmpOp,
    l: Value,
    r: Value,
    span: Option<Span>,
) -> Result<Value, EvalError> {
    // ANY die operand lifts to Die[Bool] (D32-3).
    if matches!(l, Value::Die(_)) || matches!(r, Value::Die(_)) {
        return Ok(Value::Die(DieTree::Cmp {
            op,
            lhs: die_operand(l),
            rhs: die_operand(r),
        }));
    }
    match op {
        CmpOp::EqEq => Ok(Value::bool(l == r)),
        CmpOp::NotEq => Ok(Value::bool(l != r)),
        _ => {
            let ord = match (&l, &r) {
                (Value::Num(a), Value::Num(b)) => Some(a.cmp(b)),
                (Value::Dec(a), Value::Dec(b)) => Some(a.cmp(b)),
                // IEEE semantics: any comparison against NaN is false.
                (Value::Float(a), Value::Float(b)) => a.partial_cmp(b),
                (Value::Str(a), Value::Str(b)) => Some(a.cmp(b)),
                _ => return Err(internal_shape("order-compare", &l)),
            };
            let holds = match (op, ord) {
                (_, None) => false,
                (CmpOp::Lt, Some(o)) => o.is_lt(),
                (CmpOp::Le, Some(o)) => o.is_le(),
                (CmpOp::Gt, Some(o)) => o.is_gt(),
                (CmpOp::Ge, Some(o)) => o.is_ge(),
                _ => unreachable!("eq handled above"),
            };
            let _ = span;
            Ok(Value::bool(holds))
        }
    }
}

// -- arithmetic -------------------------------------------------------------

pub(crate) fn arith(op: BinOp, l: Value, r: Value, span: Option<Span>) -> Result<Value, EvalError> {
    use crate::value::{DEC_SCALE, dec_check, dec_check_big};
    if matches!(l, Value::Die(_)) || matches!(r, Value::Die(_)) {
        // die ⊗ die / die ⊗ const stays symbolic (D32-4). A CONSTANT zero
        // divisor is caught here; a zero inside a divisor die's support is
        // S4's check.
        if op == BinOp::Div && matches!(&r, Value::Num(n) if *n == BigInt::ZERO) {
            return Err(EvalError::eval("division by zero", span));
        }
        return Ok(Value::Die(DieTree::BinOp {
            op,
            lhs: die_operand(l),
            rhs: die_operand(r),
        }));
    }
    match (l, r) {
        (Value::Num(a), Value::Num(b)) => match op {
            BinOp::Add => Ok(Value::Num(a + b)),
            BinOp::Sub => Ok(Value::Num(a - b)),
            BinOp::Mul => Ok(Value::Num(a * b)),
            BinOp::Div => {
                if b == BigInt::ZERO {
                    return Err(EvalError::eval("division by zero", span));
                }
                // Num division truncates toward zero (documented).
                Ok(Value::Num(a / b))
            }
        },
        (Value::Dec(a), Value::Dec(b)) => match op {
            // |a|,|b| ≤ 10^25 so add/sub can't overflow i128; range-check
            // post-op (D32-1).
            BinOp::Add => Ok(Value::Dec(dec_check(a + b, span)?)),
            BinOp::Sub => Ok(Value::Dec(dec_check(a - b, span)?)),
            // Mul/Div intermediates need BigInt; truncation toward zero.
            BinOp::Mul => {
                let scaled = BigInt::from(a) * BigInt::from(b) / BigInt::from(DEC_SCALE);
                Ok(Value::Dec(dec_check_big(&scaled, span)?))
            }
            BinOp::Div => {
                if b == 0 {
                    return Err(EvalError::eval("division by zero", span));
                }
                let scaled = BigInt::from(a) * BigInt::from(DEC_SCALE) / BigInt::from(b);
                Ok(Value::Dec(dec_check_big(&scaled, span)?))
            }
        },
        (Value::Float(a), Value::Float(b)) => match op {
            BinOp::Add => Ok(Value::Float(a + b)),
            BinOp::Sub => Ok(Value::Float(a - b)),
            BinOp::Mul => Ok(Value::Float(a * b)),
            BinOp::Div => {
                // An exactly-zero Float divisor is a visible error too
                // (documented — no silent inf).
                if b == 0.0 {
                    return Err(EvalError::eval("division by zero", span));
                }
                Ok(Value::Float(a / b))
            }
        },
        (l, _) => Err(internal_shape("apply arithmetic to", &l)),
    }
}

// -- display rules (D32-7) --------------------------------------------------

/// Append a value's displays per D32-7: dice + scalars display; lists/
/// tuples flatten recursively (one display per displayable element);
/// Unit/closures/dicts/open-pools are silent.
pub fn append_display(cmd: &mut Cmd, v: &Value) {
    match v {
        Value::Die(t) => cmd.displays.push(DisplayItem {
            value: v.clone(),
            die: Some(t.clone()),
        }),
        Value::Num(_) | Value::Dec(_) | Value::Float(_) | Value::Str(_) | Value::Atom(_) => {
            cmd.displays.push(DisplayItem {
                value: v.clone(),
                die: None,
            });
        }
        Value::List(items) | Value::Tuple(items) => {
            for item in items {
                append_display(cmd, item);
            }
        }
        Value::Unit | Value::Dict(_) | Value::Pool(_) | Value::Closure(_) | Value::Builtin(_) => {}
    }
}

// ---------------------------------------------------------------------------
// Top-level drivers
// ---------------------------------------------------------------------------

/// Interpret an elaborated core tree (the pinned S3 entry point). Errors
/// carry the core's own spans; [`run`] is the full driver (saves, display
/// rules).
pub fn interp(core: &CoreExpr, env: &Env, fuel: &mut Fuel) -> Result<(Value, Cmd), EvalError> {
    let mut it = Interp::new(fuel);
    let value = it.eval(core, env)?;
    Ok((value, it.into_cmd()))
}

// ---------------------------------------------------------------------------
// Save serialization (R21)
// ---------------------------------------------------------------------------

/// Serialize a value to canonical re-parseable source (module docs).
pub fn serialize_value(v: &Value) -> Result<String, EvalError> {
    let mut ctx = SerCtx::default();
    let expr = value_to_expr(v, &mut ctx)?;
    Ok(crate::printer::print(&expr))
}

#[derive(Default)]
struct SerCtx {
    /// Closures currently being serialized — defensive function-valued
    /// capture cycle detection (impossible with immutable envs, but cheap).
    active: Vec<*const ClosureValue>,
}

fn value_to_expr(v: &Value, ctx: &mut SerCtx) -> Result<Expr, EvalError> {
    match v {
        Value::Unit => Ok(Expr::Unit),
        Value::Num(n) => Ok(num_expr(&n.to_string())),
        Value::Dec(d) => {
            if *d < 0 {
                Ok(Expr::Neg(Box::new(Expr::Dec(crate::value::dec_to_text(
                    -d,
                )))))
            } else {
                Ok(Expr::Dec(crate::value::dec_to_text(*d)))
            }
        }
        Value::Float(f) => {
            if !f.is_finite() {
                return Err(EvalError::eval("cannot serialize a non-finite Float", None));
            }
            // Rust's f64 Display is positional (never exponent) and
            // shortest-round-trip; the grammar needs digits on both sides
            // of the dot.
            let mut text = format!("{}", f.abs());
            if !text.contains('.') {
                text.push_str(".0");
            }
            let lit = Expr::Float(text);
            if f.is_sign_negative() {
                Ok(Expr::Neg(Box::new(lit)))
            } else {
                Ok(lit)
            }
        }
        Value::Str(s) => Ok(Expr::Str(s.clone())),
        Value::Atom(a) => Ok(Expr::Atom(a.clone())),
        Value::Tuple(items) => Ok(Expr::Tuple(
            items
                .iter()
                .map(|x| value_to_expr(x, ctx))
                .collect::<Result<_, _>>()?,
        )),
        Value::List(items) => Ok(Expr::List(
            items
                .iter()
                .map(|x| value_to_expr(x, ctx))
                .collect::<Result<_, _>>()?,
        )),
        Value::Dict(entries) => Ok(Expr::Dict(
            entries
                .iter()
                .map(|(k, val)| Ok((value_to_expr(k, ctx)?, value_to_expr(val, ctx)?)))
                .collect::<Result<_, EvalError>>()?,
        )),
        Value::Die(t) => die_tree_to_expr(t, ctx),
        Value::Pool(p) => pool_to_expr(p, ctx),
        Value::Closure(rc) => closure_to_expr(rc, ctx),
        Value::Builtin(b) => {
            let base = Expr::Ident(b.builtin.name().to_owned());
            if b.args.is_empty() {
                Ok(base)
            } else {
                Ok(Expr::Call {
                    callee: Box::new(base),
                    args: b
                        .args
                        .iter()
                        .map(|a| value_to_expr(a, ctx))
                        .collect::<Result<_, _>>()?,
                })
            }
        }
    }
}

fn num_expr(digits: &str) -> Expr {
    match digits.strip_prefix('-') {
        Some(mag) => Expr::Neg(Box::new(Expr::Num(mag.to_owned()))),
        None => Expr::Num(digits.to_owned()),
    }
}

fn call1(b: Builtin, a: Expr) -> Expr {
    Expr::Call {
        callee: Box::new(Expr::Ident(b.name().to_owned())),
        args: vec![a],
    }
}

fn call2(f: Builtin, a: Expr, b: Expr) -> Expr {
    Expr::Call {
        callee: Box::new(Expr::Ident(f.name().to_owned())),
        args: vec![a, b],
    }
}

fn die_tree_to_expr(t: &DieTree, ctx: &mut SerCtx) -> Result<Expr, EvalError> {
    match t {
        DieTree::Leaf { count, sides } => Ok(Expr::Die {
            count: (*count != 1).then(|| count.to_string()),
            sides: sides.to_string(),
            suffixes: Vec::new(),
        }),
        DieTree::Const(v) => value_to_expr(v, ctx),
        DieTree::Dl { faces } => Ok(call1(
            Builtin::Dl,
            Expr::List(
                faces
                    .iter()
                    .map(|f| value_to_expr(f, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        )),
        DieTree::Dm { faces } => Ok(call1(
            Builtin::Dm,
            Expr::Dict(
                faces
                    .iter()
                    .map(|(f, w)| Ok((value_to_expr(f, ctx)?, Expr::Num(w.to_string()))))
                    .collect::<Result<_, EvalError>>()?,
            ),
        )),
        DieTree::BinOp { op, lhs, rhs } => Ok(Expr::Binary {
            op: *op,
            lhs: Box::new(die_tree_to_expr(lhs, ctx)?),
            rhs: Box::new(die_tree_to_expr(rhs, ctx)?),
        }),
        DieTree::Cmp { op, lhs, rhs } => Ok(Expr::Cmp {
            first: Box::new(die_tree_to_expr(lhs, ctx)?),
            rest: vec![(*op, die_tree_to_expr(rhs, ctx)?)],
        }),
        DieTree::Neg(inner) => Ok(Expr::Neg(Box::new(die_tree_to_expr(inner, ctx)?))),
        DieTree::MinMax { op, lhs, rhs } => Ok(call2(
            match op {
                crate::value::MinMaxOp::Min => Builtin::Min,
                crate::value::MinMaxOp::Max => Builtin::Max,
            },
            die_tree_to_expr(lhs, ctx)?,
            die_tree_to_expr(rhs, ctx)?,
        )),
        DieTree::Explode { inner, depth } => Ok(call2(
            Builtin::Explode,
            die_tree_to_expr(inner, ctx)?,
            Expr::Num(depth.to_string()),
        )),
        DieTree::Reroll { inner, faces } => Ok(call2(
            Builtin::Reroll,
            die_tree_to_expr(inner, ctx)?,
            Expr::List(
                faces
                    .iter()
                    .map(|f| value_to_expr(f, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        )),
        DieTree::RerollFace { inner, face } => Ok(call2(
            Builtin::R,
            die_tree_to_expr(inner, ctx)?,
            num_expr(&face.to_string()),
        )),
        DieTree::Label { word, inner } => Ok(call2(
            Builtin::Label,
            die_tree_to_expr(inner, ctx)?,
            Expr::Atom(word.clone()),
        )),
        DieTree::Sum { pool } => Ok(call1(Builtin::Sum, pool_to_expr(pool, ctx)?)),
        DieTree::Successes { pool, target } => Ok(call2(
            Builtin::Successes,
            pool_to_expr(pool, ctx)?,
            num_expr(&target.to_string()),
        )),
        DieTree::Evaluate { pool, init, func } => Ok(Expr::Call {
            callee: Box::new(Expr::Ident(Builtin::Evaluate.name().to_owned())),
            args: vec![
                pool_to_expr(pool, ctx)?,
                value_to_expr(init, ctx)?,
                value_to_expr(func, ctx)?,
            ],
        }),
    }
}

fn pool_to_expr(p: &PoolTree, ctx: &mut SerCtx) -> Result<Expr, EvalError> {
    let mut expr = call2(
        Builtin::Pool,
        Expr::Num(p.count.to_string()),
        die_tree_to_expr(&p.die, ctx)?,
    );
    for k in &p.keep {
        expr = match k {
            Keep::High(n) => call2(Builtin::Kh, expr, Expr::Num(n.to_string())),
            Keep::Low(n) => call2(Builtin::Kl, expr, Expr::Num(n.to_string())),
        };
    }
    Ok(expr)
}

fn closure_to_expr(rc: &Rc<ClosureValue>, ctx: &mut SerCtx) -> Result<Expr, EvalError> {
    let ptr = Rc::as_ptr(rc);
    if ctx.active.contains(&ptr) {
        return Err(EvalError::eval(
            "cannot serialize a function that captures itself",
            None,
        ));
    }
    ctx.active.push(ptr);
    let result = closure_to_expr_inner(rc, ctx);
    ctx.active.pop();
    result
}

fn closure_to_expr_inner(rc: &Rc<ClosureValue>, ctx: &mut SerCtx) -> Result<Expr, EvalError> {
    // Free names of the body, minus params and the self-reference.
    let mut bound: Vec<String> = rc.params.clone();
    if let Some(self_name) = &rc.self_name {
        bound.push(self_name.clone());
    }
    let mut free = Vec::new();
    free_idents(&rc.body, &mut bound, &mut free);
    // Captures = free names resolvable in the captured env; the rest are
    // ambient prelude names (they don't serialize).
    let mut captures: Vec<(String, Value)> = Vec::new();
    for name in &free {
        if let Some(v) = env_lookup(&rc.env, name) {
            captures.push((name.clone(), v.clone()));
        } else if Builtin::from_name(name).is_none() {
            return Err(EvalError::internal(format!(
                "unserializable free name `{name}`"
            )));
        }
    }
    // Rename captures/params/self that collide with prelude names — the
    // body may contain checker-inserted `Prelude` references that print as
    // bare idents and must keep resolving ambiently on reload.
    let mut taken: Vec<String> = Vec::new();
    all_idents(&rc.body, &mut taken);
    taken.extend(rc.params.iter().cloned());
    taken.extend(captures.iter().map(|(n, _)| n.clone()));
    let mut renames: HashMap<String, String> = HashMap::new();
    let rename_if_prelude = |name: &str, taken: &mut Vec<String>| -> String {
        if Builtin::from_name(name).is_none() {
            return name.to_owned();
        }
        let mut i = 1;
        loop {
            let candidate = format!("{name}_{i}");
            if !taken.contains(&candidate) && Builtin::from_name(&candidate).is_none() {
                taken.push(candidate.clone());
                return candidate;
            }
            i += 1;
        }
    };
    let params: Vec<String> = rc
        .params
        .iter()
        .map(|p| {
            let new = rename_if_prelude(p, &mut taken);
            if new != *p {
                renames.insert(p.clone(), new.clone());
            }
            new
        })
        .collect();
    let self_name = rc.self_name.as_ref().map(|n| {
        let new = rename_if_prelude(n, &mut taken);
        if new != *n {
            renames.insert(n.clone(), new.clone());
        }
        new
    });
    let renamed_captures: Vec<(String, String, Value)> = captures
        .into_iter()
        .map(|(orig, v)| {
            let new = rename_if_prelude(&orig, &mut taken);
            if new != orig {
                renames.insert(orig.clone(), new.clone());
            }
            (orig, new, v)
        })
        .collect();
    // Convert the body, applying renames to free occurrences only.
    let mut shadow: Vec<String> = Vec::new();
    let body = core_to_expr(&rc.body, &renames, &mut shadow);
    // Assemble: enclosing lets for captures (first-use order), then the
    // lambda — or the LetFn + name form for a recursive function.
    let inner = match self_name {
        Some(name) => Expr::LetFn {
            name: name.clone(),
            params,
            annot: None,
            value: Box::new(body),
            body: Box::new(Expr::Ident(name)),
        },
        None => Expr::Lambda {
            params,
            body: Box::new(body),
        },
    };
    let mut expr = inner;
    for (_, new_name, v) in renamed_captures.into_iter().rev() {
        let value = value_to_expr(&v, ctx)?;
        expr = Expr::Let {
            pattern: Pattern::Ident(new_name),
            annot: None,
            value: Box::new(value),
            body: Box::new(expr),
        };
    }
    Ok(expr)
}

fn pattern_names(p: &Pattern, out: &mut Vec<String>) {
    match p {
        Pattern::Ident(n) => out.push(n.clone()),
        Pattern::Wildcard => {}
        Pattern::Tuple(ps) => ps.iter().for_each(|q| pattern_names(q, out)),
    }
}

fn match_pat_names(p: &MatchPat, out: &mut Vec<String>) {
    match p {
        MatchPat::Ident(n) => out.push(n.clone()),
        MatchPat::Tuple(ps) => ps.iter().for_each(|q| match_pat_names(q, out)),
        _ => {}
    }
}

/// Free identifiers of a body, in first-occurrence order. `bound` is the
/// initial binder set (mutated as a stack, restored on return).
fn free_idents(e: &CoreExpr, bound: &mut Vec<String>, out: &mut Vec<String>) {
    match &e.kind {
        CoreKind::Ident(n) => {
            if !bound.contains(n) && !out.contains(n) {
                out.push(n.clone());
            }
        }
        CoreKind::Let {
            pattern,
            value,
            body,
        } => {
            free_idents(value, bound, out);
            let mark = bound.len();
            pattern_names(pattern, bound);
            free_idents(body, bound, out);
            bound.truncate(mark);
        }
        CoreKind::LetFn {
            name,
            params,
            value,
            body,
        } => {
            let mark = bound.len();
            bound.push(name.clone());
            bound.extend(params.iter().cloned());
            free_idents(value, bound, out);
            bound.truncate(mark + 1); // keep `name` for the body
            free_idents(body, bound, out);
            bound.truncate(mark);
        }
        CoreKind::Match { scrutinee, arms } => {
            free_idents(scrutinee, bound, out);
            for (pat, body) in arms {
                let mark = bound.len();
                match_pat_names(pat, bound);
                free_idents(body, bound, out);
                bound.truncate(mark);
            }
        }
        CoreKind::Lambda { params, body } => {
            let mark = bound.len();
            bound.extend(params.iter().cloned());
            free_idents(body, bound, out);
            bound.truncate(mark);
        }
        CoreKind::Cmp { lhs, rhs, .. } | CoreKind::Binary { lhs, rhs, .. } => {
            free_idents(lhs, bound, out);
            free_idents(rhs, bound, out);
        }
        CoreKind::Neg(inner) | CoreKind::Label { expr: inner, .. } => {
            free_idents(inner, bound, out)
        }
        CoreKind::Call { callee, args, .. } => {
            free_idents(callee, bound, out);
            args.iter().for_each(|a| free_idents(a, bound, out));
        }
        CoreKind::List(items) | CoreKind::Tuple(items) => {
            items.iter().for_each(|x| free_idents(x, bound, out));
        }
        CoreKind::Dict(entries) => {
            for (k, v) in entries {
                free_idents(k, bound, out);
                free_idents(v, bound, out);
            }
        }
        CoreKind::Die { .. }
        | CoreKind::Num(_)
        | CoreKind::Dec(_)
        | CoreKind::Float(_)
        | CoreKind::Str(_)
        | CoreKind::Atom(_)
        | CoreKind::Unit
        | CoreKind::Prelude(_) => {}
    }
}

/// Every identifier appearing anywhere (referenced or bound) — the
/// freshness pool for capture renames (conservative superset).
fn all_idents(e: &CoreExpr, out: &mut Vec<String>) {
    match &e.kind {
        CoreKind::Ident(n) => out.push(n.clone()),
        CoreKind::Prelude(b) => out.push(b.name().to_owned()),
        CoreKind::Let {
            pattern,
            value,
            body,
        } => {
            pattern_names(pattern, out);
            all_idents(value, out);
            all_idents(body, out);
        }
        CoreKind::LetFn {
            name,
            params,
            value,
            body,
        } => {
            out.push(name.clone());
            out.extend(params.iter().cloned());
            all_idents(value, out);
            all_idents(body, out);
        }
        CoreKind::Match { scrutinee, arms } => {
            all_idents(scrutinee, out);
            for (pat, body) in arms {
                match_pat_names(pat, out);
                all_idents(body, out);
            }
        }
        CoreKind::Lambda { params, body } => {
            out.extend(params.iter().cloned());
            all_idents(body, out);
        }
        CoreKind::Cmp { lhs, rhs, .. } | CoreKind::Binary { lhs, rhs, .. } => {
            all_idents(lhs, out);
            all_idents(rhs, out);
        }
        CoreKind::Neg(inner) | CoreKind::Label { expr: inner, .. } => all_idents(inner, out),
        CoreKind::Call { callee, args, .. } => {
            all_idents(callee, out);
            args.iter().for_each(|a| all_idents(a, out));
        }
        CoreKind::List(items) | CoreKind::Tuple(items) => {
            items.iter().for_each(|x| all_idents(x, out));
        }
        CoreKind::Dict(entries) => {
            for (k, v) in entries {
                all_idents(k, out);
                all_idents(v, out);
            }
        }
        CoreKind::Die { .. }
        | CoreKind::Num(_)
        | CoreKind::Dec(_)
        | CoreKind::Float(_)
        | CoreKind::Str(_)
        | CoreKind::Atom(_)
        | CoreKind::Unit => {}
    }
}

/// Convert a spanned core body back to a printable AST, applying `renames`
/// to FREE occurrences only (`shadow` tracks binders of the ORIGINAL names
/// so shadowed occurrences stay untouched).
fn core_to_expr(e: &CoreExpr, renames: &HashMap<String, String>, shadow: &mut Vec<String>) -> Expr {
    match &e.kind {
        CoreKind::Ident(n) => {
            if !shadow.contains(n)
                && let Some(new) = renames.get(n)
            {
                return Expr::Ident(new.clone());
            }
            Expr::Ident(n.clone())
        }
        CoreKind::Prelude(b) => Expr::Ident(b.name().to_owned()),
        CoreKind::Let {
            pattern,
            value,
            body,
        } => {
            let value = core_to_expr(value, renames, shadow);
            let mark = shadow.len();
            pattern_names(pattern, shadow);
            let body = core_to_expr(body, renames, shadow);
            shadow.truncate(mark);
            Expr::Let {
                pattern: pattern.clone(),
                annot: None,
                value: Box::new(value),
                body: Box::new(body),
            }
        }
        CoreKind::LetFn {
            name,
            params,
            value,
            body,
        } => {
            let mark = shadow.len();
            shadow.push(name.clone());
            shadow.extend(params.iter().cloned());
            let value = core_to_expr(value, renames, shadow);
            shadow.truncate(mark + 1);
            let body = core_to_expr(body, renames, shadow);
            shadow.truncate(mark);
            Expr::LetFn {
                name: name.clone(),
                params: params.clone(),
                annot: None,
                value: Box::new(value),
                body: Box::new(body),
            }
        }
        CoreKind::Match { scrutinee, arms } => Expr::Match {
            scrutinee: Box::new(core_to_expr(scrutinee, renames, shadow)),
            arms: arms
                .iter()
                .map(|(pat, body)| {
                    let mark = shadow.len();
                    match_pat_names(pat, shadow);
                    let body = core_to_expr(body, renames, shadow);
                    shadow.truncate(mark);
                    (pat.clone(), body)
                })
                .collect(),
        },
        CoreKind::Lambda { params, body } => {
            let mark = shadow.len();
            shadow.extend(params.iter().cloned());
            let body = core_to_expr(body, renames, shadow);
            shadow.truncate(mark);
            Expr::Lambda {
                params: params.clone(),
                body: Box::new(body),
            }
        }
        CoreKind::Cmp { op, lhs, rhs } => Expr::Cmp {
            first: Box::new(core_to_expr(lhs, renames, shadow)),
            rest: vec![(*op, core_to_expr(rhs, renames, shadow))],
        },
        CoreKind::Binary { op, lhs, rhs } => Expr::Binary {
            op: *op,
            lhs: Box::new(core_to_expr(lhs, renames, shadow)),
            rhs: Box::new(core_to_expr(rhs, renames, shadow)),
        },
        CoreKind::Neg(inner) => Expr::Neg(Box::new(core_to_expr(inner, renames, shadow))),
        CoreKind::Call { callee, args, .. } => Expr::Call {
            callee: Box::new(core_to_expr(callee, renames, shadow)),
            args: args
                .iter()
                .map(|a| core_to_expr(a, renames, shadow))
                .collect(),
        },
        CoreKind::Label { expr, word } => Expr::Label {
            expr: Box::new(core_to_expr(expr, renames, shadow)),
            word: word.clone(),
        },
        CoreKind::Die { count, sides } => Expr::Die {
            count: count.clone(),
            sides: sides.clone(),
            suffixes: Vec::new(),
        },
        CoreKind::Num(s) => Expr::Num(s.clone()),
        CoreKind::Dec(s) => Expr::Dec(s.clone()),
        CoreKind::Float(s) => Expr::Float(s.clone()),
        CoreKind::Str(s) => Expr::Str(s.clone()),
        CoreKind::Atom(s) => Expr::Atom(s.clone()),
        CoreKind::Unit => Expr::Unit,
        CoreKind::List(items) => Expr::List(
            items
                .iter()
                .map(|x| core_to_expr(x, renames, shadow))
                .collect(),
        ),
        CoreKind::Tuple(items) => Expr::Tuple(
            items
                .iter()
                .map(|x| core_to_expr(x, renames, shadow))
                .collect(),
        ),
        CoreKind::Dict(entries) => Expr::Dict(
            entries
                .iter()
                .map(|(k, v)| {
                    (
                        core_to_expr(k, renames, shadow),
                        core_to_expr(v, renames, shadow),
                    )
                })
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::ErrorKind;
    use num_bigint::BigInt;

    fn run_src(src: &str) -> Result<RunOutput, RunError> {
        let mut fuel = Fuel::default();
        run(src, &[], &mut fuel)
    }

    fn value_of(src: &str) -> Value {
        match run_src(src) {
            Ok(out) => out.value,
            Err(e) => panic!("expected `{src}` to run, got {e:?}"),
        }
    }

    fn eval_err(src: &str) -> EvalError {
        match run_src(src) {
            Err(RunError::Eval(e)) => e,
            other => panic!("expected an eval error for `{src}`, got {other:?}"),
        }
    }

    fn num(n: i64) -> Value {
        Value::num_i64(n)
    }

    fn atom(s: &str) -> Value {
        Value::Atom(s.to_owned())
    }

    fn leaf(count: u64, sides: u64) -> DieTree {
        DieTree::Leaf { count, sides }
    }

    /// Apply a (closure) value outside any source program.
    fn apply_value(f: &Value, args: Vec<Value>) -> Result<Value, EvalError> {
        let mut fuel = Fuel::default();
        let mut it = Interp::new(&mut fuel);
        it.apply(f.clone(), args, false, None)
    }

    // -- semantics ----------------------------------------------------------

    #[test]
    fn arithmetic_precedence_and_bigints() {
        assert_eq!(value_of("1 + 2 * 3"), num(7));
        assert_eq!(
            value_of("1000000000000000000000 * 1000000000000000000000"),
            Value::Num(
                "1000000000000000000000000000000000000000000"
                    .parse()
                    .unwrap()
            )
        );
    }

    #[test]
    fn num_division_truncates_toward_zero() {
        assert_eq!(value_of("7 / 2"), num(3));
        assert_eq!(value_of("(0 - 7) / 2"), num(-3));
    }

    #[test]
    fn division_by_zero_is_an_eval_error_with_span() {
        let e = eval_err("10 / 0");
        assert_eq!(e.kind, ErrorKind::Eval);
        assert!(e.message.contains("division by zero"));
        assert_eq!(e.span, Some((0, 6)));
    }

    #[test]
    fn dec_arithmetic_is_fixed_point() {
        assert_eq!(value_of("1.5 + 2.25"), Value::Dec(3_750_000));
        assert_eq!(value_of("1.5 * 2.0"), Value::Dec(3_000_000));
        assert_eq!(value_of("1.0 / 3.0"), Value::Dec(333_333)); // truncates
        let e = eval_err("1.0 / 0.0");
        assert!(e.message.contains("division by zero"));
    }

    #[test]
    fn dec_range_is_checked_post_op() {
        let e = eval_err("9000000000000000000.0 * 9000000000000000000.0");
        assert_eq!(e.kind, ErrorKind::Eval);
        assert!(e.message.contains("range"));
    }

    #[test]
    fn float_arithmetic_and_zero_divisor() {
        assert_eq!(value_of("1.5f * 2.0f"), Value::Float(3.0));
        let e = eval_err("1.0f / 0.0f");
        assert!(e.message.contains("division by zero"));
    }

    #[test]
    fn currying_and_partial_application() {
        assert_eq!(value_of("let add = |a, b| a + b; add(1)(41)"), num(42));
        assert_eq!(
            value_of("let add = |a, b| a + b; let inc = add(1); inc(41)"),
            num(42)
        );
    }

    #[test]
    fn over_application_re_applies() {
        assert_eq!(value_of("let f = |a| |b| a + b; f(1, 2)"), num(3));
    }

    #[test]
    fn match_tuple_destructure_and_negative_patterns() {
        assert_eq!(
            value_of("match {1, 0 - 2} | {1, -2} -> :hit | _ -> :miss"),
            atom("hit")
        );
        assert_eq!(
            value_of("match 0.0 - 1.5 | -1.5 -> :yes | _ -> :no"),
            atom("yes")
        );
    }

    #[test]
    fn match_binders_bind() {
        assert_eq!(value_of("match 5 | n -> n + 1"), num(6));
        assert_eq!(value_of("match {1, 2} | {a, b} -> a + b"), num(3));
    }

    #[test]
    fn letfn_recursion_works() {
        assert_eq!(
            value_of("let fact(n) = match n | 0 -> 1 | m -> m * fact(m - 1); fact(5)"),
            num(120)
        );
    }

    #[test]
    fn partial_application_of_a_recursive_fn_keeps_the_self_reference() {
        assert_eq!(
            value_of(
                "let go(a, n) = match n | 0 -> a | m -> go(a + m, m - 1); \
                 let from = go(0); from(4)"
            ),
            num(10)
        );
    }

    #[test]
    fn closures_capture_by_value_snapshots() {
        // Later rebinding must not affect the captured value.
        assert_eq!(
            value_of("let x = 1; let f = |y| x + y; let x = 10; f(5)"),
            num(6)
        );
    }

    #[test]
    fn plain_let_lambda_is_not_recursive_but_capture_chains_work() {
        // Mutual-recursion-via-capture attempt: g captures the PRIOR f.
        assert_eq!(
            value_of("let f = |x| x + 1; let g = |x| f(x) * 2; let f = |x| g(x); f(3)"),
            num(8)
        );
    }

    #[test]
    fn string_and_scalar_comparisons() {
        assert_eq!(value_of("\"abc\" < \"abd\""), Value::bool(true));
        assert_eq!(value_of("3 > 2"), Value::bool(true));
        assert_eq!(value_of("1.5 <= 1.5"), Value::bool(true));
        assert_eq!(value_of("2.0f > 3.0f"), Value::bool(false));
    }

    #[test]
    fn structural_equality_on_dicts_is_order_insensitive() {
        assert_eq!(value_of("[1: 2, 3: 4] == [3: 4, 1: 2]"), Value::bool(true));
        assert_eq!(value_of("[1: 2] != [1: 3]"), Value::bool(true));
    }

    #[test]
    fn dict_literals_keep_first_position_on_duplicate_keys() {
        assert_eq!(value_of("[1: 2, 1: 9] == [1: 9]"), Value::bool(true));
    }

    // -- dice ---------------------------------------------------------------

    #[test]
    fn bare_die_and_pool_sum_collapse() {
        assert_eq!(value_of("d6"), Value::Die(leaf(1, 6)));
        // Top-level open pool auto-sums (D32-7) and collapses to a leaf.
        assert_eq!(value_of("2d6"), Value::Die(leaf(2, 6)));
    }

    #[test]
    fn kept_pool_builds_the_pinned_shape() {
        let expected = Value::Die(DieTree::Sum {
            pool: PoolTree {
                count: 4,
                die: Box::new(leaf(1, 6)),
                keep: vec![Keep::High(3)],
            },
        });
        assert_eq!(value_of("4d6kh3"), expected);
    }

    #[test]
    fn die_arithmetic_stays_symbolic() {
        let expected = Value::Die(DieTree::BinOp {
            op: BinOp::Add,
            lhs: Box::new(DieTree::Sum {
                pool: PoolTree {
                    count: 2,
                    die: Box::new(leaf(1, 20)),
                    keep: vec![Keep::High(1)],
                },
            }),
            rhs: Box::new(DieTree::Const(Box::new(num(7)))),
        });
        assert_eq!(value_of("2d20kh1 + 7"), expected);
    }

    #[test]
    fn lifted_comparison_builds_a_cmp_tree() {
        let expected = Value::Die(DieTree::Cmp {
            op: CmpOp::Ge,
            lhs: Box::new(leaf(1, 20)),
            rhs: Box::new(DieTree::Const(Box::new(num(15)))),
        });
        assert_eq!(value_of("d20 >= 15"), expected);
    }

    #[test]
    fn labels_wrap_the_summed_tree() {
        let expected = Value::Die(DieTree::Label {
            word: "fire".to_owned(),
            inner: Box::new(leaf(2, 8)),
        });
        assert_eq!(value_of("2d8[fire]"), expected);
    }

    #[test]
    fn negating_a_die_stays_symbolic() {
        assert_eq!(
            value_of("-d6"),
            Value::Die(DieTree::Neg(Box::new(leaf(1, 6))))
        );
    }

    #[test]
    fn die_suffix_chain_elaboration_evaluates() {
        // 4d6e2kh3 = kh(pool(4, explode(d6, 2)), 3), then top-level sum.
        let expected = Value::Die(DieTree::Sum {
            pool: PoolTree {
                count: 4,
                die: Box::new(DieTree::Explode {
                    inner: Box::new(leaf(1, 6)),
                    depth: 2,
                }),
                keep: vec![Keep::High(3)],
            },
        });
        assert_eq!(value_of("4d6e2kh3"), expected);
    }

    #[test]
    fn construction_validity_is_a_visible_eval_error_with_the_die_span() {
        let e = eval_err("1 + 0d6");
        assert_eq!(e.kind, ErrorKind::Eval);
        assert!(e.message.contains("at least 1 die"));
        assert_eq!(e.span, Some((4, 7)));
        let e = eval_err("d0");
        assert!(e.message.contains("at least 1 side"));
        assert_eq!(e.span, Some((0, 2)));
    }

    #[test]
    fn keep_bounds_are_validated() {
        let e = eval_err("2d6kh3");
        assert!(e.message.contains("only has 2"));
        let e = eval_err("2d6kh0");
        assert!(e.message.contains("at least 1"));
    }

    #[test]
    fn dm_face_order_literal_vs_sorted() {
        let literal = value_of("dm([:b: 1, :a: 2])");
        match literal {
            Value::Die(DieTree::Dm { faces }) => {
                let names: Vec<_> = faces.iter().map(|(f, _)| f.clone()).collect();
                assert_eq!(names, vec![atom("b"), atom("a")]);
            }
            other => panic!("expected a dm die, got {other:?}"),
        }
        let sorted = value_of("let d = [:b: 1, :a: 2]; dm(d)");
        match sorted {
            Value::Die(DieTree::Dm { faces }) => {
                let names: Vec<_> = faces.iter().map(|(f, _)| f.clone()).collect();
                assert_eq!(names, vec![atom("a"), atom("b")]);
            }
            other => panic!("expected a dm die, got {other:?}"),
        }
    }

    #[test]
    fn dm_weights_must_be_positive() {
        let e = eval_err("dm([:a: 0])");
        assert!(e.message.contains("at least 1"));
    }

    #[test]
    fn dl_validity_and_order() {
        let e = eval_err("dl([])");
        assert!(e.message.contains("at least one face"));
        let e = eval_err("dl([|x| x])");
        assert!(e.message.contains("function-free"));
        match value_of("dl([:fine, :good, :fine])") {
            Value::Die(DieTree::Dl { faces }) => {
                assert_eq!(faces, vec![atom("fine"), atom("good"), atom("fine")]);
            }
            other => panic!("expected a dl die, got {other:?}"),
        }
    }

    #[test]
    fn evaluate_builds_a_symbolic_node() {
        let out = run_src("evaluate(3d6, 0, |s, f, n| s + f * n)").unwrap();
        match &out.value {
            Value::Die(DieTree::Evaluate { pool, init, .. }) => {
                assert_eq!(pool.count, 3);
                assert_eq!(**init, num(0));
            }
            other => panic!("expected an evaluate die, got {other:?}"),
        }
        assert_eq!(out.cmd.displays.len(), 1);
    }

    #[test]
    fn min_max_on_nums_and_dice() {
        assert_eq!(value_of("min(2, 3)"), num(2));
        assert_eq!(value_of("max(2, 3)"), num(3));
        assert_eq!(
            value_of("min(d6, 3)"),
            Value::Die(DieTree::MinMax {
                op: crate::value::MinMaxOp::Min,
                lhs: Box::new(leaf(1, 6)),
                rhs: Box::new(DieTree::Const(Box::new(num(3)))),
            })
        );
    }

    #[test]
    fn successes_builds_a_dedicated_node() {
        assert_eq!(
            value_of("successes(5d10, 8)"),
            Value::Die(DieTree::Successes {
                pool: PoolTree {
                    count: 5,
                    die: Box::new(leaf(1, 10)),
                    keep: vec![],
                },
                target: BigInt::from(8),
            })
        );
    }

    #[test]
    fn reroll_and_r_build_tree_nodes() {
        assert_eq!(
            value_of("reroll(d6, [1, 2])"),
            Value::Die(DieTree::Reroll {
                inner: Box::new(leaf(1, 6)),
                faces: vec![num(1), num(2)],
            })
        );
        assert_eq!(
            value_of("2d6r1"),
            Value::Die(DieTree::Sum {
                pool: PoolTree {
                    count: 2,
                    die: Box::new(DieTree::RerollFace {
                        inner: Box::new(leaf(1, 6)),
                        face: BigInt::from(1),
                    }),
                    keep: vec![],
                },
            })
        );
    }

    #[test]
    fn conversions_num_round_floor_ceil_abs() {
        assert_eq!(value_of("num(1.9)"), num(1)); // truncates toward zero
        assert_eq!(value_of("num(0.0 - 1.9)"), num(-1));
        assert_eq!(value_of("round(2.5)"), num(3)); // half away from zero
        assert_eq!(value_of("round(0.0 - 2.5)"), num(-3));
        assert_eq!(value_of("floor(0.0 - 1.2)"), num(-2));
        assert_eq!(value_of("ceil(1.2)"), num(2));
        assert_eq!(value_of("abs(0 - 5)"), num(5));
        assert_eq!(value_of("abs(0.0 - 1.5)"), Value::Dec(1_500_000));
        assert_eq!(value_of("dec(3)"), Value::Dec(3_000_000));
        assert_eq!(value_of("float(3)"), Value::Float(3.0));
        assert_eq!(value_of("float(1.5)"), Value::Float(1.5));
    }

    // -- fuel ---------------------------------------------------------------

    #[test]
    fn step_budget_exhaustion() {
        let mut fuel = Fuel::new(2);
        let err = match run("1 + 2 * 3", &[], &mut fuel) {
            Err(RunError::Eval(e)) => e,
            other => panic!("expected fuel exhaustion, got {other:?}"),
        };
        assert_eq!(err.kind, ErrorKind::Fuel);
        assert!(err.message.contains("interpreter steps"));
    }

    /// Deep-recursion tests run on a dedicated big-stack thread: reaching
    /// the 256 depth cap needs ~256 debug-build `eval` frames, which
    /// overflows libtest's default 2 MiB thread stack before the cap fires
    /// (release/wasm frames are far smaller; S5 sizes the wasm stack, and
    /// the parser's nesting cap keeps paren bombs out entirely).
    fn on_big_stack<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
        std::thread::Builder::new()
            .stack_size(32 * 1024 * 1024)
            .spawn(f)
            .expect("spawn test thread")
            .join()
            .expect("deep-recursion test thread panicked")
    }

    #[test]
    fn infinite_recursion_hits_the_depth_cap() {
        let e = on_big_stack(|| eval_err("let f(x) = f(x); f(1)"));
        assert_eq!(e.kind, ErrorKind::Fuel);
        assert!(e.message.contains("recursion depth"));
    }

    #[test]
    fn nested_paren_bomb_is_rejected_before_evaluation() {
        // The parser's nesting cap stops it: every stage recurses on the tree,
        // so a bomb must never reach one (it would overflow the host stack).
        let mut src = "1".to_owned();
        for _ in 0..300 {
            src = format!("(1+{src})");
        }
        match run_src(&src) {
            Err(RunError::Check(e)) => {
                assert!(e.message.contains("too deeply nested"), "{e:?}");
            }
            other => panic!("expected a nesting rejection, got {other:?}"),
        }
    }

    #[test]
    fn giant_pool_counts_are_fuel_errors() {
        let e = eval_err("20000d6");
        assert_eq!(e.kind, ErrorKind::Fuel);
        assert!(e.message.contains("pool count"));
        let e = eval_err("pool(20000, d6)");
        assert_eq!(e.kind, ErrorKind::Fuel);
        assert!(e.message.contains("pool count"));
    }

    #[test]
    fn explode_depth_cap_both_paths() {
        for src in ["explode(d6, 9)", "d6e9"] {
            let e = eval_err(src);
            assert_eq!(e.kind, ErrorKind::Fuel, "{src}");
            assert!(e.message.contains("explode depth"), "{src}");
        }
        assert!(run_src("explode(d6, 8)").is_ok());
    }

    // -- effects + display rules --------------------------------------------

    #[test]
    fn roll_is_variadic_and_appends_displays() {
        let out = run_src("roll(d6, 5)").unwrap();
        assert_eq!(out.value, Value::Unit);
        assert_eq!(out.cmd.displays.len(), 2); // Unit result is silent
        assert_eq!(out.cmd.displays[0].die, Some(leaf(1, 6)));
        assert_eq!(out.cmd.displays[1].value, num(5));
        assert!(out.cmd.displays[1].die.is_none());
    }

    #[test]
    fn roll_first_class_is_unary() {
        let out = run_src("let f = roll; f(7)").unwrap();
        assert_eq!(out.cmd.displays.len(), 1);
        assert_eq!(out.cmd.displays[0].value, num(7));
    }

    #[test]
    fn plot_accumulates_die_trees() {
        let out = run_src("plot(d20)").unwrap();
        assert_eq!(out.cmd.plots, vec![leaf(1, 20)]);
        assert!(out.cmd.displays.is_empty());
    }

    #[test]
    fn final_display_flattens_lists_and_tuples() {
        let out = run_src("{1, [2, 3]}").unwrap();
        let shown: Vec<Value> = out.cmd.displays.iter().map(|d| d.value.clone()).collect();
        assert_eq!(shown, vec![num(1), num(2), num(3)]);
    }

    #[test]
    fn units_and_closures_display_silently() {
        assert!(run_src("()").unwrap().cmd.displays.is_empty());
        assert!(run_src("|x| x").unwrap().cmd.displays.is_empty());
        assert!(run_src("[:]").unwrap().cmd.displays.is_empty());
    }

    #[test]
    fn effect_guard_blocks_effects_inside_evaluator_steps() {
        for src in [
            "|s, f, n| roll(s)",
            "|s, f, n| plot(d6)",
            "|s, f, n| save(:x, s)",
        ] {
            let out = run_src(src).unwrap();
            let mut fuel = Fuel::default();
            let mut it = Interp::new(&mut fuel);
            let err = it
                .run_evaluator_step(&out.value, &num(1), &num(2), 3)
                .unwrap_err();
            assert_eq!(err.message, "effect inside evaluate()", "{src}");
            assert_eq!(err.kind, ErrorKind::Eval);
        }
    }

    #[test]
    fn evaluator_steps_apply_the_transition() {
        let out = run_src("|s, f, n| s + f * n").unwrap();
        let mut fuel = Fuel::default();
        let mut it = Interp::new(&mut fuel);
        let v = it
            .run_evaluator_step(&out.value, &num(1), &num(2), 3)
            .unwrap();
        assert_eq!(v, num(7));
        // The guard disarms once the step returns.
        assert!(it.effect_guard(None).is_ok());
    }

    // -- saves (R21 + D32-19) -----------------------------------------------

    #[test]
    fn save_rejects_kebab_names() {
        let src = "save(:my-macro, 1)";
        let e = eval_err(src);
        assert_eq!(e.kind, ErrorKind::Eval);
        assert!(e.message.contains(":my-macro"));
        assert_eq!(e.span, Some((0, src.len())));
    }

    #[test]
    fn saves_load_into_the_environment() {
        let saves = vec![
            ("bonus".to_owned(), "3".to_owned()),
            ("smite".to_owned(), "|x| x + bonus".to_owned()),
        ];
        let mut fuel = Fuel::default();
        let out = run("smite(2)", &saves, &mut fuel).unwrap();
        assert_eq!(out.value, num(5));
    }

    #[test]
    fn saved_functions_are_suffix_eligible() {
        let saves = vec![("myk".to_owned(), "|p, n| kh(p, n)".to_owned())];
        let mut fuel = Fuel::default();
        let out = run("4d6myk3", &saves, &mut fuel).unwrap();
        assert_eq!(
            out.value,
            Value::Die(DieTree::Sum {
                pool: PoolTree {
                    count: 4,
                    die: Box::new(leaf(1, 6)),
                    keep: vec![Keep::High(3)],
                },
            })
        );
    }

    #[test]
    fn a_stale_save_aborts_with_its_name() {
        let saves = vec![("bad".to_owned(), "1 +".to_owned())];
        let mut fuel = Fuel::default();
        match run("1", &saves, &mut fuel) {
            Err(RunError::Save { name, .. }) => assert_eq!(name, "bad"),
            other => panic!("expected a save error, got {other:?}"),
        }
    }

    #[test]
    fn save_evaluation_effects_are_discarded() {
        let saves = vec![("noisy".to_owned(), "roll(9)".to_owned())];
        let mut fuel = Fuel::default();
        let out = run("1", &saves, &mut fuel).unwrap();
        assert_eq!(out.cmd.displays.len(), 1); // only the main script's
        assert_eq!(out.cmd.displays[0].value, num(1));
    }

    // -- serialization goldens ----------------------------------------------

    #[test]
    fn literal_serialization_goldens() {
        assert_eq!(serialize_value(&num(5)).unwrap(), "5");
        assert_eq!(serialize_value(&num(-3)).unwrap(), "-3");
        assert_eq!(serialize_value(&Value::Dec(1_500_000)).unwrap(), "1.5");
        assert_eq!(serialize_value(&Value::Dec(-500_000)).unwrap(), "-0.5");
        assert_eq!(serialize_value(&Value::Float(2.5)).unwrap(), "2.5f");
        assert_eq!(serialize_value(&Value::Float(3.0)).unwrap(), "3.0f");
        assert_eq!(serialize_value(&Value::Float(1e-7)).unwrap(), "0.0000001f");
        assert_eq!(
            serialize_value(&Value::Str("a\"b\n".to_owned())).unwrap(),
            "\"a\\\"b\\n\""
        );
        assert_eq!(serialize_value(&atom("fire")).unwrap(), ":fire");
        assert_eq!(serialize_value(&Value::Unit).unwrap(), "()");
        assert!(serialize_value(&Value::Float(f64::INFINITY)).is_err());
    }

    #[test]
    fn container_serialization_goldens() {
        assert_eq!(
            serialize_value(&Value::List(vec![num(1), num(2)])).unwrap(),
            "[1, 2]"
        );
        assert_eq!(
            serialize_value(&Value::Tuple(vec![num(1), atom("a")])).unwrap(),
            "{1, :a}"
        );
        assert_eq!(
            serialize_value(&Value::Dict(vec![(atom("a"), num(1))])).unwrap(),
            "[:a: 1]"
        );
    }

    #[test]
    fn die_tree_serialization_golden_via_save() {
        let out = run_src("save(:x, 4d6kh3)").unwrap();
        assert_eq!(out.cmd.saves.len(), 1);
        assert_eq!(out.cmd.saves[0].name, "x");
        assert_eq!(out.cmd.saves[0].source, "kh(pool(4, d6), 3)");
    }

    #[test]
    fn open_pool_serialization_golden() {
        let out = run_src("save(:p, 4d6)").unwrap();
        assert_eq!(out.cmd.saves[0].source, "pool(4, d6)");
    }

    #[test]
    fn capturing_closure_serialization_golden() {
        let out = run_src("let bonus = 3; save(:smite, |x| x + bonus)").unwrap();
        assert_eq!(out.cmd.saves[0].source, "let bonus = 3; |x| x + bonus");
    }

    #[test]
    fn recursive_fn_serialization_golden() {
        let out = run_src("let fact(n) = match n | 0 -> 1 | m -> m * fact(m - 1); save(:f, fact)")
            .unwrap();
        assert_eq!(
            out.cmd.saves[0].source,
            "let fact(n) = match n | 0 -> 1 | m -> m * fact(m - 1); fact"
        );
    }

    #[test]
    fn nested_capture_serialization_golden() {
        let out =
            run_src("let a = 1; let g = |y| y + a; let h = |z| g(z) * 2; save(:h, h)").unwrap();
        assert_eq!(
            out.cmd.saves[0].source,
            "let g = let a = 1; |y| y + a; |z| g(z) * 2"
        );
    }

    #[test]
    fn prelude_colliding_captures_are_renamed() {
        // The body carries a checker-inserted `sum` that prints as a bare
        // ident — the user's `sum` binding must not re-capture it.
        let out = run_src("let sum = 5; save(:f, |p| 2d6kh1 + sum)").unwrap();
        assert_eq!(
            out.cmd.saves[0].source,
            "let sum_1 = 5; |p| sum(kh(pool(2, d6), 1)) + sum_1"
        );
    }

    #[test]
    fn builtin_values_serialize_ambient_or_partial() {
        let out = run_src("let f = kh; save(:g, f)").unwrap();
        assert_eq!(out.cmd.saves[0].source, "kh");
        let out = run_src("save(:g, kh(4d6))").unwrap();
        assert_eq!(out.cmd.saves[0].source, "kh(pool(4, d6))");
    }

    // -- serialization round-trips (behavioral) -----------------------------

    #[test]
    fn round_trip_capturing_closure_behaves_identically() {
        let out = run_src("let bonus = 3; save(:f, |x| x + bonus)").unwrap();
        let reloaded = value_of(&out.cmd.saves[0].source);
        assert_eq!(apply_value(&reloaded, vec![num(2)]).unwrap(), num(5));
    }

    #[test]
    fn round_trip_nested_captures_behave_identically() {
        let out =
            run_src("let a = 1; let g = |y| y + a; let h = |z| g(z) * 2; save(:f, h)").unwrap();
        let reloaded = value_of(&out.cmd.saves[0].source);
        assert_eq!(apply_value(&reloaded, vec![num(4)]).unwrap(), num(10));
    }

    #[test]
    fn round_trip_recursive_fn_self_reference_survives() {
        let out = run_src("let fact(n) = match n | 0 -> 1 | m -> m * fact(m - 1); save(:f, fact)")
            .unwrap();
        let reloaded = value_of(&out.cmd.saves[0].source);
        assert_eq!(apply_value(&reloaded, vec![num(6)]).unwrap(), num(720));
    }

    #[test]
    fn round_trip_renamed_capture_behaves_identically() {
        let out = run_src("let sum = 5; save(:f, |p| 2d6kh1 + sum)").unwrap();
        let reloaded = value_of(&out.cmd.saves[0].source);
        let applied = apply_value(&reloaded, vec![num(0)]).unwrap();
        let expected = Value::Die(DieTree::BinOp {
            op: BinOp::Add,
            lhs: Box::new(DieTree::Sum {
                pool: PoolTree {
                    count: 2,
                    die: Box::new(leaf(1, 6)),
                    keep: vec![Keep::High(1)],
                },
            }),
            rhs: Box::new(DieTree::Const(Box::new(num(5)))),
        });
        assert_eq!(applied, expected);
    }

    #[test]
    fn round_trip_die_tree_value_is_structurally_stable() {
        let out = run_src("save(:x, 4d6kh3)").unwrap();
        // Reloading the pool source at top level closes it with sum
        // (documented limitation) — the SUMMED trees must agree.
        let reloaded = value_of(&out.cmd.saves[0].source);
        assert_eq!(reloaded, value_of("4d6kh3"));
    }

    // -- the bare interp() entry point --------------------------------------

    #[test]
    fn interp_runs_an_elaborated_core_directly() {
        let (core, _ty) = crate::infer::check_source("1 + 2 * 3", &[]).unwrap();
        let mut fuel = Fuel::default();
        let (v, cmd) = interp(&core, &env_nil(), &mut fuel).unwrap();
        assert_eq!(v, num(7));
        assert_eq!(cmd, Cmd::default());
    }

    #[test]
    fn interp_errors_carry_the_core_spans() {
        let (core, _ty) = crate::infer::check_source("1 / 0", &[]).unwrap();
        let mut fuel = Fuel::default();
        let e = interp(&core, &env_nil(), &mut fuel).unwrap_err();
        assert_eq!(e.span, Some((0, 5)));
        assert_eq!(e.kind, ErrorKind::Eval);
    }

    // -- polymorphic saves reuse --------------------------------------------

    #[test]
    fn let_generalization_holds_at_runtime() {
        let out = run_src("let id = |x| x; {id(1), id(:a)}").unwrap();
        assert_eq!(out.value, Value::Tuple(vec![num(1), atom("a")]));
        assert_eq!(out.cmd.displays.len(), 2);
    }
}
