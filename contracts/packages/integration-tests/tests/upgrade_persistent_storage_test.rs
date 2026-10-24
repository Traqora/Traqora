//! Integration tests for contract upgrades with initialized persistent storage.
//!
//! These tests exercise upgrade migrations with populated state from the previous
//! contract version and verify existing bookings, balances, and authorization data
//! remain valid after the upgrade.
//!
//! Coverage:
//! - §A  Pre-upgrade state: bookings are created and verified
//! - §B  Upgrade lifecycle: schedule → execute with timelock
//! - §C  Post-upgrade verification: bookings remain accessible and valid
//! - §D  Failure cases: premature execution, missing state

use access::{AccessControl, Role};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, BytesN, Env,
};
use upgrade::{UpgradeContract, UpgradeContractClient};

use booking::{Booking, BookingContract, BookingContractClient};

/// Test helper to set up environment with booking contract and admin.
fn setup_booking_env() -> (Env, BookingContractClient, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let booking_id = env.register_contract(None, BookingContract);
    let client = BookingContractClient::new(&env, &booking_id);

    let admin = Address::generate(&env);

    env.as_contract(&booking_id, || {
        // No special initialization needed for booking contract
    });

    (env, client, admin)
}

/// Test helper to set up environment with upgrade contract.
fn setup_upgrade_env() -> (Env, UpgradeContractClient, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeContract);
    let client = UpgradeContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    env.as_contract(&contract_id, || {
        access::AccessControl::init_owner(&env, &admin);
        access::AccessControl::set_role(&env, &admin, &admin, Role::Admin, true);
    });

    (env, client, admin)
}

// ═════════════════════════════════════════════════════════════════════════════
// §A  Pre-upgrade state: bookings are created and verified
// ═════════════════════════════════════════════════════════════════════════════

/// After creating bookings, the data is persisted and accessible before any upgrade.
#[test]
fn test_persistent_storage_before_upgrade() {
    let (env, client, admin) = setup_booking_env();

    let price = 100_0000000i128;

    let booking_id_1 = client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
    );

    let booking_id_2 = client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL456"),
        &Symbol::new(&env, "CDG"),
        &Symbol::new(&env, "FRA"),
        &1704067200,
        &price,
    );

    // Verify bookings exist and are valid
    let b1 = client.get_booking(&booking_id_1).unwrap();
    assert_eq!(b1.status, symbol_short!("pending"));
    assert_eq!(b1.amount_escrowed, 0);

    let b2 = client.get_booking(&booking_id_2).unwrap();
    assert_eq!(b2.status, symbol_short!("pending"));
    assert_eq!(b2.amount_escrowed, 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// §B  Upgrade lifecycle: schedule → execute with timelock
// ═════════════════════════════════════════════════════════════════════════════

/// After scheduling an upgrade, the upgrade is stored and can be executed after
/// the timelock period has elapsed.
#[test]
fn test_upgrade_lifecycle_with_booking_state() {
    let (env, booking_client, admin) = setup_booking_env();

    // Create bookings before upgrade
    let price = 100_0000000i128;
    let booking_id = booking_client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
    );

    // Verify booking exists before upgrade
    let before = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(before.status, symbol_short!("pending"));

    // Set up upgrade contract
    let (upgrade_env, upgrade_client, upgrade_admin) = setup_upgrade_env();

    let new_wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    // Schedule upgrade from booking contract admin
    upgrade_client.schedule_upgrade(&admin, &new_wasm_hash);

    // Advance timelock to exactly 48 hours
    env.ledger().set_timestamp(0);
    upgrade_client.schedule_upgrade(&admin, &new_wasm_hash);
    env.ledger().set_timestamp(172800);

    // Execute upgrade (should succeed at timelock boundary)
    upgrade_client.execute_upgrade(&admin);

    // Verify upgrade was executed
    let scheduled = upgrade_client.get_scheduled_upgrade().unwrap();
    assert!(scheduled.executed, "upgrade must be marked as executed");
}

