//! S4 unit tests for `Weight`: representation invariant (u128 fast path,
//! checked promotion/demotion), bit caps, gcd/div, ordering across
//! representations.

use num_bigint::BigUint;
use weal_engine::dist::{DistError, Weight};

const BITS: u64 = 16_384;

fn w(v: u128) -> Weight {
    Weight::from_u128(v)
}

#[test]
fn add_promotes_past_u128() {
    let big = w(u128::MAX).checked_add(&w(1), BITS).unwrap();
    assert_eq!(big.bits(), 129);
    assert_eq!(big.to_biguint(), BigUint::from(u128::MAX) + 1u32);
    // And demotes back on exact division by 2 (2^128 / 2 = 2^127).
    let back = big.div_exact(&w(2));
    assert_eq!(back, w(1u128 << 127));
}

#[test]
fn mul_promotes_past_u128() {
    let a = w(1u128 << 100);
    let p = a.checked_mul(&a, BITS).unwrap();
    assert_eq!(p.bits(), 201);
    assert_eq!(p.to_biguint(), BigUint::from(1u32) << 200);
}

#[test]
fn pow_exact_and_zero_zero_is_one() {
    assert_eq!(w(2).checked_pow(200, BITS).unwrap().bits(), 201);
    assert_eq!(w(6).checked_pow(3, BITS).unwrap(), w(216));
    assert_eq!(Weight::zero().checked_pow(0, BITS).unwrap(), Weight::one());
    assert_eq!(Weight::zero().checked_pow(5, BITS).unwrap(), Weight::zero());
    assert_eq!(w(1).checked_pow(1_000_000, BITS).unwrap(), Weight::one());
}

#[test]
fn bit_cap_aborts_each_op() {
    let e = DistError::Budget {
        counter: "weight_bits",
    };
    // add: 2^10 has 11 bits > 10.
    assert_eq!(w(1023).checked_add(&w(1), 10), Err(e.clone()));
    // mul: 2^6 * 2^6 = 2^12, 13 bits > 10.
    assert_eq!(w(64).checked_mul(&w(64), 10), Err(e.clone()));
    // pow: pre-check catches without allocating.
    assert_eq!(w(2).checked_pow(1 << 40, BITS), Err(e.clone()));
    assert_eq!(w(3).checked_pow(20_000, BITS), Err(e));
}

#[test]
fn gcd_and_div_exact() {
    assert_eq!(w(36).gcd(&w(24)), w(12));
    assert_eq!(w(36).div_exact(&w(12)), w(3));
    assert_eq!(Weight::zero().gcd(&w(7)), w(7));
    // Cross-representation gcd: gcd(2^200, 2^100) = 2^100.
    let big = w(2).checked_pow(200, BITS).unwrap();
    assert_eq!(big.gcd(&w(1u128 << 100)), w(1u128 << 100));
}

#[test]
fn ordering_across_representations() {
    let big = w(u128::MAX).checked_add(&w(1), BITS).unwrap();
    assert!(w(u128::MAX) < big);
    assert!(Weight::zero() < Weight::one());
    assert_ne!(big, w(u128::MAX));
}

#[test]
fn decimal_round_trip() {
    let big = w(2).checked_pow(200, BITS).unwrap();
    let s = big.to_string();
    assert_eq!(Weight::from_decimal_str(&s), Some(big));
    assert_eq!(Weight::from_decimal_str("12345"), Some(w(12345)));
    assert_eq!(Weight::from_decimal_str("not a number"), None);
}
