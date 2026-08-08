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
//!
//! Lowering additionally produces a [`SpanTree`] — a parallel structure that
//! mirrors the [`Expr`] tree shape and carries byte spans into the ORIGINAL
//! source for every node (the AST itself stays span-free by design so the S1
//! round-trip `Eq` property holds). The S2 checker threads the two trees in
//! lockstep to give every `TypeError` a byte-accurate span (D32-11).

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

/// A byte span `(start, end)` into the original source.
pub type Span = (usize, usize);

/// A span-carrying mirror of one [`Expr`] node.
///
/// `children` follow a FIXED per-variant order (the checker relies on it):
///
/// - `Let` / `LetFn`: `[value, body]`
/// - `Match`: `[scrutinee, arm₀ body, arm₁ body, …]`; `aux` = each arm's
///   PATTERN span, in arm order
/// - `Lambda`: `[body]` (including placeholder-desugared lambdas, whose own
///   span is the enclosing call ARGUMENT's span)
/// - `Cmp`: `[first, rest₀, rest₁, …]`
/// - `Binary`: `[lhs, rhs]`; `Neg`: `[operand]`
/// - `Call`: `[callee, arg₀, …]`; `Label`: `[inner]`
/// - `List` / `Tuple`: elements in order
/// - `Dict`: `[k₀, v₀, k₁, v₁, …]`
/// - `Die`: no children; `aux` = each suffix NAME's span, in chain order
/// - all remaining leaves: no children, no aux
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpanTree {
    pub span: Span,
    pub children: Vec<SpanTree>,
    /// Auxiliary spans (see the per-variant list above).
    pub aux: Vec<Span>,
}

impl SpanTree {
    fn leaf(span: Span) -> SpanTree {
        SpanTree {
            span,
            children: Vec::new(),
            aux: Vec::new(),
        }
    }

    fn node(span: Span, children: Vec<SpanTree>) -> SpanTree {
        SpanTree {
            span,
            children,
            aux: Vec::new(),
        }
    }
}

fn err<T>(message: impl Into<String>) -> Result<T, LowerError> {
    Err(LowerError {
        message: message.into(),
    })
}

/// Lower a ROOT syntax node into the AST (spans discarded).
pub fn lower_root(root: &SyntaxNode) -> Result<Expr, LowerError> {
    lower_root_spanned(root).map(|(expr, _)| expr)
}

