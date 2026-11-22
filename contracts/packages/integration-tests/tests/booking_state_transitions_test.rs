use booking::{BookingContract, BookingContractClient};
use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
use soroban_sdk::{testutils::Ledger, Address, Env, Symbol};
use token::{TRQTokenContract, TRQTokenContractClient};

#[test]
fn test_booking_full_lifecycle_completed_path() {
    let env = new_env();
    env.ledger().set_timestamp(1700000000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 250_0000000i128;
    let departure_time = 1750000000u64;

    // 1. Initial State: Pending
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL999"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &departure_time,
        &price,
        &contracts.token.address,
    );

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "pending"));
    assert_eq!(booking.amount_escrowed, 0);

    // 2. Transition: Pending -> Confirmed (via payment)
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "confirmed"));
    assert_eq!(booking.amount_escrowed, price);

    // 3. Transition: Confirmed -> Completed (via release to airline)
    contracts.booking.release_payment_to_airline(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "completed"));
    assert_eq!(booking.amount_escrowed, 0);
}

#[test]
fn test_booking_full_lifecycle_refunded_path() {
    let env = new_env();
    env.ledger().set_timestamp(1700000000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 150_0000000i128;
    let departure_time = 1750000000u64;

    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL888"),
        &Symbol::new(&env, "LHR"),
        &Symbol::new(&env, "JFK"),
        &departure_time,
        &price,
        &contracts.token.address,
    );

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "confirmed"));

    // Transition: Confirmed -> Refunded
    contracts.booking.refund_passenger(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "refunded"));
    assert_eq!(booking.amount_escrowed, 0);
}

#[test]
#[should_panic(expected = "Invalid booking status")]
fn test_rejected_transition_release_unpaid_pending_booking() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL777"),
        &Symbol::new(&env, "CDG"),
        &Symbol::new(&env, "JFK"),
        &1750000000,
        &price,
        &contracts.token.address,
    );

    // Attempting to release escrow on a 'pending' (unpaid) booking should be rejected
    contracts.booking.release_payment_to_airline(&booking_id);
}

#[test]
#[should_panic(expected = "Already paid or cancelled")]
fn test_rejected_transition_double_payment() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL666"),
        &Symbol::new(&env, "HND"),
        &Symbol::new(&env, "NRT"),
        &1750000000,
        &price,
        &contracts.token.address,
    );

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &(price * 2));

    // First payment succeeds (pending -> confirmed)
    contracts.booking.pay_for_booking(&booking_id);

    // Second payment on confirmed booking must be rejected
    contracts.booking.pay_for_booking(&booking_id);
}
