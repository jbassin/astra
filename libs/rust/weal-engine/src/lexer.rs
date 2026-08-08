//! Logos tokenizer per D32-1.
//!
//! Notable decisions carried from the spec:
//! - The die literal + its suffix run is ONE fat token
//!   (`([0-9][0-9_]*)?d[0-9][0-9_]*([a-z]+[0-9]*)*`) with explicit priority over
//!   `IDENT`, so `d6`, `d6kh3`, `4d6kh3`, `2d6e2r1` always lex as die tokens and
//!   an identifier can never shadow a die form. The parser/lowering splits it.
//! - Comments `(* … *)` are NESTABLE (depth-counting callback) and preserved as
//!   trivia tokens, as is whitespace (lossless CST).
//! - `[:]` is not special at the lex level: it emits `[`, `:`, `]` (an atom
//!   requires `[a-z]` after the colon), and the parser forks on it.

use crate::cst::SyntaxKind;
use logos::{Lexer, Logos};

/// Consume the body of a `(* … *)` comment, honoring nesting.
///
/// Called after logos matched the opening `(*`. Errors on an unterminated
/// comment (the token then surfaces as `ERROR_TOKEN` with the `(*` span).
fn lex_comment(lex: &mut Lexer<'_, Tok>) -> Result<(), ()> {
    let bytes = lex.remainder().as_bytes();
    let mut depth = 1usize;
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'(' && bytes.get(i + 1) == Some(&b'*') {
            depth += 1;
            i += 2;
        } else if bytes[i] == b'*' && bytes.get(i + 1) == Some(&b')') {
            depth -= 1;
            i += 2;
            if depth == 0 {
                lex.bump(i);
                return Ok(());
            }
        } else {
            i += 1;
        }
    }
    Err(())
}

#[derive(Logos, Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tok {
    #[regex(r"[ \t\r\n]+")]
    Whitespace,

    #[token("(*", lex_comment)]
    Comment,

    #[token("let", priority = 100)]
    LetKw,
    #[token("match", priority = 100)]
    MatchKw,

    /// The fat die token — explicit priority over `Ident` (D32-1).
    #[regex(r"([0-9][0-9_]*)?d[0-9][0-9_]*([a-z]+[0-9]*)*", priority = 20)]
    Die,

    #[regex(r"[a-z][a-zA-Z0-9_]*")]
    Ident,
    #[regex(r"[A-Z][a-zA-Z0-9_]*")]
    TypeName,
    #[regex(r":[a-z][a-z0-9\-]*")]
    Atom,

    #[regex(r"[0-9][0-9_]*\.[0-9][0-9_]*f")]
    Float,
    #[regex(r"[0-9][0-9_]*\.[0-9][0-9_]*")]
    Dec,
    #[regex(r"[0-9][0-9_]*")]
    Num,
    #[regex(r#""([^"\\]|\\.)*""#)]
    Str,

    #[token("_")]
    Underscore,

    #[token("(")]
    LParen,
    #[token(")")]
    RParen,
    #[token("[")]
    LBracket,
    #[token("]")]
    RBracket,
    #[token("{")]
    LBrace,
    #[token("}")]
    RBrace,
    #[token(",")]
    Comma,
    #[token(";")]
    Semi,
    #[token(":")]
    Colon,
    #[token("|")]
    Pipe,
    #[token("->")]
    Arrow,
    #[token("=")]
    Eq,
    #[token("+")]
    Plus,
    #[token("-")]
    Minus,
    #[token("*")]
    Star,
    #[token("/")]
    Slash,
    #[token("<")]
    Lt,
    #[token("<=")]
    Le,
    #[token(">")]
    Gt,
    #[token(">=")]
    Ge,
    #[token("==")]
    EqEq,
    #[token("!=")]
    NotEq,
}

impl Tok {
    fn syntax_kind(self) -> SyntaxKind {
        match self {
            Tok::Whitespace => SyntaxKind::WHITESPACE,
            Tok::Comment => SyntaxKind::COMMENT,
            Tok::LetKw => SyntaxKind::LET_KW,
            Tok::MatchKw => SyntaxKind::MATCH_KW,
            Tok::Die => SyntaxKind::DIE,
            Tok::Ident => SyntaxKind::IDENT,
            Tok::TypeName => SyntaxKind::TYPE_NAME,
            Tok::Atom => SyntaxKind::ATOM,
            Tok::Float => SyntaxKind::FLOAT,
            Tok::Dec => SyntaxKind::DEC,
            Tok::Num => SyntaxKind::NUM,
            Tok::Str => SyntaxKind::STR,
            Tok::Underscore => SyntaxKind::UNDERSCORE,
            Tok::LParen => SyntaxKind::L_PAREN,
            Tok::RParen => SyntaxKind::R_PAREN,
            Tok::LBracket => SyntaxKind::L_BRACKET,
            Tok::RBracket => SyntaxKind::R_BRACKET,
            Tok::LBrace => SyntaxKind::L_BRACE,
            Tok::RBrace => SyntaxKind::R_BRACE,
            Tok::Comma => SyntaxKind::COMMA,
            Tok::Semi => SyntaxKind::SEMI,
            Tok::Colon => SyntaxKind::COLON,
            Tok::Pipe => SyntaxKind::PIPE,
            Tok::Arrow => SyntaxKind::ARROW,
            Tok::Eq => SyntaxKind::EQ,
            Tok::Plus => SyntaxKind::PLUS,
            Tok::Minus => SyntaxKind::MINUS,
            Tok::Star => SyntaxKind::STAR,
            Tok::Slash => SyntaxKind::SLASH,
            Tok::Lt => SyntaxKind::LT,
            Tok::Le => SyntaxKind::LE,
            Tok::Gt => SyntaxKind::GT,
            Tok::Ge => SyntaxKind::GE,
            Tok::EqEq => SyntaxKind::EQ_EQ,
            Tok::NotEq => SyntaxKind::NOT_EQ,
        }
    }
}

/// A lexed token: kind + byte span into the source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Token {
    pub kind: SyntaxKind,
    pub start: usize,
    pub end: usize,
}

/// Lex the full source. Unlexable byte runs become `ERROR_TOKEN`s — the lexer
/// never fails, the parser reports the error with the span.
pub fn lex(src: &str) -> Vec<Token> {
    let mut out = Vec::new();
    let mut lexer = Tok::lexer(src);
    while let Some(res) = lexer.next() {
        let span = lexer.span();
        let kind = match res {
            Ok(tok) => tok.syntax_kind(),
            Err(()) => SyntaxKind::ERROR_TOKEN,
        };
        out.push(Token {
            kind,
            start: span.start,
            end: span.end,
        });
    }
    out
}

/// Debug rendering of a token stream — one `KIND "text"` line per token
/// (trivia included). Used by the lexer goldens.
pub fn lex_debug(src: &str) -> String {
    lex(src)
        .iter()
        .map(|t| format!("{:?} {:?}", t.kind, &src[t.start..t.end]))
        .collect::<Vec<_>>()
        .join("\n")
}
