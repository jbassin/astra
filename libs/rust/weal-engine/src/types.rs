//! The S2 type representation (D32-3).
//!
//! `Bool` is NOT a constructor — it is an alias for the atom union
//! `:false | :true`, and [`Type`]'s `Display` prints that union back as
//! `Bool`. Singleton atoms are size-1 unions (`:fire` : `:fire`); the `Atom`
//! constructor is the TOP atom type. Subsumption is one-directional subset
//! widening: singleton ≤ union ≤ Atom.

use std::collections::BTreeSet;
use std::fmt;

/// A weal v2 type. `Var` is an inference variable owned by the checker's
/// substitution table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Type {
    Unit,
    Num,
    Dec,
    Float,
    Str,
    /// The TOP atom type — any atom.
    Atom,
    /// A sorted set of atom names (without the leading `:`); singleton atoms
    /// are size-1 unions. `Bool` = `{false, true}`.
    Union(BTreeSet<String>),
    Tuple(Vec<Type>),
    List(Box<Type>),
    Dict(Box<Type>, Box<Type>),
    Die(Box<Type>),
    Pool(Box<Type>),
    /// `A -> B` (curried). The domain is the ONE contravariant position.
    Arrow(Box<Type>, Box<Type>),
    Var(u32),
}

impl Type {
    /// The predefined `Bool` alias: `:false | :true`.
    pub fn bool() -> Type {
        Type::Union(BTreeSet::from(["false".to_owned(), "true".to_owned()]))
    }

    /// A singleton atom union.
    pub fn atom(name: &str) -> Type {
        Type::Union(BTreeSet::from([name.to_owned()]))
    }

    /// A union of the given atom names.
    pub fn union<I: IntoIterator<Item = S>, S: Into<String>>(names: I) -> Type {
        Type::Union(names.into_iter().map(Into::into).collect())
    }

    pub fn arrow(dom: Type, cod: Type) -> Type {
        Type::Arrow(Box::new(dom), Box::new(cod))
    }

    /// Fold `params -> ret` into a curried arrow chain.
    pub fn arrows(params: Vec<Type>, ret: Type) -> Type {
        params
            .into_iter()
            .rev()
            .fold(ret, |acc, p| Type::arrow(p, acc))
    }

    pub fn die(t: Type) -> Type {
        Type::Die(Box::new(t))
    }

    pub fn pool(t: Type) -> Type {
        Type::Pool(Box::new(t))
    }

    pub fn list(t: Type) -> Type {
        Type::List(Box::new(t))
    }

    pub fn dict(k: Type, v: Type) -> Type {
        Type::Dict(Box::new(k), Box::new(v))
    }

    /// Does this (resolved) type contain a function anywhere? Used by the
    /// equatable check (D32-3): dict keys / evaluator states / `==` operands
    /// must be function-free.
    pub fn contains_arrow(&self) -> bool {
        match self {
            Type::Arrow(..) => true,
            Type::Tuple(ts) => ts.iter().any(Type::contains_arrow),
            Type::List(t) | Type::Die(t) | Type::Pool(t) => t.contains_arrow(),
            Type::Dict(k, v) => k.contains_arrow() || v.contains_arrow(),
            _ => false,
        }
    }

    /// Collect free inference variables into `out` (in first-occurrence
    /// order, deduplicated).
    pub fn free_vars(&self, out: &mut Vec<u32>) {
        match self {
            Type::Var(v) => {
                if !out.contains(v) {
                    out.push(*v);
                }
            }
            Type::Tuple(ts) => ts.iter().for_each(|t| t.free_vars(out)),
            Type::List(t) | Type::Die(t) | Type::Pool(t) => t.free_vars(out),
            Type::Dict(k, v) => {
                k.free_vars(out);
                v.free_vars(out);
            }
            Type::Arrow(d, c) => {
                d.free_vars(out);
                c.free_vars(out);
            }
            _ => {}
        }
    }

    /// Is a `Display` of this type ambiguous as an arrow domain / bracket
    /// element without parentheses?
    fn needs_parens_in_domain(&self) -> bool {
        matches!(self, Type::Arrow(..)) || matches!(self, Type::Union(s) if s.len() > 1)
    }
}

