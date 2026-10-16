// contracts/token/src/test.rs
use super::*;
use soroban_sdk::{Env, Address};

#[test]
fn test_mint_burn_authorization_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(TraqoraToken, ());
    let client = TraqoraTokenClient::new(&env, &contract_id);

    // 1. Authorized Minting
    client.mint(&admin, &user, &1000);
    // Verify balance or state...

    // 2. Authorized Burning
    client.burn(&user, &400);
    // Verify remaining balance...
}

#[test]
#[should_panic(expected = "HostError")] // Or specific authorization panic in Soroban
fn test_mint_unauthorized_fails() {
    let env = Env::default();
    // Do NOT mock all auths or explicitly test missing auth
    let unauthorized_caller = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(TraqoraToken, ());
    let client = TraqoraTokenClient::new(&env, &contract_id);

    // Attempting to mint without admin authorization should fail
    client.mint(&unauthorized_caller, &user, &1000);
}