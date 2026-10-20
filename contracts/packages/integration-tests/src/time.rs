//! Ledger time helpers for contract tests — issue #765.
//!
//! Soroban tests move time by mutating the ledger. Doing that by hand is easy to get wrong:
//! overwriting the whole `LedgerInfo` silently resets `network_id`, `base_reserve` and entry TTLs,
//! `timestamp + seconds` can overflow, and timestamps often move without the sequence number.
//!
//! Contract for every helper in this module:
//! - Only `timestamp` and `sequence_number` are changed; every other ledger field is preserved.
//! - Time is monotonic: helpers never move the timestamp or sequence backwards.
//! - Timestamp and sequence move together at [`SECONDS_PER_LEDGER`] seconds per ledger
//!   (sequence advances by `ceil(seconds / SECONDS_PER_LEDGER)`).
//! - Every helper returns the new ledger timestamp.
//! - `try_*` variants return [`TimeError`] instead of changing the ledger; the plain variants
//!   panic with the error's message.

use core::fmt;
use soroban_sdk::{testutils::Ledger, Env};

/// Target Stellar ledger close time, used to keep sequence numbers in step with timestamps.
pub const SECONDS_PER_LEDGER: u64 = 5;
pub const MINUTE: u64 = 60;
pub const HOUR: u64 = 60 * MINUTE;
pub const DAY: u64 = 24 * HOUR;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeError {
    /// The requested timestamp is earlier than the current ledger timestamp.
    Backwards { current: u64, requested: u64 },
    /// The new timestamp would not fit in a `u64`.
    TimestampOverflow,
    /// The new sequence number would not fit in a `u32`.
    SequenceOverflow,
}

impl fmt::Display for TimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TimeError::Backwards { current, requested } => write!(
                f,
                "cannot move ledger time backwards (current {current}, requested {requested})"
            ),
            TimeError::TimestampOverflow => write!(f, "ledger timestamp overflow"),
            TimeError::SequenceOverflow => write!(f, "ledger sequence overflow"),
        }
    }
}

/// Number of ledgers that close during `seconds` (rounded up).
pub fn ledgers_for(seconds: u64) -> u64 {
    seconds.div_ceil(SECONDS_PER_LEDGER)
}

/// Current ledger timestamp.
pub fn now(env: &Env) -> u64 {
    env.ledger().timestamp()
}

fn apply(env: &Env, new_timestamp: u64, ledgers: u64) -> Result<u64, TimeError> {
    let current = env.ledger().timestamp();
    if new_timestamp < current {
        return Err(TimeError::Backwards {
            current,
            requested: new_timestamp,
        });
    }

    let ledgers = u32::try_from(ledgers).map_err(|_| TimeError::SequenceOverflow)?;
    let new_sequence = env
        .ledger()
        .sequence()
        .checked_add(ledgers)
        .ok_or(TimeError::SequenceOverflow)?;

    env.ledger().with_mut(|li| {
        li.timestamp = new_timestamp;
        li.sequence_number = new_sequence;
    });
    Ok(new_timestamp)
}

/// Move time forward by `seconds`. `0` is a no-op.
pub fn try_advance_time(env: &Env, seconds: u64) -> Result<u64, TimeError> {
    let target = now(env)
        .checked_add(seconds)
        .ok_or(TimeError::TimestampOverflow)?;
    apply(env, target, ledgers_for(seconds))
}

/// Close `ledgers` ledgers, moving time forward by `ledgers * SECONDS_PER_LEDGER`.
pub fn try_advance_ledgers(env: &Env, ledgers: u32) -> Result<u64, TimeError> {
    let seconds = u64::from(ledgers)
        .checked_mul(SECONDS_PER_LEDGER)
        .ok_or(TimeError::TimestampOverflow)?;
    let target = now(env)
        .checked_add(seconds)
        .ok_or(TimeError::TimestampOverflow)?;
    apply(env, target, u64::from(ledgers))
}

/// Set an absolute timestamp. Must not be earlier than the current timestamp.
pub fn try_set_time(env: &Env, timestamp: u64) -> Result<u64, TimeError> {
    let current = now(env);
    let elapsed = timestamp.checked_sub(current).ok_or(TimeError::Backwards {
        current,
        requested: timestamp,
    })?;
    apply(env, timestamp, ledgers_for(elapsed))
}

/// Move time to one second after `deadline`, for "strictly after the deadline" checks
/// (`now > deadline`). If the ledger is already past `deadline`, nothing changes.
pub fn try_advance_past(env: &Env, deadline: u64) -> Result<u64, TimeError> {
    let target = deadline
        .checked_add(1)
        .ok_or(TimeError::TimestampOverflow)?;
    if now(env) >= target {
        return Ok(now(env));
    }
    try_set_time(env, target)
}

/// Panicking form of [`try_advance_time`].
pub fn advance_time(env: &Env, seconds: u64) -> u64 {
    try_advance_time(env, seconds).unwrap_or_else(|e| panic!("{e}"))
}

/// Panicking form of [`try_advance_ledgers`].
pub fn advance_ledgers(env: &Env, ledgers: u32) -> u64 {
    try_advance_ledgers(env, ledgers).unwrap_or_else(|e| panic!("{e}"))
}

/// Panicking form of [`try_set_time`].
pub fn set_time(env: &Env, timestamp: u64) -> u64 {
    try_set_time(env, timestamp).unwrap_or_else(|e| panic!("{e}"))
}

/// Panicking form of [`try_advance_past`].
pub fn advance_past(env: &Env, deadline: u64) -> u64 {
    try_advance_past(env, deadline).unwrap_or_else(|e| panic!("{e}"))
}
