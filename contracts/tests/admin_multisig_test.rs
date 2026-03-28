use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, Symbol, Vec,
};
use traqora_contracts::admin::{AdminActionType, AdminMultisig, AdminMultisigClient};

mod common;

// ── Setup helpers ─────────────────────────────────────────────────────────────

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn make_client(env: &Env) -> AdminMultisigClient<'static> {
    let id = env.register(AdminMultisig, ());
    AdminMultisigClient::new(env, &id)
}

fn make_signers(env: &Env, n: usize) -> Vec<Address> {
    let mut v = Vec::new(env);
    for _ in 0..n {
        v.push_back(Address::generate(env));
    }
    v
}

fn advance_time(env: &Env, secs: u64) {
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + secs,
        protocol_version: env.ledger().protocol_version(),
        sequence_number: env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });
}

// ── Happy-path tests ───────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);

    client.initialize(&signers, &2u32, &86400u64);

    let config = client.get_multisig_config().unwrap();
    assert_eq!(config.threshold, 2);
    assert_eq!(config.signers.len(), 3);
    assert_eq!(config.proposal_expiration, 86400);
    assert!(!client.is_emergency_stopped());
    assert_eq!(client.get_proposal_count(), 0);
}

#[test]
fn test_query_functions_before_init() {
    let env = new_env();
    let client = make_client(&env);
    let addr = Address::generate(&env);

    assert!(client.get_multisig_config().is_none());
    assert_eq!(client.get_proposal_count(), 0);
    assert!(!client.is_emergency_stopped());
    assert!(!client.is_signer_address(&addr));
}

#[test]
fn test_is_signer_address() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    assert!(client.is_signer_address(&signers.get(0).unwrap()));
    assert!(client.is_signer_address(&signers.get(1).unwrap()));
    assert!(client.is_signer_address(&signers.get(2).unwrap()));

    let outsider = Address::generate(&env);
    assert!(!client.is_signer_address(&outsider));
}

#[test]
fn test_propose_and_execute_emergency_stop() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert_eq!(pid, 1);
    assert_eq!(client.get_proposal_count(), 1);

    // Proposer auto-approves
    assert!(client.has_approved(&pid, &signers.get(0).unwrap()));

    let proposal = client.get_proposal(&pid).unwrap();
    assert_eq!(proposal.proposal_id, 1);
    assert!(!proposal.executed);
    assert!(!proposal.cancelled);
    assert_eq!(proposal.approvals.len(), 1);

    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    assert!(client.has_approved(&pid, &signers.get(1).unwrap()));

    assert!(!client.is_emergency_stopped());
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
    assert!(client.is_emergency_stopped());

    let proposal = client.get_proposal(&pid).unwrap();
    assert!(proposal.executed);
}

#[test]
fn test_propose_and_execute_emergency_resume() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid_stop = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid_stop);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid_stop);
    assert!(client.is_emergency_stopped());

    let pid_resume = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyResume,
        &None, &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid_resume);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid_resume);
    assert!(!client.is_emergency_stopped());
}

#[test]
fn test_propose_and_execute_parameter_change() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let key = Symbol::new(&env, "fee_bps");
    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::ParameterChange,
        &None,
        &Some(key.clone()),
        &Some(250i128),
        &None,
        &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);

    let proposal = client.get_proposal(&pid).unwrap();
    assert!(proposal.executed);
    assert_eq!(proposal.parameter_key, Some(key));
    assert_eq!(proposal.parameter_value, Some(250i128));
}

#[test]
fn test_propose_and_execute_add_signer() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let new_signer = Address::generate(&env);
    assert!(!client.is_signer_address(&new_signer));

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::AddSigner,
        &None, &None, &None,
        &Some(new_signer.clone()),
        &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);

    assert!(client.is_signer_address(&new_signer));
    let config = client.get_multisig_config().unwrap();
    assert_eq!(config.signers.len(), 4);
}

#[test]
fn test_propose_and_execute_remove_signer() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 4);
    client.initialize(&signers, &2u32, &86400u64);

    let signer_to_remove = signers.get(3).unwrap();
    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::RemoveSigner,
        &None, &None, &None,
        &Some(signer_to_remove.clone()),
        &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);

    assert!(!client.is_signer_address(&signer_to_remove));
    let config = client.get_multisig_config().unwrap();
    assert_eq!(config.signers.len(), 3);
}

#[test]
fn test_propose_and_execute_update_threshold() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 5);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::UpdateThreshold,
        &None, &None, &None, &None,
        &Some(3u32),
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);

    let config = client.get_multisig_config().unwrap();
    assert_eq!(config.threshold, 3);
}

#[test]
fn test_propose_and_execute_contract_upgrade() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let target = Address::generate(&env);
    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::ContractUpgrade,
        &Some(target),
        &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);

    let proposal = client.get_proposal(&pid).unwrap();
    assert!(proposal.executed);
}

#[test]
fn test_cancel_proposal() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    client.cancel_proposal(&signers.get(0).unwrap(), &pid);

    let proposal = client.get_proposal(&pid).unwrap();
    assert!(proposal.cancelled);
    assert!(!proposal.executed);
}

