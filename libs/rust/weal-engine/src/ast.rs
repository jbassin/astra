//! The typed AST — the structure the S2 checker and S3 interpreter consume,
//! produced by lowering the rowan CST (`lower.rs`).
//!
//! Numeric literals are stored as NORMALIZED digit strings (underscores
//! stripped) so arbitrary precision survives S1 without committing to a bigint
//! representation; die counts/sides likewise (D32-5 splits the fat token into
//! `(count, sides, suffix-chain)` here).
//!
//! The AST is deliberately span-free and derives structural equality — the S1
//! round-trip property is `lower(parse(print(a))) == a`.

/// Comparison operators — non-associative level 1; chains PARSE into one flat
/// [`Expr::Cmp`] node and are rejected later at the type stage (D32-2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CmpOp {
    Lt,
    Le,
    Gt,
    Ge,
    EqEq,
    NotEq,
}

impl CmpOp {
    pub fn as_str(self) -> &'static str {
        match self {
            CmpOp::Lt => "<",
            CmpOp::Le => "<=",
            CmpOp::Gt => ">",
            CmpOp::Ge => ">=",
            CmpOp::EqEq => "==",
            CmpOp::NotEq => "!=",
        }
    }
}

/// Arithmetic binary operators: add/sub (level 2), mul/div (level 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
}

impl BinOp {
    pub fn as_str(self) -> &'static str {
        match self {
            BinOp::Add => "+",
            BinOp::Sub => "-",
            BinOp::Mul => "*",
            BinOp::Div => "/",
        }
    }
}

/// One die-suffix application from the fat token: longest `[a-z]+` = name,
/// following digits = optional Num argument (D32-5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DieSuffix {
    pub name: String,
    /// Normalized digits; `None` for a digit-less suffix like `4d6kh`
    /// (parses fine — rejected at the type stage per D32-5).
    pub arg: Option<String>,
}

/// `let` binding patterns: ident, wildcard, or tuple destructure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Pattern {
    Ident(String),
    Wildcard,
    Tuple(Vec<Pattern>),
}

/// Match-arm patterns (D32-2 `mpat`) — negative literals allowed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MatchPat {
    /// `-`? num-lit; `neg` records the leading minus.
    Num {
        neg: bool,
        digits: String,
    },
    /// `-`? dec-lit (normalized, underscores stripped).
    Dec {
        neg: bool,
        text: String,
    },
    /// String literal pattern (unescaped value).
    Str(String),
    /// Atom pattern, name without the leading `:`.
    Atom(String),
    /// Binder.
    Ident(String),
    Wildcard,
    Tuple(Vec<MatchPat>),
}

/// A weal v2 expression.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    /// `let pattern annot? = value; body`.
    Let {
        pattern: Pattern,
        annot: Option<String>,
        value: Box<Expr>,
        body: Box<Expr>,
    },
    /// Function sugar `let name(params) annot? = value; body` — kept distinct
    /// from [`Expr::Let`] because D32-3 gives it different recursion scoping.
    LetFn {
        name: String,
        params: Vec<String>,
        annot: Option<String>,
        value: Box<Expr>,
        body: Box<Expr>,
    },
    /// `match scrutinee (| pat -> body)+` — arms bound to the NEAREST match.
    Match {
        scrutinee: Box<Expr>,
        arms: Vec<(MatchPat, Expr)>,
    },
    /// `|params| body`.
    Lambda {
        params: Vec<String>,
        body: Box<Expr>,
    },
    /// Flat comparison chain: `first op1 e1 op2 e2 …` (`rest` is non-empty).
    Cmp {
        first: Box<Expr>,
        rest: Vec<(CmpOp, Expr)>,
    },
    /// Left-associative `+ - * /`.
    Binary {
        op: BinOp,
        lhs: Box<Expr>,
        rhs: Box<Expr>,
    },
    /// Prefix `-`.
    Neg(Box<Expr>),
    /// `callee(args)`. Placeholder arguments have already been desugared into
    /// lambdas by lowering (D32-2), so no placeholder node exists here.
    Call {
        callee: Box<Expr>,
        args: Vec<Expr>,
    },
    /// `expr[word]` render label (D32-6).
    Label {
        expr: Box<Expr>,
        word: String,
    },
    /// A die literal split from the fat token (D32-5).
    Die {
        /// Normalized digits; `None` for the bare `dM` form.
        count: Option<String>,
        sides: String,
        suffixes: Vec<DieSuffix>,
    },
    /// Num literal, normalized digits.
    Num(String),
    /// Dec literal, normalized `int.frac` text.
    Dec(String),
    /// Float literal, normalized `int.frac` text (printer re-adds the `f`).
    Float(String),
    /// String literal, unescaped value.
    Str(String),
    /// Atom, name without the leading `:`.
    Atom(String),
    Unit,
    /// Identifier reference.
    Ident(String),
    List(Vec<Expr>),
    /// Dict literal entries in source order (`[:]` = empty).
    Dict(Vec<(Expr, Expr)>),
    /// `{e1, …}` — at least one element.
    Tuple(Vec<Expr>),
}
