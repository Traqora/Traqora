use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, Symbol,
};
use traqora_contracts::governance::{GovernanceContract, GovernanceContractClient};

mod common;
use common::{new_env, register_contracts};

fn setup_test(env: &Env) -> (GovernanceContractClient<'static>, Address, Address, Address) {
    let admin = Address::generate(env);
    let voter1 = Address::generate(env);
    let voter2 = Address::generate(env);

    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(env, &contract_id);

    // 200-second voting window for every proposal
    client.init_governance(&200);

    (client, admin, voter1, voter2)
}

#[test]
fn test_initialize_and_create_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let desc = Symbol::new(&env, "Upgrade_oracle");
    let proposal_id = client.create_proposal(&voter1, &desc);

    assert_eq!(proposal_id, 1);
    assert_eq!(client.get_proposal_count(), 1);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.id, 1);
    assert_eq!(proposal.description, desc);
    assert_eq!(proposal.status, Symbol::new(&env, "open"));
    assert_eq!(proposal.vote_deadline, 1200);
    assert_eq!(proposal.yes_votes, 0);
    assert_eq!(proposal.no_votes, 0);
}

#[test]
fn test_multiple_proposals_increment_counter() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let id1 = client.create_proposal(&voter1, &Symbol::new(&env, "p1"));
    let id2 = client.create_proposal(&voter1, &Symbol::new(&env, "p2"));

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.get_proposal_count(), 2);
}

#[test]
fn test_cast_vote_yes_and_no() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.cast_vote(&voter1, &proposal_id, &true);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.yes_votes, 1);
    assert_eq!(proposal.no_votes, 0);
    assert!(client.has_voted(&voter1, &proposal_id));

    client.cast_vote(&voter2, &proposal_id, &false);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.yes_votes, 1);
    assert_eq!(proposal.no_votes, 1);
}

#[test]
#[should_panic(expected = "Already voted")]
fn test_double_vote_prevention() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.cast_vote(&voter1, &proposal_id, &true);
    client.cast_vote(&voter1, &proposal_id, &false);
}

#[test]
#[should_panic(expected = "Voting period ended")]
fn test_vote_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    env.ledger().set_timestamp(1300);

    client.cast_vote(&voter1, &proposal_id, &true);
}

#[test]
fn test_execute_proposal_passed() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.cast_vote(&voter1, &proposal_id, &true);
    client.cast_vote(&voter2, &proposal_id, &false);

    env.ledger().set_timestamp(1300);
    client.execute_proposal(&proposal_id);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "passed"));
}

#[test]
fn test_execute_proposal_rejected_majority_no() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.cast_vote(&voter1, &proposal_id, &true);
    client.cast_vote(&voter2, &proposal_id, &false);
    let voter3 = Address::generate(&env);
    client.cast_vote(&voter3, &proposal_id, &false);

    env.ledger().set_timestamp(1300);
    client.execute_proposal(&proposal_id);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "rejected"));
}

#[test]
fn test_execute_proposal_tie_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.cast_vote(&voter1, &proposal_id, &true);
    client.cast_vote(&voter2, &proposal_id, &false);

    env.ledger().set_timestamp(1300);
    client.execute_proposal(&proposal_id);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "rejected"));
}

#[test]
#[should_panic(expected = "Voting still active")]
fn test_execute_before_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.execute_proposal(&proposal_id);
}

#[test]
fn test_common_initialize_and_create_proposal() {
    let env = new_env();
    let contracts = register_contracts(&env);

    contracts.governance.init_governance(&120);

    let proposer = Address::generate(&env);
    let pid = contracts
        .governance
        .create_proposal(&proposer, &Symbol::new(&env, "Add_new_feature"));
    let p = contracts.governance.get_proposal(&pid).unwrap();
    assert_eq!(p.status, Symbol::new(&env, "open"));
}

#[test]
fn test_cast_vote_and_execute_proposal() {
    let env = new_env();
    let contracts = register_contracts(&env);
    contracts.governance.init_governance(&10);

    let proposer = Address::generate(&env);
    let pid = contracts
        .governance
        .create_proposal(&proposer, &Symbol::new(&env, "Lower_fees"));

    let voter = Address::generate(&env);
    contracts.governance.cast_vote(&voter, &pid, &true);
    assert!(contracts.governance.has_voted(&voter, &pid));

    let p = contracts.governance.get_proposal(&pid).unwrap();
    env.ledger().set_timestamp(p.vote_deadline + 1);
    contracts.governance.execute_proposal(&pid);
    let finalized = contracts.governance.get_proposal(&pid).unwrap();
    assert_eq!(finalized.status, Symbol::new(&env, "passed"));
}
