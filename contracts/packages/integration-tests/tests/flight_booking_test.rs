use flight_booking::{FlightBookingContract, FlightBookingContractClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env, Symbol,
};

#[test]
fn test_reserve_seat_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let passenger = soroban_sdk::Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);

    let flight_id = Symbol::new(&env, "FL100");
    let seat = Symbol::new(&env, "12A");
    let booking_id = client.reserve_seat(&passenger, &flight_id, &seat, &1_000i128);

    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.booking_id, booking_id);
    assert_eq!(booking.flight_id, flight_id);
    assert_eq!(booking.seat, seat);
    assert_eq!(booking.escrowed_amount, 1_000i128);
}

#[test]
#[should_panic(expected = "Seat already reserved")]
fn test_double_booking_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let passenger = soroban_sdk::Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);

    let flight_id = Symbol::new(&env, "FL100");
    let seat = Symbol::new(&env, "12A");
    client.reserve_seat(&passenger, &flight_id, &seat, &1_000i128);
    client.reserve_seat(&passenger, &flight_id, &seat, &1_000i128);
}

#[test]
fn test_init_upgrade_owner_for_flight_booking() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);

    client.init_upgrade_owner(&owner);
}

// ─── Double booking edge cases ─────────────────────────────────────────────

#[test]
fn test_double_booking_different_seat_same_flight_ok() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let flight_id = Symbol::new(&env, "FLEDGE");
    let seat_a = Symbol::new(&env, "12A");
    let seat_b = Symbol::new(&env, "12B");
    let id_a = client.reserve_seat(&passenger, &flight_id, &seat_a, &1_000);
    let id_b = client.reserve_seat(&passenger, &flight_id, &seat_b, &1_000);
    assert_ne!(id_a, id_b);
    assert_eq!(client.get_booking(&id_a).unwrap().seat, seat_a);
    assert_eq!(client.get_booking(&id_b).unwrap().seat, seat_b);
}

#[test]
fn test_double_booking_same_seat_different_flight_ok() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let seat = Symbol::new(&env, "12A");
    let flight_a = Symbol::new(&env, "FLA");
    let flight_b = Symbol::new(&env, "FLB");
    let id_a = client.reserve_seat(&passenger, &flight_a, &seat, &500);
    let id_b = client.reserve_seat(&passenger, &flight_b, &seat, &500);
    assert_ne!(id_a, id_b);
}

// ─── Cancelled flights ─────────────────────────────────────────────────────
// Contract has no explicit cancellation, but state is Confirmed on creation
// and must remain deterministic (not Cancelled/Refunded).

#[test]
fn test_cancelled_flight_state_is_confirmed_not_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let flight_id = Symbol::new(&env, "FLCANCEL");
    let seat = Symbol::new(&env, "10A");
    let booking_id = client.reserve_seat(&passenger, &flight_id, &seat, &2_000);
    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.state, flight_booking::BookingState::Confirmed);
    assert_ne!(booking.state, flight_booking::BookingState::Cancelled);
    assert_ne!(booking.state, flight_booking::BookingState::Refunded);
}

#[test]
fn test_cancelled_flight_seat_still_reserved() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let flight_id = Symbol::new(&env, "FLCANCEL2");
    let seat = Symbol::new(&env, "11A");
    client.reserve_seat(&passenger, &flight_id, &seat, &1_000);
    // Seat remains reserved even if flight conceptually cancelled — deterministic
    let res = client.try_reserve_seat(&passenger, &flight_id, &seat, &1_000);
    assert!(res.is_err());
}

// ─── Non-existent flight ids ───────────────────────────────────────────────

#[test]
fn test_non_existent_flight_get_returns_none() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    assert!(client.get_booking(&999).is_none());
    assert!(client.get_booking(&0).is_none());
    assert!(client.get_booking(&u64::MAX).is_none());
}

#[test]
fn test_non_existent_flight_reserve_succeeds_and_is_retrievable() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let unknown_flight = Symbol::new(&env, "UNKNOWN9999");
    let seat = Symbol::new(&env, "9Z");
    let booking_id = client.reserve_seat(&passenger, &unknown_flight, &seat, &750);
    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.flight_id, unknown_flight);
    assert_eq!(booking.seat, seat);
}

// ─── Capacity overflow ─────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Invalid amount")]
fn test_capacity_overflow_zero_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    client.reserve_seat(&passenger, &Symbol::new(&env, "FLCAP"), &Symbol::new(&env, "1A"), &0);
}

