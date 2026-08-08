//! Rowan setup: the [`SyntaxKind`] enum (tokens + composite nodes), the language
//! impl, and type aliases for the lossless syntax tree.
//!
//! The tree is lossless: whitespace and `(* … *)` comments are preserved as
//! trivia tokens, so `node.text()` reproduces the source byte-for-byte.

use rowan::Language;

/// Every token and node kind in the weal v2 syntax tree.
///
/// Token kinds come first, composite node kinds after `ROOT`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u16)]
#[allow(non_camel_case_types, clippy::upper_case_acronyms)]
pub enum SyntaxKind {
    // --- trivia tokens ---
    /// Whitespace run (preserved as trivia).
    WHITESPACE = 0,
    /// A `(* … *)` comment, nestable (preserved as trivia).
    COMMENT,
    /// A byte sequence the lexer could not tokenize.
    ERROR_TOKEN,

    // --- keyword tokens ---
    LET_KW,
    MATCH_KW,

    // --- literal / name tokens ---
    /// `[a-z][a-zA-Z0-9_]*` (not `let`/`match`, not shadowing a die form).
    IDENT,
    /// `[A-Z][a-zA-Z0-9_]*` — type names for `let` annotations (D32-2 annot).
    TYPE_NAME,
    /// `:` + `[a-z][a-z0-9-]*` (kebab allowed in atoms only).
    ATOM,
    /// `[0-9][0-9_]*` (arbitrary precision).
    NUM,
    /// `[0-9][0-9_]*\.[0-9][0-9_]*`.
    DEC,
    /// Dec form + `f`.
    FLOAT,
    /// `"…"` with `\"` `\\` `\n` escapes only.
    STR,
    /// The fat die token (D32-1):
    /// `([0-9][0-9_]*)?d[0-9][0-9_]*([a-z]+[0-9]*)*`, priority over IDENT.
    DIE,
    /// `_` — placeholder in call-argument position, wildcard in patterns.
    UNDERSCORE,

    // --- punctuation tokens ---
    L_PAREN,
    R_PAREN,
    L_BRACKET,
    R_BRACKET,
    L_BRACE,
    R_BRACE,
    COMMA,
    SEMI,
    COLON,
    PIPE,
    ARROW,
    EQ,
    PLUS,
    MINUS,
    STAR,
    SLASH,
    LT,
    LE,
    GT,
    GE,
    EQ_EQ,
    NOT_EQ,

    // --- composite nodes ---
    ROOT,
    /// `let pattern annot? = expr ; expr` (value form).
    LET_EXPR,
    /// `let ident ( params ) annot? = expr ; expr` (function sugar).
    LET_FN_EXPR,
    /// Pattern position of a `let`: IDENT / UNDERSCORE / TUPLE_PAT.
    IDENT_PAT,
    WILDCARD_PAT,
    TUPLE_PAT,
    /// Optional `let` type annotation (a single TYPE_NAME token).
    ANNOT,
    /// `match expr (| mpat -> expr)+` — arms bind to the NEAREST match.
    MATCH_EXPR,
    MATCH_ARM,
    /// A match-arm pattern (literal / `-`literal / atom / ident / `_` / tuple).
    ARM_PAT,
    ARM_TUPLE_PAT,
    /// `| params | expr`.
    LAMBDA_EXPR,
    PARAM_LIST,
    /// Flat non-assoc comparison chain: `a < b < c` (rejected at TYPE stage).
    CMP_CHAIN,
    /// Left-assoc `+ - * /` node.
    BIN_EXPR,
    /// Prefix `-`.
    UNARY_EXPR,
    /// `callee(args)`.
    CALL_EXPR,
    ARG_LIST,
    /// One call argument — the placeholder-binding boundary (D32-2).
    ARG,
    /// `expr[word]` postfix label (D32-6).
    LABEL_EXPR,
    /// A die literal (the fat DIE token wrapped as an expression).
    DIE_EXPR,
    /// Num / Dec / Float / Str / Atom / `()` unit.
    LITERAL,
    /// An identifier in expression position.
    NAME_REF,
    /// `_` in call-argument position.
    PLACEHOLDER,
    PAREN_EXPR,
    LIST_EXPR,
    DICT_EXPR,
    DICT_ENTRY,
    TUPLE_EXPR,
    /// Recovery node wrapping skipped tokens.
    ERROR_NODE,
}

impl SyntaxKind {
    pub fn is_trivia(self) -> bool {
        matches!(self, SyntaxKind::WHITESPACE | SyntaxKind::COMMENT)
    }
}

impl From<SyntaxKind> for rowan::SyntaxKind {
    fn from(kind: SyntaxKind) -> Self {
        rowan::SyntaxKind(kind as u16)
    }
}

/// The rowan language tag for weal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum WealLanguage {}

impl Language for WealLanguage {
    type Kind = SyntaxKind;

    fn kind_from_raw(raw: rowan::SyntaxKind) -> SyntaxKind {
        assert!(raw.0 <= SyntaxKind::ERROR_NODE as u16);
        // SAFETY: SyntaxKind is repr(u16) and the value is range-checked above.
        unsafe { std::mem::transmute::<u16, SyntaxKind>(raw.0) }
    }

    fn kind_to_raw(kind: SyntaxKind) -> rowan::SyntaxKind {
        kind.into()
    }
}

pub type SyntaxNode = rowan::SyntaxNode<WealLanguage>;
pub type SyntaxToken = rowan::SyntaxToken<WealLanguage>;
pub type SyntaxElement = rowan::SyntaxElement<WealLanguage>;
