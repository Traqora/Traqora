use soroban_sdk::{testutils::Events, vec, Env, Address, Symbol, IntoVal};
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

    // Verify Booking Created Event
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    let (contract, topics, data) = events.last().unwrap();
    
    assert_eq!(contract, &contract_id);
    assert_eq!(
        topics,
        &vec![&env, Symbol::short(&env, "Booking"), Symbol::short(&env, "create")]
    );
    assert_eq!(data, &booking_id.into_val(&env));
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

    // Verify Booking Cancelled Event
    // Note: create_booking also emits an event, so we expect 2 events total
    let events = env.events().all();
    assert_eq!(events.len(), 2);
    
    let (contract, topics, data) = events.last().unwrap();
    assert_eq!(contract, &contract_id);
    assert_eq!(
        topics,
        &vec![&env, Symbol::short(&env, "Booking"), Symbol::short(&env, "cancel")]
    );
    assert_eq!(data, &booking_id.into_val(&env));
}
