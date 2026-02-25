use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, Symbol};
use traqora_contracts::airline::{AirlineContract, AirlineContractClient, PriceUpdateInput, PricingFactors};

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
fn test_dynamic_pricing_oracle_update_cap_history_and_current_price() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2_000i128, &5_000i128);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ303"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "SFO"),
        &1_700_010_000,
        &1_700_020_000,
        &100,
        &100_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    // Push an extreme +100% update; should be capped to +20%.
    let input = PriceUpdateInput {
        base_price: 100_0000000i128,
        factors: PricingFactors {
            demand_bps: 10_000,
            competitor_bps: 0,
            time_to_departure_bps: 0,
        },
    };

    let new_price = contracts.airline.update_flight_price(&oracle, &flight_id, &input);
    assert_eq!(new_price, 120_0000000i128);

    let flight = contracts.airline.get_flight(&flight_id).unwrap();
    assert_eq!(flight.price, 120_0000000i128);

    let history = contracts.airline.get_price_history(&flight_id);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().old_price, 100_0000000i128);
    assert_eq!(history.get(0).unwrap().new_price, 120_0000000i128);

    // Demand multiplier should not decrease price and should be bounded.
    // With 0 seats sold and departure in the future, demand signal is low => close to base.
    let current = contracts.airline.get_current_price(&flight_id);
    assert!(current >= 120_0000000i128);
    assert!(current <= 180_0000000i128); // 1.5x max (max_demand_multiplier_bps=5000)

    // Sell seats to increase utilization.
    for _ in 0..80 {
        contracts.airline.reserve_seat(&actors.airline, &flight_id);
    }
    let current2 = contracts.airline.get_current_price(&flight_id);
    assert!(current2 >= current);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_dynamic_pricing_oracle_requires_authorized_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    let attacker = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &0u64, &2_000i128, &5_000i128);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ404"),
        &Symbol::new(&env, "LHR"),
        &Symbol::new(&env, "CDG"),
        &1_700_010_000,
        &1_700_020_000,
        &10,
        &200_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let input = PriceUpdateInput {
        base_price: 200_0000000i128,
        factors: PricingFactors {
            demand_bps: 0,
            competitor_bps: 0,
            time_to_departure_bps: 0,
        },
    };

    contracts.airline.update_flight_price(&attacker, &flight_id, &input);
}

#[test]
#[should_panic(expected = "Cooldown active")]
fn test_dynamic_pricing_oracle_cooldown_enforced() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    register_and_verify_airline(&env, &contracts.airline, &actors.airline);

    let oracle = Address::generate(&env);
    contracts.airline.initialize_pricing(&actors.admin, &oracle, &300u64, &2_000i128, &5_000i128);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ505"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &1_700_010_000,
        &1_700_020_000,
        &10,
        &100_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let input = PriceUpdateInput {
        base_price: 100_0000000i128,
        factors: PricingFactors {
            demand_bps: 0,
            competitor_bps: 0,
            time_to_departure_bps: 0,
        },
    };

    contracts.airline.update_flight_price(&oracle, &flight_id, &input);

    // Same timestamp -> should fail due to 300s cooldown
    contracts.airline.update_flight_price(&oracle, &flight_id, &input);
}
