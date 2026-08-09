//! S5 — the render tree + sampling (spec 0032 §3, D32-11, D32-15).
//!
//! A die display's [`DieTree`] is sampled with a host-seeded ChaCha20 rng:
//! leaves are sampled LEFT-TO-RIGHT in source order (tree order — lhs before
//! rhs, pool draws in index order, an explosion/reroll chain completing
//! before the next die), and every composite value is COMPUTED from the leaf
//! samples (never sampled independently), so the top-level value is always
//! consistent with the shown faces.
//!
//! # Sampling per node
//!
//! - `Leaf{count,sides}` draws `count` uniform faces; each `(sides, face)`
//!   pair is recorded into `standardDice` (kept, dropped, and chain draws
//!   alike — D32-11).
//! - `Dl`/`Dm` draw one face by exact weight over the denominator; they
//!   contribute NO `standardDice` rows (R20).
//! - `Explode` chains draws while a draw equals the inner die's maximum
//!   face, up to `depth` ADDITIONAL draws (matching `dist::explode`); the
//!   chain renders `face→face→…`.
//! - `Reroll`/`RerollFace` draw once, and on a matching face draw ONCE more
//!   (the second draw is kept even if it matches again — `dist::reroll_faces`
//!   law). **Design call (goldened):** reroll chains render `orig→rerolled`
//!   exactly like explode chains.
//! - `Cmp` compares the two sampled operands; `BinOp`/`Neg`/`MinMax`
//!   compute; `Sum`/`Successes` fold the sampled pool; `Evaluate` runs the
//!   transition closure over the sampled kept multiset in DESCENDING sorted
//!   order (amended D32-8), grouped per distinct face.
//! - Pools sort draws by value (numeric order for Num/Dec faces, D32-4
//!   face-order rank otherwise, draw index as the stable tie-break) and fold
//!   the keep chain over the contiguous sorted window; dropped draws render
//!   struck through (`~~n~~`).
//!
//! # Collapse policy (§3, in order)
//!
//! (1) die-free subtrees are already values (`Const` nodes — the
//! interpreter folds die-free math before the tree exists); (2) user calls
//! are transparent (no call nodes exist in the tree); (3) pools show faces
//! with dropped dice struck; (4) beyond RENDER DEPTH 4, and then while the
//! text exceeds 900 chars (deepest node first, leftmost on ties), subtrees
//! collapse to `{label-or-dice-summary} = value` (parenthesized inside a
//! larger expression); (5) floor: `= value`, ellipsized to fit.
//!
//! Goodness reads the top-level die's distribution face-order vector
//! (D32-11): position 0 = fumble, last = crit, otherwise thirds by position
//! index (`pos * 3 / len` → bad/okay/good); `None` when the support has one
//! face.

use crate::ast::{BinOp, CmpOp};
use crate::dist_seam::{SeamDist, dist_of_with};
use crate::interp::Interp;
use crate::value::{DieTree, EvalError, Keep, MinMaxOp, PoolTree, Value, dec_to_text, total_cmp};
use num_bigint::{BigInt, BigUint};
use rand_chacha::ChaCha20Rng;
use rand_core::{Rng, SeedableRng};

/// The D32-15 renderText budget (chars).
pub const RENDER_TEXT_MAX: usize = 900;
/// The D32-11 headline budget (chars).
pub const HEADLINE_MAX: usize = 80;
/// The §3 render-depth bound (render-tree depth, root = 1).
const RENDER_DEPTH_MAX: usize = 4;

// ---------------------------------------------------------------------------
// Goodness (R24)
// ---------------------------------------------------------------------------

/// The five goodness bands (D32-11).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Goodness {
    Fumble,
    Bad,
    Okay,
    Good,
    Crit,
}

impl Goodness {
    pub fn as_str(self) -> &'static str {
        match self {
            Goodness::Fumble => "fumble",
            Goodness::Bad => "bad",
            Goodness::Okay => "okay",
            Goodness::Good => "good",
            Goodness::Crit => "crit",
        }
    }
}

/// Goodness of a sampled outcome from the face-order vector: first face =
/// fumble, last = crit, thirds by position index between. `None` when the
/// support has a single face (or the value is somehow absent — defensive).
pub fn goodness_of(dist: &SeamDist, sampled: &Value) -> Option<Goodness> {
    let len = dist.support_len();
    if len <= 1 {
        return None;
    }
    let pos = dist.position_of(sampled)?;
    Some(if pos == 0 {
        Goodness::Fumble
    } else if pos == len - 1 {
        Goodness::Crit
    } else {
        match pos * 3 / len {
            0 => Goodness::Bad,
            1 => Goodness::Okay,
            _ => Goodness::Good,
        }
    })
}

// ---------------------------------------------------------------------------
// Value formatting + markdown escaping (D32-15)
// ---------------------------------------------------------------------------

/// Markdown-escape user-controlled text (Str content): backslash-prefix
/// backtick (killing any backtick run), `*`, `~` (killing `~~`), and `_` —
/// exactly the D32-15 set. Backslash itself is NOT re-escaped here: the
/// source-escaping pass in [`format_str`] already doubled literal
/// backslashes, and a second pass would mangle them.
pub fn markdown_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '`' | '*' | '~' | '_') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn format_str(s: &str, md: bool) -> String {
    // Source-style quoting first (the grammar's three escapes), then the
    // markdown pass over the whole quoted body.
    let mut quoted = String::with_capacity(s.len() + 2);
    quoted.push('"');
    for c in s.chars() {
        match c {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\n' => quoted.push_str("\\n"),
            other => quoted.push(other),
        }
    }
    quoted.push('"');
    if md { markdown_escape(&quoted) } else { quoted }
}

