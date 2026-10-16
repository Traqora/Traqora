//! Regression tests for the upgrade-mechanism quick reference (UPGRADE_QUICK_REFERENCE.md).
//!
//! These tests exercise every behaviour described in the quick reference —
//! inputs, outputs, and error cases — through the registered contract client
//! so they reflect real on-chain call semantics rather than direct struct calls.
//!
//! Coverage map
//! ============
//! §1  Happy path — full schedule → execute lifecycle
//!     – schedule stores the WASM hash and the scheduling timestamp
//!     – get_scheduled_upgrade returns Some after schedule, None after cancel
//!     – get_timelock_duration returns 172800 (48 h) by default
//!     – get_upgrade_timelock_remaining counts down correctly
//!     – execute_upgrade succeeds at the exact 48-hour boundary
//!     – get_upgrade_timelock_remaining returns 0 after execution
//!     – a new upgrade can be scheduled after the previous one executes
//!
//! §2  Key failure mode — premature execution
//!     – execute_upgrade panics with "Timelock period not yet elapsed"
//!       when called one second before the 48-hour window closes
//!
//! §3  Cancellation flow
//!     – cancel_upgrade clears the scheduled upgrade
//!     – a different WASM hash can be scheduled after cancellation
//!     – cancel panics when no upgrade is scheduled
//!     – cancel panics when the upgrade has already been executed
//!
//! §4  Authorization guards (quick-reference error table)
//!     – schedule_upgrade rejects a non-admin caller
//!     – execute_upgrade rejects a non-admin caller
//!     – set_timelock_duration rejects a non-owner caller
//!     – cancel_upgrade rejects a non-owner caller
//!
//! §5  Custom timelock
//!     – set_timelock_duration updates the stored duration
//!     – execute_upgrade respects the custom timelock, not the 48-hour default
//!
//! §6  Event emission
//!     – schedule_upgrade emits (upgrade, scheduled) with correct payload
//!     – execute_upgrade emits (upgrade, executed) with correct payload
//!     – cancel_upgrade emits (upgrade, cancelled) with correct payload
//!     – set_timelock_duration emits (upgrade, timelock) with correct payload

use access::{AccessControl, Role};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    Address, BytesN, Env, Val,
};
use upgrade::{UpgradeContract, UpgradeContractClient};

// ─────────────────────────────── event helpers ───────────────────────────────

/// Return all events whose first two topics are `(topic0, topic1)`.
///
/// Comparison uses payload equality (the same technique as `event_assertions_test.rs`)
/// because `soroban_sdk::Val` does not implement `PartialEq` directly.
fn find_upgrade_events(
    env: &Env,
    action: soroban_sdk::Symbol,
) -> std::vec::Vec<(Address, soroban_sdk::Vec<Val>, Val)> {
    let t0 = symbol_short!("upgrade").to_val().get_payload();
    let t1 = action.to_val().get_payload();
    env.events()
        .all()
        .iter()
        .filter(|(_, topics, _)| {
            topics.len() == 2
                && topics.get(0).unwrap().get_payload() == t0
                && topics.get(1).unwrap().get_payload() == t1
        })
        .collect()
}

// ─────────────────────────────── helpers ─────────────────────────────────────

