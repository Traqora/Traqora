use flight_registry::{FlightRegistryContract, FlightRegistryContractClient};
use flight_registry::sync_cursor::{get_cursor, set_cursor};
soroban_sdk::contracttype!();
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

#[test]
fn test_flight_sync_durable_cursor_resume_and_retry() {
    let env = Env::default();
    env.mock_all_auths();

    let provider_id = Symbol::new(&env, "AERO_PROVIDER");
    
    // Initially no cursor exists
    assert_eq!(get_cursor(&env, &provider_id), None);

    // Simulate committing cursor after page 1
    let cursor_page_1 = Symbol::new(&env, "cursor_page_1");
    set_cursor(&env, &provider_id, &cursor_page_1);
    assert_eq!(get_cursor(&env, &provider_id), Some(cursor_page_1.clone()));

    // Simulate worker restart and resume from last committed cursor
    let resumed_cursor = get_cursor(&env, &provider_id).unwrap();
    assert_eq!(resumed_cursor, cursor_page_1);

    // Simulate retry failure scenario: network error happens, cursor is NOT advanced
    // Worker restarts and reads cursor again, still gets cursor_page_1
    assert_eq!(get_cursor(&env, &provider_id), Some(cursor_page_1.clone()));

    // Advance to page 2 upon successful retry completion
    let cursor_page_2 = Symbol::new(&env, "cursor_page_2");
    set_cursor(&env, &provider_id, &cursor_page_2);
    assert_eq!(get_cursor(&env, &provider_id), Some(cursor_page_2));
}
