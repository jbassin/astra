//! Recoverable recursive-descent parser producing the rowan CST per the D32-2
//! grammar.
//!
//! Grammar notes implemented here:
//! - `let` both forms, `;`-terminated (`;` is OCaml's `in`).
//! - `match` arms bind to the NEAREST match (greedy arm loop); arm-`|` vs
//!   lambda-`|` disambiguated by lookahead (`|` pattern `->` vs `|` params `|`).
//! - Precedence climb: cmp(1, non-assoc but CHAINS PARSE into one flat
//!   `CMP_CHAIN` node — rejection is the type stage's job) < add,sub(2) <
//!   mul,div(3) < unary-neg(4) < postfix(5: calls, `[word]` labels).
//! - `[`-fork: `[:]` = empty dict; otherwise parse the first expr and dispatch
//!   on `:`.
//! - Negative literals allowed in match patterns; trailing commas everywhere.
//! - Placeholder `_` is legal ONLY inside a call argument (tracked with an
//!   argument-depth counter); anywhere else (outside patterns) = parse error.
//!
//! Errors never panic: they are recorded with byte spans and the parser skips
//! or wraps the offending tokens in `ERROR_NODE`s.

use crate::cst::{SyntaxKind, SyntaxNode};
use crate::lexer::{Token, lex};
use rowan::{GreenNode, GreenNodeBuilder};

use SyntaxKind::*;

/// A parse error with a byte span into the source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
    pub span: (usize, usize),
}

/// Result of parsing: the lossless green tree plus any errors.
#[derive(Debug, Clone)]
pub struct Parse {
    pub green: GreenNode,
    pub errors: Vec<ParseError>,
}

impl Parse {
    pub fn syntax(&self) -> SyntaxNode {
        SyntaxNode::new_root(self.green.clone())
    }
}

/// Parse a full source text (one expression, then end of input).
pub fn parse(src: &str) -> Parse {
    let tokens = lex(src);
    let mut parser = Parser {
        src,
        tokens,
        pos: 0,
        builder: GreenNodeBuilder::new(),
        errors: Vec::new(),
        arg_depth: 0,
    };
    parser.parse_root();
    Parse {
        green: parser.builder.finish(),
        errors: parser.errors,
    }
}

struct Parser<'s> {
    src: &'s str,
    tokens: Vec<Token>,
    pos: usize,
    builder: GreenNodeBuilder<'static>,
    errors: Vec<ParseError>,
    arg_depth: u32,
}

