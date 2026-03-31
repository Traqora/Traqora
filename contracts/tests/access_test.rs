#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};
use crate::governance::{GovernanceContract, GovernanceContractClient};

#[test]
fn test_access_control_ownership() {
    let env = Env::default();
    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let other = Address::generate(&env);

    // Initialize with owner
    client.init_governance(&owner, &3600);

    assert_eq!(client.get_owner(), owner);
    assert!(client.has_role(&owner, &0)); // Role::Owner = 0

    // Transfer ownership
    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);
    assert_eq!(client.get_owner(), new_owner);
    assert!(client.has_role(&new_owner, &0));
    assert!(!client.has_role(&owner, &0));

    // Non-owner cannot transfer
    let res = client.try_transfer_ownership(&owner, &other);
    assert!(res.is_err());
}

#[test]
fn test_access_control_roles() {
    let env = Env::default();
    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let random = Address::generate(&env);

    client.init_governance(&owner, &3600);

    // Set Admin role
    client.set_role(&owner, &admin, &1, &true); // Role::Admin = 1
    assert!(client.has_role(&admin, &1));
    assert!(client.has_role(&admin, &2)); // Admin implies Operator

    // Set Operator role
    client.set_role(&owner, &operator, &2, &true); // Role::Operator = 2
    assert!(client.has_role(&operator, &2));
    assert!(!client.has_role(&operator, &1)); // Operator does not imply Admin

    // Random user has no roles
    assert!(!client.has_role(&random, &1));
    assert!(!client.has_role(&random, &2));

    // Revoke role
    client.set_role(&owner, &admin, &1, &false);
    assert!(!client.has_role(&admin, &1));
}

#[test]
fn test_guarded_function() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let admin = Address::generate(&env);
    let random = Address::generate(&env);

    client.init_governance(&owner, &3600);
    client.set_role(&owner, &admin, &1, &true);

    let proposal_id = client.create_proposal(&owner, &soroban_sdk::Symbol::new(&env, "Test"));
    
    // Jump time to end voting period
    env.ledger().with_mut(|li| {
        li.timestamp += 4000;
    });

    // Random user cannot execute
    let res = client.try_execute_proposal(&random, &proposal_id);
    assert!(res.is_err());

    // Admin can execute
    client.execute_proposal(&admin, &proposal_id);
    
    let prop = client.get_proposal(&proposal_id).unwrap();
    assert_ne!(prop.status, soroban_sdk::Symbol::new(&env, "open"));
}
