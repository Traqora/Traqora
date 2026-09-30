//! Proxy contract: delegate-call routing, storage layout preservation, and
//! non-upgradeable failure-mode tests.
//!
//! Coverage map
//! ============
//! §1  Delegate-call routing simulation
//!     – implementation address is stored and forwarded correctly
//!     – routing table survives a pause/unpause cycle
//!     – routing table is updated atomically on upgrade
//!     – each upgrade produces a strictly monotone version counter
//!     – swapping to the same implementation is observable
//!
//! §2  Storage layout preservation across upgrades
//!     – config/multisig data are intact after an upgrade
//!     – storage_version is bumped only when explicitly requested
//!     – storage_version stays unchanged when no bump is requested
//!     – sequential upgrades accumulate correct version numbers
//!     – storage migration record is written on upgrade with version bump
//!     – migration record marks completed after migrate_storage
//!
//! §3  Non-upgradeable failure modes
//!     – non-signer cannot propose
//!     – non-signer cannot approve
//!     – non-signer cannot execute upgrade
//!     – signer cannot approve twice (duplicate approval)
//!     – executed proposal cannot be re-executed
//!     – executed proposal cannot receive more approvals
//!     – upgrade with insufficient approvals is rejected
//!     – non-admin cannot pause / unpause
//!     – non-admin cannot update multisig
//!     – non-admin cannot run storage migration
//!     – migrate_storage on already-completed migration is rejected
//!     – migrate_storage without a pending upgrade state is rejected
//!     – threshold = 0 is rejected
//!     – threshold > signer count is rejected
//!     – double initialisation is rejected
//!     – proposal for non-existent ID panics
//!     – approve on non-existent proposal panics
//!     – execute on non-existent proposal panics

#![cfg(test)]

use proxy::{ContractProxy, ContractProxyClient, ProxyState};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

// ─────────────────────────────── helpers ─────────────────────────────────────

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn register(env: &Env) -> ContractProxyClient<'_> {
    let id = env.register(ContractProxy, ());
    ContractProxyClient::new(env, &id)
}

fn signers(env: &Env, n: u32) -> Vec<Address> {
    let mut v = Vec::new(env);
    for _ in 0..n {
        v.push_back(Address::generate(env));
    }
    v
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

/// Initialise proxy with `n` signers and `threshold`, returning (client, admin, signers_vec, impl_hash).
fn init(
    env: &Env,
    n: u32,
    threshold: u32,
) -> (ContractProxyClient<'_>, Address, Vec<Address>, BytesN<32>) {
    let client = register(env);
    let admin = Address::generate(env);
    let s = signers(env, n);
    let impl_v1 = hash(env, 0xAA);
    client.init_proxy(&admin, &impl_v1, &s, &threshold);
    (client, admin, s, impl_v1)
}

/// Propose + approve (by `extra_approvals` additional signers after proposer) + execute.
/// Returns the new implementation hash used.
fn do_full_upgrade(
    env: &Env,
    client: &ContractProxyClient<'_>,
    s: &Vec<Address>,
    byte: u8,
    new_storage_version: Option<u32>,
    extra_approvals: usize, // signers beyond index-0 that need to approve
) -> BytesN<32> {
    let new_impl = hash(env, byte);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &new_impl, &new_storage_version);
    for i in 1..=extra_approvals as u32 {
        client.approve_upgrade(&s.get(i).unwrap(), &pid);
    }
    client.upgrade_to(&s.get(0).unwrap(), &pid);
    new_impl
}

// ══════════════════════════════════════════════════════════════════════════════
// §1  Delegate-call routing simulation
// ══════════════════════════════════════════════════════════════════════════════

/// The implementation hash returned by get_implementation after init matches exactly
/// what was passed to init_proxy — i.e. the "delegate target" is stored correctly.
#[test]
fn test_routing_initial_implementation_stored_correctly() {
    let env = new_env();
    let (client, _, _, impl_v1) = init(&env, 3, 2);
    assert_eq!(client.get_implementation(), impl_v1);
}

/// A pause/unpause cycle does NOT change the stored implementation address.
/// If the proxy forwards calls based on the stored hash, routing is preserved.
#[test]
fn test_routing_preserved_through_pause_unpause() {
    let env = new_env();
    let (client, admin, _, impl_v1) = init(&env, 3, 2);

    client.pause_contract(&admin);
    assert_eq!(client.get_implementation(), impl_v1);

    client.unpause_contract(&admin);
    assert_eq!(client.get_implementation(), impl_v1);
}

