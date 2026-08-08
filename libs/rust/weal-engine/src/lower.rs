//! CST → typed-AST lowering.
//!
//! Two D32 rules live here:
//! - **Fat die token split (D32-5):** the single DIE token becomes
//!   `(count, sides, Vec<DieSuffix>)` — longest `[a-z]+` run = suffix name,
//!   the digits following it = its Num argument.
//! - **Placeholder desugaring (D32-2):** each `_` binds to the smallest
//!   enclosing syntactic argument expression (the `ARG` node); `_`s sharing
//!   that argument form ONE lambda with parameters in occurrence order. In
//!   `f(_ + g(_))` the outer `_` becomes the parameter of `f`'s argument
//!   lambda and the inner `_` the parameter of `g`'s argument lambda.
//!   Generated parameter names (`ph0`, `ph1`, …) skip every identifier that
//!   occurs anywhere in the source, so they can never capture user names.

use crate::ast::{BinOp, CmpOp, DieSuffix, Expr, MatchPat, Pattern};
use crate::cst::{SyntaxKind, SyntaxNode, SyntaxToken};
use std::collections::HashSet;

use SyntaxKind::*;

/// Lowering failure — only reachable on trees that still contain parse
/// errors (callers should lower clean parses only).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LowerError {
    pub message: String,
}

fn err<T>(message: impl Into<String>) -> Result<T, LowerError> {
    Err(LowerError {
        message: message.into(),
    })
}

/// Lower a ROOT syntax node into the AST.
pub fn lower_root(root: &SyntaxNode) -> Result<Expr, LowerError> {
    if root.kind() != ROOT {
        return err("lower_root expects a ROOT node");
    }
    if root.descendants().any(|n| n.kind() == ERROR_NODE) {
        return err("cannot lower a tree containing parse errors");
    }
    let mut ctx = Ctx {
        used: collect_idents(root),
        counter: 0,
        collectors: Vec::new(),
    };
    let expr_node = child_nodes(root).into_iter().next().ok_or(LowerError {
        message: "empty parse tree".into(),
    })?;
    ctx.lower_expr(&expr_node)
}

fn collect_idents(root: &SyntaxNode) -> HashSet<String> {
    root.descendants_with_tokens()
        .filter_map(|el| el.into_token())
        .filter(|t| t.kind() == IDENT)
        .map(|t| t.text().to_owned())
        .collect()
}

fn child_nodes(node: &SyntaxNode) -> Vec<SyntaxNode> {
    node.children().collect()
}

fn child_tokens(node: &SyntaxNode) -> Vec<SyntaxToken> {
    node.children_with_tokens()
        .filter_map(|el| el.into_token())
        .filter(|t| !t.kind().is_trivia())
        .collect()
}

struct Ctx {
    used: HashSet<String>,
    counter: u32,
    /// Stack of per-argument placeholder collectors; top = innermost ARG.
    collectors: Vec<Vec<String>>,
}

impl Ctx {
    fn fresh_param(&mut self) -> String {
        loop {
            let name = format!("ph{}", self.counter);
            self.counter += 1;
            if self.used.insert(name.clone()) {
                return name;
            }
        }
    }

    fn lower_expr(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        match node.kind() {
            LET_EXPR => self.lower_let(node),
            LET_FN_EXPR => self.lower_let_fn(node),
            MATCH_EXPR => self.lower_match(node),
            LAMBDA_EXPR => self.lower_lambda(node),
            CMP_CHAIN => self.lower_cmp_chain(node),
            BIN_EXPR => self.lower_bin(node),
            UNARY_EXPR => {
                let inner = expr_children(self, node, 1)?;
                let [e] = <[Expr; 1]>::try_from(inner).expect("arity checked");
                Ok(Expr::Neg(Box::new(e)))
            }
            CALL_EXPR => self.lower_call(node),
            LABEL_EXPR => self.lower_label(node),
            DIE_EXPR => {
                let tok = child_tokens(node)
                    .into_iter()
                    .find(|t| t.kind() == DIE)
                    .ok_or(LowerError {
                        message: "die expr without die token".into(),
                    })?;
                let (count, sides, suffixes) = split_die(tok.text());
                Ok(Expr::Die {
                    count,
                    sides,
                    suffixes,
                })
            }
            LITERAL => self.lower_literal(node),
            NAME_REF => {
                let tok = first_token(node, IDENT)?;
                Ok(Expr::Ident(tok.text().to_owned()))
            }
            PLACEHOLDER => {
                let name = self.fresh_param();
                match self.collectors.last_mut() {
                    Some(c) => {
                        c.push(name.clone());
                        Ok(Expr::Ident(name))
                    }
                    None => err("placeholder outside a call argument survived parsing"),
                }
            }
            PAREN_EXPR => {
                let inner = child_nodes(node).into_iter().next().ok_or(LowerError {
                    message: "empty parenthesized expression".into(),
                })?;
                self.lower_expr(&inner)
            }
            LIST_EXPR => {
                let items = child_nodes(node)
                    .iter()
                    .map(|n| self.lower_expr(n))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(Expr::List(items))
            }
            DICT_EXPR => {
                let mut entries = Vec::new();
                for entry in child_nodes(node) {
                    if entry.kind() != DICT_ENTRY {
                        return err("unexpected child in dict literal");
                    }
                    let kv = expr_children(self, &entry, 2)?;
                    let [k, v] = <[Expr; 2]>::try_from(kv).expect("arity checked");
                    entries.push((k, v));
                }
                Ok(Expr::Dict(entries))
            }
            TUPLE_EXPR => {
                let items = child_nodes(node)
                    .iter()
                    .map(|n| self.lower_expr(n))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(Expr::Tuple(items))
            }
            other => err(format!(
                "unexpected node kind in expression position: {other:?}"
            )),
        }
    }

