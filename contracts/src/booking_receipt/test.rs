#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Env, String, Symbol};

fn create_receipt_contract<'a>(env: &Env, admin: &Address) -> BookingReceiptContractClient<'a> {
    let contract_id = env.register_contract(None, BookingReceiptContract);
    let client = BookingReceiptContractClient::new(env, &contract_id);
    client.initialize(admin, &String::from_str(env, "Traqora Receipt"), &Symbol::new(env, "TREC"));
    client
}

#[test]
fn test_mint_receipt() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let passenger = Address::generate(&env);
    
    let client = create_receipt_contract(&env, &admin);
    
    let flight_number = Symbol::new(&env, "TRQ101");
    let from_airport = Symbol::new(&env, "JFK");
    let to_airport = Symbol::new(&env, "LHR");
    let seat = String::from_str(&env, "12A");
    
    env.ledger().set_timestamp(1672531200);

    let receipt_id = client.mint_receipt(
        &passenger,
        &1001,
        &flight_number,
        &from_airport,
        &to_airport,
        &seat,
        &500_0000000,
    );
    
    assert_eq!(receipt_id, 1);
    
    // Check balance
    assert_eq!(client.balance(&passenger), 1);
    
    // Check passenger receipts list
    let receipts = client.get_passenger_receipts(&passenger);
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts.get(0).unwrap(), 1);
    
    // Check metadata
    let metadata = client.get_receipt_metadata(&1);
    assert_eq!(metadata.booking_id, 1001);
    assert_eq!(metadata.flight_number, flight_number);
    assert_eq!(metadata.seat, seat);
    assert_eq!(metadata.price, 500_0000000);
    assert_eq!(metadata.timestamp, 1672531200);
    
    // Check verification
    assert!(client.verify_receipt(&passenger, &1));
    
    // Verify another user does not own it
    let other = Address::generate(&env);
    assert!(!client.verify_receipt(&other, &1));
}

#[test]
#[should_panic(expected = "Non-transferable soulbound token")]
fn test_soulbound_transfer() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let passenger = Address::generate(&env);
    let other = Address::generate(&env);
    
    let client = create_receipt_contract(&env, &admin);
    
    client.mint_receipt(
        &passenger,
        &1001,
        &Symbol::new(&env, "TRQ101"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &String::from_str(&env, "12A"),
        &500_0000000,
    );
    
    client.transfer(&passenger, &other, &1);
}

#[test]
#[should_panic(expected = "Non-transferable soulbound token")]
fn test_soulbound_approve() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let passenger = Address::generate(&env);
    let spender = Address::generate(&env);
    
    let client = create_receipt_contract(&env, &admin);
    
    client.approve(&passenger, &spender, &1, &100);
}

#[test]
fn test_token_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let client = create_receipt_contract(&env, &admin);
    
    assert_eq!(client.name(), String::from_str(&env, "Traqora Receipt"));
    assert_eq!(client.symbol(), Symbol::new(&env, "TREC"));
    assert_eq!(client.decimals(), 0);
}