fn format_impl(v: &Value, md: bool) -> String {
    match v {
        Value::Unit => "()".to_owned(),
        Value::Num(n) => n.to_string(),
        Value::Dec(d) => {
            if *d < 0 {
                format!("-{}", dec_to_text(-d))
            } else {
                dec_to_text(*d)
            }
        }
        Value::Float(f) => {
            let mut text = format!("{f}");
            if !text.contains('.') && f.is_finite() {
                text.push_str(".0");
            }
            text.push('f');
            text
        }
        Value::Str(s) => format_str(s, md),
        Value::Atom(a) => format!(":{a}"),
        Value::Tuple(items) => {
            let inner: Vec<String> = items.iter().map(|x| format_impl(x, md)).collect();
            format!("{{{}}}", inner.join(", "))
        }
        Value::List(items) => {
            let inner: Vec<String> = items.iter().map(|x| format_impl(x, md)).collect();
            format!("[{}]", inner.join(", "))
        }
        Value::Dict(entries) => {
            if entries.is_empty() {
                return "[:]".to_owned();
            }
            let inner: Vec<String> = entries
                .iter()
                .map(|(k, v)| format!("{}: {}", format_impl(k, md), format_impl(v, md)))
                .collect();
            format!("[{}]", inner.join(", "))
        }
        // Not displayable as sampled values — defensive placeholders.
        Value::Die(_) | Value::Pool(_) => "<die>".to_owned(),
        Value::Closure(_) | Value::Builtin(_) => "<fn>".to_owned(),
    }
}

/// Display-form value text with markdown-escaped Str content (render/
/// headline surfaces).
pub fn format_value(v: &Value) -> String {
    format_impl(v, true)
}

/// Display-form value text WITHOUT markdown escaping (plot labels, the
/// structured JSON `value.v`).
pub fn format_value_plain(v: &Value) -> String {
    format_impl(v, false)
}

/// Truncate to `max` chars with a `…` ellipsis (char count, not bytes).
pub fn ellipsize(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_owned();
    }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

// ---------------------------------------------------------------------------
// Die summaries (dice-summary reprs — collapse labels + plot titles)
// ---------------------------------------------------------------------------

fn bin_prec(op: BinOp) -> u8 {
    match op {
        BinOp::Add | BinOp::Sub => 2,
        BinOp::Mul | BinOp::Div => 3,
    }
}

/// Is this die a suffix-representable chain over a plain `dM`
/// (`Leaf{1,_}` wrapped in any run of `Explode`/`RerollFace`)?
fn suffix_chain(t: &DieTree) -> Option<String> {
    match t {
        DieTree::Leaf { count: 1, sides } => Some(format!("d{sides}")),
        DieTree::Explode { inner, depth } => {
            suffix_chain(inner).map(|base| format!("{base}e{depth}"))
        }
        DieTree::RerollFace { inner, face } => {
            suffix_chain(inner).map(|base| format!("{base}r{face}"))
        }
        _ => None,
    }
}

fn keep_suffixes(keep: &[Keep]) -> String {
    keep.iter()
        .map(|k| match k {
            Keep::High(n) => format!("kh{n}"),
            Keep::Low(n) => format!("kl{n}"),
        })
        .collect()
}

/// The pool's dice-summary WITHOUT its keep chain (`4d6e2`,
/// `pool(3, d6 + 1)`).
fn pool_base_summary(pool: &PoolTree) -> String {
    match suffix_chain(&pool.die) {
        Some(base) if pool.count == 1 => base,
        Some(base) => format!("{}{base}", pool.count),
        None => format!("pool({}, {})", pool.count, summary_impl(&pool.die, false)),
    }
}

/// The pool's full dice-summary (`4d6e2kh3`).
fn pool_summary(pool: &PoolTree) -> String {
    format!("{}{}", pool_base_summary(pool), keep_suffixes(&pool.keep))
}

