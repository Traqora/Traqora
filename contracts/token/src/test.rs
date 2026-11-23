use super::*;
use soroban_sdk::{Env, Address};

#[test]
fn test_mint_burn_authorization_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(TraqoraToken, ());
    let client = TraqoraTokenClient::new(&env, &contract_id);

    // 1. Authorized Minting
    client.mint(&admin, &user, &1000);
    // Verify balance or state...

    // 2. Authorized Burning
    client.burn(&user, &400);
    // Verify remaining balance...
}

#[test]
#[should_panic(expected = "HostError")] // Or specific authorization panic in Soroban
fn test_mint_unauthorized_fails() {
    let env = Env::default();
    // Do NOT mock all auths or explicitly test missing auth
    let unauthorized_caller = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(TraqoraToken, ());
    let client = TraqoraTokenClient::new(&env, &contract_id);

    // Attempting to mint without admin authorization should fail
    client.mint(&unauthorized_caller, &user, &1000);
}


#[test]
fn test_booking_pay_and_release_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let client = Address::generate(&env);
    let provider = Address::generate(&env);

    let contract_id = env.register(TraqoraBooking, ());
    let client_contract = TraqoraBookingClient::new(&env, &contract_id);

    // 1. Client pays into escrow
    client_contract.pay(&client, &provider, &5000);

    // 2. Provider releases funds upon completion
    client_contract.release(&provider, &1);
}

#[test]
fn test_booking_pay_and_refund_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let client = Address::generate(&env);
    let provider = Address::generate(&env);

    let contract_id = env.register(TraqoraBooking, ());
    let client_contract = TraqoraBookingClient::new(&env, &contract_id);

    // 1. Client pays into escrow
    client_contract.pay(&client, &provider, &5000);

    // 2. Refund issued to client
    client_contract.refund(&client, &1);
}

#[test]
#[should_panic(expected = "HostError")]
fn test_unauthorized_release_fails() {
    let env = Env::default();
    let client = Address::generate(&env);
    let provider = Address::generate(&env);
    let unauthorized_user = Address::generate(&env);

    let contract_id = env.register(TraqoraBooking, ());
    let client_contract = TraqoraBookingClient::new(&env, &contract_id);

    client_contract.pay(&client, &provider, &5000);

    // Unauthorized user attempting to release funds should panic/fail
    client_contract.release(&unauthorized_user, &1);
}

#[test]
fn test_reserve_and_cancel_seat_happy_path() {
    let env = Env.default();
    env.mock_all_auths();

    let passenger = Address::generate(&env);
    let flight_id = 101_u64;
    let seat_number = 12_u32;

    let contract_id = env.register(TraqoraAirline, ());
    let client = TraqoraAirlineClient::new(&env, &contract_id);

    // 1. Reserve seat
    client.reserve_seat(&passenger, &flight_id, &seat_number);

    // 2. Cancel seat reservation
    client.cancel_seat(&passenger, &flight_id, &seat_number);
}

#[test]
#[should_panic(expected = "HostError")]
fn test_reserve_invalid_seat_number_fails() {
    let env = Env.default();
    env.mock_all_auths();

    let passenger = Address::generate(&env);
    let flight_id = 101_u64;
    let invalid_seat = 999_u32; // Exceeds max seat bounds

    let contract_id = env.register(TraqoraAirline, ());
    let client = TraqoraAirlineClient::new(&env, &contract_id);

    // Attempting to reserve an out-of-bounds seat should panic
    client.reserve_seat(&passenger, &flight_id, &invalid_seat);
}

#[test]
fn test_loyalty_points_and_tier_recalc_happy_path() {
    let env = Env.default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let admin = Address::generate(&env);

    let contract_id = env.register(TraqoraLoyalty, ());
    let client = TraqoraLoyaltyClient::new(&env, &contract_id);

    // 1. Add points
    client.add_points(&user, &6000);

    // 2. Recalculate tier
    let tier = client.recalc_tier(&user);
    assert_eq!(tier, 3); // Gold tier

    // 3. Expire some points
    client.expire_points(&admin, &user, &2000);
}

#[test]
#[should_panic(expected = "HostError")]
fn test_add_zero_points_fails() {
    let env = Env.default();
    env.mock_all_auths();

    let user = Address::generate(&env);

    let contract_id = env.register(TraqoraLoyalty, ());
    let client = TraqoraLoyaltyClient::new(&env, &contract_id);

    // Adding 0 points should panic
    client.add_points(&user, &0);
}