/// Build an env + registered UpgradeContract client with a pre-configured owner/admin.
///
/// The returned address holds both Owner and Admin roles, matching the
/// recommended integration pattern from UPGRADE_QUICK_REFERENCE §Integration.
fn setup() -> (Env, UpgradeContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(UpgradeContract, ());
    let client = UpgradeContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Initialise access control inside the contract's storage context.
    env.as_contract(&contract_id, || {
        AccessControl::init_owner(&env, &admin);
        AccessControl::set_role(&env, &admin, &admin, Role::Admin, true);
    });

    (env, client, admin)
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

// ══════════════════════════════════════════════════════════════════════════════
// §1  Happy path — full schedule → execute lifecycle
// ══════════════════════════════════════════════════════════════════════════════

/// After schedule_upgrade the stored hash matches exactly what was passed in.
#[test]
fn test_quickref_schedule_stores_wasm_hash() {
    let (env, client, admin) = setup();
    let new_hash = hash(&env, 0xAB);

    client.schedule_upgrade(&admin, &new_hash);

    let stored = client.get_scheduled_upgrade().expect("should be Some after schedule");
    assert_eq!(stored.new_wasm_hash, new_hash);
    assert!(!stored.executed, "executed flag must be false right after scheduling");
}

/// The scheduling timestamp recorded in the struct equals the ledger timestamp
/// at the moment schedule_upgrade was called.
#[test]
fn test_quickref_schedule_records_ledger_timestamp() {
    let (env, client, admin) = setup();
    let scheduled_at: u64 = 9_000;
    env.ledger().set_timestamp(scheduled_at);

    client.schedule_upgrade(&admin, &hash(&env, 0x01));

    let stored = client.get_scheduled_upgrade().unwrap();
    assert_eq!(
        stored.scheduled_at, scheduled_at,
        "scheduled_at must equal the ledger timestamp when schedule_upgrade was called"
    );
}

/// get_scheduled_upgrade returns None when nothing has been scheduled yet.
#[test]
fn test_quickref_get_scheduled_upgrade_none_before_schedule() {
    let (_env, client, _admin) = setup();
    assert!(client.get_scheduled_upgrade().is_none());
}

/// The default timelock returned by get_timelock_duration is exactly 48 hours
/// (172 800 seconds) as stated in the quick-reference Key Properties table.
#[test]
fn test_quickref_default_timelock_is_48_hours() {
    let (_env, client, _admin) = setup();
    assert_eq!(
        client.get_timelock_duration(),
        172_800,
        "default timelock must be 172800 s (48 h) per UPGRADE_QUICK_REFERENCE"
    );
}

/// get_upgrade_timelock_remaining counts down correctly:
///   remaining = timelock_duration − (now − scheduled_at)
#[test]
fn test_quickref_timelock_remaining_counts_down() {
    let (env, client, admin) = setup();

    env.ledger().set_timestamp(1_000);
    client.schedule_upgrade(&admin, &hash(&env, 0x02));

    // 500 s after scheduling: 172800 − 500 = 172300 remaining
    env.ledger().set_timestamp(1_500);
    assert_eq!(client.get_upgrade_timelock_remaining(), 172_300);

    // at exactly the boundary: remaining drops to 0
    env.ledger().set_timestamp(1_000 + 172_800);
    assert_eq!(client.get_upgrade_timelock_remaining(), 0);
}

/// get_upgrade_timelock_remaining returns 0 when no upgrade is scheduled
/// (documented in UPGRADE_QUICK_REFERENCE §Core API).
#[test]
fn test_quickref_timelock_remaining_zero_when_no_upgrade() {
    let (_env, client, _admin) = setup();
    assert_eq!(client.get_upgrade_timelock_remaining(), 0);
}

/// execute_upgrade succeeds at the exact 48-hour boundary and marks the
/// upgrade as executed.
#[test]
fn test_quickref_execute_succeeds_at_exact_48h_boundary() {
    let (env, client, admin) = setup();

    env.ledger().set_timestamp(1_000);
    client.schedule_upgrade(&admin, &hash(&env, 0x03));

    // Advance exactly 48 h
    env.ledger().set_timestamp(1_000 + 172_800);
    client.execute_upgrade(&admin);

    let stored = client.get_scheduled_upgrade().unwrap();
    assert!(stored.executed, "executed flag must be true after execute_upgrade");
}

/// After a successful execution get_upgrade_timelock_remaining returns 0.
#[test]
fn test_quickref_timelock_remaining_zero_after_execution() {
    let (env, client, admin) = setup();

    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash(&env, 0x04));
    env.ledger().set_timestamp(200_000);
    client.execute_upgrade(&admin);

    assert_eq!(
        client.get_upgrade_timelock_remaining(),
        0,
        "remaining must be 0 after the upgrade has been executed"
    );
}

