//! weal-engine — the weal v2 dice-language engine (spec 0032).
//!
//! Slice S1: lexer (logos, fat die token), lossless rowan CST, recoverable
//! recursive-descent parser, typed AST + lowering (fat-die split, placeholder
//! desugaring), and the canonical pretty-printer (the future R21
//! save-serializer core). Round-trip property: for every AST `a`,
//! `lower(parse(print(a))) == a`.
//!
//! Slice S2: the type checker + elaborator (`types` + `infer`) — rank-1 HM
//! with the D32-3 union lattice, D32-4 sum coercion, D32-5 suffix
//! resolution, and elaboration into [`CoreExpr`] (the S3 input contract; see
//! the `infer` module docs).
//!
//! Slice S3: runtime values + symbolic die trees (`value`), the
//! tree-walking interpreter with fuel/effects/saves (`interp` + `fuel` +
//! `prelude`), and the S4 distribution seam (`dist_seam` — stubbed until
//! `dist.rs` lands). [`run`] is the top-level check→interp→display driver
//! that S5's wasm API wraps.

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
pub mod prelude;
pub mod printer;
pub mod types;
pub mod value;

pub use ast::Expr;
pub use fuel::Fuel;
pub use infer::{CoreExpr, PreludeEntry, TypeError, check, check_source, prelude_types};
pub use interp::{
    Env, Interp, RunError, RunOutput, env_bind, env_lookup, env_nil, interp, run, serialize_value,
};
pub use lower::{SpanTree, lower_root_spanned};
pub use parser::{Parse, ParseError, parse};
pub use printer::print;
pub use types::{Scheme, Type};
pub use value::{Cmd, DieTree, DisplayItem, ErrorKind, EvalError, Keep, PoolTree, SaveCmd, Value};

/// Parse source and lower it to the typed AST. Any parse error (with byte
/// spans) aborts lowering.
pub fn parse_to_ast(src: &str) -> Result<Expr, Vec<ParseError>> {
    let parsed = parse(src);
    if !parsed.errors.is_empty() {
        return Err(parsed.errors);
    }
    lower::lower_root(&parsed.syntax()).map_err(|e| {
        vec![ParseError {
            message: e.message,
            span: (0, src.len()),
        }]
    })
}
