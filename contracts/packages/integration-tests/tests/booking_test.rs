use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
use soroban_sdk::{testutils::Ledger, Symbol};

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

    let booking = contracts
        .booking
        .get_booking(&actors.passenger, &booking_id)
        .unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "pending"));
    assert_eq!(booking.amount_escrowed, 0);

    // 2. Mint tokens to passenger and Pay
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let booking = contracts
        .booking
        .get_booking(&actors.passenger, &booking_id)
        .unwrap();
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

    let booking = contracts
        .booking
        .get_booking(&actors.passenger, &booking_id)
        .unwrap();
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

    let booking = contracts
        .booking
        .get_booking(&actors.passenger, &booking_id)
        .unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "refunded"));
    assert_eq!(booking.amount_escrowed, 0);
}

#[test]
fn test_booking_pagination() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 10_0000000i128;
    for i in 0..5 {
        contracts.booking.create_booking(
            &actors.passenger,
            &actors.airline,
            &Symbol::new(&env, "FL123"),
            &Symbol::new(&env, "JFK"),
            &Symbol::new(&env, "LAX"),
            &1704067200 + i,
            &price,
            &contracts.token.address,
        );
    }

    let page1 = contracts.booking.get_paginated_bookings(&1, &2);
    assert_eq!(page1.len(), 2);
    assert_eq!(page1.get(0).unwrap().booking_id, 1);
    assert_eq!(page1.get(1).unwrap().booking_id, 2);

    let page2 = contracts.booking.get_paginated_bookings(&3, &2);
    assert_eq!(page2.len(), 2);
    assert_eq!(page2.get(0).unwrap().booking_id, 3);
    assert_eq!(page2.get(1).unwrap().booking_id, 4);

    let passenger_page =
        contracts
            .booking
            .get_passenger_bookings_paginated(&actors.passenger, &0, &3);
    assert_eq!(passenger_page.len(), 3);
    assert_eq!(passenger_page.get(0).unwrap().booking_id, 1);
    assert_eq!(passenger_page.get(2).unwrap().booking_id, 3);
}

#[test]
#[should_panic(expected = "Limit too large")]
fn test_booking_pagination_limit_too_large_should_panic() {
    let env = new_env();
    let contracts = register_contracts(&env);
    contracts.booking.get_paginated_bookings(&1, &101);
}
