#[cfg(test)]
use super::*;
use soroban_sdk::{Env, Address};

#[test]
fn test_valid_transitions() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(BookingContract, ());
    let client = BookingContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let booking_id = 1u64;

    client.initialize_booking(&booking_id, &owner);
    assert_eq!(client.get_state(&booking_id), BookingState::Pending);

    client.transition(&booking_id, &BookingState::Confirmed);
    assert_eq!(client.get_state(&booking_id), BookingState::Confirmed);

    client.transition(&booking_id, &BookingState::Completed);
    assert_eq!(client.get_state(&booking_id), BookingState::Completed);
}

#[test]
#[should_panic(expected = "illegal state transition")]
fn test_invalid_transition() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(BookingContract, ());
    let client = BookingContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let booking_id = 2u64;

    client.initialize_booking(&booking_id, &owner);
    // Cannot go directly from Pending to Completed
    client.transition(&booking_id, &BookingState::Completed);
}