impl fmt::Display for Type {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Type::Unit => write!(f, "Unit"),
            Type::Num => write!(f, "Num"),
            Type::Dec => write!(f, "Dec"),
            Type::Float => write!(f, "Float"),
            Type::Str => write!(f, "Str"),
            Type::Atom => write!(f, "Atom"),
            Type::Union(names) => {
                if *self == Type::bool() {
                    return write!(f, "Bool");
                }
                let mut first = true;
                for n in names {
                    if !first {
                        write!(f, " | ")?;
                    }
                    first = false;
                    write!(f, ":{n}")?;
                }
                Ok(())
            }
            Type::Tuple(ts) => {
                write!(f, "{{")?;
                for (i, t) in ts.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{t}")?;
                }
                write!(f, "}}")
            }
            Type::List(t) => write!(f, "List[{t}]"),
            Type::Dict(k, v) => write!(f, "Dict[{k}, {v}]"),
            Type::Die(t) => write!(f, "Die[{t}]"),
            Type::Pool(t) => write!(f, "Pool[{t}]"),
            Type::Arrow(d, c) => {
                if d.needs_parens_in_domain() {
                    write!(f, "({d}) -> {c}")
                } else {
                    write!(f, "{d} -> {c}")
                }
            }
            Type::Var(v) => write!(f, "t{v}"),
        }
    }
}

/// Why a deferred equatable constraint exists — used in its error message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EquatableSite {
    DictKey,
    EvaluatorState,
    CmpOperand,
    RollArgument,
}

impl EquatableSite {
    pub fn describe(self) -> &'static str {
        match self {
            EquatableSite::DictKey => "dict keys",
            EquatableSite::EvaluatorState => "evaluator states",
            EquatableSite::CmpOperand => "compared values",
            EquatableSite::RollArgument => "rolled values",
        }
    }
}

/// A deferred function-free (equatable) constraint (D32-3): checked on the
/// RESOLVED type once inference finishes; silent while the type stays an
/// unconstrained variable; a ground arrow landing there = type error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EquatableConstraint {
    pub ty: Type,
    pub site: EquatableSite,
}

/// A deferred die-lifting arithmetic constraint (the 2026-08-10 D32-4
/// amendment): `l ⊕ r = ret`, where a Var operand may still resolve to
/// either `Num` or `Die[Num]` — the choice is made at solve time (end of
/// checking, or per instantiation when carried by a scheme), defaulting
/// to `Num` when nothing resolves it. `r = None` is unary negation
/// (shape-preserving, so Dec/Float operands stay legal there).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArithConstraint {
    pub l: Type,
    pub r: Option<Type>,
    pub ret: Type,
}

/// A rank-1 type scheme: `∀ vars . constraints => ty`. Constraints are
/// re-instantiated (with the caller's span) every time the scheme is
/// instantiated — this is what makes generic wrappers around `evaluate`
/// still reject closure states at THEIR call sites, and what lets a
/// let-bound `|x| x + 1` lift to dice at one call site and stay numeric
/// at another (`arith`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scheme {
    pub vars: Vec<u32>,
    pub constraints: Vec<EquatableConstraint>,
    pub arith: Vec<ArithConstraint>,
    pub ty: Type,
}

impl Scheme {
    /// A scheme with no quantified variables and no constraints.
    pub fn mono(ty: Type) -> Scheme {
        Scheme {
            vars: Vec::new(),
            constraints: Vec::new(),
            arith: Vec::new(),
            ty,
        }
    }

    /// Quantify the given vars over `ty`, unconstrained.
    pub fn poly(vars: Vec<u32>, ty: Type) -> Scheme {
        Scheme {
            vars,
            constraints: Vec::new(),
            arith: Vec::new(),
            ty,
        }
    }
}

impl fmt::Display for Scheme {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.ty)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bool_union_displays_as_bool() {
        assert_eq!(Type::bool().to_string(), "Bool");
    }

    #[test]
    fn union_displays_sorted_atoms() {
        assert_eq!(Type::union(["b", "a"]).to_string(), ":a | :b");
        assert_eq!(Type::atom("fire").to_string(), ":fire");
    }

    #[test]
    fn arrow_display_parenthesizes_ambiguous_domains() {
        let f = Type::arrow(Type::arrow(Type::Num, Type::Num), Type::Str);
        assert_eq!(f.to_string(), "(Num -> Num) -> Str");
        let g = Type::arrow(Type::union(["a", "b"]), Type::Num);
        assert_eq!(g.to_string(), "(:a | :b) -> Num");
        let h = Type::arrow(Type::atom("a"), Type::Num);
        assert_eq!(h.to_string(), ":a -> Num");
    }

    #[test]
    fn compound_display() {
        let t = Type::dict(Type::atom("a"), Type::list(Type::die(Type::Num)));
        assert_eq!(t.to_string(), "Dict[:a, List[Die[Num]]]");
        assert_eq!(
            Type::Tuple(vec![Type::Num, Type::Var(3)]).to_string(),
            "{Num, t3}"
        );
    }

    #[test]
    fn contains_arrow_recurses() {
        assert!(Type::list(Type::arrow(Type::Num, Type::Num)).contains_arrow());
        assert!(!Type::dict(Type::atom("a"), Type::Num).contains_arrow());
    }
}
