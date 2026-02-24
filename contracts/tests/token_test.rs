use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, String};
use traqora_contracts::token::{TRQTokenContract, TRQTokenContractClient};

mod common;
use common::{new_env, generate_actors, register_contracts, initialize_token};

#[test]
fn test_initialize_ok() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    initialize_token(&env, &contracts.token, &actors.admin);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_reinitialize_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.token.initialize(
        &actors.admin,
        &String::from_str(&env, "TRQ"),
        &Symbol::new(&env, "TRQ"),
        &7,
    );
}

#[test]
fn test_mint_increases_balance_and_total_supply() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let amount = 1_000i128;
    contracts.token.mint(&actors.admin, &actors.passenger, &amount);

    assert_eq!(contracts.token.balance_of(&actors.passenger), amount);
    assert_eq!(contracts.token.total_supply(), amount);
}

#[test]
fn test_transfer_valid() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.token.mint(&actors.admin, &actors.passenger, &1000);
    contracts
        .token
        .transfer(&actors.passenger, &actors.airline, &400);
    assert_eq!(contracts.token.balance_of(&actors.passenger), 600);
    assert_eq!(contracts.token.balance_of(&actors.airline), 400);
    assert_eq!(contracts.token.total_supply(), 1000);
}

#[test]
#[should_panic(expected = "Invalid amount")]
fn test_transfer_invalid_amount_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.token.mint(&actors.admin, &actors.passenger, &1000);
    contracts
        .token
        .transfer(&actors.passenger, &actors.airline, &0);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn test_transfer_insufficient_balance_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.token.mint(&actors.admin, &actors.passenger, &1000);
    contracts
        .token
        .transfer(&actors.airline, &actors.passenger, &1);
}

#[test]
fn test_approve_and_transfer_from() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.token.mint(&actors.admin, &actors.passenger, &500);

    // Approve spender with expiration sequence
    contracts
        .token
        .approve(&actors.passenger, &actors.airline, &300, &10);
    assert_eq!(
        contracts
            .token
            .allowance(&actors.passenger, &actors.airline),
        300
    );

    // Transfer within allowance
    contracts
        .token
        .transfer_from(&actors.airline, &actors.passenger, &actors.airline, &200);
    assert_eq!(contracts.token.balance_of(&actors.passenger), 300);
    assert_eq!(contracts.token.balance_of(&actors.airline), 200);
    assert_eq!(
        contracts
            .token
            .allowance(&actors.passenger, &actors.airline),
        100
    );
}

#[test]
#[should_panic(expected = "Insufficient allowance")]
fn test_transfer_from_insufficient_allowance_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.token.mint(&actors.admin, &actors.passenger, &500);

    // Approve with zero amount
    contracts
        .token
        .approve(&actors.passenger, &actors.airline, &0, &1);
    contracts.token.transfer_from(
        &actors.airline,
        &actors.passenger,
        &actors.airline,
        &1,
    );
}
