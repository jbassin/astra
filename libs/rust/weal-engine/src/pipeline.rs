//! The one compile-and-run pipeline: parse → lower → check → eval.
//!
//! Every entry point that turns source text into a checked or evaluated
//! program goes through these stages: the wasm API's `check` and `run`
//! modes ([`crate::api`]), save loading for both modes ([`load_saves`]),
//! the [`run`] driver, and the tooling helpers [`crate::check_source`] and
//! [`crate::parse_to_ast`]. So they share one error staging and one set of
//! limits.
//!
//! # Stages
//!
//! 1. [`parse`]: the recoverable parser, with its source-nesting cap
//!    (`MAX_NESTING_DEPTH`). The FIRST parse error fails the stage, as
//!    [`CompileStage::Parse`] with the message prefixed `parse error: ` and
//!    the error's own span.
//! 2. [`lower_parsed`] (or [`lower`] for stages 1 and 2 together): CST → AST
//!    plus the parallel [`SpanTree`]. A lowering error is also
//!    [`CompileStage::Parse`], unprefixed, spanning the whole source.
//! 3. [`Lowered::check`] (or [`compile`] for stages 1 to 3): type checking
//!    and elaboration against the prelude plus the given save schemes, as
//!    [`CompileStage::Type`] on failure.
//! 4. [`Checked::eval`]: the interpreter on the caller's [`Fuel`]
//!    ([`fuel_for_budget`] turns the wasm `budget` into one), with the
//!    display rules applied.
//!
//! Saves ([`load_saves`]) run stages 1 to 3 on each entry against the
//! prelude plus the prior saves, then (in [`SaveLoad::Evaluate`]) stage 4 on
//! a fresh default fuel with a discarded effect accumulator.

use crate::ast::Expr;
use crate::fuel::Fuel;
use crate::infer::{CoreExpr, TypeError};
use crate::interp::{Env, Interp, append_display, env_bind, env_nil};
use crate::lower::{Span, SpanTree, lower_root_spanned};
use crate::parser::Parse;
use crate::types::{Scheme, Type};
use crate::value::{Cmd, EvalError, Value};

/// Which compile stage failed. Lowering errors count as `Parse`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompileStage {
    Parse,
    Type,
}

/// A failed compile (stages 1 to 3), with a span into the compiled source.
#[derive(Debug, Clone, PartialEq)]
pub struct CompileError {
    pub stage: CompileStage,
    pub message: String,
    pub span: Span,
}

impl From<CompileError> for TypeError {
    fn from(e: CompileError) -> TypeError {
        TypeError {
            message: e.message,
            span: e.span,
        }
    }
}

/// Stage 1: parse, failing on the first parse error.
pub fn parse(src: &str) -> Result<Parse, CompileError> {
    let parsed = crate::parser::parse(src);
    if let Some(e) = parsed.errors.first() {
        return Err(CompileError {
            stage: CompileStage::Parse,
            message: format!("parse error: {}", e.message),
            span: e.span,
        });
    }
    Ok(parsed)
}

/// A source that parsed and lowered: its AST and span tree.
#[derive(Debug, Clone)]
pub struct Lowered {
    pub ast: Expr,
    pub spans: SpanTree,
}

/// Stage 2: lower an error-free parse of `src`.
pub fn lower_parsed(parsed: &Parse, src: &str) -> Result<Lowered, CompileError> {
    let (ast, spans) = lower_root_spanned(&parsed.syntax()).map_err(|e| CompileError {
        stage: CompileStage::Parse,
        message: e.message,
        span: (0, src.len()),
    })?;
    Ok(Lowered { ast, spans })
}

/// Stages 1 and 2: parse and lower.
pub fn lower(src: &str) -> Result<Lowered, CompileError> {
    lower_parsed(&parse(src)?, src)
}

/// A source that type-checked: its elaborated core (spans included) and type.
#[derive(Debug, Clone)]
pub struct Checked {
    pub core: CoreExpr,
    pub ty: Type,
}

