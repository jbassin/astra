//! The D32-12 budget: caps enforced at the distribution-engine level.
//!
//! The caller threads one [`Budget`] through every dist-building call; each
//! allocation/growth point checks BEFORE growing and aborts with
//! [`DistError::Budget`] naming the exhausted counter.

use std::error::Error;
use std::fmt;

/// An error from the distribution engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DistError {
    /// A D32-12 budget counter was exhausted. `counter` is one of
    /// `"transitions"`, `"states"`, `"support"`, `"weight_bits"`,
    /// `"explode_depth"`, `"pool_count"`.
    Budget { counter: &'static str },
    /// A distribution would have an empty support (constructors reject
    /// empty inputs; a mixture of all-zero component weights).
    Empty,
    /// A `weighted` pair carried a zero weight (weights must be >= 1).
    ZeroWeight,
    /// The keep-tuple length does not equal the pool's dice count.
    KeepLen { expected: u64, got: u64 },
    /// Carrier for caller-side errors threaded through a pool callback
    /// (e.g. the interpreter's own eval errors inside `evaluate()`).
    External { message: String },
}

impl fmt::Display for DistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DistError::Budget { counter } => write!(f, "budget exhausted: {counter}"),
            DistError::Empty => write!(f, "distribution would be empty"),
            DistError::ZeroWeight => write!(f, "weights must be >= 1"),
            DistError::KeepLen { expected, got } => {
                write!(f, "keep-tuple length {got} != pool count {expected}")
            }
            DistError::External { message } => write!(f, "{message}"),
        }
    }
}

impl Error for DistError {}

/// The D32-12 budget the caller threads through the engine.
///
/// The four public fields are LIMITS (defaults = the D32-12 consts); the
/// private fields track usage. `transitions` is cumulative work
/// (`next`-callback invocations plus weighted-Pascal `comb_row` cells —
/// the row cells are the pool DP's other super-linear cost, so they count
/// too). `states` caps the CONCURRENT size of any one DP level map
/// (a memory cap, tracked as a high-water mark). `support` caps the face
/// count of any single distribution. `weight_bits` caps the bit length of
/// any single weight (checked inside every [`super::Weight`] op).
#[derive(Debug, Clone)]
pub struct Budget {
    /// DP-transition limit (D32-12 default: 1,000,000).
    pub transitions: u64,
    /// Concurrent state-map entry limit (D32-12 default: 200,000).
    pub states: u64,
    /// Support size limit per die (D32-12 default: 50,000).
    pub support: u64,
    /// Bigint bit-length limit per weight (D32-12 default: 16,384).
    pub weight_bits: u64,
    used_transitions: u64,
    peak_states: u64,
}

impl Budget {
    /// D32-12: DP transitions <= 1,000,000.
    pub const DEFAULT_TRANSITIONS: u64 = 1_000_000;
    /// D32-12: state-map entries <= 200,000.
    pub const DEFAULT_STATES: u64 = 200_000;
    /// D32-12: support size per die <= 50,000.
    pub const DEFAULT_SUPPORT: u64 = 50_000;
    /// D32-12: bigint bits per weight <= 16,384.
    pub const DEFAULT_WEIGHT_BITS: u64 = 16_384;

    /// A budget with custom limits and zero usage.
    pub fn with_limits(transitions: u64, states: u64, support: u64, weight_bits: u64) -> Budget {
        Budget {
            transitions,
            states,
            support,
            weight_bits,
            used_transitions: 0,
            peak_states: 0,
        }
    }

    /// Charge `n` units of DP work; errors once the cumulative total would
    /// exceed the `transitions` limit.
    pub fn charge_transitions(&mut self, n: u64) -> Result<(), DistError> {
        let next = self.used_transitions.saturating_add(n);
        if next > self.transitions {
            return Err(DistError::Budget {
                counter: "transitions",
            });
        }
        self.used_transitions = next;
        Ok(())
    }

    /// Check a prospective concurrent state-map size (called before the map
    /// grows to `entries`).
    pub fn check_states(&mut self, entries: u64) -> Result<(), DistError> {
        if entries > self.states {
            return Err(DistError::Budget { counter: "states" });
        }
        self.peak_states = self.peak_states.max(entries);
        Ok(())
    }

    /// Check a prospective support size (called before a distribution grows
    /// to `n` faces).
    pub fn check_support(&self, n: u64) -> Result<(), DistError> {
        if n > self.support {
            return Err(DistError::Budget { counter: "support" });
        }
        Ok(())
    }

    /// Cumulative DP work charged so far.
    pub fn used_transitions(&self) -> u64 {
        self.used_transitions
    }

    /// High-water mark of concurrent DP state-map entries.
    pub fn peak_states(&self) -> u64 {
        self.peak_states
    }
}

impl Default for Budget {
    fn default() -> Budget {
        Budget::with_limits(
            Budget::DEFAULT_TRANSITIONS,
            Budget::DEFAULT_STATES,
            Budget::DEFAULT_SUPPORT,
            Budget::DEFAULT_WEIGHT_BITS,
        )
    }
}
