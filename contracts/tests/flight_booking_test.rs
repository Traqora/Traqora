use soroban_sdk::{Symbol};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Env;

use traqora_contracts::flight_booking::{FlightBookingContract, FlightBookingContractClient};

#[test]
fn test_reserve_seat_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let passenger = soroban_sdk::Address::generate(&env);
    let contract_id = env.register(FlightBookingContract, ());
    let client = FlightBookingContractClient::new(&env, &contract_id);

    let flight_id = Symbol::new(&env, "FL-100");
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

    let flight_id = Symbol::new(&env, "FL-100");
    let seat = Symbol::new(&env, "12A");
    client.reserve_seat(&passenger, &flight_id, &seat, &1_000i128);
    client.reserve_seat(&passenger, &flight_id, &seat, &1_000i128);
}