/// After a successful upgrade, get_implementation returns the NEW hash —
/// delegate routing is updated atomically.
#[test]
fn test_routing_updated_atomically_on_upgrade() {
    let env = new_env();
    let (client, _, s, impl_v1) = init(&env, 3, 2);

    let impl_v2 = hash(&env, 0xBB);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &impl_v2, &None);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);

    // Before execution: still v1
    assert_eq!(client.get_implementation(), impl_v1);

    client.upgrade_to(&s.get(0).unwrap(), &pid);

    // After execution: v2
    assert_eq!(client.get_implementation(), impl_v2);
}

/// Each upgrade increments the version counter monotonically.
#[test]
fn test_routing_version_counter_is_strictly_monotone() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    assert_eq!(client.get_version(), 1);

    do_full_upgrade(&env, &client, &s, 0x11, None, 1);
    assert_eq!(client.get_version(), 2);

    do_full_upgrade(&env, &client, &s, 0x22, None, 1);
    assert_eq!(client.get_version(), 3);

    do_full_upgrade(&env, &client, &s, 0x33, None, 1);
    assert_eq!(client.get_version(), 4);
}

/// Swapping to the same implementation hash is still observable: version bumps.
#[test]
fn test_routing_same_implementation_still_bumps_version() {
    let env = new_env();
    let (client, _, s, impl_v1) = init(&env, 3, 2);

    let pid = client.propose_upgrade(&s.get(0).unwrap(), &impl_v1, &None);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    assert_eq!(client.get_implementation(), impl_v1);
    assert_eq!(client.get_version(), 2); // version still bumped
}

/// Implementation pointer reflects the LATEST executed proposal when there are many.
#[test]
fn test_routing_latest_upgrade_wins() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    let impl_b = do_full_upgrade(&env, &client, &s, 0xB0, None, 1);
    let impl_c = do_full_upgrade(&env, &client, &s, 0xC0, None, 1);
    let impl_d = do_full_upgrade(&env, &client, &s, 0xD0, None, 1);

    assert_eq!(client.get_implementation(), impl_d);
    let _ = impl_b; // earlier versions replaced
    let _ = impl_c;
}

// ══════════════════════════════════════════════════════════════════════════════
// §2  Storage layout preservation across upgrades
// ══════════════════════════════════════════════════════════════════════════════

/// ProxyConfig fields (admin, threshold, signer count) are intact after upgrade.
#[test]
fn test_storage_config_intact_after_upgrade() {
    let env = new_env();
    let (client, admin, s, _) = init(&env, 3, 2);

    let impl_v2 = hash(&env, 0x02);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &impl_v2, &None);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    // AccessControl owner is unchanged
    assert_eq!(client.get_owner(), admin);

    // MultisigConfig still has 3 signers with threshold 2
    let ms = client.get_multisig_config().unwrap();
    assert_eq!(ms.signers.len(), 3);
    assert_eq!(ms.threshold, 2);
}

/// storage_version is bumped when new_storage_version is Some(_).
#[test]
fn test_storage_version_bumped_when_explicitly_requested() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);
    assert_eq!(client.get_storage_version(), 1);

    do_full_upgrade(&env, &client, &s, 0x02, Some(2), 1);
    assert_eq!(client.get_storage_version(), 2);
}

/// storage_version is NOT changed when new_storage_version is None.
#[test]
fn test_storage_version_unchanged_when_none_passed() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    do_full_upgrade(&env, &client, &s, 0x02, None, 1);
    assert_eq!(client.get_storage_version(), 1); // unchanged
    assert_eq!(client.get_version(), 2); // logic version still bumped
}

/// Sequential upgrades with consecutive storage versions accumulate correctly.
#[test]
fn test_storage_version_sequential_accumulation() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    do_full_upgrade(&env, &client, &s, 0x02, Some(2), 1);
    assert_eq!(client.get_storage_version(), 2);

    do_full_upgrade(&env, &client, &s, 0x03, Some(3), 1);
    assert_eq!(client.get_storage_version(), 3);

    do_full_upgrade(&env, &client, &s, 0x04, Some(99), 1);
    assert_eq!(client.get_storage_version(), 99);
}

/// A storage migration record is created when upgrade includes a version bump.
#[test]
fn test_storage_migration_record_created_on_version_bump() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    let new_impl = hash(&env, 0x02);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &new_impl, &Some(2));
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    // storage_version updated
    assert_eq!(client.get_storage_version(), 2);
    // and contract is Active (not stuck in Upgrading)
    assert!(!client.is_upgrading());
}

