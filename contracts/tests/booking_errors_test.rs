use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use traqora_contracts::booking::{BookingContract, BookingContractClient};
use traqora_contracts::token::{TRQTokenContract, TRQTokenContractClient};

mod common;
use common::{new_env, generate_actors, register_contracts, initialize_token};

#[test]
fn test_pay_for_booking_then_success() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    // Create booking
    let price = 100_0000000i128;
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

    // Pay once
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    // Status now confirmed; next test covers panic on second payment
}

#[test]
#[should_panic(expected = "Already paid or cancelled")]
fn test_pay_for_booking_again_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    let price = 100_0000000i128;
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
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    contracts.booking.pay_for_booking(&booking_id);
}

#[test]
#[should_panic(expected = "Booking not found")]
fn test_pay_for_booking_nonexistent_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    contracts.booking.pay_for_booking(&123456789u64);
}

#[test]
#[should_panic(expected = "Invalid booking status")]
fn test_release_payment_invalid_status_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 50_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL321"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &1705067200,
        &price,
        &contracts.token.address,
    );

    contracts.booking.release_payment_to_airline(&booking_id);
}

#[test]
fn test_release_payment_success() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 50_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL321"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &1705067200,
        &price,
        &contracts.token.address,
    );

    // Confirm but no funds (no mint/transfer) -> will panic inside token client, but simulate correct flow
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    // Release successfully
    contracts
        .booking
        .release_payment_to_airline(&booking_id);
    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "completed"));
    assert_eq!(booking.amount_escrowed, 0);
}

#[test]
fn test_refund_passenger_window_and_status_checks() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 25_0000000i128;
    // Set departure time far ahead to keep window open
    let departure = 2_000_000_000u64;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL777"),
        &Symbol::new(&env, "DXB"),
        &Symbol::new(&env, "DEL"),
        &departure,
        &price,
        &contracts.token.address,
    );

    // Pending -> refundable, but amount_escrowed = 0
    contracts.booking.refund_passenger(&booking_id);
    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "refunded"));
    assert_eq!(booking.amount_escrowed, 0);

    // Reset to confirmed with escrow to test transfer
    let booking_id2 = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL778"),
        &Symbol::new(&env, "DXB"),
        &Symbol::new(&env, "DEL"),
        &departure,
        &price,
        &contracts.token.address,
    );
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id2);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), price);
    contracts.booking.refund_passenger(&booking_id2);
    assert_eq!(contracts.token.balance_of(&actors.passenger), price);
    assert_eq!(contracts.token.balance_of(&contracts.booking.address), 0);

}

#[test]
#[should_panic]
fn test_refund_passenger_window_closed_should_panic() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);
    let price = 25_0000000i128;
    let booking_id3 = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL779"),
        &Symbol::new(&env, "DXB"),
        &Symbol::new(&env, "DEL"),
        &1_000, // very soon relative to current timestamp
        &price,
        &contracts.token.address,
    );
    contracts.booking.refund_passenger(&booking_id3);
}

#[test]
fn test_cancel_and_complete_wrappers() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 80_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL999"),
        &Symbol::new(&env, "NRT"),
        &Symbol::new(&env, "ICN"),
        &2_000_000_000,
        &price,
        &contracts.token.address,
    );

    // Cancel wrapper (pending -> refunded)
    contracts.booking.cancel_booking(&actors.passenger, &booking_id);
    let b = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(b.status, Symbol::new(&env, "refunded"));

    // Complete wrapper path
    let booking_id2 = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL1000"),
        &Symbol::new(&env, "NRT"),
        &Symbol::new(&env, "ICN"),
        &2_000_000_000,
        &price,
        &contracts.token.address,
    );
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id2);
    contracts.booking.complete_booking(&actors.airline, &booking_id2);
    let b2 = contracts.booking.get_booking(&booking_id2).unwrap();
    assert_eq!(b2.status, Symbol::new(&env, "completed"));
}