impl Lowered {
    /// Stage 3: type-check against the prelude plus `env` (save schemes).
    pub fn check(self, env: &[(String, Scheme)]) -> Result<Checked, CompileError> {
        let (core, ty) =
            crate::infer::check(&self.ast, &self.spans, env).map_err(|e| CompileError {
                stage: CompileStage::Type,
                message: e.message,
                span: e.span,
            })?;
        Ok(Checked { core, ty })
    }
}

/// Stages 1 to 3: parse, lower and check.
pub fn compile(src: &str, env: &[(String, Scheme)]) -> Result<Checked, CompileError> {
    lower(src)?.check(env)
}

impl Checked {
    /// The scheme a save of this program binds (see [`save_scheme`]).
    pub fn save_scheme(&self) -> Scheme {
        save_scheme(&self.ty)
    }

    /// Stage 4: interpret in `env` on `fuel`, then apply the display
    /// rules (the final displayable value is appended last).
    pub fn eval(&self, env: &Env, fuel: &mut Fuel) -> Result<RunOutput, EvalError> {
        let mut it = Interp::new(fuel);
        let value = it.eval(&self.core, env)?;
        let mut cmd = it.into_cmd();
        append_display(&mut cmd, &value);
        Ok(RunOutput { value, cmd })
    }
}

/// The interpreter fuel for a wasm `budget`: 0 is the default step budget,
/// anything else the absolute step count (it scales steps only).
pub fn fuel_for_budget(budget: u32) -> Fuel {
    if budget == 0 {
        Fuel::default()
    } else {
        Fuel::new(u64::from(budget))
    }
}

pub(crate) fn save_scheme(ty: &Type) -> Scheme {
    // NB: `ty` is the post-check zonked type — any deferred arith constraints
    // were already solved (defaulted) by then, so quantifying without carrying
    // `arith` is sound: a save's die-lifting pins at the save boundary.
    let mut vars = Vec::new();
    ty.free_vars(&mut vars);
    Scheme {
        vars,
        constraints: Vec::new(),
        arith: Vec::new(),
        ty: ty.clone(),
    }
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

/// Whether [`load_saves`] evaluates each save or only checks it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveLoad {
    /// Stages 1 to 3 only (the boot-validation `check` mode); the returned
    /// env stays empty.
    CheckOnly,
    /// Stages 1 to 4, binding each save's value into the env.
    Evaluate,
}

/// The loaded saves: their schemes (the checker env) and values (the
/// interpreter env).
pub struct Saves {
    pub schemes: Vec<(String, Scheme)>,
    pub env: Env,
}

/// A failing save: its name, the message, and a span into ITS source.
#[derive(Debug, Clone, PartialEq)]
pub struct SaveError {
    pub name: String,
    pub message: String,
    pub span: Option<Span>,
}

/// Load `(name, source)` saves in order, each checked against the prelude
/// plus the prior saves. Evaluation runs on a FRESH default fuel (saves are
/// fuel-exempt, bounded by row count) and discards the save's own
/// effects, so its `roll`/`plot` don't replay on every message. An eval
/// error keeps its bare message whatever its kind.
pub fn load_saves(saves: &[(String, String)], mode: SaveLoad) -> Result<Saves, SaveError> {
    let mut schemes: Vec<(String, Scheme)> = Vec::new();
    let mut env = env_nil();
    for (name, src) in saves {
        let checked = compile(src, &schemes).map_err(|e| SaveError {
            name: name.clone(),
            message: e.message,
            span: Some(e.span),
        })?;
        if mode == SaveLoad::Evaluate {
            let mut save_fuel = Fuel::default();
            let mut it = Interp::new(&mut save_fuel);
            let v = it.eval(&checked.core, &env).map_err(|e| SaveError {
                name: name.clone(),
                message: e.message,
                span: e.span,
            })?;
            env = env_bind(&env, name.clone(), v);
        }
        schemes.push((name.clone(), checked.save_scheme()));
    }
    Ok(Saves { schemes, env })
}

