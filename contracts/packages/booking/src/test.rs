#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env};

#[test]
fn test_atomic_booking_and_passenger_creation() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(BookingContract, ());
    let client = BookingContractClient::new(&env, &contract_id);

    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    let token_address = Address::generate(&env);

    let booking_id = client.create_booking_with_passenger(
        &passenger,
        &String::from_str(&env, "Alice Doe"),
        &symbol_short!("pass123"),
        &airline,
        &symbol_short!("AB123"),
        &symbol_short!("JFK"),
        &symbol_short!("LAX"),
        &1000000,
        &500,
        &token_address,
    );

    assert_eq!(booking_id, 1);
    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.passenger, passenger);
    assert_eq!(booking.price, 500);
}