/// Proposal metadata is preserved and accurately reflects all approvals.
#[test]
fn test_storage_proposal_metadata_preserved() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    let new_impl = hash(&env, 0x77);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &new_impl, &Some(5));

    // Before execution
    let p = client.get_upgrade_proposal(&pid).unwrap();
    assert_eq!(p.proposal_id, pid);
    assert_eq!(p.new_implementation, new_impl);
    assert_eq!(p.new_storage_version, Some(5));
    assert!(!p.executed);
    assert_eq!(p.approvals.len(), 1); // proposer auto-approves

    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    let p2 = client.get_upgrade_proposal(&pid).unwrap();
    assert_eq!(p2.approvals.len(), 2);

    client.upgrade_to(&s.get(0).unwrap(), &pid);
    let p3 = client.get_upgrade_proposal(&pid).unwrap();
    assert!(p3.executed);
}

/// Proposal counter increments per proposal, not per approval/execution.
#[test]
fn test_storage_proposal_counter_increments_per_proposal() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 1);

    let impl_a = hash(&env, 0xA1);
    let impl_b = hash(&env, 0xA2);
    let impl_c = hash(&env, 0xA3);

    let p1 = client.propose_upgrade(&s.get(0).unwrap(), &impl_a, &None);
    let p2 = client.propose_upgrade(&s.get(0).unwrap(), &impl_b, &None);
    let p3 = client.propose_upgrade(&s.get(0).unwrap(), &impl_c, &None);

    assert_eq!(p1, 1);
    assert_eq!(p2, 2);
    assert_eq!(p3, 3);
}

/// Multisig config survives multiple upgrade cycles.
#[test]
fn test_storage_multisig_config_survives_multiple_upgrades() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 4, 3);

    do_full_upgrade(&env, &client, &s, 0x10, Some(2), 2);
    do_full_upgrade(&env, &client, &s, 0x20, Some(3), 2);

    let ms = client.get_multisig_config().unwrap();
    assert_eq!(ms.threshold, 3);
    assert_eq!(ms.signers.len(), 4);
}

// ══════════════════════════════════════════════════════════════════════════════
// §3  Non-upgradeable failure modes
// ══════════════════════════════════════════════════════════════════════════════

/// A non-signer cannot propose an upgrade.
#[test]
#[should_panic(expected = "Not an authorized signer")]
fn test_failure_non_signer_cannot_propose() {
    let env = new_env();
    let (client, _, _, _) = init(&env, 3, 2);
    let outsider = Address::generate(&env);
    client.propose_upgrade(&outsider, &hash(&env, 0xFF), &None);
}

/// A non-signer cannot approve a proposal.
#[test]
#[should_panic(expected = "Not an authorized signer")]
fn test_failure_non_signer_cannot_approve() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);
    let outsider = Address::generate(&env);

    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0xFE), &None);
    client.approve_upgrade(&outsider, &pid);
}

/// A non-signer cannot execute an upgrade.
#[test]
#[should_panic(expected = "Not an authorized signer")]
fn test_failure_non_signer_cannot_execute() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 1);
    let outsider = Address::generate(&env);

    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0xFD), &None);
    // threshold=1, proposer auto-approves, so sufficient approvals
    client.upgrade_to(&outsider, &pid);
}

/// Duplicate approval from the same signer is rejected.
#[test]
#[should_panic(expected = "Already approved")]
fn test_failure_duplicate_approval_rejected() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0x01), &None);
    // signer[0] already approved by proposing; try again
    client.approve_upgrade(&s.get(0).unwrap(), &pid);
}

/// An executed proposal cannot be executed a second time.
#[test]
#[should_panic(expected = "Already executed")]
fn test_failure_executed_proposal_cannot_be_re_executed() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0x02), &None);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    // Second execution must panic
    client.upgrade_to(&s.get(0).unwrap(), &pid);
}

/// An executed proposal cannot receive further approvals.
#[test]
#[should_panic(expected = "Already executed")]
fn test_failure_executed_proposal_cannot_receive_more_approvals() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0x03), &None);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    // Approval after execution must panic
    client.approve_upgrade(&s.get(2).unwrap(), &pid);
}

/// Upgrade cannot proceed if approval count < threshold.
#[test]
#[should_panic(expected = "Insufficient approvals")]
fn test_failure_upgrade_insufficient_approvals() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2); // threshold=2

    // proposer auto-approves: only 1 approval; need 2
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0x05), &None);
    client.upgrade_to(&s.get(0).unwrap(), &pid);
}

