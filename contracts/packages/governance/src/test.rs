use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env,
};

#[test]
fn test_governance_quorum_and_config() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.init_governance(&owner, &86400);

    let config = GovernanceStorageKey::get_config(&env).unwrap();
    assert_eq!(config.voting_period_secs, 86400);
    assert_eq!(config.quorum, 0);

    // Update config with quorum
    client.set_config(&owner, &3600, &5);
    let updated_config = GovernanceStorageKey::get_config(&env).unwrap();
    assert_eq!(updated_config.voting_period_secs, 3600);
    assert_eq!(updated_config.quorum, 5);
}

#[test]
fn proposal_passes_when_quorum_and_majority_are_met() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let yes_voter_1 = Address::generate(&env);
    let yes_voter_2 = Address::generate(&env);
    let no_voter = Address::generate(&env);

    client.init_governance_with_quorum(&owner, &100, &2);
    let proposal_id = client.create_proposal(&yes_voter_1, &Symbol::new(&env, "quorum"));
    client.cast_vote(&yes_voter_1, &proposal_id, &true);
    client.cast_vote(&yes_voter_2, &proposal_id, &true);
    client.cast_vote(&no_voter, &proposal_id, &false);

    env.ledger().set_timestamp(101);
    client.execute_proposal(&owner, &proposal_id);

    assert_eq!(
        client.get_proposal(&proposal_id).unwrap().status,
        Symbol::new(&env, "passed")
    );
}

#[test]
fn proposal_is_rejected_when_yes_votes_do_not_reach_quorum() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let voter = Address::generate(&env);

    client.init_governance_with_quorum(&owner, &100, &2);
    let proposal_id = client.create_proposal(&voter, &Symbol::new(&env, "quorum"));
    client.cast_vote(&voter, &proposal_id, &true);

    env.ledger().set_timestamp(101);
    client.execute_proposal(&owner, &proposal_id);

    assert_eq!(
        client.get_proposal(&proposal_id).unwrap().status,
        Symbol::new(&env, "rejected")
    );
}
