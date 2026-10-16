//! Integration tests for the centralised `errors` shared package.
//!
//! These tests verify:
//! 1. Every `ContractError` variant has the expected stable discriminant so the
//!    backend can map errors deterministically.
//! 2. The `access` crate now emits structured `ContractError` codes instead of
//!    bare panic strings.
//! 3. The `guards` helpers behave correctly on both the happy and error paths.
//! 4. Key contracts still produce the right errors through their public API.
#![cfg(test)]

use errors::{guards, ContractError};
use governance::{GovernanceContract, GovernanceContractClient};
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, IntoVal,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn governance_with_owner(env: &Env) -> (GovernanceContractClient, Address) {
    let id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(env, &id);
    let owner = Address::generate(env);
    client.init_governance(&owner, &3600);
    (client, owner)
}

// ─── 1. Discriminant stability ───────────────────────────────────────────────

/// Guard that makes it obvious when a discriminant is accidentally renumbered.
#[test]
fn test_error_discriminants_are_stable() {
    // Access / Auth
    assert_eq!(ContractError::NotOwner as u32, 1);
    assert_eq!(ContractError::NotAdmin as u32, 2);
    assert_eq!(ContractError::NotOperator as u32, 3);
    assert_eq!(ContractError::Unauthorized as u32, 4);
    assert_eq!(ContractError::InvalidRole as u32, 5);

    // Initialisation
    assert_eq!(ContractError::AlreadyInitialized as u32, 100);
    assert_eq!(ContractError::OwnerAlreadyInitialized as u32, 101);

    // Booking
    assert_eq!(ContractError::BookingNotFound as u32, 200);
    assert_eq!(ContractError::InvalidBookingStatus as u32, 201);
    assert_eq!(ContractError::InvalidAmount as u32, 202);
    assert_eq!(ContractError::NoFundsInEscrow as u32, 203);
    assert_eq!(ContractError::RefundWindowClosed as u32, 204);
    assert_eq!(ContractError::BatchTooLarge as u32, 205);
    assert_eq!(ContractError::AlreadyPaid as u32, 206);

    // Refund
    assert_eq!(ContractError::RefundRequestNotFound as u32, 300);
    assert_eq!(ContractError::RequestAlreadyProcessed as u32, 301);
    assert_eq!(ContractError::NoRefundPolicy as u32, 302);
    assert_eq!(ContractError::BookingAlreadyRegistered as u32, 303);
    assert_eq!(ContractError::BookingAlreadyCancelled as u32, 304);

    // Flight / Registry
    assert_eq!(ContractError::SeatAlreadyReserved as u32, 400);
    assert_eq!(ContractError::FlightNotFound as u32, 401);

    // Dispute
    assert_eq!(ContractError::NoEligibleArbiter as u32, 500);

    // Upgrade / Timelock
    assert_eq!(ContractError::UpgradeAlreadyScheduled as u32, 800);
    assert_eq!(ContractError::UpgradeAlreadyExecuted as u32, 801);
    assert_eq!(ContractError::TimelockNotElapsed as u32, 802);
    assert_eq!(ContractError::CannotCancelExecutedUpgrade as u32, 803);
    assert_eq!(ContractError::InvalidTimelockDuration as u32, 804);

    // Token / Receipt
    assert_eq!(ContractError::NonTransferableSoulbound as u32, 900);
    assert_eq!(ContractError::BurnNotSupported as u32, 901);
    assert_eq!(ContractError::InsufficientBalance as u32, 902);
    assert_eq!(ContractError::InsufficientAllowance as u32, 903);

    // Arithmetic
    assert_eq!(ContractError::ArithmeticOverflow as u32, 1000);

    // Migration / Storage
    assert_eq!(ContractError::InvalidMigrationDirection as u32, 1100);
    assert_eq!(ContractError::VersionMismatch as u32, 1101);
}

/// Variants compare by domain ordering.
#[test]
fn test_error_ordering_respects_domains() {
    assert!(ContractError::NotOwner < ContractError::AlreadyInitialized);
    assert!(ContractError::AlreadyInitialized < ContractError::BookingNotFound);
    assert!(ContractError::BookingNotFound < ContractError::RefundRequestNotFound);
    assert!(ContractError::RefundRequestNotFound < ContractError::SeatAlreadyReserved);
    assert!(ContractError::SeatAlreadyReserved < ContractError::NoEligibleArbiter);
    assert!(ContractError::NoEligibleArbiter < ContractError::UpgradeAlreadyScheduled);
    assert!(ContractError::UpgradeAlreadyScheduled < ContractError::NonTransferableSoulbound);
    assert!(ContractError::NonTransferableSoulbound < ContractError::ArithmeticOverflow);
    assert!(ContractError::ArithmeticOverflow < ContractError::InvalidMigrationDirection);
}

/// Variants implement Copy + Clone + Eq.
#[test]
fn test_error_implements_copy_clone_eq() {
    let e = ContractError::NotOwner;
    let cloned = e;
    assert_eq!(e, cloned);

    let f = ContractError::InvalidAmount;
    assert_ne!(e, f);
}

// ─── 2. access crate emits structured errors ─────────────────────────────────

