use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
use soroban_sdk::{testutils::Ledger, Symbol};

#[test]
fn test_payment_transaction_finality_validation() {
    let env = new_env();
    env.mock_all_auths();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let client = booking::Client::new(&env, &contracts.booking);
    let booking_id = client.create_booking(
        &actors.traveler,
        &actors.airline,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &1000000000,
        &contracts.token,
    );

    let token_client = token::Client::new(&env, &contracts.token);
    token_client.mint(&actors.admin, &actors.traveler, &1000000000);

    // Attempt payment before transferring tokens to escrow (verifying finality failure path)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.pay_for_booking(&booking_id);
    }));
    assert!(
        result.is_err(),
        "Payment without transferred funds should fail finality verification"
    );

    // Now transfer funds properly for normal path
    token_client.transfer(&actors.traveler, &contracts.booking, &1000000000);
    client.pay_for_booking(&booking_id);

    let b = client.get_booking(&booking_id);
    assert_eq!(b.status, BookingStatus::Confirmed);
}

#[test]
fn test_payment_escrow_flow() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128; // 100 USDC

    // 1. Create booking
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
        &contracts.token.address,
    );

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "pending"));
    assert_eq!(booking.amount_escrowed, 0);

    // 2. Mint tokens to passenger and Pay
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "confirmed"));
    assert_eq!(booking.amount_escrowed, price);
    assert_eq!(contracts.token.balance_of(&actors.passenger), 0);
    assert_eq!(
        contracts.token.balance_of(&contracts.booking.address),
        price
    );
    assert_eq!(contracts.token.balance_of(&actors.airline), 0);

    // 3. Release escrow to the airline after fulfillment.
    contracts.booking.release_payment_to_airline(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "completed"));
    assert_eq!(booking.amount_escrowed, 0);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);
    assert_eq!(contracts.token.balance_of(&actors.airline), price);
}

#[test]
fn test_refund_flow() {
    let env = new_env();
    env.ledger().set_timestamp(1700000000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let departure_time = 1705000000; // Far in the future

    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &departure_time,
        &price,
        &contracts.token.address,
    );

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    // Refund passenger
    contracts.booking.refund_passenger(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "refunded"));
    assert_eq!(booking.amount_escrowed, 0);

    let audits = contracts.booking.get_audits();
    assert_eq!(audits.len(), 2); // pay and refund
    assert_eq!(audits.get(1).unwrap().booking_id, booking_id);
    assert_eq!(audits.get(1).unwrap().actor, actors.passenger);
    assert_eq!(
        audits.get(1).unwrap().previous_status,
        Symbol::new(&env, "confirmed")
    );
    assert_eq!(
        audits.get(1).unwrap().new_status,
        Symbol::new(&env, "refunded")
    );
}

#[test]
#[should_panic(expected = "Invalid booking price")]
fn test_create_booking_atomic_validation_failure_zero_price() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    // Zero price should fail validation and leave no booking or partial records
    contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL000"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &0,
        &contracts.token.address,
    );
}

#[test]
#[should_panic(expected = "Invalid booking price")]
fn test_create_booking_atomic_validation_failure_negative_price() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    // Negative price should fail validation atomically
    contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL000"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &-100,
        &contracts.token.address,
    );
}
