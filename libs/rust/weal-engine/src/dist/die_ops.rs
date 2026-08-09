//! Die-level ops (D32-10): bounded explode and reroll-once substitution.

use std::collections::BTreeMap;

use super::base::{Dist, SumFace, mix};
use super::budget::{Budget, DistError};
use super::weight::Weight;

/// D32-12 construction cap: explode depth <= 8.
pub const MAX_EXPLODE_DEPTH: u32 = 8;

/// Bounded explode on the MAXIMUM face (icepool `Die.explode` defaults:
/// explode-on-max, `depth` = maximum number of ADDITIONAL rolls, and at the
/// depth cap further explosions contribute zero — i.e. the final max face
/// stays itself).
///
/// Law: `E(0) = die`; `E(k) = mix([restrict(die, != max) : D - w_max],
/// [map(E(k-1), max + _) : w_max])` — the max face (weight `w_max`)
/// substitutes to `max + E(k-1)`, everything else stays. Face order follows
/// the mixture rule: non-max faces in die order, then unseen chain faces.
pub fn explode<F: SumFace>(
    die: &Dist<F>,
    depth: u32,
    budget: &Budget,
) -> Result<Dist<F>, DistError> {
    if depth > MAX_EXPLODE_DEPTH {
        return Err(DistError::Budget {
            counter: "explode_depth",
        });
    }
    if depth == 0 {
        return Ok(die.clone());
    }
    let max = die.max_face().clone();
    let w_max = die.weight_of(&max);
    let inner = explode(die, depth - 1, budget)?;
    // max + E(k-1)
    let shifted = inner.map(budget, |f| max.add_scaled(f, 1))?;
    // die restricted to non-max faces, in die face order.
    let mut components: Vec<(Dist<F>, Weight)> = Vec::new();
    let rest_weight = die.denominator().sub_exact(&w_max);
    if !rest_weight.is_zero() {
        let entries: BTreeMap<F, Weight> = die
            .entries()
            .filter(|(f, _)| **f != max)
            .map(|(f, w)| (f.clone(), w.clone()))
            .collect();
        let order: Vec<F> = die
            .face_order()
            .iter()
            .filter(|f| **f != max)
            .cloned()
            .collect();
        components.push((Dist::from_parts(entries, order), rest_weight));
    }
    components.push((shifted, w_max));
    mix(&components, budget)
}

/// Reroll-ONCE of the given faces (icepool `Die.reroll(faces, depth=1)`):
/// a matching first roll is replaced by ONE fresh roll of the die (which
/// may land on a matching face again and is then kept).
///
/// Law (R = total weight of rerolled faces, D = denominator):
/// `P'(f) = [f not in S] * w_f/D + (R/D) * (w_f/D)`, i.e. over `D^2`:
/// matching faces get `R * w_f`, others `(D + R) * w_f`. Rerolling faces
/// absent from the support is the identity (returned unscaled).
pub fn reroll_faces<F: Ord + Clone>(
    die: &Dist<F>,
    faces: &[F],
    budget: &Budget,
) -> Result<Dist<F>, DistError> {
    let bits = budget.weight_bits;
    let mut r = Weight::zero();
    for f in faces {
        r = r.checked_add(&die.weight_of(f), bits)?;
    }
    if r.is_zero() {
        return Ok(die.clone());
    }
    let stop = die.denominator().checked_add(&r, bits)?;
    let mut entries: BTreeMap<F, Weight> = BTreeMap::new();
    for (f, w) in die.entries() {
        let factor = if faces.contains(f) { &r } else { &stop };
        entries.insert(f.clone(), w.checked_mul(factor, bits)?);
    }
    // Support (and thus face order) is unchanged: every factor is >= 1.
    Ok(Dist::from_parts(entries, die.face_order().to_vec()))
}

/// Reroll-once of a single face (the `r`-suffix).
pub fn reroll_face<F: Ord + Clone>(
    die: &Dist<F>,
    face: &F,
    budget: &Budget,
) -> Result<Dist<F>, DistError> {
    reroll_faces(die, std::slice::from_ref(face), budget)
}