/// Lower a ROOT syntax node into the AST plus its parallel [`SpanTree`].
pub fn lower_root_spanned(root: &SyntaxNode) -> Result<(Expr, SpanTree), LowerError> {
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

/// The trivia-trimmed byte span of a node: first non-trivia token start to
/// last non-trivia token end.
fn node_span(node: &SyntaxNode) -> Span {
    let mut start = None;
    let mut end = None;
    for el in node.descendants_with_tokens() {
        if let Some(t) = el.into_token()
            && !t.kind().is_trivia()
        {
            let r = t.text_range();
            if start.is_none() {
                start = Some(usize::from(r.start()));
            }
            end = Some(usize::from(r.end()));
        }
    }
    (start.unwrap_or(0), end.unwrap_or(0))
}

fn token_span(tok: &SyntaxToken) -> Span {
    let r = tok.text_range();
    (usize::from(r.start()), usize::from(r.end()))
}

struct Ctx {
    used: HashSet<String>,
    counter: u32,
    /// Stack of per-argument placeholder collectors; top = innermost ARG.
    collectors: Vec<Vec<String>>,
}

type Lowered = (Expr, SpanTree);

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

    fn lower_expr(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        match node.kind() {
            LET_EXPR => self.lower_let(node),
            LET_FN_EXPR => self.lower_let_fn(node),
            MATCH_EXPR => self.lower_match(node),
            LAMBDA_EXPR => self.lower_lambda(node),
            CMP_CHAIN => self.lower_cmp_chain(node),
            BIN_EXPR => self.lower_bin(node),
            UNARY_EXPR => {
                let inner = expr_children(self, node, 1)?;
                let [(e, es)] = <[Lowered; 1]>::try_from(inner).expect("arity checked");
                Ok((Expr::Neg(Box::new(e)), SpanTree::node(span, vec![es])))
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
                let (count, sides, split) = split_die(tok.text());
                let base = usize::from(tok.text_range().start());
                let mut suffixes = Vec::new();
                let mut aux = Vec::new();
                for (suffix, (s, e)) in split {
                    suffixes.push(suffix);
                    aux.push((base + s, base + e));
                }
                Ok((
                    Expr::Die {
                        count,
                        sides,
                        suffixes,
                    },
                    SpanTree {
                        span,
                        children: Vec::new(),
                        aux,
                    },
                ))
            }
            LITERAL => self.lower_literal(node),
            NAME_REF => {
                let tok = first_token(node, IDENT)?;
                Ok((
                    Expr::Ident(tok.text().to_owned()),
                    SpanTree::leaf(token_span(&tok)),
                ))
            }
            PLACEHOLDER => {
                let name = self.fresh_param();
                match self.collectors.last_mut() {
                    Some(c) => {
                        c.push(name.clone());
                        Ok((Expr::Ident(name), SpanTree::leaf(span)))
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
                let mut items = Vec::new();
                let mut spans = Vec::new();
                for n in child_nodes(node) {
                    let (e, s) = self.lower_expr(&n)?;
                    items.push(e);
                    spans.push(s);
                }
                Ok((Expr::List(items), SpanTree::node(span, spans)))
            }
            DICT_EXPR => {
                let mut entries = Vec::new();
                let mut spans = Vec::new();
                for entry in child_nodes(node) {
                    if entry.kind() != DICT_ENTRY {
                        return err("unexpected child in dict literal");
                    }
                    let kv = expr_children(self, &entry, 2)?;
                    let [(k, ks), (v, vs)] = <[Lowered; 2]>::try_from(kv).expect("arity checked");
                    entries.push((k, v));
                    spans.push(ks);
                    spans.push(vs);
                }
                Ok((Expr::Dict(entries), SpanTree::node(span, spans)))
            }
            TUPLE_EXPR => {
                let mut items = Vec::new();
                let mut spans = Vec::new();
                for n in child_nodes(node) {
                    let (e, s) = self.lower_expr(&n)?;
                    items.push(e);
                    spans.push(s);
                }
                Ok((Expr::Tuple(items), SpanTree::node(span, spans)))
            }
            other => err(format!(
                "unexpected node kind in expression position: {other:?}"
            )),
        }
    }

    fn lower_let(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
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
        let (value, vs) = self.lower_expr(exprs[0])?;
        let (body, bs) = self.lower_expr(exprs[1])?;
        Ok((
            Expr::Let {
                pattern,
                annot,
                value: Box::new(value),
                body: Box::new(body),
            },
            SpanTree::node(span, vec![vs, bs]),
        ))
    }

    fn lower_let_fn(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
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
        let (value, vs) = self.lower_expr(exprs[0])?;
        let (body, bs) = self.lower_expr(exprs[1])?;
        Ok((
            Expr::LetFn {
                name,
                params,
                annot,
                value: Box::new(value),
                body: Box::new(body),
            },
            SpanTree::node(span, vec![vs, bs]),
        ))
    }

    fn lower_match(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        let kids = child_nodes(node);
        let scrutinee_node = kids
            .iter()
            .find(|n| n.kind() != MATCH_ARM)
            .ok_or(LowerError {
                message: "match without a scrutinee".into(),
            })?;
        let (scrutinee, ss) = self.lower_expr(scrutinee_node)?;
        let mut arms = Vec::new();
        let mut children = vec![ss];
        let mut aux = Vec::new();
        for arm in kids.iter().filter(|n| n.kind() == MATCH_ARM) {
            let pat_node = arm
                .children()
                .find(|n| n.kind() == ARM_PAT)
                .ok_or(LowerError {
                    message: "match arm without a pattern".into(),
                })?;
            let pat = lower_arm_pat(&pat_node)?;
            aux.push(node_span(&pat_node));
            let body_node = arm
                .children()
                .find(|n| n.kind() != ARM_PAT)
                .ok_or(LowerError {
                    message: "match arm without a body".into(),
                })?;
            let (body, bs) = self.lower_expr(&body_node)?;
            arms.push((pat, body));
            children.push(bs);
        }
        if arms.is_empty() {
            return err("match without arms");
        }
        Ok((
            Expr::Match {
                scrutinee: Box::new(scrutinee),
                arms,
            },
            SpanTree {
                span,
                children,
                aux,
            },
        ))
    }

    fn lower_lambda(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
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
        let (body, bs) = self.lower_expr(body_node)?;
        Ok((
            Expr::Lambda {
                params,
                body: Box::new(body),
            },
            SpanTree::node(span, vec![bs]),
        ))
    }

    fn lower_cmp_chain(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        let mut operands = Vec::new();
        let mut spans = Vec::new();
        for n in child_nodes(node) {
            let (e, s) = self.lower_expr(&n)?;
            operands.push(e);
            spans.push(s);
        }
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
        Ok((
            Expr::Cmp {
                first: Box::new(first),
                rest,
            },
            SpanTree::node(span, spans),
        ))
    }

    fn lower_bin(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        let operands = expr_children(self, node, 2)?;
        let [(lhs, ls), (rhs, rs)] = <[Lowered; 2]>::try_from(operands).expect("arity checked");
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
        Ok((
            Expr::Binary {
                op,
                lhs: Box::new(lhs),
                rhs: Box::new(rhs),
            },
            SpanTree::node(span, vec![ls, rs]),
        ))
    }

    fn lower_call(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        let kids = child_nodes(node);
        let callee_node = kids
            .iter()
            .find(|n| n.kind() != ARG_LIST)
            .ok_or(LowerError {
                message: "call without a callee".into(),
            })?;
        let (callee, cs) = self.lower_expr(callee_node)?;
        let arg_list = kids
            .iter()
            .find(|n| n.kind() == ARG_LIST)
            .ok_or(LowerError {
                message: "call without an argument list".into(),
            })?;
        let mut args = Vec::new();
        let mut children = vec![cs];
        for arg in arg_list.children().filter(|n| n.kind() == ARG) {
            let (a, s) = self.lower_arg(&arg)?;
            args.push(a);
            children.push(s);
        }
        Ok((
            Expr::Call {
                callee: Box::new(callee),
                args,
            },
            SpanTree::node(span, children),
        ))
    }

    /// Lower one call argument — the placeholder-binding boundary. Any `_`s
    /// lowered directly under this argument become ONE lambda wrapping it,
    /// parameters in occurrence order (D32-2). The generated lambda's span is
    /// the whole argument's span.
    fn lower_arg(&mut self, arg: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(arg);
        let inner = arg.children().next().ok_or(LowerError {
            message: "empty call argument".into(),
        })?;
        self.collectors.push(Vec::new());
        let lowered = self.lower_expr(&inner);
        let params = self.collectors.pop().expect("pushed above");
        let (lowered, ls) = lowered?;
        if params.is_empty() {
            Ok((lowered, ls))
        } else {
            Ok((
                Expr::Lambda {
                    params,
                    body: Box::new(lowered),
                },
                SpanTree::node(span, vec![ls]),
            ))
        }
    }

    fn lower_label(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        let inner = child_nodes(node).into_iter().next().ok_or(LowerError {
            message: "label without an inner expression".into(),
        })?;
        let (expr, es) = self.lower_expr(&inner)?;
        let word = child_tokens(node)
            .into_iter()
            .find(|t| matches!(t.kind(), IDENT | DIE))
            .ok_or(LowerError {
                message: "label without a word".into(),
            })?
            .text()
            .to_owned();
        Ok((
            Expr::Label {
                expr: Box::new(expr),
                word,
            },
            SpanTree::node(span, vec![es]),
        ))
    }

    fn lower_literal(&mut self, node: &SyntaxNode) -> Result<Lowered, LowerError> {
        let span = node_span(node);
        let toks = child_tokens(node);
        let first = toks.first().ok_or(LowerError {
            message: "empty literal".into(),
        })?;
        let expr = match first.kind() {
            NUM => Expr::Num(normalize_digits(first.text())),
            DEC => Expr::Dec(normalize_decimal(first.text())),
            FLOAT => {
                let text = first.text();
                let without_f = &text[..text.len() - 1];
                Expr::Float(normalize_decimal(without_f))
            }
            STR => Expr::Str(unescape_str(first.text())),
            ATOM => Expr::Atom(first.text()[1..].to_owned()),
            L_PAREN => Expr::Unit,
            other => return err(format!("unexpected literal token: {other:?}")),
        };
        Ok((expr, SpanTree::leaf(span)))
    }
}

fn expr_children(
    ctx: &mut Ctx,
    node: &SyntaxNode,
    arity: usize,
) -> Result<Vec<Lowered>, LowerError> {
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

/// A split fat die token: count digits, sides digits, and each suffix paired
/// with its NAME's byte offsets relative to the token start.
type SplitDie = (Option<String>, String, Vec<(DieSuffix, (usize, usize))>);

/// Split the fat die token (D32-5): optional count digits, `d`, sides digits,
/// then a suffix run — longest `[a-z]+` = name, following digits = Num arg.
fn split_die(text: &str) -> SplitDie {
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
        let name_span = (name_start, i);
        let digits_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        let arg = if i > digits_start {
            Some(text[digits_start..i].to_owned())
        } else {
            None
        };
        suffixes.push((DieSuffix { name, arg }, name_span));
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
