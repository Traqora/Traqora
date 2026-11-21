use governance::{GovernanceContract, GovernanceContractClient, Proposal};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, Symbol,
};

use integration_tests::{new_env, register_contracts};

fn setup_test(env: &Env) -> (GovernanceContractClient, Address, Address, Address) {
    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let voter1 = Address::generate(env);
    let voter2 = Address::generate(env);

    client.init_governance(&admin, &1000);
    (client, admin, voter1, voter2)
}

#[test]
fn test_create_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let description = Symbol::new(&env, "Test proposal");
    let proposal_id = client.create_proposal(&voter1, &description);

    assert_eq!(proposal_id, 1);

    let proposal = client.get_proposal(&1).unwrap();
    assert_eq!(proposal.description, description);
    assert_eq!(proposal.creator, voter1);
    assert_eq!(proposal.status, Symbol::new(&env, "open"));
}

#[test]
fn test_vote_on_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    // Vote YES
    client.cast_vote(&voter1, &proposal_id, &true);
    // Vote NO
    client.cast_vote(&voter2, &proposal_id, &false);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.yes_votes, 1);
    assert_eq!(proposal.no_votes, 1);
}

#[test]
#[should_panic(expected = "Already voted")]
fn test_double_vote_should_panic() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, voter1, _voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.cast_vote(&voter1, &proposal_id, &true);
    client.cast_vote(&voter1, &proposal_id, &true);
}

#[test]
fn test_execute_proposal_success() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    // Vote
    client.cast_vote(&voter1, &proposal_id, &true);
    client.cast_vote(&voter2, &proposal_id, &true);

    // Fast forward past deadline (1000 + 1000)
    env.ledger().set_timestamp(3000);

    client.execute_proposal(&admin, &proposal_id);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "passed"));
}

#[test]
fn test_execute_proposal_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, admin, voter1, voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    // Vote against
    client.cast_vote(&voter1, &proposal_id, &false);
    client.cast_vote(&voter2, &proposal_id, &false);

    // Fast forward
    env.ledger().set_timestamp(3000);

    client.execute_proposal(&admin, &proposal_id);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.status, Symbol::new(&env, "rejected"));
}

#[test]
#[should_panic(expected = "Voting still active")]
fn test_execute_before_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (client, admin, voter1, _voter2) = setup_test(&env);

    let proposal_id = client.create_proposal(&voter1, &Symbol::new(&env, "desc"));

    client.execute_proposal(&admin, &proposal_id);
}

#[test]
fn test_common_initialize_and_create_proposal() {
    let env = new_env();
    let contracts = register_contracts(&env);

    let owner = Address::generate(&env);
    contracts.governance.init_governance(&owner, &120);

    let voter = Address::generate(&env);
    let proposal_id = contracts
        .governance
        .create_proposal(&voter, &Symbol::new(&env, "desc"));

    let p = contracts.governance.get_proposal(&proposal_id).unwrap();
    assert_eq!(p.creator, voter);

    // Complete flow
    contracts.governance.cast_vote(&voter, &proposal_id, &true);
    env.ledger().set_timestamp(200);
    contracts.governance.execute_proposal(&owner, &proposal_id);
    let p2 = contracts.governance.get_proposal(&proposal_id).unwrap();
    assert_eq!(p2.status, Symbol::new(&env, "passed"));
}
