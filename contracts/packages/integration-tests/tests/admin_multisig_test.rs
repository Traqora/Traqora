#![cfg(test)]

use admin::{AdminActionType, AdminMultisig, AdminMultisigClient};
use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, IntoVal, Symbol, TryIntoVal, Val, Vec,
};

/// Helper: find all events with matching (topic0, topic1) pair.
fn find_events(
    env: &Env,
    topic0: Symbol,
    topic1: Symbol,
) -> std::vec::Vec<(Address, soroban_sdk::Vec<Val>, Val)> {
    let t0 = topic0.to_val().get_payload();
    let t1 = topic1.to_val().get_payload();
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

fn setup_admin(env: &Env) -> (AdminMultisigClient<'_>, Address, Address, Address, Address) {
    let contract_id = env.register(AdminMultisig, ());
    let client = AdminMultisigClient::new(env, &contract_id);

    let signer1 = Address::generate(env);
    let signer2 = Address::generate(env);
    let signer3 = Address::generate(env);
    let outsider = Address::generate(env);

    let mut signers = Vec::new(env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    signers.push_back(signer3.clone());

    let threshold: u32 = 2;
    let expiration: u64 = 86400;

    client.initialize(&signers, &threshold, &expiration);

    (client, signer1, signer2, signer3, outsider)
}

// ---------------------------------------------------------------------------
// Initialization + canonical event
// ---------------------------------------------------------------------------

#[test]
fn test_admin_init_emits_canonical_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AdminMultisig, ());
    let client = AdminMultisigClient::new(&env, &contract_id);

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(s1.clone());
    signers.push_back(s2.clone());

    let threshold: u32 = 2;
    client.initialize(&signers, &threshold, &86400);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("admin"),
        soroban_sdk::symbol_short!("init"),
    );
    assert_eq!(events.len(), 1, "expected exactly one (admin, init) event");
    let (_, _, data) = &events[0];
    let emitted_threshold: u32 = data.clone().try_into_val(&env).unwrap();
    assert_eq!(emitted_threshold, threshold);
}

// ---------------------------------------------------------------------------
// Privilege checks — unauthorised callers cannot add/remove admins
// (AddSigner / RemoveSigner) and cannot pause/resume (EmergencyStop/Resume)
// ---------------------------------------------------------------------------

#[test]
fn test_unauthorised_cannot_propose_add_signer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _s1, _s2, _s3, outsider) = setup_admin(&env);
    let new_signer = Address::generate(&env);

    let res = client.try_propose_admin_action(
        &outsider,
        &AdminActionType::AddSigner,
        &None,
        &None,
        &None,
        &Some(new_signer),
        &None,
    );
    assert!(res.is_err(), "outsider should not be able to propose AddSigner");
}

#[test]
fn test_unauthorised_cannot_propose_remove_signer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, _s2, _s3, outsider) = setup_admin(&env);

    let res = client.try_propose_admin_action(
        &outsider,
        &AdminActionType::RemoveSigner,
        &None,
        &None,
        &None,
        &Some(s1.clone()),
        &None,
    );
    assert!(res.is_err(), "outsider should not be able to propose RemoveSigner");
}

#[test]
fn test_unauthorised_cannot_propose_emergency_stop() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _s1, _s2, _s3, outsider) = setup_admin(&env);

    let res = client.try_propose_admin_action(
        &outsider,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert!(res.is_err(), "outsider should not be able to propose EmergencyStop");
}

#[test]
fn test_unauthorised_cannot_propose_emergency_resume() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _s1, _s2, _s3, outsider) = setup_admin(&env);

    let res = client.try_propose_admin_action(
        &outsider,
        &AdminActionType::EmergencyResume,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert!(res.is_err(), "outsider should not be able to propose EmergencyResume");
}

#[test]
fn test_unauthorised_cannot_approve() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, _s2, _s3, outsider) = setup_admin(&env);

    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );

    let res = client.try_approve_admin_action(&outsider, &pid);
    assert!(res.is_err(), "outsider should not be able to approve");
}

#[test]
fn test_unauthorised_cannot_execute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, _s3, outsider) = setup_admin(&env);

    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    client.approve_admin_action(&s2, &pid);

    let res = client.try_execute_admin_action(&outsider, &pid);
    assert!(res.is_err(), "outsider should not be able to execute");
}

// ---------------------------------------------------------------------------
// Authorised add-admin (AddSigner) emits canonical events
// ---------------------------------------------------------------------------