    fn lower_let(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let kids = child_nodes(node);
        let pat_node = kids
            .iter()
            .find(|n| matches!(n.kind(), IDENT_PAT | WILDCARD_PAT | TUPLE_PAT))
            .ok_or(LowerError {
                message: "let without a pattern".into(),
            })?;
        let pattern = lower_pattern(pat_node)?;
        let annot = lower_annot(&kids);
        let exprs: Vec<&SyntaxNode> = kids
            .iter()
            .filter(|n| !matches!(n.kind(), IDENT_PAT | WILDCARD_PAT | TUPLE_PAT | ANNOT))
            .collect();
        if exprs.len() != 2 {
            return err("let needs a value and a body expression");
        }
        let value = self.lower_expr(exprs[0])?;
        let body = self.lower_expr(exprs[1])?;
        Ok(Expr::Let {
            pattern,
            annot,
            value: Box::new(value),
            body: Box::new(body),
        })
    }

    fn lower_let_fn(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let name = first_token(node, IDENT)?.text().to_owned();
        let kids = child_nodes(node);
        let params_node = kids
            .iter()
            .find(|n| n.kind() == PARAM_LIST)
            .ok_or(LowerError {
                message: "let fn without parameter list".into(),
            })?;
        let params = param_names(params_node);
        let annot = lower_annot(&kids);
        let exprs: Vec<&SyntaxNode> = kids
            .iter()
            .filter(|n| !matches!(n.kind(), PARAM_LIST | ANNOT))
            .collect();
        if exprs.len() != 2 {
            return err("let fn needs a value and a body expression");
        }
        let value = self.lower_expr(exprs[0])?;
        let body = self.lower_expr(exprs[1])?;
        Ok(Expr::LetFn {
            name,
            params,
            annot,
            value: Box::new(value),
            body: Box::new(body),
        })
    }

    fn lower_match(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let kids = child_nodes(node);
        let scrutinee_node = kids
            .iter()
            .find(|n| n.kind() != MATCH_ARM)
            .ok_or(LowerError {
                message: "match without a scrutinee".into(),
            })?;
        let scrutinee = self.lower_expr(scrutinee_node)?;
        let mut arms = Vec::new();
        for arm in kids.iter().filter(|n| n.kind() == MATCH_ARM) {
            let pat_node = arm
                .children()
                .find(|n| n.kind() == ARM_PAT)
                .ok_or(LowerError {
                    message: "match arm without a pattern".into(),
                })?;
            let pat = lower_arm_pat(&pat_node)?;
            let body_node = arm
                .children()
                .find(|n| n.kind() != ARM_PAT)
                .ok_or(LowerError {
                    message: "match arm without a body".into(),
                })?;
            let body = self.lower_expr(&body_node)?;
            arms.push((pat, body));
        }
        if arms.is_empty() {
            return err("match without arms");
        }
        Ok(Expr::Match {
            scrutinee: Box::new(scrutinee),
            arms,
        })
    }

    fn lower_lambda(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let kids = child_nodes(node);
        let params_node = kids
            .iter()
            .find(|n| n.kind() == PARAM_LIST)
            .ok_or(LowerError {
                message: "lambda without parameter list".into(),
            })?;
        let params = param_names(params_node);
        let body_node = kids
            .iter()
            .find(|n| n.kind() != PARAM_LIST)
            .ok_or(LowerError {
                message: "lambda without a body".into(),
            })?;
        let body = self.lower_expr(body_node)?;
        Ok(Expr::Lambda {
            params,
            body: Box::new(body),
        })
    }