// ---------------------------------------------------------------------------
// The run driver
// ---------------------------------------------------------------------------

/// The result of [`run`]: the final value plus the effect accumulator with
/// the display rules applied (final displayable value appended last).
/// Displays carry [`crate::value::DieTree`]s, never rolled numbers —
/// sampling is the renderer's.
#[derive(Debug, Clone, PartialEq)]
pub struct RunOutput {
    pub value: Value,
    pub cmd: Cmd,
}

/// A [`run`] failure. `Check` covers parse + type errors (the wasm API
/// stages them separately); `Save` is a failing SAVES entry (the API's
/// `stage:"prelude"` — `span` points into THAT save's source); `Eval`
/// carries the eval/fuel kind.
#[derive(Debug, Clone, PartialEq)]
pub enum RunError {
    Check(TypeError),
    Save {
        name: String,
        message: String,
        span: Option<Span>,
    },
    Eval(EvalError),
}

impl From<SaveError> for RunError {
    fn from(e: SaveError) -> RunError {
        RunError::Save {
            name: e.name,
            message: e.message,
            span: e.span,
        }
    }
}

/// Load and evaluate the saves, then compile and run the source on `fuel`
/// — the library-level driver (the wasm API stages the same calls itself).
pub fn run(
    source: &str,
    saves: &[(String, String)],
    fuel: &mut Fuel,
) -> Result<RunOutput, RunError> {
    let loaded = load_saves(saves, SaveLoad::Evaluate)?;
    let checked = compile(source, &loaded.schemes).map_err(|e| RunError::Check(e.into()))?;
    checked.eval(&loaded.env, fuel).map_err(RunError::Eval)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saves(entries: &[(&str, &str)]) -> Vec<(String, String)> {
        entries
            .iter()
            .map(|(n, s)| ((*n).to_owned(), (*s).to_owned()))
            .collect()
    }

    #[test]
    fn a_parse_error_is_prefixed_parse_stage() {
        let e = compile("1 +", &[]).expect_err("rejects");
        assert_eq!(e.stage, CompileStage::Parse);
        assert!(e.message.starts_with("parse error: "), "{}", e.message);
    }

    #[test]
    fn the_nesting_cap_is_a_parse_stage_error() {
        let src = format!("{}1{}", "(".repeat(300), ")".repeat(300));
        let e = lower(&src).expect_err("rejects");
        assert_eq!(e.stage, CompileStage::Parse);
        assert!(e.message.contains("too deeply nested"), "{}", e.message);
    }

    #[test]
    fn a_type_error_is_type_stage() {
        let e = compile("1 + \"a\"", &[]).expect_err("rejects");
        assert_eq!(e.stage, CompileStage::Type);
    }

    #[test]
    fn check_only_saves_never_evaluate() {
        let s = saves(&[("boom", "1 / 0")]);
        let loaded = load_saves(&s, SaveLoad::CheckOnly).expect("checks");
        assert_eq!(loaded.schemes.len(), 1);
        let e = load_saves(&s, SaveLoad::Evaluate)
            .err()
            .expect("eval fails");
        assert_eq!(e.name, "boom");
    }

    #[test]
    fn a_save_sees_only_the_saves_before_it() {
        let s = saves(&[("uses", "first + 1"), ("first", "2")]);
        for mode in [SaveLoad::CheckOnly, SaveLoad::Evaluate] {
            let e = load_saves(&s, mode).err().expect("rejects");
            assert_eq!(e.name, "uses");
            assert!(e.span.is_some());
        }
    }

    #[test]
    fn run_evaluates_against_the_loaded_saves() {
        let s = saves(&[("bonus", "3")]);
        let out = run("bonus + 4", &s, &mut fuel_for_budget(0)).expect("runs");
        assert!(matches!(&out.value, Value::Num(n) if n.to_string() == "7"));
        assert_eq!(out.cmd.displays.len(), 1);
    }
}
