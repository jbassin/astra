//! The distribution type + cartesian ops + weighted-lcm mixture (D32-10).
//!
//! A [`Dist`] keeps its entries in a sorted map (the DP's business) AND an
//! explicit face-order vector (D32-4 — goodness, `evaluate` iteration, and
//! render read the vector, never the map order).

use std::collections::BTreeMap;

use super::budget::{Budget, DistError};
use super::weight::Weight;

/// A face type that supports the numeric summing the pool engine needs
/// (`sum_pool`, `explode`). `add_scaled` is `self + face * count` — `count`
/// is signed because negative keep-tuple entries subtract.
pub trait SumFace: Ord + Clone {
    fn zero() -> Self;
    fn add_scaled(&self, face: &Self, count: i64) -> Self;
}

impl SumFace for i64 {
    fn zero() -> Self {
        0
    }
    /// Test-convenience impl; panics on overflow. Production face types
    /// should be arbitrary-precision (see the `BigInt` impl).
    fn add_scaled(&self, face: &Self, count: i64) -> Self {
        face.checked_mul(count)
            .and_then(|p| self.checked_add(p))
            .expect("i64 face sum overflow — use BigInt faces")
    }
}

impl SumFace for i128 {
    fn zero() -> Self {
        0
    }
    fn add_scaled(&self, face: &Self, count: i64) -> Self {
        face.checked_mul(count as i128)
            .and_then(|p| self.checked_add(p))
            .expect("i128 face sum overflow — use BigInt faces")
    }
}

impl SumFace for num_bigint::BigInt {
    fn zero() -> Self {
        num_bigint::BigInt::from(0)
    }
    fn add_scaled(&self, face: &Self, count: i64) -> Self {
        self + face * num_bigint::BigInt::from(count)
    }
}

/// An exact distribution over faces `F`.
///
/// Invariants: at least one entry; every weight >= 1; `face_order` is a
/// permutation of the entry keys; `denominator` == sum of weights.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dist<F: Ord + Clone> {
    entries: BTreeMap<F, Weight>,
    face_order: Vec<F>,
    denominator: Weight,
}

impl<F: Ord + Clone> Dist<F> {
    /// Internal constructor from already-validated parts. Computes and
    /// caches the denominator. `face_order` must be a permutation of the
    /// entry keys and every weight nonzero.
    pub(crate) fn from_parts(entries: BTreeMap<F, Weight>, face_order: Vec<F>) -> Dist<F> {
        debug_assert!(!entries.is_empty());
        debug_assert_eq!(entries.len(), face_order.len());
        debug_assert!(face_order.iter().all(|f| entries.contains_key(f)));
        debug_assert!(!entries.values().any(Weight::is_zero));
        let mut denominator = Weight::zero();
        for w in entries.values() {
            denominator = denominator
                .checked_add(w, u64::MAX)
                .expect("denominator sum cannot exceed u64::MAX bits");
        }
        Dist {
            entries,
            face_order,
            denominator,
        }
    }

    /// A uniform die over `faces_in_order` (each occurrence weight 1).
    /// Duplicates are legal: weights merge and the FIRST occurrence fixes
    /// the face's order position (D32-4).
    pub fn uniform(faces_in_order: Vec<F>, budget: &Budget) -> Result<Dist<F>, DistError> {
        if faces_in_order.is_empty() {
            return Err(DistError::Empty);
        }
        let one = Weight::one();
        let pairs = faces_in_order.into_iter().map(|f| (f, one.clone()));
        Self::build_merged(pairs, budget)
    }

    /// A weighted die from `(face, weight)` pairs in face order. Weights
    /// must be >= 1; duplicate faces merge (first occurrence fixes order).
    pub fn weighted(
        pairs_in_order: Vec<(F, Weight)>,
        budget: &Budget,
    ) -> Result<Dist<F>, DistError> {
        if pairs_in_order.is_empty() {
            return Err(DistError::Empty);
        }
        if pairs_in_order.iter().any(|(_, w)| w.is_zero()) {
            return Err(DistError::ZeroWeight);
        }
        Self::build_merged(pairs_in_order.into_iter(), budget)
    }