    fn lower_cmp_chain(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let operands: Vec<Expr> = child_nodes(node)
            .iter()
            .map(|n| self.lower_expr(n))
            .collect::<Result<Vec<_>, _>>()?;
        let ops: Vec<CmpOp> = child_tokens(node)
            .iter()
            .filter_map(|t| match t.kind() {
                LT => Some(CmpOp::Lt),
                LE => Some(CmpOp::Le),
                GT => Some(CmpOp::Gt),
                GE => Some(CmpOp::Ge),
                EQ_EQ => Some(CmpOp::EqEq),
                NOT_EQ => Some(CmpOp::NotEq),
                _ => None,
            })
            .collect();
        if operands.len() != ops.len() + 1 || ops.is_empty() {
            return err("malformed comparison chain");
        }
        let mut iter = operands.into_iter();
        let first = iter.next().expect("len checked");
        let rest = ops.into_iter().zip(iter).collect();
        Ok(Expr::Cmp {
            first: Box::new(first),
            rest,
        })
    }

    fn lower_bin(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let operands = expr_children(self, node, 2)?;
        let [lhs, rhs] = <[Expr; 2]>::try_from(operands).expect("arity checked");
        let op = child_tokens(node)
            .iter()
            .find_map(|t| match t.kind() {
                PLUS => Some(BinOp::Add),
                MINUS => Some(BinOp::Sub),
                STAR => Some(BinOp::Mul),
                SLASH => Some(BinOp::Div),
                _ => None,
            })
            .ok_or(LowerError {
                message: "binary expression without an operator".into(),
            })?;
        Ok(Expr::Binary {
            op,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        })
    }

    fn lower_call(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let kids = child_nodes(node);
        let callee_node = kids
            .iter()
            .find(|n| n.kind() != ARG_LIST)
            .ok_or(LowerError {
                message: "call without a callee".into(),
            })?;
        let callee = self.lower_expr(callee_node)?;
        let arg_list = kids
            .iter()
            .find(|n| n.kind() == ARG_LIST)
            .ok_or(LowerError {
                message: "call without an argument list".into(),
            })?;
        let mut args = Vec::new();
        for arg in arg_list.children().filter(|n| n.kind() == ARG) {
            args.push(self.lower_arg(&arg)?);
        }
        Ok(Expr::Call {
            callee: Box::new(callee),
            args,
        })
    }

    /// Lower one call argument — the placeholder-binding boundary. Any `_`s
    /// lowered directly under this argument become ONE lambda wrapping it,
    /// parameters in occurrence order (D32-2).
    fn lower_arg(&mut self, arg: &SyntaxNode) -> Result<Expr, LowerError> {
        let inner = arg.children().next().ok_or(LowerError {
            message: "empty call argument".into(),
        })?;
        self.collectors.push(Vec::new());
        let lowered = self.lower_expr(&inner);
        let params = self.collectors.pop().expect("pushed above");
        let lowered = lowered?;
        if params.is_empty() {
            Ok(lowered)
        } else {
            Ok(Expr::Lambda {
                params,
                body: Box::new(lowered),
            })
        }
    }

    fn lower_label(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let inner = child_nodes(node).into_iter().next().ok_or(LowerError {
            message: "label without an inner expression".into(),
        })?;
        let expr = self.lower_expr(&inner)?;
        let word = child_tokens(node)
            .into_iter()
            .find(|t| matches!(t.kind(), IDENT | DIE))
            .ok_or(LowerError {
                message: "label without a word".into(),
            })?
            .text()
            .to_owned();
        Ok(Expr::Label {
            expr: Box::new(expr),
            word,
        })
    }

    fn lower_literal(&mut self, node: &SyntaxNode) -> Result<Expr, LowerError> {
        let toks = child_tokens(node);
        let first = toks.first().ok_or(LowerError {
            message: "empty literal".into(),
        })?;
        match first.kind() {
            NUM => Ok(Expr::Num(normalize_digits(first.text()))),
            DEC => Ok(Expr::Dec(normalize_decimal(first.text()))),
            FLOAT => {
                let text = first.text();
                let without_f = &text[..text.len() - 1];
                Ok(Expr::Float(normalize_decimal(without_f)))
            }
            STR => Ok(Expr::Str(unescape_str(first.text()))),
            ATOM => Ok(Expr::Atom(first.text()[1..].to_owned())),
            L_PAREN => Ok(Expr::Unit),
            other => err(format!("unexpected literal token: {other:?}")),
        }
    }
}

