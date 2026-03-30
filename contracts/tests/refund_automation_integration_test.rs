use soroban_sdk::{testutils::Ledger, Symbol};

mod common;
use common::{generate_actors, initialize_token, new_env, register_contracts};

#[test]
fn test_cancel_booking_full_refund_over_72_hours() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_000_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts
        .refund_automation
        .initialize(&contracts.booking.address);

    let price = 100_0000000i128;
    let departure = env.ledger().timestamp() + (73 * 60 * 60);

    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLFULL"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &departure,
        &price,
        &contracts.token.address,
    );

    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKFULL1");
    contracts
        .refund_automation
        .register_booking(&booking_symbol, &booking_numeric_id);

    let result = contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);

    assert_eq!(result.tier, Symbol::new(&env, "full"));
    assert_eq!(result.passenger_refund, price);
    assert_eq!(result.airline_amount, 0);

    assert_eq!(contracts.token.balance_of(&actors.passenger), price);
    assert_eq!(contracts.token.balance_of(&actors.airline), 0);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);

    let booking = contracts.booking.get_booking(&booking_numeric_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "cancelled"));
}

#[test]
fn test_cancel_booking_partial_refund_between_24_and_72_hours() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_100_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts
        .refund_automation
        .initialize(&contracts.booking.address);

    let price = 100_0000000i128;
    let departure = env.ledger().timestamp() + (48 * 60 * 60);

    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLPART"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &departure,
        &price,
        &contracts.token.address,
    );

    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKPART1");
    contracts
        .refund_automation
        .register_booking(&booking_symbol, &booking_numeric_id);

    let result = contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);

    assert_eq!(result.tier, Symbol::new(&env, "partial"));
    assert_eq!(result.passenger_refund, price / 2);
    assert_eq!(result.airline_amount, price / 2);

    assert_eq!(contracts.token.balance_of(&actors.passenger), price / 2);
    assert_eq!(contracts.token.balance_of(&actors.airline), price / 2);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);
}

#[test]
fn test_cancel_booking_no_refund_below_24_hours() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_200_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts
        .refund_automation
        .initialize(&contracts.booking.address);

    let price = 100_0000000i128;
    let departure = env.ledger().timestamp() + (10 * 60 * 60);

    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLNONE"),
        &Symbol::new(&env, "DXB"),
        &Symbol::new(&env, "DEL"),
        &departure,
        &price,
        &contracts.token.address,
    );

    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKNONE1");
    contracts
        .refund_automation
        .register_booking(&booking_symbol, &booking_numeric_id);

    let result = contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.airline);

    assert_eq!(result.tier, Symbol::new(&env, "no_refund"));
    assert_eq!(result.passenger_refund, 0);
    assert_eq!(result.airline_amount, price);

    assert_eq!(contracts.token.balance_of(&actors.passenger), 0);
    assert_eq!(contracts.token.balance_of(&actors.airline), price);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);
}

#[test]
#[should_panic(expected = "Booking already cancelled")]
fn test_cancel_booking_prevents_double_cancellation() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_300_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts
        .refund_automation
        .initialize(&contracts.booking.address);

    let price = 100_0000000i128;
    let departure = env.ledger().timestamp() + (80 * 60 * 60);

    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLGUARD"),
        &Symbol::new(&env, "BOS"),
        &Symbol::new(&env, "MIA"),
        &departure,
        &price,
        &contracts.token.address,
    );

    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKGUARD");
    contracts
        .refund_automation
        .register_booking(&booking_symbol, &booking_numeric_id);

    contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);

    contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);
}
