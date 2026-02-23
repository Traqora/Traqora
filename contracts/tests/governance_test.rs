use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, Symbol};
use traqora_contracts::governance::{GovernanceContract, GovernanceContractClient};

mod common;
use common::{new_env, register_contracts};

#[test]
fn test_initialize_and_create_proposal() {
    let env = new_env();
    let contracts = register_contracts(&env);

    contracts
        .governance
        .initialize(&60, &100, &10);

    let proposer = Address::generate(&env);
    let pid = contracts.governance.create_proposal(
        &proposer,
        &Symbol::new(&env, "Upgrade"),
        &Symbol::new(&env, "Add_new_feature"),
        &Symbol::new(&env, "feature"),
        &120,
    );
    let p = contracts.governance.get_proposal(&pid).unwrap();
    assert_eq!(p.status, Symbol::new(&env, "active"));
}

#[test]
fn test_cast_vote_and_finalize() {
    let env = new_env();
    let contracts = register_contracts(&env);
    contracts
        .governance
        .initialize(&10, &1, &0);

    let proposer = Address::generate(&env);
    let pid = contracts.governance.create_proposal(
        &proposer,
        &Symbol::new(&env, "Fee_Change"),
        &Symbol::new(&env, "Lower_fees"),
        &Symbol::new(&env, "fee_change"),
        &10,
    );

    let voter = Address::generate(&env);
    contracts
        .governance
        .cast_vote(&voter, &pid, &true, &5);
    assert!(contracts.governance.has_voted(&voter, &pid));

    // Advance ledger time beyond voting_end and finalize
    let p = contracts.governance.get_proposal(&pid).unwrap();
    env.ledger().set_timestamp(p.voting_end + 1);
    contracts.governance.finalize_proposal(&pid);
    let finalized = contracts.governance.get_proposal(&pid).unwrap();
    assert!(finalized.status == Symbol::new(&env, "passed") || finalized.status == Symbol::new(&env, "rejected"));
}