#[test]
#[should_panic(expected = "Invalid amount")]
fn test_capacity_overflow_negative_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    client.reserve_seat(&passenger, &Symbol::new(&env, "FLCAP"), &Symbol::new(&env, "1B"), &-1);
}

#[test]
fn test_capacity_overflow_large_amount_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let large = i128::MAX / 2;
    let booking_id = client.reserve_seat(
        &passenger,
        &Symbol::new(&env, "FLLARGE"),
        &Symbol::new(&env, "1A"),
        &large,
    );
    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.amount, large);
    assert_eq!(booking.escrowed_amount, large);
}

#[test]
fn test_capacity_overflow_booking_id_increments_deterministically() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let flight_id = Symbol::new(&env, "FLINC");
    let seats = [
        Symbol::new(&env, "1A"),
        Symbol::new(&env, "1B"),
        Symbol::new(&env, "1C"),
        Symbol::new(&env, "1D"),
        Symbol::new(&env, "1E"),
    ];
    let mut last_id = 0;
    for (idx, seat) in seats.iter().enumerate() {
        let id = client.reserve_seat(&passenger, &flight_id, seat, &1_000);
        assert_eq!(id, (idx as u64) + 1);
        last_id = id;
    }
    assert_eq!(last_id, 5);
    let next = client.reserve_seat(
        &passenger,
        &Symbol::new(&env, "FLOTHER"),
        &Symbol::new(&env, "9Z"),
        &1_000,
    );
    assert_eq!(next, 6);
}

#[test]
fn test_capacity_overflow_many_seats_same_flight() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let flight_id = Symbol::new(&env, "FLCAP");
    let seats = [
        Symbol::new(&env, "1A"),
        Symbol::new(&env, "1B"),
        Symbol::new(&env, "1C"),
        Symbol::new(&env, "1D"),
        Symbol::new(&env, "1E"),
        Symbol::new(&env, "2A"),
        Symbol::new(&env, "2B"),
        Symbol::new(&env, "2C"),
        Symbol::new(&env, "2D"),
        Symbol::new(&env, "2E"),
    ];
    for seat in seats.iter() {
        let id = client.reserve_seat(&passenger, &flight_id, seat, &500);
        assert_eq!(client.get_booking(&id).unwrap().flight_id, flight_id);
    }
    assert_eq!(client.get_booking(&10).unwrap().booking_id, 10);
}

// ─── Auth failure paths ────────────────────────────────────────────────────

#[test]
fn test_auth_failure_without_mock_all_auths() {
    let env = Env::default();
    // Do NOT mock auths — require_auth must fail
    let passenger = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let res = client.try_reserve_seat(
        &passenger,
        &Symbol::new(&env, "FLAUTH"),
        &Symbol::new(&env, "12A"),
        &1_000,
    );
    assert!(res.is_err(), "should fail without auth");
}

#[test]
fn test_auth_failure_seat_taken_by_other_passenger_still_blocked() {
    let env = Env::default();
    env.mock_all_auths();
    let passenger = Address::generate(&env);
    let other = Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);
    let flight_id = Symbol::new(&env, "FLAUTH2");
    let seat = Symbol::new(&env, "12A");
    let id = client.reserve_seat(&passenger, &flight_id, &seat, &1_000);
    let booking = client.get_booking(&id).unwrap();
    assert_eq!(booking.passenger, passenger);
    assert_ne!(booking.passenger, other);
    let res = client.try_reserve_seat(&other, &flight_id, &seat, &1_000);
    assert!(res.is_err());
}

#[test]
fn test_deterministic_same_inputs_same_sequence() {
    for _ in 0..3 {
        let env = Env::default();
        env.mock_all_auths();
        let passenger = Address::generate(&env);
        let contract_id = env.register(FlightBookingContract, ());
        let client = FlightBookingContractClient::new(&env, &contract_id);
        env.ledger().set_timestamp(1_000);
        let flight_id = Symbol::new(&env, "FLDET");
        let seat = Symbol::new(&env, "10A");
        let id1 = client.reserve_seat(&passenger, &flight_id, &seat, &1_000);
        assert_eq!(id1, 1);
        // capture event before view call (view may affect event buffer)
        let events_len = env.events().all().len();
        assert_eq!(events_len, 1, "BookingCreated event should be emitted");
        let booking = client.get_booking(&id1).unwrap();
        assert_eq!(booking.created_at, 1_000);
        assert_eq!(booking.state, flight_booking::BookingState::Confirmed);
    }
}
