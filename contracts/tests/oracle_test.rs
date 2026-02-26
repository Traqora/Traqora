use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Bytes, Env, Symbol,
};
use traqora_contracts::oracle::{FlightOracle, FlightOracleClient};

mod common;
use common::{generate_actors, initialize_token, new_env, register_contracts};

fn compute_proof(
    env: &Env,
    _flight_number: &Symbol,
    booking_id: u64,
    _status: &Symbol,
    timestamp: u64,
) -> soroban_sdk::BytesN<32> {
    let mut msg = Bytes::new(env);
    for b in booking_id.to_be_bytes().iter() {
        msg.push_back(*b);
    }
    for b in timestamp.to_be_bytes().iter() {
        msg.push_back(*b);
    }
    env.crypto().keccak256(&msg).into()
}

#[test]
fn test_oracle_completion_settlement() {
    let env = new_env();
    env.ledger().set_timestamp(2_000_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let oracle_id = env.register(FlightOracle, ());
    let oracle = FlightOracleClient::new(&env, &oracle_id);

    // Configure booking to trust oracle
    contracts
        .booking
        .initialize_oracle(&actors.admin, &oracle.address);
    // Initialize oracle with booking contract address and consensus threshold = 1
    oracle.initialize(&actors.admin, &1_000i128, &1u32, &contracts.booking.address);

    // Register provider
    let provider = Address::generate(&env);
    oracle.register_oracle_provider(&actors.admin, &provider, &1_000i128);

    // Create booking and escrow funds
    let price = 1_000_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ300"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_010_000,
        &price,
        &contracts.token.address,
    );
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    assert_eq!(
        contracts.token.balance_of(&contracts.booking.address),
        price
    );

    // Submit completed status and verify settlement
    let ts = env.ledger().timestamp();
    let status = Symbol::new(&env, "completed");
    let flight_number = Symbol::new(&env, "TQ300");
    let proof = compute_proof(&env, &flight_number, booking_id, &status, ts);
    oracle.submit_flight_status(&provider, &flight_number, &booking_id, &status, &ts, &proof);

    oracle.verify_flight_completion(&flight_number, &booking_id);

    assert_eq!(contracts.token.balance_of(&actors.airline), price);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);
}

#[test]
fn test_oracle_cancellation_refund() {
    let env = new_env();
    env.ledger().set_timestamp(2_000_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let oracle_id = env.register(FlightOracle, ());
    let oracle = FlightOracleClient::new(&env, &oracle_id);
    contracts
        .booking
        .initialize_oracle(&actors.admin, &oracle.address);
    oracle.initialize(&actors.admin, &1_000i128, &1u32, &contracts.booking.address);

    let provider = Address::generate(&env);
    oracle.register_oracle_provider(&actors.admin, &provider, &1_000i128);

    let price = 500_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ301"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &2_000_010_000,
        &price,
        &contracts.token.address,
    );
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    assert_eq!(
        contracts.token.balance_of(&contracts.booking.address),
        price
    );

    let ts = env.ledger().timestamp();
    let status = Symbol::new(&env, "cancelled");
    let flight_number = Symbol::new(&env, "TQ301");
    let proof = compute_proof(&env, &flight_number, booking_id, &status, ts);
    oracle.submit_flight_status(&provider, &flight_number, &booking_id, &status, &ts, &proof);

    oracle.verify_airline_cancellation(&flight_number, &booking_id);

    assert_eq!(contracts.token.balance_of(&actors.passenger), price);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);
}

#[test]
#[should_panic(expected = "Provider not registered")]
fn test_unregistered_provider_cannot_submit() {
    let env = new_env();
    env.ledger().set_timestamp(2_000_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let oracle_id = env.register(FlightOracle, ());
    let oracle = FlightOracleClient::new(&env, &oracle_id);
    contracts
        .booking
        .initialize_oracle(&actors.admin, &oracle.address);
    oracle.initialize(&actors.admin, &1_000i128, &1u32, &contracts.booking.address);

    let provider = Address::generate(&env);
    // Not registered
    let ts = env.ledger().timestamp();
    let status = Symbol::new(&env, "completed");
    let flight_number = Symbol::new(&env, "TQ999");
    let proof = compute_proof(&env, &flight_number, 1u64, &status, ts);
    oracle.submit_flight_status(&provider, &flight_number, &1u64, &status, &ts, &proof);
}