fn summary_impl(t: &DieTree, label_wins: bool) -> String {
    match t {
        DieTree::Leaf { count: 1, sides } => format!("d{sides}"),
        DieTree::Leaf { count, sides } => format!("{count}d{sides}"),
        DieTree::Const(v) => format_value(v),
        DieTree::Dl { faces } => {
            let inner: Vec<String> = faces.iter().map(format_value).collect();
            format!("dl({})", inner.join(","))
        }
        DieTree::Dm { faces } => {
            let inner: Vec<String> = faces
                .iter()
                .map(|(f, w)| format!("{}:{w}", format_value(f)))
                .collect();
            format!("dm({})", inner.join(","))
        }
        DieTree::BinOp { op, lhs, rhs } => {
            let prec = bin_prec(*op);
            let l = summary_operand(lhs, label_wins, prec, false);
            let r = summary_operand(rhs, label_wins, prec, true);
            format!("{l} {} {r}", op.as_str())
        }
        DieTree::Cmp { op, lhs, rhs } => {
            let l = summary_operand(lhs, label_wins, 1, false);
            let r = summary_operand(rhs, label_wins, 1, true);
            format!("{l} {} {r}", op.as_str())
        }
        DieTree::Neg(inner) => {
            let text = summary_impl(inner, label_wins);
            if matches!(**inner, DieTree::BinOp { .. } | DieTree::Cmp { .. }) {
                format!("-({text})")
            } else {
                format!("-{text}")
            }
        }
        DieTree::MinMax { op, lhs, rhs } => {
            let name = match op {
                MinMaxOp::Min => "min",
                MinMaxOp::Max => "max",
            };
            format!(
                "{name}({}, {})",
                summary_impl(lhs, label_wins),
                summary_impl(rhs, label_wins)
            )
        }
        DieTree::Explode { inner, depth } => suffix_chain(t)
            .unwrap_or_else(|| format!("explode({}, {depth})", summary_impl(inner, label_wins))),
        DieTree::Reroll { inner, faces } => {
            let list: Vec<String> = faces.iter().map(format_value).collect();
            format!(
                "reroll({}, [{}])",
                summary_impl(inner, label_wins),
                list.join(", ")
            )
        }
        DieTree::RerollFace { inner, face } => suffix_chain(t)
            .unwrap_or_else(|| format!("reroll({}, [{face}])", summary_impl(inner, label_wins))),
        DieTree::Label { word, inner } => {
            if label_wins {
                word.clone()
            } else {
                format!("{}[{word}]", summary_impl(inner, false))
            }
        }
        DieTree::Sum { pool } => pool_summary(pool),
        DieTree::Successes { pool, target } => {
            format!("successes({}, {target})", pool_summary(pool))
        }
        DieTree::Evaluate { pool, .. } => format!("evaluate({})", pool_summary(pool)),
    }
}

fn summary_operand(t: &DieTree, label_wins: bool, parent_prec: u8, is_rhs: bool) -> String {
    let text = summary_impl(t, label_wins);
    let child_prec = match t {
        DieTree::BinOp { op, .. } => Some(bin_prec(*op)),
        DieTree::Cmp { .. } => Some(1),
        _ => None,
    };
    match child_prec {
        Some(p) if p < parent_prec || (is_rhs && p == parent_prec) => format!("({text})"),
        _ => text,
    }
}

/// The label-or-dice-summary for collapse: a `Label` node's word names its
/// subtree.
pub(crate) fn die_summary(t: &DieTree) -> String {
    summary_impl(t, true)
}

/// The full die repr (labels shown inline) — the D32-16 plot title.
pub fn die_repr(t: &DieTree) -> String {
    summary_impl(t, false)
}

// ---------------------------------------------------------------------------
// The render tree
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub(crate) struct RN {
    kind: RKind,
    value: Value,
    summary: String,
}

