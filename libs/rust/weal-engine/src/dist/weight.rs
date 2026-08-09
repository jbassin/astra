//! Exact nonnegative integer weights (D32-10): a `u128` fast path with
//! checked promotion to `num_bigint::BigUint`.
//!
//! All arithmetic is exact. Every checked op takes a `max_bits` cap (the
//! caller passes `Budget::weight_bits`); a result whose bit length would
//! exceed the cap aborts with `DistError::Budget { counter: "weight_bits" }`.
//!
//! Representation invariant: the `Big` variant holds only values that do NOT
//! fit in `u128` (values are demoted on construction). Under that invariant
//! the derived `Ord`/`Eq`/`Hash` are value-consistent: every `Big` value is
//! strictly greater than every `Small` value.

use num_bigint::BigUint;
use std::fmt;
use std::str::FromStr;

use super::budget::DistError;

const WEIGHT_BITS_ERR: DistError = DistError::Budget {
    counter: "weight_bits",
};

/// An exact nonnegative integer weight.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Weight(Repr);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum Repr {
    Small(u128),
    Big(BigUint),
}

/// Normalize: demote a `BigUint` that fits `u128` (upholds the invariant).
fn norm(b: BigUint) -> Weight {
    match u128::try_from(&b) {
        Ok(v) => Weight(Repr::Small(v)),
        Err(_) => Weight(Repr::Big(b)),
    }
}