#[test]
fn test_add_signer_authorised_emits_canonical_events() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, _s3, _outsider) = setup_admin(&env);

    let new_signer = Address::generate(&env);

    // Propose AddSigner by authorised signer
    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::AddSigner,
        &None,
        &None,
        &None,
        &Some(new_signer.clone()),
        &None,
    );

    // (proposal, created) emitted on propose
    let created = find_events(
        &env,
        soroban_sdk::symbol_short!("proposal"),
        soroban_sdk::symbol_short!("created"),
    );
    assert_eq!(created.len(), 1, "expected one (proposal, created) event");
    let (_, _, data) = &created[0];
    let (evt_pid, evt_action): (u64, AdminActionType) =
        data.clone().try_into_val(&env).unwrap();
    assert_eq!(evt_pid, pid);
    assert_eq!(evt_action, AdminActionType::AddSigner);

    // Approve by second authorised signer
    client.approve_admin_action(&s2, &pid);

    let approved = find_events(
        &env,
        soroban_sdk::symbol_short!("proposal"),
        soroban_sdk::symbol_short!("approved"),
    );
    assert_eq!(approved.len(), 1, "expected one (proposal, approved) event");
    let (_, _, data) = &approved[0];
    let (appr_pid, approver): (u64, Address) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(appr_pid, pid);
    assert_eq!(approver, s2);

    // Execute
    client.execute_admin_action(&s1, &pid);

    // (signer, added) canonical event
    let added = find_events(
        &env,
        soroban_sdk::symbol_short!("signer"),
        soroban_sdk::symbol_short!("added"),
    );
    assert_eq!(added.len(), 1, "expected one (signer, added) event");
    let (_, _, data) = &added[0];
    // contract emits (proposal_id, new_signer)
    let (added_pid, added_signer): (u64, Address) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(added_pid, pid);
    assert_eq!(added_signer, new_signer);

    // (action, executed) canonical event
    let executed = find_events(
        &env,
        soroban_sdk::symbol_short!("action"),
        soroban_sdk::symbol_short!("executed"),
    );
    assert_eq!(executed.len(), 1, "expected one (action, executed) event");
    let (_, _, data) = &executed[0];
    let (exec_pid, exec_action): (u64, AdminActionType) =
        data.clone().try_into_val(&env).unwrap();
    assert_eq!(exec_pid, pid);
    assert_eq!(exec_action, AdminActionType::AddSigner);

    // State: new signer is now authorised
    assert!(client.is_signer_address(&new_signer));
    // New signer can now propose
    let pid2 = client.propose_admin_action(
        &new_signer,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert_eq!(pid2, 2);
}

// ---------------------------------------------------------------------------
// Authorised remove-admin (RemoveSigner) emits canonical events
// ---------------------------------------------------------------------------

#[test]
fn test_remove_signer_authorised_emits_canonical_events() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, s3, _outsider) = setup_admin(&env);

    // First add a 4th signer so we can remove one and stay above threshold (2)
    let extra = Address::generate(&env);
    let add_pid = client.propose_admin_action(
        &s1,
        &AdminActionType::AddSigner,
        &None,
        &None,
        &None,
        &Some(extra.clone()),
        &None,
    );
    client.approve_admin_action(&s2, &add_pid);
    client.execute_admin_action(&s1, &add_pid);
    assert!(client.is_signer_address(&extra));

    // Now propose RemoveSigner for s3
    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::RemoveSigner,
        &None,
        &None,
        &None,
        &Some(s3.clone()),
        &None,
    );

    client.approve_admin_action(&s2, &pid);
    client.execute_admin_action(&s1, &pid);

    // (signer, removed) canonical event — check last such event (there is also added earlier)
    let removed_events = find_events(
        &env,
        soroban_sdk::symbol_short!("signer"),
        soroban_sdk::symbol_short!("removed"),
    );
    assert_eq!(removed_events.len(), 1, "expected one (signer, removed) event");
    let (_, _, data) = &removed_events[0];
    let (rem_pid, rem_signer): (u64, Address) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(rem_pid, pid);
    assert_eq!(rem_signer, s3);

    // State: s3 is no longer a signer
    assert!(!client.is_signer_address(&s3));
    // Removed signer can no longer propose
    let res = client.try_propose_admin_action(
        &s3,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert!(res.is_err(), "removed signer should not be able to propose");
}

// ---------------------------------------------------------------------------
// Pause / resume (EmergencyStop / EmergencyResume) privilege + events
// ---------------------------------------------------------------------------