#[derive(Debug)]
enum RKind {
    /// A fully-rendered atomic fragment (pool/die with faces, dl/dm draw,
    /// successes/evaluate call).
    Leaf(String),
    /// Die-free: renders as the formatted value (`Const` operands).
    Plain,
    /// A binary-operator chain FLATTENED across one precedence level (a
    /// left-associative run `a + b - c` is ONE node, so an additive chain
    /// costs one render-depth level — §3 depth counts nesting, not chain
    /// length). A same-precedence rhs (explicit parens in source) stays a
    /// nested child and re-parenthesizes via the precedence rule.
    Chain {
        prec: u8,
        first: Box<RN>,
        rest: Vec<(&'static str, RN)>,
    },
    Neg(Box<RN>),
    Call {
        name: &'static str,
        args: Vec<RN>,
    },
    Label {
        word: String,
        inner: Box<RN>,
    },
    /// A §3-collapsed subtree: `{summary} = value`.
    Collapsed,
}

fn collapse(rn: &mut RN) {
    rn.kind = RKind::Collapsed;
}

/// Collapse every subtree that sits beyond the §3 depth bound. `Plain`
/// nodes are already bare values — never collapsed.
fn enforce_depth(rn: &mut RN, depth: usize) {
    if matches!(rn.kind, RKind::Plain) {
        return;
    }
    if depth > RENDER_DEPTH_MAX {
        collapse(rn);
        return;
    }
    match &mut rn.kind {
        RKind::Chain { first, rest, .. } => {
            enforce_depth(first, depth + 1);
            for (_, c) in rest {
                enforce_depth(c, depth + 1);
            }
        }
        RKind::Neg(inner) | RKind::Label { inner, .. } => enforce_depth(inner, depth + 1),
        RKind::Call { args, .. } => {
            for a in args {
                enforce_depth(a, depth + 1);
            }
        }
        RKind::Leaf(_) | RKind::Plain | RKind::Collapsed => {}
    }
}

/// Collapse ONE deepest (leftmost on ties) collapsible node. Returns false
/// when nothing further can collapse. Two passes: locate the deepest
/// collapsible node by child-index path, then walk the path mutably.
fn collapse_one(rn: &mut RN) -> bool {
    fn deepest_path(rn: &RN, depth: usize, path: &mut Vec<usize>, best: &mut (usize, Vec<usize>)) {
        let candidate = !matches!(rn.kind, RKind::Plain | RKind::Collapsed);
        if candidate && depth > best.0 {
            *best = (depth, path.clone());
        }
        let children: Vec<&RN> = match &rn.kind {
            RKind::Chain { first, rest, .. } => std::iter::once(&**first)
                .chain(rest.iter().map(|(_, c)| c))
                .collect(),
            RKind::Neg(inner) | RKind::Label { inner, .. } => vec![inner],
            RKind::Call { args, .. } => args.iter().collect(),
            _ => vec![],
        };
        for (i, c) in children.into_iter().enumerate() {
            path.push(i);
            deepest_path(c, depth + 1, path, best);
            path.pop();
        }
    }
    let mut best = (0usize, Vec::new());
    deepest_path(rn, 1, &mut Vec::new(), &mut best);
    if best.0 == 0 {
        return false;
    }
    let mut node = rn;
    for i in best.1 {
        node = match &mut node.kind {
            RKind::Chain { first, rest, .. } => {
                if i == 0 {
                    first
                } else {
                    &mut rest[i - 1].1
                }
            }
            RKind::Neg(inner) | RKind::Label { inner, .. } => inner,
            RKind::Call { args, .. } => &mut args[i],
            _ => unreachable!("path points through composite nodes"),
        };
    }
    collapse(node);
    true
}

fn render_rn(rn: &RN, is_root: bool) -> String {
    match &rn.kind {
        RKind::Leaf(text) => text.clone(),
        RKind::Plain => format_value(&rn.value),
        RKind::Chain { prec, first, rest } => {
            let mut out = render_operand(first, *prec, false);
            for (op, c) in rest {
                out.push_str(&format!(" {op} {}", render_operand(c, *prec, true)));
            }
            out
        }
        RKind::Neg(inner) => {
            let text = render_rn(inner, false);
            if matches!(inner.kind, RKind::Chain { .. } | RKind::Collapsed) {
                format!("-({text})")
            } else {
                format!("-{text}")
            }
        }
        RKind::Call { name, args } => {
            let inner: Vec<String> = args.iter().map(|a| render_rn(a, false)).collect();
            format!("{name}({})", inner.join(", "))
        }
        RKind::Label { word, inner } => {
            let text = render_rn(inner, false);
            if matches!(
                inner.kind,
                RKind::Chain { .. } | RKind::Neg(_) | RKind::Collapsed
            ) {
                format!("({text})[{word}]")
            } else {
                format!("{text}[{word}]")
            }
        }
        RKind::Collapsed => {
            let body = format!("{} = {}", rn.summary, format_value(&rn.value));
            if is_root { body } else { format!("({body})") }
        }
    }
}

fn render_operand(rn: &RN, parent_prec: u8, is_rhs: bool) -> String {
    let text = render_rn(rn, false);
    match &rn.kind {
        RKind::Chain { prec, .. } if *prec < parent_prec || (is_rhs && *prec == parent_prec) => {
            format!("({text})")
        }
        _ => text,
    }
}

// ---------------------------------------------------------------------------
// The sampler
// ---------------------------------------------------------------------------

/// One draw of a pool element: the chain text plus its value.
struct Draw {
    text: String,
    value: Value,
}

struct PoolSample {
    draws: Vec<Draw>,
    kept: Vec<bool>,
}

impl PoolSample {
    fn faces_markup(&self) -> String {
        let parts: Vec<String> = self
            .draws
            .iter()
            .zip(&self.kept)
            .map(|(d, kept)| {
                if *kept {
                    d.text.clone()
                } else {
                    format!("~~{}~~", d.text)
                }
            })
            .collect();
        format!("⟪{}⟫", parts.join(","))
    }

    fn kept_values(&self) -> Vec<Value> {
        self.draws
            .iter()
            .zip(&self.kept)
            .filter(|(_, k)| **k)
            .map(|(d, _)| d.value.clone())
            .collect()
    }
}

/// The S5 sampler: one ChaCha20 stream shared across every display of one
/// evaluation, plus the running `standardDice` rows (drained per display by
/// the api layer).
pub struct Sampler {
    rng: ChaCha20Rng,
    dice: Vec<(u64, u64)>,
}

impl Sampler {
    /// Seed from the host's 32 bytes (shorter/longer input is zero-padded/
    /// truncated — documented; production always passes 32).
    pub fn new(seed: &[u8]) -> Sampler {
        let mut key = [0u8; 32];
        let n = seed.len().min(32);
        key[..n].copy_from_slice(&seed[..n]);
        Sampler {
            rng: ChaCha20Rng::from_seed(key),
            dice: Vec::new(),
        }
    }

    /// Drain the standardDice rows accumulated since the last call.
    pub fn take_dice(&mut self) -> Vec<(u64, u64)> {
        std::mem::take(&mut self.dice)
    }

    /// Uniform in `0..n` (rejection sampling — no modulo bias).
    fn below(&mut self, n: u64) -> u64 {
        debug_assert!(n > 0);
        if n == 1 {
            return 0;
        }
        let zone = u64::MAX - (u64::MAX % n);
        loop {
            let x = self.rng.next_u64();
            if x < zone {
                return x % n;
            }
        }
    }

