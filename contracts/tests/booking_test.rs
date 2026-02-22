use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, Symbol, String};
use traqora_contracts::booking::{BookingContract, BookingContractClient};
use traqora_contracts::token::{TRQTokenContract, TRQTokenContractClient};

fn setup_test(env: &Env) -> (BookingContractClient<'static>, TRQTokenContractClient<'static>, Address, Address, Address, Address) {
    let admin = Address::generate(env);
    let passenger = Address::generate(env);
    let airline = Address::generate(env);
    
    // Register and initialize token
    let token_id = env.register(TRQTokenContract, ());
    let token_client = TRQTokenContractClient::new(env, &token_id);
    token_client.initialize(
        &admin,
        &String::from_str(env, "USDC"),
        &Symbol::new(env, "USDC"),
        &7,
    );
    
    // Register booking contract
    let booking_id = env.register(BookingContract, ());
    let booking_client = BookingContractClient::new(env, &booking_id);
    
    (booking_client, token_client, passenger, airline, token_id, admin)
}

#[test]
fn test_payment_escrow_flow() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (booking_client, token_client, passenger, airline, token_id, admin) = setup_test(&env);
    
    let price = 100_0000000i128; // 100 USDC
    
    // 1. Create booking
    let booking_id = booking_client.create_booking(
        &passenger,
        &airline,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1704067200,
        &price,
        &token_id,
    );
    
    let booking = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "pending"));
    assert_eq!(booking.amount_escrowed, 0);
    
    // 2. Mint tokens to passenger and Pay
    token_client.mint(&admin, &passenger, &price);
    booking_client.pay_for_booking(&booking_id);
    
    let booking = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "confirmed"));
    assert_eq!(booking.amount_escrowed, price);
    
    // Verify contract holds the tokens
    assert_eq!(token_client.balance_of(&booking_client.address), price);
    assert_eq!(token_client.balance_of(&passenger), 0);
    
    // 3. Complete flight and release payment
    booking_client.complete_booking(&airline, &booking_id);
    
    let booking = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "completed"));
    assert_eq!(booking.amount_escrowed, 0);
    
    // Verify airline received the tokens
    assert_eq!(token_client.balance_of(&airline), price);
    assert_eq!(token_client.balance_of(&booking_client.address), 0);
}

#[test]
fn test_refund_flow() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1700000000);
    
    let (booking_client, token_client, passenger, airline, token_id, admin) = setup_test(&env);
    
    let price = 100_0000000i128;
    let departure_time = 1705000000; // Far in the future
    
    let booking_id = booking_client.create_booking(
        &passenger,
        &airline,
        &Symbol::new(&env, "FL123"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &departure_time,
        &price,
        &token_id,
    );
    
    token_client.mint(&admin, &passenger, &price);
    booking_client.pay_for_booking(&booking_id);
    
    // Refund passenger
    booking_client.refund_passenger(&booking_id);
    
    let booking = booking_client.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "refunded"));
    assert_eq!(booking.amount_escrowed, 0);
    
    // Verify passenger got tokens back
    assert_eq!(token_client.balance_of(&passenger), price);
    assert_eq!(token_client.balance_of(&booking_client.address), 0);
}