impl Parser<'_> {
    // --- token plumbing ---

    /// Index of the nth non-trivia token at/after `pos` (0 = next).
    fn nth_index(&self, n: usize) -> Option<usize> {
        let mut seen = 0usize;
        for (i, t) in self.tokens.iter().enumerate().skip(self.pos) {
            if t.kind.is_trivia() {
                continue;
            }
            if seen == n {
                return Some(i);
            }
            seen += 1;
        }
        None
    }

    fn peek_nth(&self, n: usize) -> Option<SyntaxKind> {
        self.nth_index(n).map(|i| self.tokens[i].kind)
    }

    fn peek(&self) -> Option<SyntaxKind> {
        self.peek_nth(0)
    }

    fn at(&self, kind: SyntaxKind) -> bool {
        self.peek() == Some(kind)
    }

    /// Span of the next non-trivia token, or the zero-width end-of-input span.
    fn peek_span(&self) -> (usize, usize) {
        match self.nth_index(0) {
            Some(i) => (self.tokens[i].start, self.tokens[i].end),
            None => (self.src.len(), self.src.len()),
        }
    }

    fn token_text(&self, i: usize) -> &str {
        let t = self.tokens[i];
        &self.src[t.start..t.end]
    }

    /// Emit pending trivia tokens into the builder.
    fn eat_trivia(&mut self) {
        while self.pos < self.tokens.len() && self.tokens[self.pos].kind.is_trivia() {
            self.emit_current();
        }
    }

    fn emit_current(&mut self) {
        let t = self.tokens[self.pos];
        self.builder.token(t.kind.into(), &self.src[t.start..t.end]);
        self.pos += 1;
    }

    /// Emit trivia, then the next token. Panics only on internal misuse
    /// (callers always check `peek()` first).
    fn bump(&mut self) {
        self.eat_trivia();
        assert!(self.pos < self.tokens.len(), "bump at end of input");
        self.emit_current();
    }

    fn start_node(&mut self, kind: SyntaxKind) {
        self.eat_trivia();
        self.builder.start_node(kind.into());
    }

    fn finish_node(&mut self) {
        self.builder.finish_node();
    }

    /// Checkpoint for retroactive wrapping (leading trivia stays outside).
    fn checkpoint(&mut self) -> rowan::Checkpoint {
        self.eat_trivia();
        self.builder.checkpoint()
    }

    fn error(&mut self, message: impl Into<String>, span: (usize, usize)) {
        self.errors.push(ParseError {
            message: message.into(),
            span,
        });
    }

    fn error_here(&mut self, message: impl Into<String>) {
        let span = self.peek_span();
        self.error(message, span);
    }

    /// Expect `kind`; bump it, or record an error (without consuming).
    fn expect(&mut self, kind: SyntaxKind, what: &str) {
        if self.at(kind) {
            self.bump();
        } else {
            let found = self.describe_next();
            self.error_here(format!("expected {what}, found {found}"));
        }
    }

    fn describe_next(&self) -> String {
        match self.nth_index(0) {
            Some(i) => format!("`{}`", self.token_text(i)),
            None => "end of input".to_owned(),
        }
    }

    // --- entry ---

    fn parse_root(&mut self) {
        self.builder.start_node(ROOT.into());
        if self.peek().is_none() {
            self.error_here("expected an expression");
        } else {
            self.parse_expr();
        }
        if self.peek().is_some() {
            self.error_here("expected end of input after the expression");
            self.start_node(ERROR_NODE);
            while self.peek().is_some() {
                self.bump();
            }
            self.finish_node();
        }
        self.eat_trivia();
        self.finish_node();
    }

    // --- expressions ---

    fn parse_expr(&mut self) {
        match self.peek() {
            Some(LET_KW) => self.parse_let(),
            Some(MATCH_KW) => self.parse_match(),
            Some(PIPE) => self.parse_lambda(),
            _ => self.parse_cmp(),
        }
    }

    fn parse_let(&mut self) {
        // Function sugar: `let ident ( … ) …`.
        let is_fn = self.peek_nth(1) == Some(IDENT) && self.peek_nth(2) == Some(L_PAREN);
        if is_fn {
            self.start_node(LET_FN_EXPR);
            self.bump(); // let
            self.bump(); // name
            self.start_node(PARAM_LIST);
            self.bump(); // (
            while self.at(IDENT) {
                self.bump();
                if self.at(COMMA) {
                    self.bump();
                } else {
                    break;
                }
            }
            self.expect(R_PAREN, "`)` after parameters");
            self.finish_node();
        } else {
            self.start_node(LET_EXPR);
            self.bump(); // let
            self.parse_let_pattern();
        }
        if self.at(TYPE_NAME) {
            self.start_node(ANNOT);
            self.bump();
            self.finish_node();
        }
        self.expect(EQ, "`=` in let binding");
        self.parse_expr();
        self.expect(SEMI, "`;` terminating the let binding");
        self.parse_expr();
        self.finish_node();
    }

    fn parse_let_pattern(&mut self) {
        match self.peek() {
            Some(IDENT) => {
                self.start_node(IDENT_PAT);
                self.bump();
                self.finish_node();
            }
            Some(UNDERSCORE) => {
                self.start_node(WILDCARD_PAT);
                self.bump();
                self.finish_node();
            }
            Some(L_BRACE) => {
                self.start_node(TUPLE_PAT);
                self.bump(); // {
                loop {
                    match self.peek() {
                        Some(R_BRACE) | None => break,
                        _ => {}
                    }
                    self.parse_let_pattern();
                    if self.at(COMMA) {
                        self.bump();
                    } else {
                        break;
                    }
                }
                self.expect(R_BRACE, "`}` closing the tuple pattern");
                self.finish_node();
            }
            _ => {
                let found = self.describe_next();
                self.error_here(format!("expected a binding pattern, found {found}"));
            }
        }
    }

    fn parse_match(&mut self) {
        self.start_node(MATCH_EXPR);
        self.bump(); // match
        self.parse_expr(); // scrutinee
        let mut arms = 0usize;
        while self.is_arm_start() {
            self.parse_match_arm();
            arms += 1;
        }
        if arms == 0 {
            self.error_here("expected at least one match arm (`| pattern -> expr`)");
        }
        self.finish_node();
    }

    /// Arm-`|` vs lambda-`|` lookahead: `|` pattern `->` starts an arm; `|`
    /// params `|` would be a lambda (which can only appear at expression
    /// start, so anything that is not an arm ends the match).
    fn is_arm_start(&self) -> bool {
        if !self.at(PIPE) {
            return false;
        }
        match self.peek_nth(1) {
            Some(MINUS | NUM | DEC | STR | ATOM | UNDERSCORE | L_BRACE) => true,
            Some(IDENT) => self.peek_nth(2) == Some(ARROW),
            _ => false,
        }
    }

    fn parse_match_arm(&mut self) {
        self.start_node(MATCH_ARM);
        self.bump(); // |
        self.parse_arm_pat();
        self.expect(ARROW, "`->` after the match pattern");
        self.parse_expr();
        self.finish_node();
    }

    fn parse_arm_pat(&mut self) {
        self.start_node(ARM_PAT);
        match self.peek() {
            Some(MINUS) => {
                // Negative pattern literal (D32-2 review note).
                self.bump();
                match self.peek() {
                    Some(NUM | DEC) => self.bump(),
                    _ => {
                        let found = self.describe_next();
                        self.error_here(format!(
                            "expected a numeric literal after `-` in a match pattern, found {found}"
                        ));
                    }
                }
            }
            Some(NUM | DEC | STR | ATOM | IDENT | UNDERSCORE) => self.bump(),
            Some(L_BRACE) => {
                self.start_node(ARM_TUPLE_PAT);
                self.bump(); // {
                loop {
                    match self.peek() {
                        Some(R_BRACE) | None => break,
                        _ => {}
                    }
                    self.parse_arm_pat();
                    if self.at(COMMA) {
                        self.bump();
                    } else {
                        break;
                    }
                }
                self.expect(R_BRACE, "`}` closing the tuple pattern");
                self.finish_node();
            }
            _ => {
                let found = self.describe_next();
                self.error_here(format!("expected a match pattern, found {found}"));
            }
        }
        self.finish_node();
    }

    fn parse_lambda(&mut self) {
        self.start_node(LAMBDA_EXPR);
        self.bump(); // |
        self.start_node(PARAM_LIST);
        while self.at(IDENT) {
            self.bump();
            if self.at(COMMA) {
                self.bump();
            } else {
                break;
            }
        }
        self.finish_node();
        self.expect(PIPE, "`|` closing the lambda parameters");
        self.parse_expr();
        self.finish_node();
    }

    fn parse_cmp(&mut self) {
        let cp = self.checkpoint();
        self.parse_add();
        if matches!(self.peek(), Some(LT | LE | GT | GE | EQ_EQ | NOT_EQ)) {
            // Non-assoc level, but chains PARSE into one flat node (D32-2);
            // the type stage rejects chains of length > 1.
            self.builder.start_node_at(cp, CMP_CHAIN.into());
            while matches!(self.peek(), Some(LT | LE | GT | GE | EQ_EQ | NOT_EQ)) {
                self.bump();
                self.parse_add();
            }
            self.finish_node();
        }
    }

    fn parse_add(&mut self) {
        let cp = self.checkpoint();
        self.parse_mul();
        while matches!(self.peek(), Some(PLUS | MINUS)) {
            self.builder.start_node_at(cp, BIN_EXPR.into());
            self.bump();
            self.parse_mul();
            self.finish_node();
        }
    }

    fn parse_mul(&mut self) {
        let cp = self.checkpoint();
        self.parse_unary();
        while matches!(self.peek(), Some(STAR | SLASH)) {
            self.builder.start_node_at(cp, BIN_EXPR.into());
            self.bump();
            self.parse_unary();
            self.finish_node();
        }
    }

    fn parse_unary(&mut self) {
        if self.at(MINUS) {
            self.start_node(UNARY_EXPR);
            self.bump();
            self.parse_unary();
            self.finish_node();
        } else {
            self.parse_postfix();
        }
    }

    fn parse_postfix(&mut self) {
        let cp = self.checkpoint();
        self.parse_atom_expr();
        loop {
            match self.peek() {
                Some(L_PAREN) => {
                    self.builder.start_node_at(cp, CALL_EXPR.into());
                    self.parse_arg_list();
                    self.finish_node();
                }
                Some(L_BRACKET) => {
                    self.builder.start_node_at(cp, LABEL_EXPR.into());
                    self.bump(); // [
                    self.parse_label_word();
                    self.expect(R_BRACKET, "`]` closing the label");
                    self.finish_node();
                }
                _ => break,
            }
        }
    }

    /// Label words use the ident charset `[a-z][a-z0-9_]*` (D32-6 — no kebab).
    /// A `DIE`-shaped word like `d6` is accepted when it fits the charset.
    fn parse_label_word(&mut self) {
        match self.peek() {
            Some(IDENT | DIE) => {
                let i = self.nth_index(0).expect("peeked");
                let text = self.token_text(i).to_owned();
                let span = (self.tokens[i].start, self.tokens[i].end);
                let mut chars = text.chars();
                let ok = chars.next().is_some_and(|c| c.is_ascii_lowercase())
                    && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
                if !ok {
                    self.error(
                        format!("label word `{text}` must match [a-z][a-z0-9_]*"),
                        span,
                    );
                }
                self.bump();
            }
            _ => {
                let found = self.describe_next();
                self.error_here(format!(
                    "expected a label word ([a-z][a-z0-9_]*), found {found}"
                ));
            }
        }
    }

    fn parse_arg_list(&mut self) {
        self.start_node(ARG_LIST);
        self.bump(); // (
        if !self.at(R_PAREN) && self.peek().is_some() {
            loop {
                let before = self.pos;
                self.start_node(ARG);
                self.arg_depth += 1;
                self.parse_expr();
                self.arg_depth -= 1;
                self.finish_node();
                if self.at(COMMA) {
                    self.bump();
                    if self.at(R_PAREN) {
                        break; // trailing comma
                    }
                } else {
                    break;
                }
                if self.pos == before && !self.at(COMMA) {
                    break; // no progress — bail out of the argument loop
                }
            }
        }
        self.expect(R_PAREN, "`)` closing the arguments");
        self.finish_node();
    }

    fn parse_atom_expr(&mut self) {
        match self.peek() {
            Some(NUM | DEC | FLOAT | ATOM) => {
                self.start_node(LITERAL);
                self.bump();
                self.finish_node();
            }
            Some(STR) => {
                let i = self.nth_index(0).expect("peeked");
                self.validate_str_escapes(i);
                self.start_node(LITERAL);
                self.bump();
                self.finish_node();
            }
            Some(DIE) => {
                self.start_node(DIE_EXPR);
                self.bump();
                self.finish_node();
            }
            Some(IDENT) => {
                self.start_node(NAME_REF);
                self.bump();
                self.finish_node();
            }
            Some(UNDERSCORE) => {
                if self.arg_depth == 0 {
                    self.error_here("placeholder `_` is only allowed inside a call argument");
                }
                self.start_node(PLACEHOLDER);
                self.bump();
                self.finish_node();
            }
            Some(L_PAREN) => {
                if self.peek_nth(1) == Some(R_PAREN) {
                    // Unit literal `()`.
                    self.start_node(LITERAL);
                    self.bump();
                    self.bump();
                    self.finish_node();
                } else {
                    self.start_node(PAREN_EXPR);
                    self.bump();
                    self.parse_expr();
                    self.expect(R_PAREN, "`)` closing the parenthesized expression");
                    self.finish_node();
                }
            }
            Some(L_BRACKET) => self.parse_list_or_dict(),
            Some(L_BRACE) => self.parse_tuple(),
            _ => {
                let found = self.describe_next();
                self.error_here(format!("expected an expression, found {found}"));
                // Consume the offender unless it is a closer/separator the
                // caller may need for its own recovery.
                if let Some(k) = self.peek() {
                    let follow = matches!(
                        k,
                        R_PAREN | R_BRACKET | R_BRACE | COMMA | SEMI | PIPE | ARROW | EQ
                    );
                    if !follow {
                        self.start_node(ERROR_NODE);
                        self.bump();
                        self.finish_node();
                    }
                }
            }
        }
    }

    /// The `[`-fork (D32-2): `[:]` = empty dict; `[]` = empty list; otherwise
    /// parse the first expression and dispatch on `:`.
    fn parse_list_or_dict(&mut self) {
        let cp = self.checkpoint();
        self.bump(); // [
        if self.at(COLON) {
            self.bump();
            self.expect(R_BRACKET, "`]` closing the empty dict `[:]`");
            self.builder.start_node_at(cp, DICT_EXPR.into());
            self.finish_node();
            return;
        }
        if self.at(R_BRACKET) {
            self.bump();
            self.builder.start_node_at(cp, LIST_EXPR.into());
            self.finish_node();
            return;
        }
        let ecp = self.checkpoint();
        self.parse_expr();
        if self.at(COLON) {
            // Dict literal.
            self.builder.start_node_at(ecp, DICT_ENTRY.into());
            self.bump(); // :
            self.parse_expr();
            self.finish_node();
            while self.at(COMMA) {
                self.bump();
                if self.at(R_BRACKET) {
                    break; // trailing comma
                }
                self.start_node(DICT_ENTRY);
                self.parse_expr();
                self.expect(COLON, "`:` between dict key and value");
                self.parse_expr();
                self.finish_node();
            }
            self.expect(R_BRACKET, "`]` closing the dict");
            self.builder.start_node_at(cp, DICT_EXPR.into());
            self.finish_node();
        } else {
            // List literal.
            while self.at(COMMA) {
                self.bump();
                if self.at(R_BRACKET) {
                    break; // trailing comma
                }
                self.parse_expr();
            }
            self.expect(R_BRACKET, "`]` closing the list");
            self.builder.start_node_at(cp, LIST_EXPR.into());
            self.finish_node();
        }
    }

    fn parse_tuple(&mut self) {
        self.start_node(TUPLE_EXPR);
        self.bump(); // {
        if self.at(R_BRACE) {
            self.error_here("a tuple needs at least one element");
            self.bump();
            self.finish_node();
            return;
        }
        self.parse_expr();
        while self.at(COMMA) {
            self.bump();
            if self.at(R_BRACE) {
                break; // trailing comma
            }
            self.parse_expr();
        }
        self.expect(R_BRACE, "`}` closing the tuple");
        self.finish_node();
    }

    /// Only `\"`, `\\`, `\n` are legal escapes (D32-1).
    fn validate_str_escapes(&mut self, token_index: usize) {
        let t = self.tokens[token_index];
        let text = &self.src[t.start..t.end];
        let bytes = text.as_bytes();
        let mut i = 1; // skip opening quote
        while i + 1 < bytes.len() {
            if bytes[i] == b'\\' {
                match bytes.get(i + 1) {
                    Some(b'"' | b'\\' | b'n') => i += 2,
                    _ => {
                        let start = t.start + i;
                        let end = (start + 2).min(t.end);
                        self.error(
                            "invalid string escape (only \\\" \\\\ \\n are allowed)".to_owned(),
                            (start, end),
                        );
                        i += 2;
                    }
                }
            } else {
                i += 1;
            }
        }
    }
}
