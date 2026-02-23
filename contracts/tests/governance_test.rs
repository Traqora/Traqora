use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, Symbol};
use traqora_contracts::governance::{GovernanceContract, GovernanceContractClient};

fn setup_test(env: &Env) -> (GovernanceContractClient<'static>, Address, Address, Address) {
    let admin = Address::generate(env);
    let voter1 = Address::generate(env);
    let voter2 = Address::generate(env);
    
    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(env, &contract_id);
    
    // Initialize with min_voting_period=100, quorum=100, proposal_threshold=10
    client.initialize(&100, &100, &10);
    
    (client, admin, voter1, voter2)
}

#[test]
fn test_initialize_and_create_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    assert_eq!(proposal_id, 1);
    assert_eq!(client.get_proposal_count(), 1);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.proposal_id, 1);
    assert_eq!(proposal.title, Symbol::new(&env, "title1"));
    assert_eq!(proposal.status, Symbol::new(&env, "active"));
    assert_eq!(proposal.voting_start, 1000);
    assert_eq!(proposal.voting_end, 1200);
    assert_eq!(proposal.yes_votes, 0);
    assert_eq!(proposal.no_votes, 0);
    assert_eq!(proposal.executed, false);
}

#[test]
fn test_multiple_proposals_increment_counter() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let id1 = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    let id2 = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title2"),
        &Symbol::new(&env, "desc2"),
        &Symbol::new(&env, "upgrade"),
        &300,
    );
    
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.get_proposal_count(), 2);
}

#[test]
#[should_panic(expected = "Voting period too short")]
fn test_create_proposal_voting_period_too_short() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    // min_voting_period is 100, so 50 should fail
    client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &50,
    );
}

#[test]
fn test_cast_vote_yes() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    client.cast_vote(&voter1, &proposal_id, &true, &50);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.yes_votes, 50);
    assert_eq!(proposal.no_votes, 0);
    assert!(client.has_voted(&voter1, &proposal_id));
    
    // Verify vote record
    let vote_record = client.get_vote_record(&voter1, &proposal_id).unwrap();
    assert_eq!(vote_record.support, true);
    assert_eq!(vote_record.voting_power, 50);
}

#[test]
fn test_cast_vote_no() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    client.cast_vote(&voter1, &proposal_id, &false, &75);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.yes_votes, 0);
    assert_eq!(proposal.no_votes, 75);
}

#[test]
fn test_multiple_voters() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    client.cast_vote(&voter1, &proposal_id, &true, &60);
    client.cast_vote(&voter2, &proposal_id, &false, &40);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.yes_votes, 60);
    assert_eq!(proposal.no_votes, 40);
    assert!(client.has_voted(&voter1, &proposal_id));
    assert!(client.has_voted(&voter2, &proposal_id));
}

#[test]
#[should_panic(expected = "Already voted")]
fn test_double_vote_prevention() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    client.cast_vote(&voter1, &proposal_id, &true, &50);
    client.cast_vote(&voter1, &proposal_id, &false, &50); // Should panic
}

#[test]
#[should_panic(expected = "Voting period ended")]
fn test_vote_after_period_ends() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    // Advance time past voting end (1000 + 200 = 1200)
    env.ledger().set_timestamp(1300);
    
    client.cast_vote(&voter1, &proposal_id, &true, &50); // Should panic
}

#[test]
fn test_finalize_proposal_passed() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    // Cast votes exceeding quorum (100), yes > no
    client.cast_vote(&voter1, &proposal_id, &true, &80);
    client.cast_vote(&voter2, &proposal_id, &false, &30);
    
    // Advance time past voting end
    env.ledger().set_timestamp(1300);
    
    client.finalize_proposal(&proposal_id);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "passed"));
}

#[test]
fn test_finalize_proposal_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    // Cast votes exceeding quorum, no > yes
    client.cast_vote(&voter1, &proposal_id, &true, &30);
    client.cast_vote(&voter2, &proposal_id, &false, &80);
    
    env.ledger().set_timestamp(1300);
    client.finalize_proposal(&proposal_id);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "rejected"));
}

#[test]
fn test_finalize_proposal_quorum_not_met() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    // Cast votes below quorum (100)
    client.cast_vote(&voter1, &proposal_id, &true, &50);
    
    env.ledger().set_timestamp(1300);
    client.finalize_proposal(&proposal_id);
    
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "rejected"));
}

#[test]
#[should_panic(expected = "Voting still active")]
fn test_finalize_before_voting_ends() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    let proposal_id = client.create_proposal(
        &voter1,
        &Symbol::new(&env, "title1"),
        &Symbol::new(&env, "desc1"),
        &Symbol::new(&env, "feature"),
        &200,
    );
    
    // Try to finalize while voting is still active
    client.finalize_proposal(&proposal_id); // Should panic
}

#[test]
fn test_delegate_voting_power() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    
    client.delegate_voting_power(&voter1, &voter2, &100);
    
    let delegation = client.get_delegation(&voter1).unwrap();
    assert_eq!(delegation.delegate, voter2);
    assert_eq!(delegation.amount, 100);
    
    // Check voting power: voter1 has 500 base, delegated 100 away
    let power1 = client.get_voting_power(&voter1, &500);
    assert_eq!(power1, 400); // 500 - 100 delegated away
    
    // voter2 has 300 base + 100 delegated to them
    let power2 = client.get_voting_power(&voter2, &300);
    assert_eq!(power2, 400); // 300 + 100 received
}

#[test]
fn test_revoke_delegation() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    
    client.delegate_voting_power(&voter1, &voter2, &100);
    
    // Verify delegation exists
    assert!(client.get_delegation(&voter1).is_some());
    
    // Revoke
    client.revoke_delegation(&voter1);
    
    // Delegation should be removed
    assert!(client.get_delegation(&voter1).is_none());
    
    // Voting power should be restored
    let power1 = client.get_voting_power(&voter1, &500);
    assert_eq!(power1, 500);
    
    let power2 = client.get_voting_power(&voter2, &300);
    assert_eq!(power2, 300);
}

#[test]
fn test_redelegate_replaces_existing() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    let voter3 = Address::generate(&env);
    
    // Delegate to voter2
    client.delegate_voting_power(&voter1, &voter2, &100);
    
    // Re-delegate to voter3 (should replace)
    client.delegate_voting_power(&voter1, &voter3, &150);
    
    let delegation = client.get_delegation(&voter1).unwrap();
    assert_eq!(delegation.delegate, voter3);
    assert_eq!(delegation.amount, 150);
    
    // voter2 should no longer have delegated power
    let power2 = client.get_voting_power(&voter2, &300);
    assert_eq!(power2, 300);
    
    // voter3 should have the new delegation
    let power3 = client.get_voting_power(&voter3, &200);
    assert_eq!(power3, 350); // 200 + 150
}

#[test]
#[should_panic(expected = "Cannot delegate to self")]
fn test_cannot_delegate_to_self() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    client.delegate_voting_power(&voter1, &voter1, &100); // Should panic
}

#[test]
#[should_panic(expected = "Invalid delegation amount")]
fn test_cannot_delegate_zero() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, voter2) = setup_test(&env);
    
    client.delegate_voting_power(&voter1, &voter2, &0); // Should panic
}

#[test]
#[should_panic(expected = "No active delegation")]
fn test_revoke_without_delegation() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    client.revoke_delegation(&voter1); // Should panic
}

#[test]
fn test_voting_power_no_delegation() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (client, _admin, voter1, _voter2) = setup_test(&env);
    
    // No delegation, voting power equals base balance
    let power = client.get_voting_power(&voter1, &1000);
    assert_eq!(power, 1000);
}