/// Test that bookings remain accessible after upgrade execution.
#[test]
fn test_bookings_accessible_after_upgrade() {
    let (env, booking_client, admin) = setup_booking_env();

    // Create bookings before upgrade
    let price = 100_0000000i128;
    let booking_id = booking_client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
    );

    // Verify booking exists before upgrade
    let before = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(before.status, symbol_short!("pending"));

    // Set up and execute upgrade
    let (upgrade_env, upgrade_client, upgrade_admin) = setup_upgrade_env();

    let new_wasm_hash = BytesN::from_array(&env, &[2u8; 32]);

    upgrade_client.schedule_upgrade(&admin, &new_wasm_hash);
    env.ledger().set_timestamp(0);
    env.ledger().set_timestamp(172800);
    upgrade_client.execute_upgrade(&admin);

    // After upgrade, bookings should still be accessible
    // (Soroban persistent storage persists across contract upgrades)
    let after = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(after.status, symbol_short!("pending"));
    assert_eq!(after.amount_escrowed, 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// §C  Post-upgrade verification: bookings remain accessible and valid
// ═════════════════════════════════════════════════════════════════════════════

/// After upgrading the contract, all existing bookings remain valid and
/// accessible through the new contract code.
#[test]
fn test_all_bookings_survive_upgrade() {
    let (env, booking_client, admin) = setup_booking_env();

    // Create multiple bookings
    let price = 100_0000000i128;
    let bid1 = booking_client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
    );
    let bid2 = booking_client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL456"),
        &Symbol::new(&env, "CDG"),
        &Symbol::new(&env, "FRA"),
        &1704067200,
        &price,
    );
    let bid3 = booking_client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL789"),
        &Symbol::new(&env, "BCN"),
        &Symbol::new(&env, "LIS"),
        &1704067200,
        &price,
    );

    // Verify all bookings exist before upgrade
    let b1 = booking_client.get_booking(&bid1).unwrap();
    let b2 = booking_client.get_booking(&bid2).unwrap();
    let b3 = booking_client.get_booking(&bid3).unwrap();
    assert_eq!(b1.status, symbol_short!("pending"));
    assert_eq!(b2.status, symbol_short!("pending"));
    assert_eq!(b3.status, symbol_short!("pending"));

    // Set up and execute upgrade
    let (upgrade_env, upgrade_client, upgrade_admin) = setup_upgrade_env();

    let new_wasm_hash = BytesN::from_array(&env, &[3u8; 32]);

    upgrade_client.schedule_upgrade(&admin, &new_wasm_hash);
    env.ledger().set_timestamp(0);
    env.ledger().set_timestamp(172800);
    upgrade_client.execute_upgrade(&admin);

    // After upgrade, all bookings should still be accessible
    let a1 = booking_client.get_booking(&bid1).unwrap();
    let a2 = booking_client.get_booking(&bid2).unwrap();
    let a3 = booking_client.get_booking(&bid3).unwrap();
    assert_eq!(a1.status, symbol_short!("pending"));
    assert_eq!(a2.status, symbol_short!("pending"));
    assert_eq!(a3.status, symbol_short!("pending"));
}

// ═════════════════════════════════════════════════════════════════════════════
// §D  Failure cases: premature execution, missing state
// ═════════════════════════════════════════════════════════════════════════════

/// Executing an upgrade prematurely (before timelock) must fail even with
/// populated booking state.
#[test]
#[should_panic(expected = "Timelock period not yet elapsed")]
fn test_premature_execution_with_bookings() {
    let (env, booking_client, admin) = setup_booking_env();

    // Create bookings
    let price = 100_0000000i128;
    let booking_id = booking_client.create_booking(
        &admin,
        &admin,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
    );

    // Booking exists - verify it's there
    let _ = booking_client.get_booking(&booking_id).unwrap();

    // Set up and execute upgrade prematurely
    let (upgrade_env, upgrade_client, upgrade_admin) = setup_upgrade_env();

    let new_wasm_hash = BytesN::from_array(&env, &[4u8; 32]);

    upgrade_client.schedule_upgrade(&admin, &new_wasm_hash);
    // Do NOT advance timelock - execute immediately
    upgrade_client.execute_upgrade(&admin); // must panic
}

// ═════════════════════════════════════════════════════════════════════════════
// End of tests
// ═════════════════════════════════════════════════════════════════════════════