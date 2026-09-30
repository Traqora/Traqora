//! # Traqora Shared Contract Errors
//!
//! Centralised, deterministic error codes for all Soroban smart contracts in the
//! Traqora platform.  Every contract that previously used ad-hoc `panic!` strings
//! should import this crate and call [`panic_with_error!`] instead.
//!
//! ## Design goals
//! * **Deterministic** – every error variant maps to a stable `u32` discriminant so
//!   the Node/Express backend can map them without string matching.
//! * **No-std compatible** – the crate carries `#![no_std]` and only depends on
//!   `soroban-sdk`.
//! * **Categorised** – variants are grouped by domain (access, booking, refund, …)
//!   and each domain starts at a round multiple of 100, leaving room for additions
//!   without renumbering.
//!
//! ## Discriminant layout
//! | Range    | Domain              |
//! |----------|---------------------|
//! | 1–99     | Access / Auth       |
//! | 100–199  | Initialisation      |
//! | 200–299  | Booking             |
//! | 300–399  | Refund              |
//! | 400–499  | Flight / Registry   |
//! | 500–599  | Dispute             |
//! | 600–699  | Governance          |
//! | 700–799  | Oracle              |
//! | 800–899  | Upgrade / Timelock  |
//! | 900–999  | Token / Receipt     |
//! | 1000–…   | Arithmetic / misc   |

#![no_std]

use soroban_sdk::contracterror;

/// Canonical error type for all Traqora Soroban contracts.
///
/// Use [`panic_with_error!`] to abort contract execution with one of these
/// codes.  The discriminant values are **stable**: do not renumber existing
/// variants; append new ones at the end of each domain block.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    // ── Access / Auth  (1 – 99) ──────────────────────────────────────────────
    /// Caller is not the contract owner.
    NotOwner = 1,
    /// Caller does not hold the Admin role.
    NotAdmin = 2,
    /// Caller does not hold the Operator role.
    NotOperator = 3,
    /// General authorisation failure (e.g. signer mismatch).
    Unauthorized = 4,
    /// The supplied role discriminant is not a known value (0/1/2).
    InvalidRole = 5,

    // ── Initialisation  (100 – 199) ──────────────────────────────────────────
    /// `init_*` was called on an already-initialised contract.
    AlreadyInitialized = 100,
    /// Owner slot was set before this call – cannot re-initialise ownership.
    OwnerAlreadyInitialized = 101,

    // ── Booking  (200 – 299) ─────────────────────────────────────────────────
    /// No booking exists for the supplied ID.
    BookingNotFound = 200,
    /// The booking is in a state that does not allow the requested operation.
    InvalidBookingStatus = 201,
    /// Payment or escrow amount must be positive.
    InvalidAmount = 202,
    /// Escrow balance is zero – nothing to release.
    NoFundsInEscrow = 203,
    /// The refund/cancellation window has passed.
    RefundWindowClosed = 204,
    /// `batch_complete_bookings` was called with more than 50 IDs.
    BatchTooLarge = 205,
    /// Booking is already in a paid / confirmed state.
    AlreadyPaid = 206,

    // ── Refund  (300 – 399) ──────────────────────────────────────────────────
    /// No refund request exists for the supplied ID.
    RefundRequestNotFound = 300,
    /// The refund request has already been approved or rejected.
    RequestAlreadyProcessed = 301,
    /// No refund policy has been configured for this airline.
    NoRefundPolicy = 302,
    /// Booking has already been registered in the automation contract.
    BookingAlreadyRegistered = 303,
    /// Cannot cancel a booking that is already cancelled.
    BookingAlreadyCancelled = 304,

    // ── Flight / Registry  (400 – 499) ───────────────────────────────────────
    /// The requested seat is already reserved on this flight.
    SeatAlreadyReserved = 400,
    /// No flight record exists for the supplied ID.
    FlightNotFound = 401,

    // ── Dispute  (500 – 599) ─────────────────────────────────────────────────
    /// No eligible arbiter is available to be assigned.
    NoEligibleArbiter = 500,

    // ── Upgrade / Timelock  (800 – 899) ──────────────────────────────────────
    /// An upgrade has already been scheduled and is awaiting execution.
    UpgradeAlreadyScheduled = 800,
    /// The upgrade has already been executed – cannot execute again.
    UpgradeAlreadyExecuted = 801,
    /// The timelock delay has not elapsed yet.
    TimelockNotElapsed = 802,
    /// Cannot cancel an upgrade that has already been executed.
    CannotCancelExecutedUpgrade = 803,
    /// Timelock duration must be a positive number of seconds.
    InvalidTimelockDuration = 804,

    // ── Token / Receipt  (900 – 999) ─────────────────────────────────────────
    /// This token is a non-transferable soulbound token.
    NonTransferableSoulbound = 900,
    /// Burn is not supported for this token.
    BurnNotSupported = 901,
    /// The token balance is insufficient for the requested transfer.
    InsufficientBalance = 902,
    /// The token allowance is insufficient for the requested transfer.
    InsufficientAllowance = 903,

    // ── Arithmetic / misc  (1000 –) ──────────────────────────────────────────
    /// An arithmetic operation would overflow.
    ArithmeticOverflow = 1000,

    // ── Migration / Storage  (1100 –) ────────────────────────────────────────
    /// Migration direction is invalid (to_version must be > from_version).
    InvalidMigrationDirection = 1100,
    /// The stored version does not match the expected from_version.
    VersionMismatch = 1101,
}