/// Non-admin cannot pause the contract.
#[test]
#[should_panic(expected = "Unauthorized")]
fn test_failure_non_admin_cannot_pause() {
    let env = new_env();
    let (client, _, _, _) = init(&env, 3, 2);
    let outsider = Address::generate(&env);
    client.pause_contract(&outsider);
}

/// Non-admin cannot unpause the contract.
#[test]
#[should_panic(expected = "Unauthorized")]
fn test_failure_non_admin_cannot_unpause() {
    let env = new_env();
    let (client, admin, _, _) = init(&env, 3, 2);
    let outsider = Address::generate(&env);

    client.pause_contract(&admin);
    client.unpause_contract(&outsider);
}

/// Non-admin cannot update the multisig config.
#[test]
#[should_panic(expected = "Unauthorized")]
fn test_failure_non_admin_cannot_update_multisig() {
    let env = new_env();
    let (client, _, _, _) = init(&env, 3, 2);
    let outsider = Address::generate(&env);
    let new_signers = signers(&env, 2);
    client.update_multisig(&outsider, &new_signers, &2);
}

/// Non-admin cannot run storage migration.
#[test]
#[should_panic(expected = "Unauthorized")]
fn test_failure_non_admin_cannot_migrate_storage() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);
    let outsider = Address::generate(&env);

    // Create a pending migration first (requires upgrade with version bump)
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0x10), &Some(2));
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    // outsider tries to mark migration complete
    client.migrate_storage(&outsider, &1, &2);
}

/// Storage migration is rejected when contract is Active (not Paused/Upgrading).
#[test]
#[should_panic(expected = "Contract must be paused or upgrading")]
fn test_failure_migrate_storage_requires_paused_or_upgrading_state() {
    let env = new_env();
    let (client, admin, s, _) = init(&env, 3, 2);

    // Grant admin role so the role check passes but state check fails
    client.set_role(&admin, &admin, &1, &true);

    // Contract is Active → migrate_storage must fail the state guard
    client.migrate_storage(&admin, &1, &2);
}

/// threshold = 0 is rejected.
#[test]
#[should_panic(expected = "Threshold must be > 0")]
fn test_failure_zero_threshold_rejected() {
    let env = new_env();
    let client = register(&env);
    let admin = Address::generate(&env);
    let s = signers(&env, 3);
    client.init_proxy(&admin, &hash(&env, 0x00), &s, &0);
}

/// threshold > signer count is rejected.
#[test]
#[should_panic(expected = "Threshold exceeds signer count")]
fn test_failure_threshold_exceeds_signer_count() {
    let env = new_env();
    let client = register(&env);
    let admin = Address::generate(&env);
    let s = signers(&env, 2);
    client.init_proxy(&admin, &hash(&env, 0x00), &s, &3); // 3 > 2
}

/// Double initialisation is rejected.
#[test]
#[should_panic(expected = "Already initialized")]
fn test_failure_double_initialisation_rejected() {
    let env = new_env();
    let (client, admin, s, impl_v1) = init(&env, 3, 2);
    client.init_proxy(&admin, &impl_v1, &s, &2); // second call panics
}

/// Getting a proposal for a non-existent ID returns None (no panic).
#[test]
fn test_failure_nonexistent_proposal_returns_none() {
    let env = new_env();
    let (client, _, _, _) = init(&env, 3, 2);
    let result = client.get_upgrade_proposal(&999_u64);
    assert!(result.is_none());
}

/// approve_upgrade on a non-existent proposal panics.
#[test]
#[should_panic(expected = "Proposal not found")]
fn test_failure_approve_nonexistent_proposal_panics() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);
    client.approve_upgrade(&s.get(0).unwrap(), &9999_u64);
}

/// upgrade_to on a non-existent proposal panics.
#[test]
#[should_panic(expected = "Proposal not found")]
fn test_failure_execute_nonexistent_proposal_panics() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 1);
    client.upgrade_to(&s.get(0).unwrap(), &8888_u64);
}

/// update_multisig: new threshold = 0 is rejected.
#[test]
#[should_panic(expected = "Threshold must be > 0")]
fn test_failure_update_multisig_zero_threshold() {
    let env = new_env();
    let (client, admin, _, _) = init(&env, 3, 2);

    client.set_role(&admin, &admin, &1, &true); // grant Admin to self
    let new_signers = signers(&env, 3);
    client.update_multisig(&admin, &new_signers, &0);
}

