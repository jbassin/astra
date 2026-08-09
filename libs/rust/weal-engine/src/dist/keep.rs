//! The keep-tuple (icepool `generator/keep.py`, D32-10).
//!
//! One signed count per SORTED position of the pool (ascending): `kh`/`kl`/
//! middle/negative keeps are all this one mechanism. `4d6kh3` =
//! `[0, 1, 1, 1]`; highest-minus-lowest of 5 = `[-1, 0, 0, 0, 1]`.

/// A keep-tuple: how many times each sorted position is counted.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct KeepTuple(Vec<i64>);

impl KeepTuple {
    /// A keep-tuple from raw per-position counts (ascending sorted order).
    pub fn from_vec(v: Vec<i64>) -> KeepTuple {
        KeepTuple(v)
    }

    /// Keep every die once: `[1; count]`.
    pub fn all(count: u64) -> KeepTuple {
        KeepTuple(vec![1; count as usize])
    }

    /// Keep the highest `n` of `count` dice (`n` clamped to `count`).
    pub fn keep_highest(count: u64, n: u64) -> KeepTuple {
        let count = count as usize;
        let n = (n as usize).min(count);
        let mut v = vec![0; count];
        for slot in v.iter_mut().skip(count - n) {
            *slot = 1;
        }
        KeepTuple(v)
    }

    /// Keep the lowest `n` of `count` dice (`n` clamped to `count`).
    pub fn keep_lowest(count: u64, n: u64) -> KeepTuple {
        let count = count as usize;
        let n = (n as usize).min(count);
        let mut v = vec![0; count];
        for slot in v.iter_mut().take(n) {
            *slot = 1;
        }
        KeepTuple(v)
    }

    pub(crate) fn empty() -> KeepTuple {
        KeepTuple(Vec::new())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// True when every entry is zero (vacuously true for the empty tuple) —
    /// the pool DP's `skip_weight` condition.
    pub fn is_all_zero(&self) -> bool {
        self.0.iter().all(|&x| x == 0)
    }

    /// Sum of all entries (the total kept count).
    pub fn sum(&self) -> i64 {
        self.0.iter().sum()
    }

    pub fn as_slice(&self) -> &[i64] {
        &self.0
    }

    /// Port of icepool `order.py::lo_hi_skip`: how many all-zero entries sit
    /// at the low / high end (the pop-direction heuristic — the end with
    /// more zeros wants to be popped first).
    pub fn lo_hi_skip(&self) -> (usize, usize) {
        let lo = self.0.iter().take_while(|&&x| x == 0).count();
        if lo == self.0.len() {
            return (lo, lo);
        }
        let hi = self.0.iter().rev().take_while(|&&x| x == 0).count();
        (lo, hi)
    }

    /// Pop `k` entries off the HIGH end; returns the remainder and the sum
    /// of the popped entries (icepool `pop_max_from_keep_tuple`).
    pub(crate) fn pop_max(&self, k: usize) -> (KeepTuple, i64) {
        let split = self.0.len() - k;
        let kept: i64 = self.0[split..].iter().sum();
        (KeepTuple(self.0[..split].to_vec()), kept)
    }

    /// Pop `k` entries off the LOW end (icepool `pop_min_from_keep_tuple`).
    pub(crate) fn pop_min(&self, k: usize) -> (KeepTuple, i64) {
        let kept: i64 = self.0[..k].iter().sum();
        (KeepTuple(self.0[k..].to_vec()), kept)
    }
}