#[test]
fn test_emergency_stop_authorised_emits_canonical_events() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, _s3, _outsider) = setup_admin(&env);

    assert!(!client.is_emergency_stopped());

    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    // Verify canonical (proposal, created) event for pause proposal
    let created = find_events(
        &env,
        soroban_sdk::symbol_short!("proposal"),
        soroban_sdk::symbol_short!("created"),
    );
    assert_eq!(created.len(), 1, "expected one (proposal, created) for EmergencyStop");
    let (_, _, data) = &created[0];
    let (evt_pid, evt_action): (u64, AdminActionType) =
        data.clone().try_into_val(&env).unwrap();
    assert_eq!(evt_pid, pid);
    assert_eq!(evt_action, AdminActionType::EmergencyStop);

    client.approve_admin_action(&s2, &pid);
    let approved = find_events(
        &env,
        soroban_sdk::symbol_short!("proposal"),
        soroban_sdk::symbol_short!("approved"),
    );
    assert_eq!(approved.len(), 1, "expected one (proposal, approved) for EmergencyStop");

    client.execute_admin_action(&s1, &pid);

    // Verify deterministic state change for pause
    assert!(client.is_emergency_stopped());
    // Canonical proposal lifecycle events already verified above cover the audit trail for pause
}

#[test]
fn test_emergency_resume_authorised_emits_canonical_events() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, _s3, _outsider) = setup_admin(&env);

    // First stop
    let stop_pid = client.propose_admin_action(
        &s1,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    client.approve_admin_action(&s2, &stop_pid);
    client.execute_admin_action(&s1, &stop_pid);
    assert!(client.is_emergency_stopped());

    // Now resume
    let resume_pid = client.propose_admin_action(
        &s2,
        &AdminActionType::EmergencyResume,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    // Verify canonical (proposal, created) for resume
    let created_resume = find_events(
        &env,
        soroban_sdk::symbol_short!("proposal"),
        soroban_sdk::symbol_short!("created"),
    );
    // At this point there are 2 proposals (stop and resume), so at least 1 created for resume
    assert!(created_resume.len() >= 1, "expected proposal created for resume");
    client.approve_admin_action(&s1, &resume_pid);
    client.execute_admin_action(&s2, &resume_pid);

    assert!(!client.is_emergency_stopped());
}

#[test]
fn test_emergency_stop_unauthorised_fails_deterministically() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, _s3, outsider) = setup_admin(&env);

    // Outsider cannot propose stop
    let res = client.try_propose_admin_action(
        &outsider,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert!(res.is_err());

    // Even if authorised proposer creates it, outsider cannot approve/execute
    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::EmergencyStop,
        &None,
        &None,
        &None,
        &None,
        &None,
    );
    assert!(client.try_approve_admin_action(&outsider, &pid).is_err());
    // Approve properly then outsider still cannot execute
    client.approve_admin_action(&s2, &pid);
    assert!(client.try_execute_admin_action(&outsider, &pid).is_err());

    // State remains not stopped until authorised execution
    assert!(!client.is_emergency_stopped());
    // Authorised execution succeeds deterministically
    client.execute_admin_action(&s1, &pid);
    assert!(client.is_emergency_stopped());
}

// ---------------------------------------------------------------------------
// Determinism & safety: same sequence always yields same state
// ---------------------------------------------------------------------------

#[test]
fn test_admin_flow_is_deterministic() {
    for _ in 0..3 {
        let env = Env::default();
        env.mock_all_auths();
        let (client, s1, s2, _s3, _outsider) = setup_admin(&env);

        let new_signer = Address::generate(&env);
        let pid = client.propose_admin_action(
            &s1,
            &AdminActionType::AddSigner,
            &None,
            &None,
            &None,
            &Some(new_signer.clone()),
            &None,
        );
        client.approve_admin_action(&s2, &pid);
        client.execute_admin_action(&s1, &pid);

        assert!(client.is_signer_address(&new_signer));
        assert_eq!(client.get_proposal_count(), 1);
        let prop = client.get_proposal(&pid).unwrap();
        assert!(prop.executed);
        assert!(!prop.cancelled);
    }
}

#[test]
fn test_cannot_remove_signer_below_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, s1, s2, s3, _outsider) = setup_admin(&env);

    // Threshold is 2, with 3 signers. Removing 1 leaves 2 == threshold -> ok.
    let pid = client.propose_admin_action(
        &s1,
        &AdminActionType::RemoveSigner,
        &None,
        &None,
        &None,
        &Some(s3.clone()),
        &None,
    );
    client.approve_admin_action(&s2, &pid);
    client.execute_admin_action(&s1, &pid);
    assert!(!client.is_signer_address(&s3));
    // Now 2 signers left, threshold 2. Removing another would leave 1 < threshold -> should panic on execute
    let pid2 = client.propose_admin_action(
        &s1,
        &AdminActionType::RemoveSigner,
        &None,
        &None,
        &None,
        &Some(s2.clone()),
        &None,
    );
    // s1 already approved as proposer, need s2 to approve
    client.approve_admin_action(&s2, &pid2);
    // Attempt to execute should panic because would fall below threshold
    let res = client.try_execute_admin_action(&s1, &pid2);
    assert!(res.is_err(), "should not allow removal below threshold");
    // Ensure state unchanged: s2 still signer, threshold unchanged
    assert!(client.is_signer_address(&s2));
}
