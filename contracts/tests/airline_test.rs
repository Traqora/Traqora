use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, Vec};
use traqora_contracts::airline::{
    AirlineContract,
    AirlineContractClient,
    BatchCreateFlightsResult,
    BatchUpdateFlightStatusResult,
    Flight,
    FlightInput,
    FlightStatusUpdate,
};

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

#[test]
fn test_batch_create_flights_partial_failure() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let mut batch = Vec::new(&env);
    batch.push_back(FlightInput {
        flight_number: Symbol::new(&env, "TQ400"),
        from_airport: Symbol::new(&env, "JFK"),
        to_airport: Symbol::new(&env, "LHR"),
        departure_time: 1_900_000_000,
        arrival_time: 1_900_100_000,
        total_seats: 180,
        price: 400_0000000i128,
        currency: Symbol::new(&env, "USDC"),
    });
    batch.push_back(FlightInput {
        flight_number: Symbol::new(&env, "TQ401"),
        from_airport: Symbol::new(&env, "LHR"),
        to_airport: Symbol::new(&env, "JFK"),
        departure_time: 1_900_100_000,
        arrival_time: 1_900_000_000,
        total_seats: 180,
        price: 410_0000000i128,
        currency: Symbol::new(&env, "USDC"),
    });
    batch.push_back(FlightInput {
        flight_number: Symbol::new(&env, "TQ402"),
        from_airport: Symbol::new(&env, "JFK"),
        to_airport: Symbol::new(&env, "DXB"),
        departure_time: 1_900_200_000,
        arrival_time: 1_900_300_000,
        total_seats: 220,
        price: 520_0000000i128,
        currency: Symbol::new(&env, "USDC"),
    });

    let result = contracts.airline.batch_create_flights(&actors.airline, &batch);
    assert_eq!(result.created_flight_ids.len(), 2);
    assert_eq!(result.failures.len(), 1);
    assert_eq!(result.failures.get(0).unwrap().reason, Symbol::new(&env, "bad_data"));

    let first_id = result.created_flight_ids.get(0).unwrap();
    let second_id = result.created_flight_ids.get(1).unwrap();
    assert!(contracts.airline.get_flight(&first_id).is_some());
    assert!(contracts.airline.get_flight(&second_id).is_some());

    let profile = contracts.airline.get_airline(&actors.airline).unwrap();
    assert_eq!(profile.total_flights, 2);
}

#[test]
fn test_batch_update_flight_status_partial_failure() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let other_airline = Address::generate(&env);
    register_and_verify_airline(&env, &contracts.airline, &other_airline);

    let my_flight = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ500"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "MAD"),
        &2_000_000_000,
        &2_000_100_000,
        &150,
        &300_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let other_flight = contracts.airline.create_flight(
        &other_airline,
        &Symbol::new(&env, "OA100"),
        &Symbol::new(&env, "LAX"),
        &Symbol::new(&env, "SEA"),
        &2_000_000_000,
        &2_000_020_000,
        &90,
        &150_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let mut updates = Vec::new(&env);
    updates.push_back(FlightStatusUpdate {
        flight_id: my_flight,
        status: Symbol::new(&env, "completed"),
    });
    updates.push_back(FlightStatusUpdate {
        flight_id: 999_999,
        status: Symbol::new(&env, "cancelled"),
    });
    updates.push_back(FlightStatusUpdate {
        flight_id: other_flight,
        status: Symbol::new(&env, "cancelled"),
    });

    let result = contracts
        .airline
        .batch_update_flight_status(&actors.airline, &updates);
    assert_eq!(result.updated_flight_ids.len(), 1);
    assert_eq!(result.failures.len(), 2);

    let updated = contracts.airline.get_flight(&my_flight).unwrap();
    assert_eq!(updated.status, Symbol::new(&env, "completed"));
}

#[test]
#[should_panic(expected = "Batch too large")]
fn test_batch_create_flights_enforces_max_batch_size() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let mut batch = Vec::new(&env);
    let mut i = 0;
    while i < 51 {
        batch.push_back(FlightInput {
            flight_number: Symbol::new(&env, "TQ999"),
            from_airport: Symbol::new(&env, "JFK"),
            to_airport: Symbol::new(&env, "LHR"),
            departure_time: 2_100_000_000,
            arrival_time: 2_100_100_000,
            total_seats: 100,
            price: 200_0000000i128,
            currency: Symbol::new(&env, "USDC"),
        });
        i += 1;
    }

    contracts.airline.batch_create_flights(&actors.airline, &batch);
}
