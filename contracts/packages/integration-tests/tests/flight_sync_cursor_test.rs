use flight_registry::{FlightRegistryContract, FlightRegistryContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};

#[test]
fn test_flight_sync_durable_cursor_resume_and_retry() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(FlightRegistryContract, ());
    let client = FlightRegistryContractClient::new(&env, &contract_id);
    let provider = Address::generate(&env);

    // Verify initial state has no cursor
    assert_eq!(client.get_sync_cursor(&provider), None);

    // Simulate sync committing page 1 cursor
    let cursor_page_1 = String::from_str(&env, "page_token_abc_123");
    client.set_sync_cursor(&provider, &cursor_page_1);

    // Verify cursor was persisted
    assert_eq!(client.get_sync_cursor(&provider), Some(cursor_page_1.clone()));

    // Simulate worker restart and resumption from page 1 cursor
    let resumed_cursor = client.get_sync_cursor(&provider).unwrap();
    assert_eq!(resumed_cursor, cursor_page_1);

    // Simulate advancing to page 2 after successful batch processing
    let cursor_page_2 = String::from_str(&env, "page_token_def_456");
    client.set_sync_cursor(&provider, &cursor_page_2);
    assert_eq!(client.get_sync_cursor(&provider), Some(cursor_page_2));
}
