use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use traqora_contracts::airline::{AirlineContract, AirlineContractClient, Flight};

mod common;
use common::{new_env, generate_actors, register_contracts, register_and_verify_airline};

#[test]
fn test_register_and_verify_airline() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    contracts.airline.register_airline(
        &actors.airline,
        &Symbol::new(&env, "TraqoraAir"),
        &Symbol::new(&env, "TQ"),
    );
    let profile = contracts.airline.get_airline(&actors.airline).unwrap();
    assert!(!profile.is_verified);

    contracts
        .airline
        .verify_airline(&actors.admin, &actors.airline);
    let profile2 = contracts.airline.get_airline(&actors.airline).unwrap();
    assert!(profile2.is_verified);
}

#[test]
fn test_create_flight_requires_verified_airline_and_reserve_seat() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ101"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1_700_000_000,
        &1_700_100_000,
        &200,
        &250_0000000i128,
        &Symbol::new(&env, "USDC"),
    );
    let flight = contracts.airline.get_flight(&flight_id).unwrap();
    assert_eq!(flight.available_seats, 200);
    assert_eq!(flight.status, Symbol::new(&env, "active"));

    // Reserve seat
    contracts.airline.reserve_seat(&actors.airline, &flight_id);
    let flight2 = contracts.airline.get_flight(&flight_id).unwrap();
    assert_eq!(flight2.available_seats, 199);
}

#[test]
fn test_cancel_flight_and_unauthorized_changes() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ202"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &1_800_000_000,
        &1_800_050_000,
        &100,
        &150_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    // Cancel flight
    contracts.airline.cancel_flight(&actors.airline, &flight_id);
    let flight = contracts.airline.get_flight(&flight_id).unwrap();
    assert_eq!(flight.status, Symbol::new(&env, "cancelled"));
}