fn expr_children(ctx: &mut Ctx, node: &SyntaxNode, arity: usize) -> Result<Vec<Expr>, LowerError> {
    let kids = child_nodes(node);
    if kids.len() != arity {
        return err(format!(
            "expected {arity} sub-expressions in {:?}, found {}",
            node.kind(),
            kids.len()
        ));
    }
    kids.iter().map(|n| ctx.lower_expr(n)).collect()
}

fn first_token(node: &SyntaxNode, kind: SyntaxKind) -> Result<SyntaxToken, LowerError> {
    child_tokens(node)
        .into_iter()
        .find(|t| t.kind() == kind)
        .ok_or(LowerError {
            message: format!("missing {kind:?} token in {:?}", node.kind()),
        })
}

fn param_names(params: &SyntaxNode) -> Vec<String> {
    child_tokens(params)
        .into_iter()
        .filter(|t| t.kind() == IDENT)
        .map(|t| t.text().to_owned())
        .collect()
}

fn lower_annot(kids: &[SyntaxNode]) -> Option<String> {
    kids.iter().find(|n| n.kind() == ANNOT).map(|annot| {
        child_tokens(annot)
            .into_iter()
            .find(|t| t.kind() == TYPE_NAME)
            .map(|t| t.text().to_owned())
            .unwrap_or_default()
    })
}

fn lower_pattern(node: &SyntaxNode) -> Result<Pattern, LowerError> {
    match node.kind() {
        IDENT_PAT => Ok(Pattern::Ident(first_token(node, IDENT)?.text().to_owned())),
        WILDCARD_PAT => Ok(Pattern::Wildcard),
        TUPLE_PAT => {
            let items = child_nodes(node)
                .iter()
                .map(lower_pattern)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Pattern::Tuple(items))
        }
        other => err(format!("unexpected pattern kind: {other:?}")),
    }
}

fn lower_arm_pat(node: &SyntaxNode) -> Result<MatchPat, LowerError> {
    if let Some(tuple) = node.children().find(|n| n.kind() == ARM_TUPLE_PAT) {
        let items = tuple
            .children()
            .map(|n| lower_arm_pat(&n))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(MatchPat::Tuple(items));
    }
    let toks = child_tokens(node);
    let neg = toks.first().is_some_and(|t| t.kind() == MINUS);
    let lit = toks.iter().find(|t| t.kind() != MINUS).ok_or(LowerError {
        message: "empty match pattern".into(),
    })?;
    match lit.kind() {
        NUM => Ok(MatchPat::Num {
            neg,
            digits: normalize_digits(lit.text()),
        }),
        DEC => Ok(MatchPat::Dec {
            neg,
            text: normalize_decimal(lit.text()),
        }),
        STR => Ok(MatchPat::Str(unescape_str(lit.text()))),
        ATOM => Ok(MatchPat::Atom(lit.text()[1..].to_owned())),
        IDENT => Ok(MatchPat::Ident(lit.text().to_owned())),
        UNDERSCORE => Ok(MatchPat::Wildcard),
        other => err(format!("unexpected match pattern token: {other:?}")),
    }
}

/// Split the fat die token (D32-5): optional count digits, `d`, sides digits,
/// then a suffix run — longest `[a-z]+` = name, following digits = Num arg.
fn split_die(text: &str) -> (Option<String>, String, Vec<DieSuffix>) {
    let bytes = text.as_bytes();
    let d_pos = bytes
        .iter()
        .position(|&b| b == b'd')
        .expect("die token always contains d");
    let count = if d_pos > 0 {
        Some(normalize_digits(&text[..d_pos]))
    } else {
        None
    };
    let mut i = d_pos + 1;
    let sides_start = i;
    while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'_') {
        i += 1;
    }
    let sides = normalize_digits(&text[sides_start..i]);
    let mut suffixes = Vec::new();
    while i < bytes.len() {
        let name_start = i;
        while i < bytes.len() && bytes[i].is_ascii_lowercase() {
            i += 1;
        }
        let name = text[name_start..i].to_owned();
        let digits_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        let arg = if i > digits_start {
            Some(text[digits_start..i].to_owned())
        } else {
            None
        };
        suffixes.push(DieSuffix { name, arg });
    }
    (count, sides, suffixes)
}

fn normalize_digits(text: &str) -> String {
    text.chars().filter(|c| *c != '_').collect()
}

/// Normalize a `int.frac` decimal text: strip underscores from both halves.
fn normalize_decimal(text: &str) -> String {
    text.chars().filter(|c| *c != '_').collect()
}

/// Unescape a STR token (including its quotes) into its value.
fn unescape_str(text: &str) -> String {
    let inner = &text[1..text.len() - 1];
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('n') => out.push('\n'),
                Some(other) => {
                    // Parser already reported invalid escapes; keep bytes.
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out
}
