
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
    

}
