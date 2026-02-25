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
    
    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "pending"));
    assert_eq!(booking.amount_escrowed, 0);
    
    // 2. Mint tokens to passenger and Pay
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
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
    
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    
    // Refund passenger
    contracts.booking.refund_passenger(&booking_id);
    
    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "refunded"));
    assert_eq!(booking.amount_escrowed, 0);
}

mod common;
use common::{generate_actors, initialize_token, new_env, register_contracts};

use soroban_sdk::{testutils::Ledger, Symbol};