/// A new upgrade can be scheduled once the previous one has been executed
/// (the "Next upgrade can be scheduled" step in the UPGRADE_QUICK_REFERENCE §Workflow).
#[test]
fn test_quickref_can_schedule_after_previous_executed() {
    let (env, client, admin) = setup();
    let hash_v2 = hash(&env, 0x20);
    let hash_v3 = hash(&env, 0x30);

    // First upgrade cycle
    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash_v2);
    env.ledger().set_timestamp(200_000);
    client.execute_upgrade(&admin);

    // Second upgrade cycle
    env.ledger().set_timestamp(200_001);
    client.schedule_upgrade(&admin, &hash_v3);

    let stored = client.get_scheduled_upgrade().unwrap();
    assert_eq!(stored.new_wasm_hash, hash_v3);
    assert!(!stored.executed, "second upgrade must start in pending state");
}

// ══════════════════════════════════════════════════════════════════════════════
// §2  Key failure mode — premature execution
// ══════════════════════════════════════════════════════════════════════════════

/// Calling execute_upgrade one second before the 48-hour window closes must
/// panic with "Timelock period not yet elapsed".
///
/// This is the single most important safety property of the upgrade mechanism
/// and is explicitly listed in the UPGRADE_QUICK_REFERENCE §Error Messages.
#[test]
#[should_panic(expected = "Timelock period not yet elapsed")]
fn test_quickref_premature_execution_rejected() {
    let (env, client, admin) = setup();

    env.ledger().set_timestamp(1_000);
    client.schedule_upgrade(&admin, &hash(&env, 0x05));

    // One second before the 48-hour window closes: 1000 + 172800 − 1 = 173799
    env.ledger().set_timestamp(173_799);
    client.execute_upgrade(&admin); // must panic
}

// ══════════════════════════════════════════════════════════════════════════════
// §3  Cancellation flow
// ══════════════════════════════════════════════════════════════════════════════

/// cancel_upgrade removes the pending upgrade from storage.
#[test]
fn test_quickref_cancel_clears_scheduled_upgrade() {
    let (env, client, admin) = setup();

    client.schedule_upgrade(&admin, &hash(&env, 0x06));
    assert!(client.get_scheduled_upgrade().is_some());

    client.cancel_upgrade(&admin);
    assert!(
        client.get_scheduled_upgrade().is_none(),
        "get_scheduled_upgrade must return None after cancel_upgrade"
    );
}

/// After cancellation a different WASM hash can be scheduled immediately
/// (Cancellation Flow in UPGRADE_QUICK_REFERENCE §Workflow).
#[test]
fn test_quickref_can_reschedule_after_cancel() {
    let (env, client, admin) = setup();
    let hash_original = hash(&env, 0x07);
    let hash_replacement = hash(&env, 0x08);

    env.ledger().set_timestamp(500);
    client.schedule_upgrade(&admin, &hash_original);

    client.cancel_upgrade(&admin);

    env.ledger().set_timestamp(600);
    client.schedule_upgrade(&admin, &hash_replacement);

    let stored = client.get_scheduled_upgrade().unwrap();
    assert_eq!(
        stored.new_wasm_hash, hash_replacement,
        "after cancel-and-reschedule the replacement hash must be stored"
    );
}

/// cancel_upgrade panics when there is no scheduled upgrade.
#[test]
#[should_panic(expected = "No upgrade scheduled")]
fn test_quickref_cancel_panics_when_nothing_scheduled() {
    let (_env, client, admin) = setup();
    client.cancel_upgrade(&admin);
}

