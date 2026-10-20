#[cfg(test)]
use booking::{BookingContract, BookingContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use token::{TRQTokenContract, TRQTokenContractClient};
use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};

#[test]
fn test_architecture_happy_path_and_failure_mode() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "TQ100"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LHR"),
        &2_000_000_000,
        &price,
        &contracts.token.address,
    );

    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, Symbol::new(&env, "confirmed"));
}

#[test]
#[should_panic(expected = "Booking not found")]
fn test_architecture_failure_mode_nonexistent_booking() {
    let env = new_env();
    let contracts = register_contracts(&env);
    contracts.booking.pay_for_booking(&999999u64);
}
