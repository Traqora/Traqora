use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

#[test]
fn test_minimum_booking_record_retrieval_and_lifecycle() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 150_0000000i128; // 150 USDC
    let offchain_ref = Symbol::new(&env, "BK789REF");

    // 1. Create booking with reference
    let booking_id = contracts.booking.create_booking_with_reference(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "DL456"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &1710000000u64,
        &price,
        &contracts.token.address,
        &offchain_ref,
    );

    // 2. Query minimum booking record
    let min_record = contracts
        .booking
        .get_minimum_booking_record(&booking_id)
        .expect("Minimum booking record should exist");

    assert_eq!(min_record.booking_id, booking_id);
    assert_eq!(min_record.payer, actors.passenger);
    assert_eq!(min_record.airline, actors.airline);
    assert_eq!(min_record.price, price);
    assert_eq!(min_record.amount_escrowed, 0);
    assert_eq!(min_record.status, Symbol::new(&env, "pending"));
    assert_eq!(min_record.offchain_ref, Some(offchain_ref.clone()));

    // 3. Query reverse lookup by offchain reference
    let resolved_id = contracts
        .booking
        .get_booking_by_offchain_ref(&offchain_ref)
        .expect("Should resolve booking ID by offchain reference");
    assert_eq!(resolved_id, booking_id);

    // 4. Pay for booking and assert escrow balance updates in minimum record
    contracts
        .token
        .mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let paid_record = contracts
        .booking
        .get_minimum_booking_record(&booking_id)
        .unwrap();
    assert_eq!(paid_record.status, Symbol::new(&env, "confirmed"));
    assert_eq!(paid_record.amount_escrowed, price);

    // 5. Release payment and assert final status
    contracts.booking.release_payment_to_airline(&booking_id);

    let completed_record = contracts
        .booking
        .get_minimum_booking_record(&booking_id)
        .unwrap();
    assert_eq!(completed_record.status, Symbol::new(&env, "completed"));
    assert_eq!(completed_record.amount_escrowed, 0);
}

#[test]
fn test_set_offchain_reference_post_creation() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 50_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "AA100"),
        &Symbol::new(&env, "ORD"),
        &Symbol::new(&env, "MIA"),
        &1715000000u64,
        &price,
        &contracts.token.address,
    );

    let initial_record = contracts
        .booking
        .get_minimum_booking_record(&booking_id)
        .unwrap();
    assert_eq!(initial_record.offchain_ref, None);

    let new_ref = Symbol::new(&env, "POSTREF12");
    contracts
        .booking
        .set_offchain_booking_reference(&booking_id, &new_ref);

    let updated_record = contracts
        .booking
        .get_minimum_booking_record(&booking_id)
        .unwrap();
    assert_eq!(updated_record.offchain_ref, Some(new_ref.clone()));

    let by_ref = contracts
        .booking
        .get_booking_by_offchain_ref(&new_ref)
        .unwrap();
    assert_eq!(by_ref, booking_id);
}