    /// Uniform in `0..n` for arbitrary-precision `n` (top-limb rejection).
    fn big_below(&mut self, n: &BigUint) -> BigUint {
        if let Ok(small) = u64::try_from(n) {
            return BigUint::from(self.below(small));
        }
        let bits = n.bits();
        let bytes = usize::try_from(bits.div_ceil(8)).expect("bit length fits usize");
        let top_mask: u8 = if bits.is_multiple_of(8) {
            0xff
        } else {
            (1u8 << (bits % 8)) - 1
        };
        let mut buf = vec![0u8; bytes];
        loop {
            self.rng.fill_bytes(&mut buf);
            buf[bytes - 1] &= top_mask;
            let candidate = BigUint::from_bytes_le(&buf);
            if candidate < *n {
                return candidate;
            }
        }
    }

    /// Roll one `dS` face (recorded into standardDice).
    fn roll(&mut self, sides: u64) -> u64 {
        let face = self.below(sides) + 1;
        self.dice.push((sides, face));
        face
    }

    // -- draws --------------------------------------------------------------

    /// Sample one "die element": a value plus its chain text (pools and
    /// bare exploded/rerolled dice share this).
    fn draw(&mut self, t: &DieTree, it: &mut Interp<'_>) -> Result<Draw, EvalError> {
        match t {
            DieTree::Leaf { count: 1, sides } => {
                let face = self.roll(*sides);
                Ok(Draw {
                    text: face.to_string(),
                    value: Value::num_u64(face),
                })
            }
            DieTree::Leaf { count, sides } => {
                // An NdM element (e.g. pool(2, 3d6)): the element's value is
                // the sum; its text is the summed value.
                let mut sum = 0u64;
                for _ in 0..*count {
                    sum += self.roll(*sides);
                }
                Ok(Draw {
                    text: sum.to_string(),
                    value: Value::num_u64(sum),
                })
            }
            DieTree::Explode { inner, depth } => {
                let max = dist_with(inner, it)?.max_face();
                let mut parts = Vec::new();
                let mut total: Option<Value> = None;
                let mut extra = 0u64;
                loop {
                    let d = self.draw(inner, it)?;
                    let exploded = d.value == max && extra < *depth;
                    parts.push(d.text);
                    total = Some(match total {
                        None => d.value,
                        Some(acc) => crate::interp::arith(BinOp::Add, acc, d.value, None)?,
                    });
                    if !exploded {
                        break;
                    }
                    extra += 1;
                }
                Ok(Draw {
                    text: parts.join("→"),
                    value: total.expect("at least one draw"),
                })
            }
            DieTree::Reroll { inner, faces } => {
                let first = self.draw(inner, it)?;
                if faces.contains(&first.value) {
                    let second = self.draw(inner, it)?;
                    Ok(Draw {
                        text: format!("{}→{}", first.text, second.text),
                        value: second.value,
                    })
                } else {
                    Ok(first)
                }
            }
            DieTree::RerollFace { inner, face } => {
                let first = self.draw(inner, it)?;
                if first.value == Value::Num(face.clone()) {
                    let second = self.draw(inner, it)?;
                    Ok(Draw {
                        text: format!("{}→{}", first.text, second.text),
                        value: second.value,
                    })
                } else {
                    Ok(first)
                }
            }
            DieTree::Dl { .. } | DieTree::Dm { .. } => {
                let value = self.draw_weighted(t)?;
                Ok(Draw {
                    text: format_value(&value),
                    value,
                })
            }
            DieTree::Label { inner, .. } => self.draw(inner, it),
            // A composite element (pool over an arbitrary die expression):
            // sample it as an expression; the element text is its value.
            other => {
                let rn = self.sample(other, it)?;
                Ok(Draw {
                    text: format_value(&rn.value),
                    value: rn.value,
                })
            }
        }
    }

    fn draw_weighted(&mut self, t: &DieTree) -> Result<Value, EvalError> {
        match t {
            DieTree::Dl { faces } => {
                let i = self.below(faces.len() as u64) as usize;
                Ok(faces[i].clone())
            }
            DieTree::Dm { faces } => {
                let total: BigUint = faces.iter().map(|(_, w)| w.clone()).sum();
                if total == BigUint::ZERO {
                    return Err(EvalError::internal("dm with zero total weight"));
                }
                let mut r = self.big_below(&total);
                for (f, w) in faces {
                    if r < *w {
                        return Ok(f.clone());
                    }
                    r -= w;
                }
                Err(EvalError::internal("weighted draw walked past total"))
            }
            _ => Err(EvalError::internal("draw_weighted on a non-dl/dm node")),
        }
    }

    /// Sort key rank for pool draws: numeric values order numerically
    /// (`total_cmp` covers Num/Dec); non-numeric faces order by the die's
    /// D32-4 face-order rank (matching the engine's rank-baked sort).
    fn pool_sorted_indices(
        &self,
        pool: &PoolTree,
        draws: &[Draw],
        it: &mut Interp<'_>,
    ) -> Result<Vec<usize>, EvalError> {
        let numeric = draws
            .iter()
            .all(|d| matches!(d.value, Value::Num(_) | Value::Dec(_)));
        let ranks: Option<Vec<usize>> = if numeric {
            None
        } else {
            let order = dist_with(&pool.die, it)?.face_order();
            Some(
                draws
                    .iter()
                    .map(|d| {
                        order
                            .iter()
                            .position(|f| *f == d.value)
                            .ok_or_else(|| EvalError::internal("sampled face not in face order"))
                    })
                    .collect::<Result<_, _>>()?,
            )
        };
        let mut idx: Vec<usize> = (0..draws.len()).collect();
        idx.sort_by(|&a, &b| match &ranks {
            Some(r) => r[a].cmp(&r[b]).then(a.cmp(&b)),
            None => total_cmp(&draws[a].value, &draws[b].value).then(a.cmp(&b)),
        });
        Ok(idx)
    }

