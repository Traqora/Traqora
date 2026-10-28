use soroban_sdk::Symbol;

use integration_tests::{
    generate_actors, initialize_token, new_env, register_and_verify_airline, register_contracts,
};

#[test]
fn test_full_booking_and_loyalty_flow() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ300"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &1_900_000_000,
        &1_900_100_000,
        &300,
        &500_0000000i128,
        &Symbol::new(&env, "USDC"),
    );

    let price = 500_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ300"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &1_900_000_000,
        &price,
        &contracts.token.address,
    );

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    contracts.airline.reserve_seat(&actors.airline, &flight_id);

    // Post-flight settlement
    contracts.booking.release_payment_to_airline(&booking_id);
    assert_eq!(contracts.token.balance_of(&actors.airline), price);

    // Loyalty points awarded
    contracts.loyalty.init_loyalty();
    let earned = contracts
        .loyalty
        .award_points(&actors.passenger, &price, &booking_id);
    assert!(earned > 0);
}

#[test]
fn test_refund_policy_integration() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

    contracts
        .refund
        .set_refund_policy(&actors.airline, &86_400, &10_000, &5_000, &3_600);

    // Create a booking scheduled far out so full refund applies
    let price = 200_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ400"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &(env.ledger().timestamp() + 200_000),
        &price,
        &contracts.token.address,
    );
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    // Calculate refund via policy
    let calc = contracts.refund.calculate_refund(
        &actors.airline,
        &price,
        &(env.ledger().timestamp() + 200_000),
    );
    assert_eq!(calc, price);
}

#[test]
fn test_soroban_transaction_envelope_rebuild_and_expiry_flow() {
    use integration_tests::SorobanTransactionEnvelope;

    // Primary path: create an envelope with valid time bounds and sequence
    let mut envelope = SorobanTransactionEnvelope::new(10, 1000, 2000);
    assert!(!envelope.is_expired(15, 1500));
    assert!(!envelope.simulated);

    // Simulate the envelope successfully
    envelope.simulate_and_rebuild(11, 1050, 2050);
    assert!(envelope.simulated);
    assert_eq!(envelope.sequence_number, 11);
    assert_eq!(envelope.time_bounds_min, 1050);
    assert_eq!(envelope.time_bounds_max, 2050);

    // Expiry case 1: ledger sequence exceeds max time bounds / bounds exceeded
    assert!(envelope.is_expired(2100, 1500));
    assert!(envelope.is_expired(11, 2051));
    assert!(envelope.is_expired(11, 1049));

    // Expiry case 2: footprint invalidated directly
    envelope.footprint_valid = false;
    assert!(envelope.is_expired(11, 1500));

    // Retry / re-simulation flow after expiration or invalidation
    envelope.simulate_and_rebuild(12, 1100, 2100);
    assert!(envelope.footprint_valid);
    assert!(!envelope.is_expired(12, 1500));
    assert_eq!(envelope.sequence_number, 12);
}