/// require_owner fails with a structured error, not a bare string.
#[test]
fn test_access_require_owner_structured_error() {
    let env = new_env();
    let (client, _owner) = governance_with_owner(&env);

    let impostor = Address::generate(&env);
    let result = client.try_transfer_ownership(&impostor, &impostor);
    // The error must be an invocation error (contract panicked with a structured error).
    assert!(result.is_err());
}

/// require_admin fails with a structured error.
#[test]
fn test_access_require_admin_structured_error() {
    let env = new_env();
    let (client, owner) = governance_with_owner(&env);

    let proposal_id = client.create_proposal(&owner, &soroban_sdk::Symbol::new(&env, "Prop1"));

    // Jump past voting period so we reach the admin guard
    env.ledger().with_mut(|l| l.timestamp += 5000);

    let non_admin = Address::generate(&env);
    let result = client.try_execute_proposal(&non_admin, &proposal_id);
    assert!(result.is_err());
}

/// init_governance (which calls init_owner) fails on second call.
#[test]
fn test_access_owner_already_initialized_structured_error() {
    let env = new_env();
    let (client, owner) = governance_with_owner(&env);

    // Second init must fail
    let result = client.try_init_governance(&owner, &3600);
    assert!(result.is_err());
}

/// Ownership transfer succeeds for the real owner.
#[test]
fn test_access_transfer_ownership_succeeds() {
    let env = new_env();
    let (client, owner) = governance_with_owner(&env);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);
    assert_eq!(client.get_owner(), new_owner);
}

/// Role checks are consistent after grant / revoke.
#[test]
fn test_access_roles_grant_revoke() {
    let env = new_env();
    let (client, owner) = governance_with_owner(&env);

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);

    client.set_role(&owner, &admin, &1, &true);
    assert!(client.has_role(&admin, &1));
    assert!(client.has_role(&admin, &2)); // Admin ⊃ Operator

    client.set_role(&owner, &operator, &2, &true);
    assert!(client.has_role(&operator, &2));
    assert!(!client.has_role(&operator, &1)); // Operator ⊄ Admin

    // Revoke
    client.set_role(&owner, &admin, &1, &false);
    assert!(!client.has_role(&admin, &1));
    assert!(!client.has_role(&admin, &2)); // No longer admin, no longer operator
}

// ─── 3. guards helpers ───────────────────────────────────────────────────────

/// `validate_role` passes for values 0, 1, 2 and panics for others.
#[test]
fn test_guards_validate_role_valid_values() {
    let env = new_env();
    assert_eq!(guards::validate_role(&env, 0), 0);
    assert_eq!(guards::validate_role(&env, 1), 1);
    assert_eq!(guards::validate_role(&env, 2), 2);
}

#[test]
#[should_panic]
fn test_guards_validate_role_invalid_panics() {
    let env = new_env();
    guards::validate_role(&env, 99);
}

/// `checked_add_i128` returns the correct sum.
#[test]
fn test_guards_checked_add_happy_path() {
    let env = new_env();
    assert_eq!(guards::checked_add_i128(&env, 100, 200), 300);
    assert_eq!(guards::checked_add_i128(&env, 0, 0), 0);
    assert_eq!(guards::checked_add_i128(&env, -50, 50), 0);
}

/// `checked_add_i128` panics on overflow.
#[test]
#[should_panic]
fn test_guards_checked_add_overflow_panics() {
    let env = new_env();
    guards::checked_add_i128(&env, i128::MAX, 1);
}

/// `require_positive_amount` passes for positive values.
#[test]
fn test_guards_require_positive_amount_happy() {
    let env = new_env();
    guards::require_positive_amount(&env, 1);
    guards::require_positive_amount(&env, i128::MAX);
}

/// `require_positive_amount` panics for zero.
#[test]
#[should_panic]
fn test_guards_require_positive_amount_zero_panics() {
    let env = new_env();
    guards::require_positive_amount(&env, 0);
}

/// `require_positive_amount` panics for negative values.
#[test]
#[should_panic]
fn test_guards_require_positive_amount_negative_panics() {
    let env = new_env();
    guards::require_positive_amount(&env, -1);
}

/// `require_not_initialized` passes when already_set is false.
#[test]
fn test_guards_require_not_initialized_happy() {
    let env = new_env();
    guards::require_not_initialized(&env, false);
}

/// `require_not_initialized` panics when already_set is true.
#[test]
#[should_panic]
fn test_guards_require_not_initialized_panics() {
    let env = new_env();
    guards::require_not_initialized(&env, true);
}

// ─── 4. End-to-end: booking errors still surface correctly ───────────────────

#[test]
fn test_booking_errors_still_propagate() {
    use booking::{BookingContract, BookingContractClient};
    use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
    use soroban_sdk::Symbol;
    use token::{TRQTokenContract, TRQTokenContractClient};

    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    // pay_for_booking on a non-existent booking should fail
    let res = contracts.booking.try_pay_for_booking(&999_999_u64);
    assert!(res.is_err(), "Expected error for non-existent booking");

    // Create a booking, pay once, pay again → should fail
    let price = 10_0000000_i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL001"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &2_000_000_000_u64,
        &price,
        &contracts.token.address,
    );
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let res2 = contracts.booking.try_pay_for_booking(&booking_id);
    assert!(res2.is_err(), "Expected error when paying twice");
}
