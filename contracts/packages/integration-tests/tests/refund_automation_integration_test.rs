use soroban_sdk::{testutils::Ledger, Symbol};

use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};

#[test]
fn test_cancel_booking_full_refund_over_72_hours() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_000_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

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

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKFULL1");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );

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
fn test_refund_automation_idempotency_and_replay_after_retry() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_500_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

    let price = 200_0000000i128;
    let departure = env.ledger().timestamp() + (75 * 60 * 60);

    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLIDEM"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &departure,
        &price,
        &contracts.token.address,
    );

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKIDEM1");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );

    // First invocation: processes the full refund successfully
    let first_result = contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);

    assert_eq!(first_result.tier, Symbol::new(&env, "full"));
    assert_eq!(first_result.passenger_refund, price);
    assert_eq!(contracts.token.balance_of(&actors.passenger), price);

    // Second invocation (retry / replay with same booking symbol / job id): should be idempotent and safe
    let second_result = contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);

    assert_eq!(second_result.tier, Symbol::new(&env, "full"));
    assert_eq!(second_result.passenger_refund, price);

    // Verify funds were not double-transferred (passenger balance remains exactly `price`, not doubled)
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

    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

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

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKPART1");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );

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

    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

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

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKNONE1");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );

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

    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

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

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKGUARD");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );

    contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);

    contracts
        .refund_automation
        .cancel_booking(&booking_symbol, &actors.passenger);
}

#[test]
fn test_automate_refund_uses_configured_refund_policy() {
    let env = new_env();
    env.ledger().set_timestamp(1_701_000_000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.refund.initialize(&actors.admin);
    contracts.refund.set_refund_policy(
        &actors.airline,
        &1_000,
        &8_000,
        &2_500,
        &100,
    );
    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

    let price = 100_0000000i128;
    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLPOL"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &(env.ledger().timestamp() + 500),
        &price,
        &contracts.token.address,
    );
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKPOL1");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );
    let result = contracts.refund_automation.automate_refund(
        &actors.passenger,
        &booking_symbol,
        &Symbol::new(&env, "schedule_change"),
    );

    assert_eq!(result.tier, Symbol::new(&env, "partial"));
    assert_eq!(result.passenger_refund, price / 4);
    assert_eq!(result.airline_amount, price * 3 / 4);
    assert_eq!(contracts.token.balance_of(&actors.passenger), price / 4);
    assert_eq!(contracts.token.balance_of(&actors.airline), price * 3 / 4);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);

    let request = contracts.refund.get_refund_request(&1).unwrap();
    assert_eq!(request.booking_id, booking_numeric_id);
    assert_eq!(request.passenger, actors.passenger);
    assert_eq!(request.amount, price / 4);
    assert_eq!(request.reason, Symbol::new(&env, "schedule_change"));
}

#[test]
fn test_automate_refund_without_policy_keeps_booking_escrowed() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.refund.initialize(&actors.admin);
    contracts.refund_automation.initialize(
        &actors.admin,
        &contracts.booking.address,
        &contracts.refund.address,
    );

    let price = 50_0000000i128;
    let booking_numeric_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FLNOPOL"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &(env.ledger().timestamp() + 10_000),
        &price,
        &contracts.token.address,
    );
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_numeric_id);

    let booking_symbol = Symbol::new(&env, "BKNOPOL");
    contracts.refund_automation.register_booking(
        &actors.admin,
        &booking_symbol,
        &booking_numeric_id,
    );

    let result = contracts.refund_automation.try_automate_refund(
        &actors.passenger,
        &booking_symbol,
        &Symbol::new(&env, "schedule_change"),
    );
    assert!(result.is_err());

    let booking = contracts.booking.get_booking(&booking_numeric_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "confirmed"));
    assert_eq!(booking.amount_escrowed, price);
    assert_eq!(contracts.token.balance_of(&actors.passenger), 0);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), price);
    assert_eq!(contracts.refund_automation.is_cancelled(&booking_symbol), false);
}
