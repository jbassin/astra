//! AST → canonical source pretty-printer.
//!
//! This is the future R21 save-serializer's core: it prints CANONICAL,
//! re-parseable source — dice as `NdM` + suffixes, atoms as `:name`, lets with
//! `;`, lambdas as `|a, b| body` — inserting parentheses only where precedence
//! demands. The S1 contract is the round-trip property
//! `lower(parse(print(a))) == a` for every AST the parser can produce (and any
//! hand-built one).

use crate::ast::{Expr, MatchPat, Pattern};
use std::fmt::Write;

/// Precedence levels, matching the D32-2 climb. Higher binds tighter.
/// let/match/lambda = 0 (they extend maximally to the right), cmp = 1,
/// add/sub = 2, mul/div = 3, unary-neg = 4, postfix = 5, atoms = 6.
fn level(e: &Expr) -> u8 {
    match e {
        Expr::Let { .. } | Expr::LetFn { .. } | Expr::Match { .. } | Expr::Lambda { .. } => 0,
        Expr::Cmp { .. } => 1,
        Expr::Binary { op, .. } => match op {
            crate::ast::BinOp::Add | crate::ast::BinOp::Sub => 2,
            crate::ast::BinOp::Mul | crate::ast::BinOp::Div => 3,
        },
        Expr::Neg(_) => 4,
        Expr::Call { .. } | Expr::Label { .. } => 5,
        _ => 6,
    }
}

/// True when `e`'s printed form ends in a match whose arm list is still
/// "open" — a following `|` would be captured by it (nearest-match binding).
/// Such bodies must be parenthesized in every non-final match arm.
fn ends_with_open_match(e: &Expr) -> bool {
    match e {
        Expr::Match { .. } => true,
        Expr::Let { body, .. } | Expr::LetFn { body, .. } | Expr::Lambda { body, .. } => {
            ends_with_open_match(body)
        }
        _ => false,
    }
}

/// Print an AST as canonical weal source.
pub fn print(e: &Expr) -> String {
    let mut out = String::new();
    write_expr(&mut out, e, 0);
    out
}

fn write_expr(out: &mut String, e: &Expr, min_level: u8) {
    if level(e) < min_level {
        out.push('(');
        write_expr(out, e, 0);
        out.push(')');
        return;
    }
    match e {
        Expr::Let {
            pattern,
            annot,
            value,
            body,
        } => {
            out.push_str("let ");
            write_pattern(out, pattern);
            if let Some(a) = annot {
                let _ = write!(out, " {a}");
            }
            out.push_str(" = ");
            write_expr(out, value, 0);
            out.push_str("; ");
            write_expr(out, body, 0);
        }
        Expr::LetFn {
            name,
            params,
            annot,
            value,
            body,
        } => {
            let _ = write!(out, "let {name}({})", params.join(", "));
            if let Some(a) = annot {
                let _ = write!(out, " {a}");
            }
            out.push_str(" = ");
            write_expr(out, value, 0);
            out.push_str("; ");
            write_expr(out, body, 0);
        }
        Expr::Match { scrutinee, arms } => {
            out.push_str("match ");
            write_expr(out, scrutinee, 1);
            let last = arms.len().saturating_sub(1);
            for (i, (pat, body)) in arms.iter().enumerate() {
                out.push_str(" | ");
                write_match_pat(out, pat);
                out.push_str(" -> ");
                // A non-final arm body ending in an open match would capture
                // the next `|` arm (nearest-match binding) — parenthesize.
                if i != last && ends_with_open_match(body) {
                    out.push('(');
                    write_expr(out, body, 0);
                    out.push(')');
                } else {
                    write_expr(out, body, 0);
                }
            }
        }
        Expr::Lambda { params, body } => {
            let _ = write!(out, "|{}| ", params.join(", "));
            write_expr(out, body, 0);
        }
        Expr::Cmp { first, rest } => {
            write_expr(out, first, 2);
            for (op, operand) in rest {
                let _ = write!(out, " {} ", op.as_str());
                write_expr(out, operand, 2);
            }
        }
        Expr::Binary { op, lhs, rhs } => {
            let lvl = level(e);
            write_expr(out, lhs, lvl);
            let _ = write!(out, " {} ", op.as_str());
            write_expr(out, rhs, lvl + 1);
        }
        Expr::Neg(inner) => {
            out.push('-');
            write_expr(out, inner, 4);
        }
        Expr::Call { callee, args } => {
            write_expr(out, callee, 5);
            out.push('(');
            for (i, arg) in args.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_expr(out, arg, 0);
            }
            out.push(')');
        }
        Expr::Label { expr, word } => {
            write_expr(out, expr, 5);
            let _ = write!(out, "[{word}]");
        }
        Expr::Die {
            count,
            sides,
            suffixes,
        } => {
            if let Some(c) = count {
                out.push_str(c);
            }
            let _ = write!(out, "d{sides}");
            for s in suffixes {
                out.push_str(&s.name);
                if let Some(arg) = &s.arg {
                    out.push_str(arg);
                }
            }
        }
        Expr::Num(digits) => out.push_str(digits),
        Expr::Dec(text) => out.push_str(text),
        Expr::Float(text) => {
            let _ = write!(out, "{text}f");
        }
        Expr::Str(value) => write_str(out, value),
        Expr::Atom(name) => {
            let _ = write!(out, ":{name}");
        }
        Expr::Unit => out.push_str("()"),
        Expr::Ident(name) => out.push_str(name),
        Expr::List(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_expr(out, item, 0);
            }
            out.push(']');
        }
        Expr::Dict(entries) => {
            if entries.is_empty() {
                out.push_str("[:]");
                return;
            }
            out.push('[');
            for (i, (k, v)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_expr(out, k, 0);
                out.push_str(": ");
                write_expr(out, v, 0);
            }
            out.push(']');
        }
        Expr::Tuple(items) => {
            out.push('{');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_expr(out, item, 0);
            }
            out.push('}');
        }
    }
}

fn write_pattern(out: &mut String, p: &Pattern) {
    match p {
        Pattern::Ident(name) => out.push_str(name),
        Pattern::Wildcard => out.push('_'),
        Pattern::Tuple(items) => {
            out.push('{');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_pattern(out, item);
            }
            out.push('}');
        }
    }
}

fn write_match_pat(out: &mut String, p: &MatchPat) {
    match p {
        MatchPat::Num { neg, digits } => {
            if *neg {
                out.push('-');
            }
            out.push_str(digits);
        }
        MatchPat::Dec { neg, text } => {
            if *neg {
                out.push('-');
            }
            out.push_str(text);
        }
        MatchPat::Str(value) => write_str(out, value),
        MatchPat::Atom(name) => {
            let _ = write!(out, ":{name}");
        }
        MatchPat::Ident(name) => out.push_str(name),
        MatchPat::Wildcard => out.push('_'),
        MatchPat::Tuple(items) => {
            out.push('{');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_match_pat(out, item);
            }
            out.push('}');
        }
    }
}

/// Re-escape a string value with the three legal escapes (`\"` `\\` `\n`).
fn write_str(out: &mut String, value: &str) {
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            other => out.push(other),
        }
    }
    out.push('"');
}