    fn sample_pool(
        &mut self,
        pool: &PoolTree,
        it: &mut Interp<'_>,
    ) -> Result<PoolSample, EvalError> {
        let count = usize::try_from(pool.count).map_err(|_| EvalError::fuel("pool count", None))?;
        let mut draws = Vec::with_capacity(count);
        for _ in 0..count {
            draws.push(self.draw(&pool.die, it)?);
        }
        // Fold the keep chain over the contiguous window of sorted positions.
        let sorted = self.pool_sorted_indices(pool, &draws, it)?;
        let (mut lo, mut hi) = (0usize, sorted.len());
        for k in &pool.keep {
            let n = usize::try_from(k.n()).unwrap_or(usize::MAX).min(hi - lo);
            match k {
                Keep::High(_) => lo = hi - n,
                Keep::Low(_) => hi = lo + n,
            }
        }
        let mut kept = vec![false; draws.len()];
        for &i in &sorted[lo..hi] {
            kept[i] = true;
        }
        Ok(PoolSample { draws, kept })
    }

    /// Sample a full die tree into a render node.
    pub(crate) fn sample(&mut self, t: &DieTree, it: &mut Interp<'_>) -> Result<RN, EvalError> {
        let summary = die_summary(t);
        match t {
            DieTree::Leaf { count, sides } => {
                let mut faces = Vec::with_capacity(*count as usize);
                let mut sum = BigInt::ZERO;
                for _ in 0..*count {
                    let f = self.roll(*sides);
                    faces.push(f.to_string());
                    sum += f;
                }
                Ok(RN {
                    kind: RKind::Leaf(format!("{summary} ⟪{}⟫", faces.join(","))),
                    value: Value::Num(sum),
                    summary,
                })
            }
            DieTree::Const(v) => Ok(RN {
                kind: RKind::Plain,
                value: (**v).clone(),
                summary,
            }),
            DieTree::Dl { .. } | DieTree::Dm { .. } => {
                let value = self.draw_weighted(t)?;
                Ok(RN {
                    kind: RKind::Leaf(format!("{summary} ⟪{}⟫", format_value(&value))),
                    value,
                    summary,
                })
            }
            DieTree::BinOp { op, lhs, rhs } => {
                let l = self.sample(lhs, it)?;
                let r = self.sample(rhs, it)?;
                let value = crate::interp::arith(*op, l.value.clone(), r.value.clone(), None)?;
                let prec = bin_prec(*op);
                // Absorb a same-precedence left spine into ONE chain node
                // (left-associative parse ⇒ flat source chains flatten).
                let kind = match l.kind {
                    RKind::Chain {
                        prec: lp,
                        first,
                        mut rest,
                    } if lp == prec => {
                        rest.push((op.as_str(), r));
                        RKind::Chain { prec, first, rest }
                    }
                    _ => RKind::Chain {
                        prec,
                        first: Box::new(l),
                        rest: vec![(op.as_str(), r)],
                    },
                };
                Ok(RN {
                    kind,
                    value,
                    summary,
                })
            }
            DieTree::Cmp { op, lhs, rhs } => {
                let l = self.sample(lhs, it)?;
                let r = self.sample(rhs, it)?;
                let value = crate::interp::cmp_values(*op, l.value.clone(), r.value.clone(), None)?;
                Ok(RN {
                    kind: RKind::Chain {
                        prec: 1,
                        first: Box::new(l),
                        rest: vec![(op_str(*op), r)],
                    },
                    value,
                    summary,
                })
            }
            DieTree::Neg(inner) => {
                let rn = self.sample(inner, it)?;
                let value = match &rn.value {
                    Value::Num(n) => Value::Num(-n),
                    other => {
                        return Err(EvalError::internal(format!(
                            "negate a non-Num sampled value ({other:?})"
                        )));
                    }
                };
                Ok(RN {
                    kind: RKind::Neg(Box::new(rn)),
                    value,
                    summary,
                })
            }
            DieTree::MinMax { op, lhs, rhs } => {
                let l = self.sample(lhs, it)?;
                let r = self.sample(rhs, it)?;
                let pick_l = match op {
                    MinMaxOp::Min => total_cmp(&l.value, &r.value).is_le(),
                    MinMaxOp::Max => total_cmp(&l.value, &r.value).is_ge(),
                };
                let value = if pick_l {
                    l.value.clone()
                } else {
                    r.value.clone()
                };
                Ok(RN {
                    kind: RKind::Call {
                        name: match op {
                            MinMaxOp::Min => "min",
                            MinMaxOp::Max => "max",
                        },
                        args: vec![l, r],
                    },
                    value,
                    summary,
                })
            }
            DieTree::Explode { .. } | DieTree::Reroll { .. } | DieTree::RerollFace { .. } => {
                let d = self.draw(t, it)?;
                Ok(RN {
                    kind: RKind::Leaf(format!("{summary} ⟪{}⟫", d.text)),
                    value: d.value,
                    summary,
                })
            }
            DieTree::Label { word, inner } => {
                let rn = self.sample(inner, it)?;
                let value = rn.value.clone();
                Ok(RN {
                    kind: RKind::Label {
                        word: word.clone(),
                        inner: Box::new(rn),
                    },
                    value,
                    summary,
                })
            }
            DieTree::Sum { pool } => {
                let ps = self.sample_pool(pool, it)?;
                let mut total = Value::Num(BigInt::ZERO);
                for v in ps.kept_values() {
                    total = crate::interp::arith(BinOp::Add, total, v, None)?;
                }
                let text = format!(
                    "{} {}{}",
                    pool_base_summary(pool),
                    ps.faces_markup(),
                    keep_suffixes(&pool.keep)
                );
                Ok(RN {
                    kind: RKind::Leaf(text),
                    value: total,
                    summary,
                })
            }
            DieTree::Successes { pool, target } => {
                let ps = self.sample_pool(pool, it)?;
                let hits = ps
                    .kept_values()
                    .iter()
                    .filter(|v| matches!(v, Value::Num(n) if n >= target))
                    .count();
                let text = format!(
                    "successes({} {}{}, {target})",
                    pool_base_summary(pool),
                    ps.faces_markup(),
                    keep_suffixes(&pool.keep)
                );
                Ok(RN {
                    kind: RKind::Leaf(text),
                    value: Value::num_u64(hits as u64),
                    summary,
                })
            }
            DieTree::Evaluate { pool, init, func } => {
                let ps = self.sample_pool(pool, it)?;
                // Kept values in DESCENDING sorted order (amended D32-8),
                // grouped per distinct face.
                let mut kept = ps.kept_values();
                let sorted = self.pool_sorted_indices(
                    pool,
                    &kept
                        .iter()
                        .map(|v| Draw {
                            text: String::new(),
                            value: v.clone(),
                        })
                        .collect::<Vec<_>>(),
                    it,
                )?;
                kept = sorted.into_iter().map(|i| kept[i].clone()).collect();
                kept.reverse();
                let mut state = (**init).clone();
                let mut i = 0;
                while i < kept.len() {
                    let face = kept[i].clone();
                    let mut count = 0u64;
                    while i < kept.len() && kept[i] == face {
                        count += 1;
                        i += 1;
                    }
                    state = it.run_evaluator_step(func, &state, &face, count)?;
                }
                let text = format!("evaluate({}) {}", pool_summary(pool), ps.faces_markup());
                Ok(RN {
                    kind: RKind::Leaf(text),
                    value: state,
                    summary,
                })
            }
        }
    }
}

fn op_str(op: CmpOp) -> &'static str {
    op.as_str()
}