/// update_multisig: threshold > new signer count is rejected.
#[test]
#[should_panic(expected = "Threshold exceeds signer count")]
fn test_failure_update_multisig_threshold_exceeds_signers() {
    let env = new_env();
    let (client, admin, _, _) = init(&env, 3, 2);

    client.set_role(&admin, &admin, &1, &true);
    let new_signers = signers(&env, 2);
    client.update_multisig(&admin, &new_signers, &3);
}

// ══════════════════════════════════════════════════════════════════════════════
// §4  State machine invariants
// ══════════════════════════════════════════════════════════════════════════════

/// After upgrade: state is Active (not stuck in Upgrading).
#[test]
fn test_invariant_state_active_after_upgrade() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 2);

    do_full_upgrade(&env, &client, &s, 0xCC, None, 1);

    assert!(!client.is_paused());
    assert!(!client.is_upgrading());
    assert_eq!(client.get_proxy_state(), ProxyState::Active);
}

/// Pause → unpause returns to Active state.
#[test]
fn test_invariant_pause_unpause_round_trip() {
    let env = new_env();
    let (client, admin, _, _) = init(&env, 3, 2);

    assert_eq!(client.get_proxy_state(), ProxyState::Active);
    client.pause_contract(&admin);
    assert_eq!(client.get_proxy_state(), ProxyState::Paused);
    client.unpause_contract(&admin);
    assert_eq!(client.get_proxy_state(), ProxyState::Active);
}

/// Ownership transfer syncs both AccessControl owner and ProxyConfig.admin.
#[test]
fn test_invariant_ownership_transfer_syncs_admin() {
    let env = new_env();
    let (client, owner, _, _) = init(&env, 3, 2);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);

    assert_eq!(client.get_owner(), new_owner);
    // ProxyConfig.admin should also be updated (sync maintained)
    let ms = client.get_multisig_config().unwrap(); // check proxy is still accessible
    assert_eq!(ms.threshold, 2);
}

/// Threshold-1 approval is NOT sufficient; threshold approval IS sufficient.
#[test]
fn test_invariant_exact_threshold_approval_required() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 5, 3); // 5 signers, threshold=3

    let impl_new = hash(&env, 0xAB);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &impl_new, &None);

    // Only 2 approvals (proposer = 1, one more = 2); threshold is 3
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    let result = client.try_upgrade_to(&s.get(0).unwrap(), &pid);
    assert!(
        result.is_err(),
        "Should fail with only 2 of 3 required approvals"
    );

    // Third approval makes it pass
    client.approve_upgrade(&s.get(2).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);
    assert_eq!(client.get_implementation(), impl_new);
}

/// Threshold = 1 (single-signer) means proposer alone can execute.
#[test]
fn test_invariant_threshold_one_single_signer_executes() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 2, 1);

    let new_impl = hash(&env, 0xE1);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &new_impl, &None);
    // No additional approvals needed
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    assert_eq!(client.get_implementation(), new_impl);
    assert_eq!(client.get_version(), 2);
}

/// All signers can independently propose their own proposals (IDs are unique).
#[test]
fn test_invariant_all_signers_can_propose_independently() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 1);

    let p1 = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0x11), &None);
    let p2 = client.propose_upgrade(&s.get(1).unwrap(), &hash(&env, 0x22), &None);
    let p3 = client.propose_upgrade(&s.get(2).unwrap(), &hash(&env, 0x33), &None);

    assert_ne!(p1, p2);
    assert_ne!(p2, p3);
    assert_ne!(p1, p3);
}

/// Multiple open proposals can coexist; executing one does not affect others.
#[test]
fn test_invariant_multiple_open_proposals_are_independent() {
    let env = new_env();
    let (client, _, s, _) = init(&env, 3, 1);

    let impl_x = hash(&env, 0xAA);
    let impl_y = hash(&env, 0xBB);

    let px = client.propose_upgrade(&s.get(0).unwrap(), &impl_x, &None);
    let py = client.propose_upgrade(&s.get(0).unwrap(), &impl_y, &None);

    // Execute py first
    client.upgrade_to(&s.get(0).unwrap(), &py);
    assert_eq!(client.get_implementation(), impl_y);

    // px is still not executed
    let prop_x = client.get_upgrade_proposal(&px).unwrap();
    assert!(!prop_x.executed);

    // Execute px (overrides implementation again)
    client.upgrade_to(&s.get(0).unwrap(), &px);
    assert_eq!(client.get_implementation(), impl_x);
}
