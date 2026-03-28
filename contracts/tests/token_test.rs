use soroban_sdk::{Env, String, Symbol};
use traqora_contracts::token::TRQTokenContract;

mod common;
use common::{generate_actors, initialize_token, new_env, register_contracts};

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
    contracts.token.init_token(
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
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &amount);

    assert_eq!(contracts.token.balance_of(&actors.passenger), amount);
    assert_eq!(contracts.token.total_supply(), amount);
}

#[test]
fn test_transfer_valid() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &1000);
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
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &1000);
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
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &1000);
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
    contracts
        .token
        .transfer_from(&actors.airline, &actors.passenger, &actors.airline, &1);
}

#[test]
fn test_metadata_queries() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    assert_eq!(contracts.token.decimals(), 7u32);
    assert_eq!(contracts.token.name(), String::from_str(&env, "TRQ"));
    assert_eq!(contracts.token.symbol(), Symbol::new(&env, "TRQ"));
    assert_eq!(contracts.token.total_supply(), 0);
}

#[test]
fn test_total_supply_tracks_mints() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.token.mint(&actors.admin, &actors.passenger, &1000);
    contracts.token.mint(&actors.admin, &actors.airline, &500);
    assert_eq!(contracts.token.total_supply(), 1500);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_mint_by_non_admin_panics() {
    // With mock_all_auths, auth passes but the admin check fails
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    // passenger is authorized via mock but is not the stored admin
    contracts.token.mint(&actors.passenger, &actors.passenger, &1000);
}

#[test]
fn test_allowance_expired_returns_zero() {
    use soroban_sdk::testutils::{Ledger, LedgerInfo};

    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.token.mint(&actors.admin, &actors.passenger, &500);
    // Approve with expiration at ledger sequence 1
    contracts.token.approve(&actors.passenger, &actors.airline, &300, &1u32);
    assert_eq!(contracts.token.allowance(&actors.passenger, &actors.airline), 300);

    // Advance ledger sequence past expiration
    env.ledger().set(LedgerInfo {
        timestamp: 0,
        protocol_version: env.ledger().protocol_version(),
        sequence_number: 2, // past expiration_ledger=1
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });

    // Expired allowance should read as 0
    assert_eq!(contracts.token.allowance(&actors.passenger, &actors.airline), 0);
}