/// Compute a tree's distribution with the interpreter as the evaluate
/// callback (fresh D32-12 dist budget per call, per the seam contract).
pub fn dist_with(t: &DieTree, it: &mut Interp<'_>) -> Result<SeamDist, EvalError> {
    let mut cb = |func: &Value, state: &Value, face: &Value, count: u64| {
        it.run_evaluator_step(func, state, face, count)
    };
    dist_of_with(t, &mut cb)
}

// ---------------------------------------------------------------------------
// The display driver
// ---------------------------------------------------------------------------

/// One fully-rendered die display (the D32-11 `kind:"die"` payload).
#[derive(Debug, Clone, PartialEq)]
pub struct RenderedDisplay {
    pub render_text: String,
    pub headline: String,
    pub value: Value,
    pub goodness: Option<Goodness>,
    pub standard_dice: Vec<(u64, u64)>,
}

/// Sample + render one die display: distribution (for goodness), leaf
/// sampling, then the §3 collapse policy down to the 900-char budget.
pub fn render_die_display(
    tree: &DieTree,
    sampler: &mut Sampler,
    it: &mut Interp<'_>,
) -> Result<RenderedDisplay, EvalError> {
    let dist = dist_with(tree, it)?;
    sampler.take_dice(); // isolate this display's rows
    let mut root = sampler.sample(tree, it)?;
    let standard_dice = sampler.take_dice();
    let value = root.value.clone();
    let goodness = goodness_of(&dist, &value);
    let value_text = format_value(&value);
    let headline = ellipsize(&value_text, HEADLINE_MAX);

    enforce_depth(&mut root, 1);
    let compose = |root: &RN, value_text: &str| -> String {
        if matches!(root.kind, RKind::Collapsed) {
            render_rn(root, true)
        } else {
            format!("{} = {value_text}", render_rn(root, true))
        }
    };
    let mut text = compose(&root, &value_text);
    while text.chars().count() > RENDER_TEXT_MAX {
        if !collapse_one(&mut root) {
            text = ellipsize(&format!("= {value_text}"), RENDER_TEXT_MAX);
            break;
        }
        text = compose(&root, &value_text);
    }
    Ok(RenderedDisplay {
        render_text: text,
        headline,
        value,
        goodness,
        standard_dice,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dist_seam::dist_of;

    #[test]
    fn markdown_escape_covers_the_d32_15_set() {
        assert_eq!(markdown_escape("a*b_c~~d`e"), "a\\*b\\_c\\~\\~d\\`e");
        // A backtick RUN is killed backtick-by-backtick.
        assert_eq!(markdown_escape("``"), "\\`\\`");
        assert_eq!(markdown_escape("plain"), "plain");
    }

    #[test]
    fn format_value_quotes_and_escapes_strings() {
        // Source escapes (\" \\ \n) survive un-doubled by the markdown pass.
        assert_eq!(
            format_value(&Value::Str("a\"b\nc".into())),
            "\"a\\\"b\\nc\""
        );
        assert_eq!(format_value(&Value::Str("x*y".into())), "\"x\\*y\"");
        assert_eq!(format_value(&Value::Str("x\\y".into())), "\"x\\\\y\"");
        // The plain variant keeps markdown characters intact.
        assert_eq!(format_value_plain(&Value::Str("x*y".into())), "\"x*y\"");
    }

    #[test]
    fn format_value_covers_the_scalar_forms() {
        assert_eq!(format_value(&Value::num_i64(-3)), "-3");
        assert_eq!(format_value(&Value::Dec(-1_500_000)), "-1.5");
        assert_eq!(format_value(&Value::Float(2.0)), "2.0f");
        assert_eq!(format_value(&Value::Atom("fire".into())), ":fire");
        assert_eq!(format_value(&Value::Unit), "()");
        assert_eq!(
            format_value(&Value::Tuple(vec![Value::num_i64(1), Value::num_i64(2)])),
            "{1, 2}"
        );
        assert_eq!(format_value(&Value::Dict(vec![])), "[:]");
    }

    #[test]
    fn ellipsize_is_char_exact() {
        let s = "x".repeat(80);
        assert_eq!(ellipsize(&s, 80), s);
        let long = "x".repeat(81);
        let cut = ellipsize(&long, 80);
        assert_eq!(cut.chars().count(), 80);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn goodness_bands_on_d20() {
        let dist = dist_of(&DieTree::Leaf {
            count: 1,
            sides: 20,
        })
        .unwrap();
        let g = |n: i64| goodness_of(&dist, &Value::num_i64(n));
        assert_eq!(g(1), Some(Goodness::Fumble));
        assert_eq!(g(20), Some(Goodness::Crit));
        // Thirds by position index: pos*3/20.
        assert_eq!(g(2), Some(Goodness::Bad)); // pos 1
        assert_eq!(g(7), Some(Goodness::Bad)); // pos 6 → 18/20 = 0
        assert_eq!(g(8), Some(Goodness::Okay)); // pos 7 → 21/20 = 1
        assert_eq!(g(14), Some(Goodness::Okay)); // pos 13 → 39/20 = 1
        assert_eq!(g(15), Some(Goodness::Good)); // pos 14 → 42/20 = 2
        assert_eq!(g(19), Some(Goodness::Good));
    }

    #[test]
    fn goodness_none_on_single_face_or_unknown_value() {
        let dist = dist_of(&DieTree::Leaf { count: 1, sides: 1 }).unwrap();
        assert_eq!(goodness_of(&dist, &Value::num_i64(1)), None);
        let d20 = dist_of(&DieTree::Leaf {
            count: 1,
            sides: 20,
        })
        .unwrap();
        assert_eq!(goodness_of(&d20, &Value::num_i64(99)), None);
    }

    #[test]
    fn goodness_two_face_die_is_fumble_or_crit_only() {
        let dist = dist_of(&DieTree::Leaf { count: 1, sides: 2 }).unwrap();
        assert_eq!(
            goodness_of(&dist, &Value::num_i64(1)),
            Some(Goodness::Fumble)
        );
        assert_eq!(goodness_of(&dist, &Value::num_i64(2)), Some(Goodness::Crit));
    }

    #[test]
    fn die_summaries_cover_suffix_chains_and_fallbacks() {
        let d6 = DieTree::Leaf { count: 1, sides: 6 };
        let exploded = DieTree::Explode {
            inner: Box::new(d6.clone()),
            depth: 2,
        };
        assert_eq!(die_repr(&exploded), "d6e2");
        let rr = DieTree::RerollFace {
            inner: Box::new(exploded),
            face: 1.into(),
        };
        assert_eq!(die_repr(&rr), "d6e2r1");
        let pool = PoolTree {
            count: 4,
            die: Box::new(rr),
            keep: vec![Keep::High(3)],
        };
        assert_eq!(die_repr(&DieTree::Sum { pool }), "4d6e2r1kh3");
        // Label: repr keeps it inline, the collapse summary uses the word.
        let labeled = DieTree::Label {
            word: "fire".into(),
            inner: Box::new(d6),
        };
        assert_eq!(die_repr(&labeled), "d6[fire]");
        assert_eq!(die_summary(&labeled), "fire");
    }

    #[test]
    fn sampler_below_is_in_range_and_deterministic() {
        let mut a = Sampler::new(&[5u8; 32]);
        let mut b = Sampler::new(&[5u8; 32]);
        for _ in 0..200 {
            let x = a.below(6);
            assert!(x < 6);
            assert_eq!(x, b.below(6));
        }
    }

    #[test]
    fn sampler_big_below_stays_below_huge_bounds() {
        let mut s = Sampler::new(&[9u8; 32]);
        let n = BigUint::from(10u8).pow(40);
        for _ in 0..50 {
            assert!(s.big_below(&n) < n);
        }
    }
}
