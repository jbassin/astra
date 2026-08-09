//! Numeric-face statistics (D32-10): exact-rational mean/variance reduced
//! at the end, 6-place decimal strings for the D32-11 plot fields, and the
//! cumulative-quantity helpers the closed forms and goodness need.

use num_bigint::{BigInt, BigUint, Sign};

use super::base::Dist;
use super::weight::{Weight, biguint_gcd};

/// A face type with an exact integer embedding (statistics are only
/// defined for numeric faces; the orchestrator returns null otherwise).
/// Fixed-point faces (Dec) should embed their SCALED integer and divide
/// the returned rational by the scale at the edge.
pub trait NumFace: Ord + Clone {
    fn to_bigint(&self) -> BigInt;
}

impl NumFace for i64 {
    fn to_bigint(&self) -> BigInt {
        BigInt::from(*self)
    }
}

impl NumFace for i128 {
    fn to_bigint(&self) -> BigInt {
        BigInt::from(*self)
    }
}

impl NumFace for BigInt {
    fn to_bigint(&self) -> BigInt {
        self.clone()
    }
}

/// Reduce `num/den` to lowest terms.
fn reduce(num: BigInt, den: BigUint) -> (BigInt, BigUint) {
    if num.sign() == Sign::NoSign {
        return (num, BigUint::from(1u32));
    }
    let g = biguint_gcd(num.magnitude().clone(), den.clone());
    if g == BigUint::from(1u32) {
        return (num, den);
    }
    let gi = BigInt::from(g.clone());
    (num / gi, den / g)
}

/// Exact mean as a reduced rational `(numerator, denominator)`:
/// `sum(f * w) / D`.
pub fn mean_rational<F: NumFace>(die: &Dist<F>) -> (BigInt, BigUint) {
    let mut num = BigInt::from(0);
    for (f, w) in die.entries() {
        num += f.to_bigint() * BigInt::from(w.to_biguint());
    }
    reduce(num, die.denominator().to_biguint())
}

/// Exact variance as a reduced rational:
/// `(D * sum(f^2 w) - (sum(f w))^2) / D^2`. Always nonnegative.
pub fn variance_rational<F: NumFace>(die: &Dist<F>) -> (BigInt, BigUint) {
    let d = BigInt::from(die.denominator().to_biguint());
    let mut s1 = BigInt::from(0);
    let mut s2 = BigInt::from(0);
    for (f, w) in die.entries() {
        let fv = f.to_bigint();
        let wv = BigInt::from(w.to_biguint());
        s1 += &fv * &wv;
        s2 += &fv * &fv * wv;
    }
    let num = &d * s2 - &s1 * &s1;
    let den = (&d * &d).magnitude().clone();
    reduce(num, den)
}

const DECIMAL_PLACES: u32 = 6;

/// Format `num/den` (den > 0) as a decimal string with 6 places,
/// round-half-away-from-zero. (`pub(crate)`: the dist seam reuses this for
/// Dec-face means with a scale-adjusted denominator.)
pub(crate) fn rational_to_decimal(num: &BigInt, den: &BigUint) -> String {
    let scale = BigUint::from(10u32).pow(DECIMAL_PLACES);
    let mag = num.magnitude() * &scale;
    // round(mag / den) half-up on the magnitude.
    let q = (&mag * BigUint::from(2u32) + den) / (den * BigUint::from(2u32));
    let int_part = &q / &scale;
    let frac = &q % &scale;
    let sign = if num.sign() == Sign::Minus && q != BigUint::from(0u32) {
        "-"
    } else {
        ""
    };
    format!(
        "{sign}{int_part}.{frac:0>width$}",
        width = DECIMAL_PLACES as usize
    )
}

/// Exact mean rendered as a 6-place decimal string (round-half-away-from-
/// zero) — the D32-11 `plots[].mean` payload.
pub fn mean_decimal<F: NumFace>(die: &Dist<F>) -> String {
    let (num, den) = mean_rational(die);
    rational_to_decimal(&num, &den)
}

/// Standard deviation as a 6-place decimal string. `sqrt` is irrational in
/// general: computed as `isqrt(10^12 * vn * vd) / vd` then rounded, which
/// is exact to within 1 unit in the last place (documented tolerance; this
/// feeds display only).
pub fn std_decimal<F: NumFace>(die: &Dist<F>) -> String {
    let (vn, vd) = variance_rational(die);
    debug_assert!(vn.sign() != Sign::Minus);
    let scale2 = BigUint::from(10u32).pow(2 * DECIMAL_PLACES);
    let s = (vn.magnitude() * &vd * scale2).sqrt(); // floor(10^6 * sqrt(vn*vd))
    // round(s / vd) half-up, then format as a 6-place decimal.
    let q = (&s * BigUint::from(2u32) + &vd) / (&vd * BigUint::from(2u32));
    let scale = BigUint::from(10u32).pow(DECIMAL_PLACES);
    let int_part = &q / &scale;
    let frac = &q % &scale;
    format!(
        "{int_part}.{frac:0>width$}",
        width = DECIMAL_PLACES as usize
    )
}

/// Total weight of faces `<= f` (the cdf quantity the keep-1 closed forms
/// and goodness thresholds use).
pub fn quantity_le<F: Ord + Clone>(die: &Dist<F>, f: &F) -> Weight {
    let mut acc = Weight::zero();
    for (face, w) in die.entries() {
        if face > f {
            break;
        }
        acc = acc
            .checked_add(w, u64::MAX)
            .expect("partial sums are bounded by the denominator");
    }
    acc
}

/// Total weight of faces `>= f`.
pub fn quantity_ge<F: Ord + Clone>(die: &Dist<F>, f: &F) -> Weight {
    let mut acc = Weight::zero();
    for (face, w) in die.entries() {
        if face >= f {
            acc = acc
                .checked_add(w, u64::MAX)
                .expect("partial sums are bounded by the denominator");
        }
    }
    acc
}
