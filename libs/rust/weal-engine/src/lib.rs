//! weal-engine — the weal v2 dice-language engine.
//!
//! Front end: lexer (logos, fat die token), lossless rowan CST, recoverable
//! recursive-descent parser, typed AST + lowering (fat-die split, placeholder
//! desugaring), and the canonical pretty-printer (the core of the
//! save serializer). Round-trip property: for every AST `a`,
//! `lower(parse(print(a))) == a`.
//!
//! Types: the type checker + elaborator (`types` + `infer`) — rank-1 HM
//! with a union lattice for atoms, sum coercion of pools, type-directed die-suffix
//! resolution, and elaboration into [`CoreExpr`] (the interpreter's input; see
//! the `infer` module docs).
//!
//! Runtime: values + symbolic die trees (`value`), the
//! tree-walking interpreter with fuel/effects/saves (`interp` + `fuel` +
//! `prelude`). [`run`] (in `pipeline`, which holds the parse → lower → check
//! → eval stages every entry point shares) is the top-level driver; the
//! wasm API composes the same stages.
//!
//! Distributions: the exact-distribution engine (`dist`, the icepool port) and
//! the seam to it (`dist_seam`): `dist_of`/`dist_of_with` lower a
//! symbolic [`DieTree`] into the engine and return a `SeamDist` with plain
//! [`Value`] faces (evaluate(), lifted comparisons, min/max on dice, and
//! the distribution accessors the renderer reads).
//!
//! Output: the render tree + seeded sampling + goodness (`render`), the
//! PMF plot (`plot`), and the JSON seam (`api`) — [`evaluate`]
//! is the single function the wasm module exports.

pub mod api;
pub mod ast;
pub mod cst;
pub mod dist;
pub mod dist_seam;
pub mod fuel;
pub mod infer;
pub mod interp;
pub mod lexer;
pub mod lower;
pub mod parser;
pub mod pipeline;
pub mod plot;
pub mod prelude;
pub mod printer;
pub mod render;
pub mod types;
pub mod value;

pub use api::evaluate;
pub use ast::Expr;
pub use fuel::Fuel;
pub use infer::{CoreExpr, CoreKind, PreludeEntry, TypeError, check, check_source, prelude_types};
pub use interp::{
    Env, Interp, RunError, RunOutput, env_bind, env_lookup, env_nil, interp, run, serialize_value,
};
pub use lower::{SpanTree, lower_root_spanned};
pub use parser::{Parse, ParseError, parse};
pub use printer::print;
pub use render::{Goodness, RenderedDisplay, Sampler, render_die_display};
pub use types::{Scheme, Type};
pub use value::{Cmd, DieTree, DisplayItem, ErrorKind, EvalError, Keep, PoolTree, SaveCmd, Value};

/// Parse source and lower it to the typed AST. Any parse error (with byte
/// spans) aborts lowering.
pub fn parse_to_ast(src: &str) -> Result<Expr, Vec<ParseError>> {
    let parsed = parse(src);
    if !parsed.errors.is_empty() {
        return Err(parsed.errors);
    }
    pipeline::lower_parsed(&parsed, src)
        .map(|lowered| lowered.ast)
        .map_err(|e| {
            vec![ParseError {
                message: e.message,
                span: e.span,
            }]
        })
}