    /// The single-face distribution (weight 1).
    pub fn constant(f: F) -> Dist<F> {
        let mut entries = BTreeMap::new();
        entries.insert(f.clone(), Weight::one());
        Dist::from_parts(entries, vec![f])
    }

    /// Merge `(face, weight)` pairs preserving first-occurrence order.
    fn build_merged(
        pairs: impl Iterator<Item = (F, Weight)>,
        budget: &Budget,
    ) -> Result<Dist<F>, DistError> {
        let mut entries: BTreeMap<F, Weight> = BTreeMap::new();
        let mut face_order: Vec<F> = Vec::new();
        for (f, w) in pairs {
            if w.bits() > budget.weight_bits {
                return Err(DistError::Budget {
                    counter: "weight_bits",
                });
            }
            merge_entry(&mut entries, &mut face_order, f, w, budget)?;
        }
        Ok(Dist::from_parts(entries, face_order))
    }

    /// Faces in ascending `Ord` order.
    pub fn support(&self) -> impl Iterator<Item = &F> {
        self.entries.keys()
    }

    /// Number of distinct faces.
    pub fn support_len(&self) -> usize {
        self.entries.len()
    }

    /// `(face, weight)` pairs in ascending `Ord` order.
    pub fn entries(&self) -> impl Iterator<Item = (&F, &Weight)> {
        self.entries.iter()
    }

    /// The weight of `f` (zero if absent).
    pub fn weight_of(&self, f: &F) -> Weight {
        self.entries.get(f).cloned().unwrap_or_else(Weight::zero)
    }

    /// The cached denominator (sum of all weights).
    pub fn denominator(&self) -> &Weight {
        &self.denominator
    }

    /// The explicit face-order vector (D32-4).
    pub fn face_order(&self) -> &[F] {
        &self.face_order
    }

    /// The face's position in the face-order vector (goodness reads this).
    pub fn position_of(&self, f: &F) -> Option<usize> {
        self.face_order.iter().position(|g| g == f)
    }

    /// Smallest face by `Ord`.
    pub fn min_face(&self) -> &F {
        self.entries.keys().next().expect("Dist is never empty")
    }

    /// Largest face by `Ord`.
    pub fn max_face(&self) -> &F {
        self.entries
            .keys()
            .next_back()
            .expect("Dist is never empty")
    }

    /// Explicit GCD reduce of all weights (and the denominator). Face order
    /// is preserved. Distributions are NEVER auto-simplified.
    pub fn simplify(&self) -> Dist<F> {
        let mut g = Weight::zero();
        for w in self.entries.values() {
            g = g.gcd(w);
        }
        if g == Weight::one() {
            return self.clone();
        }
        let entries: BTreeMap<F, Weight> = self
            .entries
            .iter()
            .map(|(f, w)| (f.clone(), w.div_exact(&g)))
            .collect();
        Dist::from_parts(entries, self.face_order.clone())
    }

    /// Unary remap. Face collisions merge weights; the result's face order
    /// is the first-occurrence order of images while walking `self`'s face
    /// order (D32-4).
    pub fn map<T, G>(&self, budget: &Budget, mut f: G) -> Result<Dist<T>, DistError>
    where
        T: Ord + Clone,
        G: FnMut(&F) -> T,
    {
        let mut entries: BTreeMap<T, Weight> = BTreeMap::new();
        let mut face_order: Vec<T> = Vec::new();
        for face in &self.face_order {
            let t = f(face);
            let w = self.entries[face].clone();
            merge_entry(&mut entries, &mut face_order, t, w, budget)?;
        }
        Ok(Dist::from_parts(entries, face_order))
    }
}

/// Insert-or-merge one `(face, weight)` pair, tracking first-occurrence face
/// order and checking the support/weight budgets before growing.
fn merge_entry<F: Ord + Clone>(
    entries: &mut BTreeMap<F, Weight>,
    face_order: &mut Vec<F>,
    f: F,
    w: Weight,
    budget: &Budget,
) -> Result<(), DistError> {
    match entries.get_mut(&f) {
        Some(existing) => {
            *existing = existing.checked_add(&w, budget.weight_bits)?;
        }
        None => {
            budget.check_support(entries.len() as u64 + 1)?;
            face_order.push(f.clone());
            entries.insert(f, w);
        }
    }
    Ok(())
}

