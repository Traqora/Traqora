use soroban_sdk::{testutils::{Address as _, Ledger, LedgerInfo}, Address, Env, Symbol, Vec};
use traqora_contracts::airline::{
    AirlineContract,
    AirlineContractClient,
    BatchCreateFlightsResult,
    BatchUpdateFlightStatusResult,
    Flight,
    FlightInput,
    FlightStatusUpdate,
    PricingFactors,
    PriceUpdateInput,
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

// ── Dynamic pricing tests ─────────────────────────────────────────────────────

fn advance_ledger(env: &Env, seconds: u64) {
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + seconds,
        protocol_version: env.ledger().protocol_version(),
        sequence_number: env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });
}

#[test]
fn test_initialize_pricing() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(
        &actors.admin,
        &oracle,
        &3600u64,       // cooldown: 1h
        &2000i128,      // max_change_bps: 20%
        &5000i128,      // max_demand_multiplier_bps: 50%
    );
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_pricing_twice_panics() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &3600u64, &2000i128, &5000i128);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &3600u64, &2000i128, &5000i128);
}

#[test]
fn test_set_price_oracle() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2000i128, &5000i128);

    let new_oracle = Address::generate(&env);
    contracts.airline.set_price_oracle(&actors.admin, &new_oracle);
}

#[test]
fn test_update_flight_price_within_guardrails() {
    let env = new_env();
    env.ledger().set_timestamp(1_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    // cooldown = 0 so we can update immediately
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2000i128, &5000i128);

    let initial_price = 100_0000000i128;
    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ600"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_000_000u64,
        &2_000_100_000u64,
        &200u32,
        &initial_price,
        &Symbol::new(&env, "USDC"),
    );

    let input = PriceUpdateInput {
        base_price: initial_price,
        factors: PricingFactors {
            demand_bps: 1000i128,  // +10%
            competitor_bps: 0i128,
            time_to_departure_bps: 0i128,
        },
    };

    let new_price = contracts.airline.update_flight_price(&oracle, &flight_id, &input);

    // Price should increase but capped at 20% max
    assert!(new_price > initial_price);
    assert!(new_price <= initial_price + initial_price * 2000 / 10_000);

    let flight = contracts.airline.get_flight(&flight_id).unwrap();
    assert_eq!(flight.price, new_price);
}

#[test]
fn test_update_flight_price_capped_at_max_change() {
    let env = new_env();
    env.ledger().set_timestamp(1_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2000i128, &5000i128);

    let initial_price = 100_0000000i128;
    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ601"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_000_000u64,
        &2_000_100_000u64,
        &200u32,
        &initial_price,
        &Symbol::new(&env, "USDC"),
    );

    // Request 50% increase, but cap is 20%
    let input = PriceUpdateInput {
        base_price: initial_price,
        factors: PricingFactors {
            demand_bps: 5000i128,  // +50% requested
            competitor_bps: 0i128,
            time_to_departure_bps: 0i128,
        },
    };

    let new_price = contracts.airline.update_flight_price(&oracle, &flight_id, &input);
    let expected_max = initial_price + initial_price * 2000 / 10_000; // 20% cap
    assert_eq!(new_price, expected_max);
}

#[test]
fn test_get_price_history() {
    let env = new_env();
    env.ledger().set_timestamp(1_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2000i128, &5000i128);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ602"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_000_000u64,
        &2_000_100_000u64,
        &200u32,
        &100_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    // Empty before any updates
    let history_before = contracts.airline.get_price_history(&flight_id);
    assert_eq!(history_before.len(), 0);

    let input = PriceUpdateInput {
        base_price: 100_0000000i128,
        factors: PricingFactors { demand_bps: 500i128, competitor_bps: 0i128, time_to_departure_bps: 0i128 },
    };
    contracts.airline.update_flight_price(&oracle, &flight_id, &input);

    advance_ledger(&env, 1);

    let input2 = PriceUpdateInput {
        base_price: 100_0000000i128,
        factors: PricingFactors { demand_bps: -500i128, competitor_bps: 0i128, time_to_departure_bps: 0i128 },
    };
    contracts.airline.update_flight_price(&oracle, &flight_id, &input2);

    let history = contracts.airline.get_price_history(&flight_id);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().old_price, 100_0000000i128);
}

#[test]
fn test_get_current_price_with_demand() {
    let env = new_env();
    env.ledger().set_timestamp(1_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2000i128, &5000i128);

    let price = 100_0000000i128;
    let departure = 1_000_000u64 + 24 * 3600; // 24h from now (within 48h time boost)
    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ603"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &departure,
        &(departure + 7200),
        &100u32,
        &price,
        &Symbol::new(&env, "USDC"),
    );

    let live_price = contracts.airline.get_current_price(&flight_id);
    // Due to time boost, live price should be >= stored price
    assert!(live_price >= price);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_update_flight_price_wrong_oracle_panics() {
    let env = new_env();
    env.ledger().set_timestamp(1_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2000i128, &5000i128);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ604"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_000_000u64,
        &2_000_100_000u64,
        &200u32,
        &100_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let wrong_oracle = Address::generate(&env);
    let input = PriceUpdateInput {
        base_price: 100_0000000i128,
        factors: PricingFactors { demand_bps: 0i128, competitor_bps: 0i128, time_to_departure_bps: 0i128 },
    };
    contracts.airline.update_flight_price(&wrong_oracle, &flight_id, &input);
}

#[test]
#[should_panic(expected = "Cooldown active")]
fn test_update_flight_price_cooldown_enforced() {
    let env = new_env();
    env.ledger().set_timestamp(1_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &3600u64, &2000i128, &5000i128);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ605"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_000_000u64,
        &2_000_100_000u64,
        &200u32,
        &100_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let input = PriceUpdateInput {
        base_price: 100_0000000i128,
        factors: PricingFactors { demand_bps: 0i128, competitor_bps: 0i128, time_to_departure_bps: 0i128 },
    };
    contracts.airline.update_flight_price(&oracle, &flight_id, &input);
    // Immediately try again — cooldown is 1h
    contracts.airline.update_flight_price(&oracle, &flight_id, &input);
}
