use soroban_sdk::{Env, Address, Symbol};
use crate::booking::{BookingContract, Booking};

#[test]
fn test_create_booking() {
    let env = Env::default();
    let contract_id = env.register_contract(None, BookingContract);
    let client = BookingContractClient::new(&env, &contract_id);
    
    let passenger = Address::random(&env);
    let airline = Address::random(&env);
    
    let booking_id = client.create_booking(
        &passenger,
        &airline,
        &Symbol::short(&env, "FL123"),
        &Symbol::short(&env, "JFK"),
        &Symbol::short(&env, "LAX"),
        &1704067200, // 2024-01-01 00:00:00 UTC
        &45000, // $450.00
        &Symbol::short(&env, "USDC"),
    );
    
    assert!(booking_id > 0);
    
    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.passenger, passenger);
    assert_eq!(booking.airline, airline);
    assert_eq!(booking.status, Symbol::short(&env, "confirmed"));
}

#[test]
fn test_cancel_booking() {
    let env = Env::default();
    env.ledger().set_timestamp(1700000000); // Set current time
    
    let contract_id = env.register_contract(None, BookingContract);
    let client = BookingContractClient::new(&env, &contract_id);
    
    let passenger = Address::random(&env);
    let airline = Address::random(&env);
    
    // Departure time is far in the future
    let departure_time = 1705000000;
    
    let booking_id = client.create_booking(
        &passenger,
        &airline,
        &Symbol::short(&env, "FL123"),
        &Symbol::short(&env, "JFK"),
        &Symbol::short(&env, "LAX"),
        &departure_time,
        &45000,
        &Symbol::short(&env, "USDC"),
    );
    
    client.cancel_booking(&passenger, &booking_id);
    
    let booking = client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::short(&env, "cancelled"));
}