#[test]
fn test_multiple_proposals_increment_counter() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let p1 = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
    let p2 = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyResume,
        &None, &None, &None, &None, &None,
    );
    let p3 = client.propose_admin_action(
        &signers.get(1).unwrap(),
        &AdminActionType::ParameterChange,
        &None,
        &Some(Symbol::new(&env, "k")),
        &Some(1i128),
        &None, &None,
    );

    assert_eq!(p1, 1);
    assert_eq!(p2, 2);
    assert_eq!(p3, 3);
    assert_eq!(client.get_proposal_count(), 3);
}

#[test]
fn test_threshold_3_of_5_requires_three_approvals() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 5);
    client.initialize(&signers, &3u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    // Proposer = 1 approval; need 2 more
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.approve_admin_action(&signers.get(2).unwrap(), &pid);

    let proposal = client.get_proposal(&pid).unwrap();
    assert_eq!(proposal.approvals.len(), 3);

    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
    assert!(client.is_emergency_stopped());
}

// ── Negative / error tests ────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);
    client.initialize(&signers, &2u32, &86400u64);
}

#[test]
#[should_panic(expected = "Threshold exceeds signer count")]
fn test_initialize_threshold_exceeds_signers() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 2);
    client.initialize(&signers, &3u32, &86400u64);
}

#[test]
#[should_panic(expected = "Threshold must be at least 2")]
fn test_initialize_threshold_below_2() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &1u32, &86400u64);
}

#[test]
#[should_panic(expected = "Not an authorized signer")]
fn test_propose_unauthorized_signer() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let outsider = Address::generate(&env);
    client.propose_admin_action(
        &outsider,
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
}

#[test]
#[should_panic(expected = "Parameter key required")]
fn test_propose_parameter_change_missing_key() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::ParameterChange,
        &None, &None, &Some(100i128), &None, &None,
    );
}

#[test]
#[should_panic(expected = "Parameter value required")]
fn test_propose_parameter_change_missing_value() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::ParameterChange,
        &None,
        &Some(Symbol::new(&env, "key")),
        &None, &None, &None,
    );
}

#[test]
#[should_panic(expected = "Target address required")]
fn test_propose_add_signer_missing_address() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::AddSigner,
        &None, &None, &None, &None, &None,
    );
}

#[test]
#[should_panic(expected = "New threshold required")]
fn test_propose_update_threshold_missing_value() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::UpdateThreshold,
        &None, &None, &None, &None, &None,
    );
}

#[test]
#[should_panic(expected = "Not an authorized signer")]
fn test_approve_by_non_signer_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    let outsider = Address::generate(&env);
    client.approve_admin_action(&outsider, &pid);
}

#[test]
#[should_panic(expected = "Already approved")]
fn test_double_approval_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    // signers[0] already approved as proposer
    client.approve_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Insufficient approvals")]
fn test_execute_without_enough_approvals_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    // Only proposer has approved (1 of 2 needed)
    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Already executed")]
fn test_execute_twice_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Proposal expired")]
fn test_approve_expired_proposal_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &3600u64); // 1 hour expiry

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    advance_time(&env, 7200); // 2 hours later

    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Proposal expired")]
fn test_execute_expired_proposal_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &3600u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);

    advance_time(&env, 7200);

    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Proposal cancelled")]
fn test_approve_cancelled_proposal_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    client.cancel_proposal(&signers.get(0).unwrap(), &pid);
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Proposal cancelled")]
fn test_execute_cancelled_proposal_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.cancel_proposal(&signers.get(0).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Only proposer can cancel")]
fn test_cancel_by_non_proposer_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    client.cancel_proposal(&signers.get(1).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Already cancelled")]
fn test_cancel_already_cancelled_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );

    client.cancel_proposal(&signers.get(0).unwrap(), &pid);
    client.cancel_proposal(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Already executed")]
fn test_cancel_already_executed_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::EmergencyStop,
        &None, &None, &None, &None, &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
    client.cancel_proposal(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Cannot remove: would fall below threshold")]
fn test_remove_signer_below_threshold_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 2); // exactly at threshold
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::RemoveSigner,
        &None, &None, &None,
        &Some(signers.get(1).unwrap()),
        &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Threshold exceeds signer count")]
fn test_update_threshold_exceeds_signer_count_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::UpdateThreshold,
        &None, &None, &None, &None,
        &Some(5u32), // 5 > 3 signers
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}

#[test]
#[should_panic(expected = "Threshold must be at least 2")]
fn test_update_threshold_below_2_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::UpdateThreshold,
        &None, &None, &None, &None,
        &Some(1u32),
    );
}

#[test]
#[should_panic(expected = "Already a signer")]
fn test_add_existing_signer_panics() {
    let env = new_env();
    let client = make_client(&env);
    let signers = make_signers(&env, 3);
    client.initialize(&signers, &2u32, &86400u64);

    let existing = signers.get(2).unwrap();
    let pid = client.propose_admin_action(
        &signers.get(0).unwrap(),
        &AdminActionType::AddSigner,
        &None, &None, &None,
        &Some(existing),
        &None,
    );
    client.approve_admin_action(&signers.get(1).unwrap(), &pid);
    client.execute_admin_action(&signers.get(0).unwrap(), &pid);
}
