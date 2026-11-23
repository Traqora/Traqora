use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

#[test]
fn test_authorized_query_access_by_permitted_actors() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 120_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "BA200"),
        &Symbol::new(&env, "LHR"),
        &Symbol::new(&env, "JFK"),
        &1720000000u64,
        &price,
        &contracts.token.address,
    );

    // 1. Passenger can query
    let b_passenger = contracts
        .booking
        .get_booking_authorized(&actors.passenger, &booking_id)
        .expect("Passenger should be permitted to query");
    assert_eq!(b_passenger.booking_id, booking_id);

    // 2. Airline can query
    let b_airline = contracts
        .booking
        .get_booking_authorized(&actors.airline, &booking_id)
        .expect("Airline should be permitted to query");
    assert_eq!(b_airline.booking_id, booking_id);

    // 3. Oracle can query when configured
    let oracle = Address::generate(&env);
    contracts
        .booking
        .initialize_oracle(&actors.admin, &oracle);

    let b_oracle = contracts
        .booking
        .get_booking_authorized(&oracle, &booking_id)
        .expect("Registered oracle should be permitted to query");
    assert_eq!(b_oracle.booking_id, booking_id);
}

#[test]
#[should_panic(expected = "Unauthorized query access")]
fn test_unauthorized_query_access_rejected() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "AF001"),
        &Symbol::new(&env, "CDG"),
        &Symbol::new(&env, "DXB"),
        &1725000000u64,
        &price,
        &contracts.token.address,
    );

    let stranger = Address::generate(&env);
    contracts
        .booking
        .get_booking_authorized(&stranger, &booking_id);
}

#[test]
#[should_panic(expected = "Unauthorized passenger")]
fn test_cancel_booking_wrapper_rejects_unauthorized_passenger() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "LH400"),
        &Symbol::new(&env, "FRA"),
        &Symbol::new(&env, "EWR"),
        &1726000000u64,
        &price,
        &contracts.token.address,
    );

    let impostor = Address::generate(&env);
    contracts
        .booking
        .cancel_booking(&impostor, &booking_id);
}

#[test]
#[should_panic(expected = "Unauthorized airline")]
fn test_complete_booking_wrapper_rejects_unauthorized_airline() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "SQ321"),
        &Symbol::new(&env, "SIN"),
        &Symbol::new(&env, "LHR"),
        &1727000000u64,
        &price,
        &contracts.token.address,
    );

    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let other_airline = Address::generate(&env);
    contracts
        .booking
        .complete_booking(&other_airline, &booking_id);
}

#[test]
#[should_panic(expected = "Not authorized to cancel")]
fn test_settle_cancellation_rejects_unauthorized_caller() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "KLM101"),
        &Symbol::new(&env, "AMS"),
        &Symbol::new(&env, "JFK"),
        &1728000000u64,
        &price,
        &contracts.token.address,
    );

    let stranger = Address::generate(&env);
    contracts
        .booking
        .settle_cancellation(&booking_id, &stranger, &5000);
}