/// Abort contract execution with a [`ContractError`] discriminant.
///
/// This macro wraps `soroban_sdk::panic_with_error!` so that callers only need
/// to import `errors::panic_with_error` instead of the SDK macro directly.
///
/// # Example
/// ```ignore
/// use errors::{ContractError, panic_with_error};
///
/// panic_with_error!(env, ContractError::NotOwner);
/// ```
#[macro_export]
macro_rules! panic_with_error {
    ($env:expr, $err:expr) => {
        soroban_sdk::panic_with_error!($env, $err)
    };
}

/// Convenience helpers that mirror the patterns found across the codebase.
///
/// These are thin wrappers that combine a guard check with the correct
/// [`ContractError`] variant so individual contracts do not have to repeat
/// the same boilerplate.
pub mod guards {
    use soroban_sdk::Env;

    use crate::ContractError;

    /// Panic with [`ContractError::InvalidRole`] if `role_u32` is not 0, 1 or 2.
    ///
    /// Returns the validated value so callers can use it in a match arm.
    #[inline]
    pub fn validate_role(env: &Env, role_u32: u32) -> u32 {
        if role_u32 > 2 {
            soroban_sdk::panic_with_error!(env, ContractError::InvalidRole);
        }
        role_u32
    }

    /// Panic with [`ContractError::ArithmeticOverflow`] if the addition
    /// `a + b` would overflow `i128`.
    #[inline]
    pub fn checked_add_i128(env: &Env, a: i128, b: i128) -> i128 {
        match a.checked_add(b) {
            Some(v) => v,
            None => soroban_sdk::panic_with_error!(env, ContractError::ArithmeticOverflow),
        }
    }

    /// Panic with [`ContractError::InvalidAmount`] if `amount` is not positive.
    #[inline]
    pub fn require_positive_amount(env: &Env, amount: i128) {
        if amount <= 0 {
            soroban_sdk::panic_with_error!(env, ContractError::InvalidAmount);
        }
    }

    /// Panic with [`ContractError::AlreadyInitialized`] if `already_set` is true.
    #[inline]
    pub fn require_not_initialized(env: &Env, already_set: bool) {
        if already_set {
            soroban_sdk::panic_with_error!(env, ContractError::AlreadyInitialized);
        }
    }
}
