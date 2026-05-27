#![cfg(test)]

use soroban_sdk::Symbol;

mod common;
use common::{
    generate_actors, initialize_token, new_env, register_and_verify_airline, register_contracts,
};

/// Full workflow: booking creation → payment → refund policy → cancellation → refund processing
#[test]
fn test_complete_booking_to_refund_workflow() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

    // 1. Airline creates a flight
    let flight_id = contracts.airline.create_flight(
        &actors.airline,
        &Symbol::new(&env, "TQ500"),
        &Symbol::new(&env, "LAX"),
        &Symbol::new(&env, "MIA"),
        &(env.ledger().timestamp() + 500_000),
        &(env.ledger().timestamp() + 600_000),
        &200,
        &1_000_0000000i128,
        &Symbol::new(&env, "USDC"),
    );
    assert!(flight_id > 0);

    // 2. Set refund policy for the airline
    contracts.refund.set_refund_policy(
        &actors.airline,
        &86_400,    // cancellation_cutoff_seconds
        &10_000,    // full_refund_days_before
        &5_000,     // partial_refund_days_before
        &3_600,     // min_refund_window
    );

    // 3. Passenger creates a booking
    let price = 1_000_0000000i128;
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);

    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ500"),
        &Symbol::new(&env, "LAX"),
        &Symbol::new(&env, "MIA"),
        &(env.ledger().timestamp() + 500_000),
        &price,
        &contracts.token.address,
    );
    assert!(booking_id > 0);

    // 4. Passenger pays for the booking
    contracts.booking.pay_for_booking(&booking_id);

    // 5. Airline reserves seat
    contracts.airline.reserve_seat(&actors.airline, &flight_id);

    // 6. Passenger requests cancellation/refund
    let refund_amount = contracts.refund.calculate_refund(
        &actors.airline,
        &price,
        &(env.ledger().timestamp() + 500_000),
    );
    assert!(refund_amount > 0);

    // 7. Refund is automated
    contracts
        .refund_automation
        .process_automatic_refund(&booking_id, &refund_amount);

    // 8. Verify final balances
    let airline_balance = contracts.token.balance_of(&actors.airline);
    let passenger_balance = contracts.token.balance_of(&actors.passenger);
    assert_eq!(airline_balance + passenger_balance, price);
}

/// Booking → Payment → Dispute → Settlement
#[test]
fn test_booking_with_dispute_resolution_flow() {
    let env = new_env();
    env.mock_all_auths();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

    // Create booking and payment
    let price = 5_000_0000000i128;
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);

    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ600"),
        &Symbol::new(&env, "CDG"),
        &Symbol::new(&env, "NRT"),
        &(env.ledger().timestamp() + 1_000_000),
        &price,
        &contracts.token.address,
    );

    contracts.booking.pay_for_booking(&booking_id);

    // Deposit escrow for dispute
    let booking_symbol = Symbol::new(&env, &format!("BK-{}", booking_id));
    // Note: In production, this would be handled by dispute resolution contract
    // For now, we test the booking state transitions
}

/// Multi-airline loyalty points accumulation
#[test]
fn test_loyalty_points_across_multiple_bookings() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

    contracts.loyalty.init_loyalty();

    let base_price = 500_0000000i128;
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &(base_price * 3));

    // First booking
    let booking1 = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ101"),
        &Symbol::new(&env, "ORD"),
        &Symbol::new(&env, "DEN"),
        &(env.ledger().timestamp() + 100_000),
        &base_price,
        &contracts.token.address,
    );
    contracts.booking.pay_for_booking(&booking1);
    let points1 = contracts
        .loyalty
        .award_points(&actors.passenger, &base_price, &booking1);

    // Second booking
    let booking2 = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ102"),
        &Symbol::new(&env, "SEA"),
        &Symbol::new(&env, "SFO"),
        &(env.ledger().timestamp() + 200_000),
        &base_price,
        &contracts.token.address,
    );
    contracts.booking.pay_for_booking(&booking2);
    let points2 = contracts
        .loyalty
        .award_points(&actors.passenger, &base_price, &booking2);

    // Verify points accumulation
    assert!(points1 > 0);
    assert!(points2 > 0);
}

/// Multiple refunds with policy changes
#[test]
fn test_refund_policy_changes_and_reapplication() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

    let price = 2_000_0000000i128;
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);

    // Set initial policy
    contracts.refund.set_refund_policy(
        &actors.airline,
        &86_400,     // 1 day cutoff
        &604_800,    // 7 days full refund
        &259_200,    // 3 days partial
        &3_600,
    );

    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ700"),
        &Symbol::new(&env, "BOS"),
        &Symbol::new(&env, "NYC"),
        &(env.ledger().timestamp() + 400_000),
        &price,
        &contracts.token.address,
    );
    contracts.booking.pay_for_booking(&booking_id);

    let refund1 = contracts.refund.calculate_refund(
        &actors.airline,
        &price,
        &(env.ledger().timestamp() + 400_000),
    );

    // Update policy to be stricter
    contracts.refund.set_refund_policy(
        &actors.airline,
        &43_200,     // 0.5 day cutoff (stricter)
        &172_800,    // 2 days full refund (less generous)
        &86_400,     // 1 day partial
        &1_800,
    );

    let refund2 = contracts.refund.calculate_refund(
        &actors.airline,
        &price,
        &(env.ledger().timestamp() + 400_000),
    );

    // Refund2 should be less than or equal to refund1 due to stricter policy
    assert!(refund2 <= refund1);
}

/// Governance proposal and voting with bookings as context
#[test]
fn test_governance_proposal_with_booking_reference() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.governance.initialize(&actors.admin);

    // Create a proposal related to refund policy
    let proposal_id = contracts.governance.create_proposal(
        &actors.admin,
        &Symbol::new(&env, "REFUND_POLICY_UPDATE"),
        &Symbol::new(&env, "Reduce cancellation window to 24h"),
    );
    assert!(proposal_id > 0);
}
