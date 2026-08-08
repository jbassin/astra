//! weal-engine — the weal v2 dice-language engine (spec 0032).
//!
//! Slice S1: lexer (logos, fat die token), lossless rowan CST, recoverable
//! recursive-descent parser, typed AST + lowering (fat-die split, placeholder
//! desugaring), and the canonical pretty-printer (the future R21
//! save-serializer core). Round-trip property: for every AST `a`,
//! `lower(parse(print(a))) == a`.

pub mod ast;
pub mod cst;
pub mod lexer;
pub mod lower;
pub mod parser;
pub mod printer;

pub use ast::Expr;
pub use parser::{Parse, ParseError, parse};
pub use printer::print;

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
