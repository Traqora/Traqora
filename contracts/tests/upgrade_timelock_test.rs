use soroban_sdk::{testutils::Address as _, vec, Address, BytesN, Env, String, Symbol};
use traqora_contracts::booking::{BookingContract, BookingContractClient};
use traqora_contracts::proxy::{ContractProxy, ContractProxyClient};
use traqora_contracts::token::{TRQTokenContract, TRQTokenContractClient};

fn dummy_wasm_hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

#[test]
#[should_panic(expected = "Timelock active")]
fn upgrade_timelock_premature_execute_rejected_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(TRQTokenContract, ());
    let client = TRQTokenContractClient::new(&env, &contract_id);
    client.init_token(
        &admin,
        &String::from_str(&env, "TRQ"),
        &Symbol::new(&env, "TRQ"),
        &7,
    );
    client.schedule_upgrade(&admin, &dummy_wasm_hash(&env, 1));
    client.execute_upgrade();
}

#[test]
#[should_panic(expected = "Timelock active")]
fn upgrade_timelock_premature_execute_rejected_booking() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BookingContract, ());
    let client = BookingContractClient::new(&env, &contract_id);
    client.init_upgrade_owner(&admin);
    client.schedule_upgrade(&admin, &dummy_wasm_hash(&env, 2));
    client.execute_upgrade();
}

#[test]
#[should_panic(expected = "Timelock active")]
fn upgrade_timelock_premature_execute_rejected_proxy() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let implementation = dummy_wasm_hash(&env, 3);
    let signers = vec![&env, admin.clone()];
    let contract_id = env.register(ContractProxy, ());
    let client = ContractProxyClient::new(&env, &contract_id);
    client.init_proxy(&admin, &implementation, &signers, &1u32);
    client.schedule_upgrade(&admin, &dummy_wasm_hash(&env, 4));
    client.execute_upgrade();
}

#[test]
#[should_panic(expected = "No scheduled upgrade")]
fn upgrade_execute_without_schedule_rejected_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(TRQTokenContract, ());
    let client = TRQTokenContractClient::new(&env, &contract_id);
    client.init_token(
        &admin,
        &String::from_str(&env, "TRQ"),
        &Symbol::new(&env, "TRQ"),
        &7,
    );
    client.execute_upgrade();
}
