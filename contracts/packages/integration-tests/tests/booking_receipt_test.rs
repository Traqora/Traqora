use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, String, Symbol};

fn init_receipt_contract(env: &Env, contracts: &integration_tests::Contracts, admin: &Address) {
    contracts.booking_receipt.initialize(
        admin,
        &String::from_str(env, "Traqora Receipt"),
        &Symbol::new(env, "TREC"),
    );
}

#[test]
fn test_mint_and_verify_receipt() {
    let env = new_env();
    env.mock_all_auths();
    env.ledger().set_timestamp(1672531200);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    init_receipt_contract(&env, &contracts, &actors.admin);

    let receipt_id = contracts.booking_receipt.mint_receipt(
        &actors.passenger,
        &1001,
        &Symbol::new(&env, "TRQ101"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &String::from_str(&env, "12A"),
        &500_0000000,
    );

    assert_eq!(receipt_id, 1);
    assert_eq!(contracts.booking_receipt.sbt_balance(&actors.passenger), 1);
    assert!(contracts
        .booking_receipt
        .verify_receipt(&actors.passenger, &1));

    let other = Address::generate(&env);
    assert!(!contracts.booking_receipt.verify_receipt(&other, &1));

    let metadata = contracts.booking_receipt.get_receipt_metadata(&1);
    assert_eq!(metadata.booking_id, 1001);
    assert_eq!(metadata.price, 500_0000000);
}

#[test]
fn test_multiple_receipts_per_passenger() {
    let env = new_env();
    env.mock_all_auths();
    env.ledger().set_timestamp(1672531200);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    init_receipt_contract(&env, &contracts, &actors.admin);

    let id1 = contracts.booking_receipt.mint_receipt(
        &actors.passenger,
        &1001,
        &Symbol::new(&env, "FL101"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &String::from_str(&env, "10A"),
        &200_0000000,
    );
    let id2 = contracts.booking_receipt.mint_receipt(
        &actors.passenger,
        &1002,
        &Symbol::new(&env, "FL202"),
        &Symbol::new(&env, "LAX"),
        &Symbol::new(&env, "SFO"),
        &String::from_str(&env, "5B"),
        &150_0000000,
    );

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(contracts.booking_receipt.sbt_balance(&actors.passenger), 2);

    let receipts = contracts
        .booking_receipt
        .get_passenger_receipts(&actors.passenger);
    assert_eq!(receipts.len(), 2);
    assert_eq!(receipts.get(0).unwrap(), 1);
    assert_eq!(receipts.get(1).unwrap(), 2);
}

#[test]
fn test_receipt_metadata_integrity() {
    let env = new_env();
    env.mock_all_auths();
    env.ledger().set_timestamp(1700000000);

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    init_receipt_contract(&env, &contracts, &actors.admin);

    let receipt_id = contracts.booking_receipt.mint_receipt(
        &actors.passenger,
        &42,
        &Symbol::new(&env, "AA789"),
        &Symbol::new(&env, "ORD"),
        &Symbol::new(&env, "MIA"),
        &String::from_str(&env, "22F"),
        &350_0000000,
    );

    let metadata = contracts.booking_receipt.get_receipt_metadata(&receipt_id);
    assert_eq!(metadata.booking_id, 42);
    assert_eq!(metadata.flight_number, Symbol::new(&env, "AA789"));
    assert_eq!(metadata.from_airport, Symbol::new(&env, "ORD"));
    assert_eq!(metadata.to_airport, Symbol::new(&env, "MIA"));
    assert_eq!(metadata.seat, String::from_str(&env, "22F"));
    assert_eq!(metadata.timestamp, 1700000000);
    assert_eq!(metadata.price, 350_0000000);
}

#[test]
#[should_panic(expected = "Not initialized")]
fn test_uninitialized_receipt_fails() {
    let env = new_env();
    env.mock_all_auths();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    contracts.booking_receipt.mint_receipt(
        &actors.passenger,
        &1,
        &Symbol::new(&env, "FL001"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &String::from_str(&env, "1A"),
        &100_0000000,
    );
}

#[test]
fn test_receipt_sbt_interface() {
    let env = new_env();
    env.mock_all_auths();

    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    init_receipt_contract(&env, &contracts, &actors.admin);

    assert_eq!(
        contracts.booking_receipt.sbt_name(),
        String::from_str(&env, "Traqora Receipt")
    );
    assert_eq!(
        contracts.booking_receipt.sbt_symbol(),
        Symbol::new(&env, "TREC")
    );
    assert_eq!(contracts.booking_receipt.sbt_decimals(), 0);
    assert_eq!(
        contracts
            .booking_receipt
            .sbt_allowance(&actors.passenger, &actors.airline),
        0
    );
}