/// Cartesian binary op: accumulate `w_l * w_r` over the face product
/// (icepool `Die.binary_operator`). Serves `+ - * /` on numeric faces AND
/// lifted comparisons producing a 2-outcome Bool-ish dist — the caller
/// passes the op.
///
/// Face order (D32-4, pinned interpretation for ops): iterate the LEFT
/// operand's face order in the outer loop and the right operand's in the
/// inner loop; each result face's position is fixed by its first
/// production. (For faces passed through unchanged this reduces to "left
/// operand's order, then unseen right faces in their order".)
///
/// PARTIAL ops: division by zero (or any other op-level failure) must be
/// pre-checked by the caller, or use [`try_combine`] and return `Err` from
/// the op closure.
pub fn combine<F, T, G>(
    l: &Dist<F>,
    r: &Dist<F>,
    budget: &Budget,
    mut f: G,
) -> Result<Dist<T>, DistError>
where
    F: Ord + Clone,
    T: Ord + Clone,
    G: FnMut(&F, &F) -> T,
{
    try_combine::<F, T, DistError, _>(l, r, budget, |a, b| Ok(f(a, b)))
}

/// Fallible [`combine`]: the op closure may fail (e.g. division by zero in
/// the support); the first failure aborts the whole product. `E` is the
/// caller's error type (`From<DistError>` covers the engine's own budget
/// aborts).
pub fn try_combine<F, T, E, G>(
    l: &Dist<F>,
    r: &Dist<F>,
    budget: &Budget,
    mut f: G,
) -> Result<Dist<T>, E>
where
    F: Ord + Clone,
    T: Ord + Clone,
    E: From<DistError>,
    G: FnMut(&F, &F) -> Result<T, E>,
{
    let mut entries: BTreeMap<T, Weight> = BTreeMap::new();
    let mut face_order: Vec<T> = Vec::new();
    for a in l.face_order() {
        let wa = l.weight_of(a);
        for b in r.face_order() {
            let t = f(a, b)?;
            let w = wa.checked_mul(&r.entries[b], budget.weight_bits)?;
            merge_entry(&mut entries, &mut face_order, t, w, budget)?;
        }
    }
    // Denominators multiply (cartesian product); equal to the entry sum.
    let out = Dist::from_parts(entries, face_order);
    debug_assert_eq!(
        out.denominator(),
        &l.denominator()
            .checked_mul(r.denominator(), u64::MAX)
            .expect("den product"),
    );
    Ok(out)
}

/// Weighted-lcm mixture (icepool `merge_weights_lcm` + `weighted_lcm`):
/// each component is scaled so component totals sit in the given ratio at
/// the MINIMAL common denominator. Zero-weight components are dropped; all
/// components zero => `DistError::Empty`.
///
/// Face order (D32-4): components in argument order, faces within each
/// component in its own face order, first occurrence wins.
pub fn mix<F: Ord + Clone>(
    components: &[(Dist<F>, Weight)],
    budget: &Budget,
) -> Result<Dist<F>, DistError> {
    let live: Vec<&(Dist<F>, Weight)> = components.iter().filter(|(_, w)| !w.is_zero()).collect();
    if live.is_empty() {
        return Err(DistError::Empty);
    }
    let bits = budget.weight_bits;
    // denominator_lcm = lcm over (d / gcd(d, w)).
    let mut lcm = Weight::one();
    for (dist, w) in &live {
        let d = dist.denominator();
        let reduced = d.div_exact(&d.gcd(w));
        let g = lcm.gcd(&reduced);
        lcm = lcm.div_exact(&g).checked_mul(&reduced, bits)?;
    }
    let mut entries: BTreeMap<F, Weight> = BTreeMap::new();
    let mut face_order: Vec<F> = Vec::new();
    for (dist, w) in &live {
        // scale = lcm * w / d (exact by construction of lcm).
        let scale = lcm.checked_mul(w, bits)?.div_exact(dist.denominator());
        for face in dist.face_order() {
            let sw = dist.entries[face].checked_mul(&scale, bits)?;
            merge_entry(&mut entries, &mut face_order, face.clone(), sw, budget)?;
        }
    }
    Ok(Dist::from_parts(entries, face_order))
}