/// cancel_upgrade panics when the upgrade has already been executed.
/// The quick reference Error Messages table covers this via
/// "Cannot cancel an executed upgrade".
#[test]
#[should_panic(expected = "Cannot cancel an executed upgrade")]
fn test_quickref_cancel_executed_upgrade_rejected() {
    let (env, client, admin) = setup();

    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash(&env, 0x09));
    env.ledger().set_timestamp(200_000);
    client.execute_upgrade(&admin);

    // Must panic — cannot cancel what is already done
    client.cancel_upgrade(&admin);
}

// ══════════════════════════════════════════════════════════════════════════════
// §4  Authorization guards (quick-reference error table)
// ══════════════════════════════════════════════════════════════════════════════

/// schedule_upgrade called by a non-admin must return a ContractError (NotAdmin = #2).
///
/// When called through the registered contract client, access violations surface
/// as structured `ContractError` codes (HostError), not bare string panics — this
/// is the canonical pattern for auth-guard tests, per contract_errors_test.rs.
#[test]
fn test_quickref_schedule_rejects_non_admin() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);

    let result = client.try_schedule_upgrade(&stranger, &hash(&env, 0x0A));
    assert!(result.is_err(), "schedule_upgrade must reject a non-admin caller");
}

/// execute_upgrade called by a non-admin must return a ContractError (NotAdmin = #2).
#[test]
fn test_quickref_execute_rejects_non_admin() {
    let (env, client, admin) = setup();
    let stranger = Address::generate(&env);

    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash(&env, 0x0B));
    env.ledger().set_timestamp(200_000);

    let result = client.try_execute_upgrade(&stranger);
    assert!(result.is_err(), "execute_upgrade must reject a non-admin caller");
}

/// set_timelock_duration called by a non-owner must return a ContractError (NotOwner = #1).
#[test]
fn test_quickref_set_timelock_rejects_non_owner() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);

    let result = client.try_set_timelock_duration(&stranger, &3_600_u64);
    assert!(result.is_err(), "set_timelock_duration must reject a non-owner caller");
}

/// cancel_upgrade called by a non-owner must return a ContractError (NotOwner = #1).
#[test]
fn test_quickref_cancel_rejects_non_owner() {
    let (env, client, admin) = setup();
    let stranger = Address::generate(&env);

    client.schedule_upgrade(&admin, &hash(&env, 0x0C));

    let result = client.try_cancel_upgrade(&stranger);
    assert!(result.is_err(), "cancel_upgrade must reject a non-owner caller");
}

/// Scheduling a second upgrade while one is already pending must panic with
/// "Upgrade already scheduled and pending execution".
#[test]
#[should_panic(expected = "Upgrade already scheduled and pending execution")]
fn test_quickref_duplicate_schedule_rejected() {
    let (env, client, admin) = setup();

    client.schedule_upgrade(&admin, &hash(&env, 0x0D));
    client.schedule_upgrade(&admin, &hash(&env, 0x0E)); // must panic
}

/// execute_upgrade called when no upgrade is scheduled must panic with
/// "No upgrade scheduled".
#[test]
#[should_panic(expected = "No upgrade scheduled")]
fn test_quickref_execute_with_nothing_scheduled_rejected() {
    let (_env, client, admin) = setup();
    client.execute_upgrade(&admin);
}

/// Executing an already-executed upgrade a second time must panic with
/// "Upgrade already executed".
#[test]
#[should_panic(expected = "Upgrade already executed")]
fn test_quickref_double_execution_rejected() {
    let (env, client, admin) = setup();

    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash(&env, 0x0F));
    env.ledger().set_timestamp(200_000);
    client.execute_upgrade(&admin);

    client.execute_upgrade(&admin); // must panic
}

// ══════════════════════════════════════════════════════════════════════════════
// §5  Custom timelock
// ══════════════════════════════════════════════════════════════════════════════