fn u128_gcd(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

/// Euclid on `BigUint` (num-integer is not a direct dependency, so the
/// trait-provided gcd is out of reach; `%` is all we need).
pub(crate) fn biguint_gcd(mut a: BigUint, mut b: BigUint) -> BigUint {
    let zero = BigUint::from(0u32);
    while b != zero {
        let t = &a % &b;
        a = b;
        b = t;
    }
    a
}

impl Weight {
    /// The zero weight (legal in accumulators, never as a `Dist` entry).
    pub fn zero() -> Weight {
        Weight(Repr::Small(0))
    }

    /// The unit weight.
    pub fn one() -> Weight {
        Weight(Repr::Small(1))
    }

    pub fn from_u128(v: u128) -> Weight {
        Weight(Repr::Small(v))
    }

    pub fn from_biguint(b: BigUint) -> Weight {
        norm(b)
    }

    /// Parse a decimal string (test/fixture convenience).
    pub fn from_decimal_str(s: &str) -> Option<Weight> {
        BigUint::from_str(s).ok().map(norm)
    }

    pub fn is_zero(&self) -> bool {
        matches!(self.0, Repr::Small(0))
    }

    /// Bit length of the value (0 for zero).
    pub fn bits(&self) -> u64 {
        match &self.0 {
            Repr::Small(v) => (128 - v.leading_zeros()) as u64,
            Repr::Big(b) => b.bits(),
        }
    }

    /// The value as a `BigUint` (cloning as needed).
    pub fn to_biguint(&self) -> BigUint {
        match &self.0 {
            Repr::Small(v) => BigUint::from(*v),
            Repr::Big(b) => b.clone(),
        }
    }

    fn check_bits(self, max_bits: u64) -> Result<Weight, DistError> {
        if self.bits() > max_bits {
            Err(WEIGHT_BITS_ERR)
        } else {
            Ok(self)
        }
    }

    /// Exact addition, capped at `max_bits`.
    pub fn checked_add(&self, rhs: &Weight, max_bits: u64) -> Result<Weight, DistError> {
        let out = match (&self.0, &rhs.0) {
            (Repr::Small(a), Repr::Small(b)) => match a.checked_add(*b) {
                Some(v) => Weight(Repr::Small(v)),
                None => norm(BigUint::from(*a) + BigUint::from(*b)),
            },
            _ => norm(self.to_biguint() + rhs.to_biguint()),
        };
        out.check_bits(max_bits)
    }

    /// Exact multiplication, capped at `max_bits`.
    pub fn checked_mul(&self, rhs: &Weight, max_bits: u64) -> Result<Weight, DistError> {
        let out = match (&self.0, &rhs.0) {
            (Repr::Small(a), Repr::Small(b)) => match a.checked_mul(*b) {
                Some(v) => Weight(Repr::Small(v)),
                None => norm(BigUint::from(*a) * BigUint::from(*b)),
            },
            _ => {
                // Pre-check: product bits >= sum of bit lengths - 1.
                let lower = (self.bits() + rhs.bits()).saturating_sub(1);
                if lower > max_bits {
                    return Err(WEIGHT_BITS_ERR);
                }
                norm(self.to_biguint() * rhs.to_biguint())
            }
        };
        out.check_bits(max_bits)
    }

    /// Exact power, capped at `max_bits`. Pinned: `0^0 == 1` (the pool
    /// `skip_weight` dump relies on the empty product being 1).
    pub fn checked_pow(&self, exp: u64, max_bits: u64) -> Result<Weight, DistError> {
        if exp == 0 {
            return Ok(Weight::one());
        }
        if self.is_zero() {
            return Ok(Weight::zero());
        }
        let bits = self.bits();
        if bits == 1 {
            return Ok(Weight::one()); // 1^n
        }
        // Lower bound on result bits: (bits-1)*exp + 1. Abort before
        // allocating a gigantic number.
        let lower = (bits - 1).saturating_mul(exp).saturating_add(1);
        if lower > max_bits {
            return Err(WEIGHT_BITS_ERR);
        }
        // exp fits u32 here: (bits-1) >= 1, so exp <= max_bits <= u64, and
        // lower <= max_bits implies exp <= max_bits (<= 2^32 in practice).
        let exp32 = u32::try_from(exp).map_err(|_| WEIGHT_BITS_ERR)?;
        let out = match &self.0 {
            Repr::Small(v) if bits.saturating_mul(exp) <= 127 => Weight(Repr::Small(v.pow(exp32))),
            _ => norm(self.to_biguint().pow(exp32)),
        };
        out.check_bits(max_bits)
    }

    /// Exact subtraction; callers guarantee `self >= rhs` (used only for
    /// cumulative-power differences in the keep-1 closed forms).
    pub(crate) fn sub_exact(&self, rhs: &Weight) -> Weight {
        debug_assert!(self >= rhs, "Weight::sub_exact underflow");
        match (&self.0, &rhs.0) {
            (Repr::Small(a), Repr::Small(b)) => Weight(Repr::Small(a - b)),
            _ => norm(self.to_biguint() - rhs.to_biguint()),
        }
    }

    /// Greatest common divisor.
    pub fn gcd(&self, rhs: &Weight) -> Weight {
        match (&self.0, &rhs.0) {
            (Repr::Small(a), Repr::Small(b)) => Weight(Repr::Small(u128_gcd(*a, *b))),
            _ => norm(biguint_gcd(self.to_biguint(), rhs.to_biguint())),
        }
    }

    /// Exact division; callers guarantee `rhs` divides `self` exactly and is
    /// nonzero (weighted-lcm scale factors, gcd-simplify).
    pub fn div_exact(&self, rhs: &Weight) -> Weight {
        debug_assert!(!rhs.is_zero(), "Weight::div_exact by zero");
        match (&self.0, &rhs.0) {
            (Repr::Small(a), Repr::Small(b)) => {
                debug_assert_eq!(a % b, 0, "Weight::div_exact not exact");
                Weight(Repr::Small(a / b))
            }
            _ => {
                let (a, b) = (self.to_biguint(), rhs.to_biguint());
                debug_assert_eq!(&a % &b, BigUint::from(0u32), "Weight::div_exact not exact");
                norm(a / b)
            }
        }
    }
}

impl fmt::Display for Weight {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            Repr::Small(v) => write!(f, "{v}"),
            Repr::Big(b) => write!(f, "{b}"),
        }
    }
}
