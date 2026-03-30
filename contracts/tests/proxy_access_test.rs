#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};
use traqora_contracts::proxy::{ContractProxy, ContractProxyClient};

#[test]
fn test_proxy_transfer_ownership_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, ContractProxy);
    let client = ContractProxyClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let other = Address::generate(&env);
    let new_owner = Address::generate(&env);

    client.init_proxy(&owner, &soroban_sdk::BytesN::from_array(&env, &[0u8; 32]), &soroban_sdk::Vec::new(&env), &1);

    // Non-owner cannot transfer ownership
    let res = client.try_transfer_ownership(&other, &new_owner);
    assert!(res.is_err());
}

#[test]
fn test_proxy_set_role_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, ContractProxy);
    let client = ContractProxyClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let target = Address::generate(&env);
    let random = Address::generate(&env);

    client.init_proxy(&owner, &soroban_sdk::BytesN::from_array(&env, &[0u8; 32]), &soroban_sdk::Vec::new(&env), &1);

    // Random user cannot set roles
    let res = client.try_set_role(&random, &target, &1u32, &true);
    assert!(res.is_err());
}