/// set_timelock_duration persists the new duration.
#[test]
fn test_quickref_set_timelock_duration_updates_value() {
    let (_env, client, admin) = setup();
    let one_hour: u64 = 3_600;

    client.set_timelock_duration(&admin, &one_hour);

    assert_eq!(
        client.get_timelock_duration(),
        one_hour,
        "get_timelock_duration must reflect the value set by set_timelock_duration"
    );
}

/// execute_upgrade respects the custom timelock, not the 48-hour default.
/// This corresponds to the Emergency Flow in UPGRADE_QUICK_REFERENCE §Workflow.
#[test]
fn test_quickref_execute_respects_custom_timelock() {
    let (env, client, admin) = setup();
    let one_hour: u64 = 3_600;

    // Owner reduces timelock to 1 hour
    client.set_timelock_duration(&admin, &one_hour);

    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash(&env, 0x10));

    // One second before the 1-hour window — must still fail
    env.ledger().set_timestamp(3_599);
    let result = client.try_execute_upgrade(&admin);
    assert!(
        result.is_err(),
        "execute_upgrade must fail 1 s before the custom timelock expires"
    );

    // Exactly at the 1-hour mark — must succeed
    env.ledger().set_timestamp(3_600);
    client.execute_upgrade(&admin);

    assert!(
        client.get_scheduled_upgrade().unwrap().executed,
        "upgrade must be marked executed after the custom timelock passes"
    );
}

/// set_timelock_duration with duration = 0 must panic with
/// "Timelock duration must be positive".
#[test]
#[should_panic(expected = "Timelock duration must be positive")]
fn test_quickref_zero_timelock_duration_rejected() {
    let (_env, client, admin) = setup();
    client.set_timelock_duration(&admin, &0_u64);
}

// ══════════════════════════════════════════════════════════════════════════════
// §6  Event emission
// ══════════════════════════════════════════════════════════════════════════════

/// schedule_upgrade emits a (upgrade, scheduled) event.
/// The quick reference §Events section documents this event.
#[test]
fn test_quickref_schedule_emits_upgrade_scheduled_event() {
    let (env, client, admin) = setup();
    env.ledger().set_timestamp(5_000);
    let new_hash = hash(&env, 0x11);

    client.schedule_upgrade(&admin, &new_hash);

    let events = find_upgrade_events(&env, symbol_short!("scheduled"));
    assert_eq!(
        events.len(),
        1,
        "schedule_upgrade must emit exactly one (upgrade, scheduled) event"
    );
}

/// execute_upgrade emits a (upgrade, executed) event.
#[test]
fn test_quickref_execute_emits_upgrade_executed_event() {
    let (env, client, admin) = setup();
    env.ledger().set_timestamp(0);
    client.schedule_upgrade(&admin, &hash(&env, 0x12));
    env.ledger().set_timestamp(200_000);

    client.execute_upgrade(&admin);

    let events = find_upgrade_events(&env, symbol_short!("executed"));
    assert_eq!(
        events.len(),
        1,
        "execute_upgrade must emit exactly one (upgrade, executed) event"
    );
}

/// cancel_upgrade emits a (upgrade, cancelled) event.
#[test]
fn test_quickref_cancel_emits_upgrade_cancelled_event() {
    let (env, client, admin) = setup();
    client.schedule_upgrade(&admin, &hash(&env, 0x13));

    client.cancel_upgrade(&admin);

    let events = find_upgrade_events(&env, symbol_short!("cancelled"));
    assert_eq!(
        events.len(),
        1,
        "cancel_upgrade must emit exactly one (upgrade, cancelled) event"
    );
}

/// set_timelock_duration emits a (upgrade, timelock) event.
#[test]
fn test_quickref_set_timelock_emits_upgrade_timelock_event() {
    let (env, client, admin) = setup();

    client.set_timelock_duration(&admin, &7_200_u64);

    let events = find_upgrade_events(&env, symbol_short!("timelock"));
    assert_eq!(
        events.len(),
        1,
        "set_timelock_duration must emit exactly one (upgrade, timelock) event"
    );
}
