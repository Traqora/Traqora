use refund::{CancellationState, SupplierCancellationContractClient};
use soroban_sdk::{Address, Env};

#[test]
fn test_supplier_cancellation_normal_path() {
    let env = Env::default();
    env.mock_all_auths();

    let supplier = Address::generate(&env);
    let contract_id = env.register(SupplierCancellationContract, ());
    let client = SupplierCancellationContractClient::new(&env, &contract_id);

    let state = client.process_cancellation(&supplier, &101u64, &false);
    assert_eq!(state, CancellationState::Confirmed);
    assert_eq!(
        client.get_cancellation_state(&101u64),
        CancellationState::Confirmed
    );
}

#[test]
fn test_supplier_cancellation_ambiguous_preserves_pending() {
    let env = Env::default();
    env.mock_all_auths();

    let supplier = Address::generate(&env);
    let contract_id = env.register(SupplierCancellationContract, ());
    let client = SupplierCancellationContractClient::new(&env, &contract_id);

    let state = client.process_cancellation(&supplier, &102u64, &true);
    assert_eq!(state, CancellationState::AmbiguousPreservedPending);
    assert_eq!(
        client.get_cancellation_state(&102u64),
        CancellationState::AmbiguousPreservedPending
    );
}
