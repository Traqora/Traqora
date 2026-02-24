use soroban_sdk::{
    testutils::{Address as _, BytesN as _},
    Address, BytesN, Env, Vec,
};

use crate::proxy::{
    ContractProxy, ContractProxyClient, MultisigConfig, ProxyState, UpgradeProposal,
};

fn setup_env() -> (Env, ContractProxyClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, ContractProxy);
    let client = ContractProxyClient::new(&env, &contract_id);
    (env, client)
}

fn create_signers(env: &Env, count: u32) -> Vec<Address> {
    let mut signers = Vec::new(env);
    for _ in 0..count {
        signers.push_back(Address::generate(env));
    }
    signers
}

fn create_dummy_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

#[test]
fn test_initialize() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(
        &admin,
        &implementation,
        &signers,
        &2, // threshold
    );
    
    assert_eq!(client.get_implementation(), implementation);
    assert_eq!(client.get_version(), 1);
    assert_eq!(client.get_storage_version(), 1);
    
    match client.get_proxy_state() {
        ProxyState::Active => (),
        _ => panic!("Expected Active state"),
    }
    
    let multisig = client.get_multisig_config().unwrap();
    assert_eq!(multisig.threshold, 2);
    assert_eq!(multisig.signers.len(), 3);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    client.initialize(&admin, &implementation, &signers, &2);
}

#[test]
#[should_panic(expected = "Threshold exceeds signer count")]
fn test_initialize_invalid_threshold() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 2);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &3);
}

#[test]
fn test_pause_and_unpause() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    assert!(!client.is_paused());
    
    client.pause_contract(&admin);
    
    assert!(client.is_paused());
    
    match client.get_proxy_state() {
        ProxyState::Paused => (),
        _ => panic!("Expected Paused state"),
    }
    
    client.unpause_contract(&admin);
    
    assert!(!client.is_paused());
    
    match client.get_proxy_state() {
        ProxyState::Active => (),
        _ => panic!("Expected Active state"),
    }
}

#[test]
fn test_upgrade_propose_and_execute() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    let new_implementation = BytesN::from_array(&env, &[1u8; 32]);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    // Propose upgrade
    let proposal_id = client.propose_upgrade(
        &signers.get(0).unwrap(),
        &new_implementation,
        &Some(2u32), // new storage version
    );
    
    assert_eq!(proposal_id, 1);
    
    let proposal = client.get_upgrade_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.new_implementation, new_implementation);
    assert!(!proposal.executed);
    assert_eq!(proposal.approvals.len(), 1);
    
    // Approve upgrade with second signer
    client.approve_upgrade(&signers.get(1).unwrap(), &proposal_id);
    
    let proposal = client.get_upgrade_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.approvals.len(), 2);
    
    // Execute upgrade
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_id);
    
    // Verify upgrade
    let proposal = client.get_upgrade_proposal(&proposal_id).unwrap();
    assert!(proposal.executed);
    
    assert_eq!(client.get_implementation(), new_implementation);
    assert_eq!(client.get_version(), 2);
    assert_eq!(client.get_storage_version(), 2);
}

#[test]
#[should_panic(expected = "Not an authorized signer")]
fn test_upgrade_unauthorized_proposer() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    let new_implementation = BytesN::from_array(&env, &[1u8; 32]);
    let unauthorized = Address::generate(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    client.propose_upgrade(&unauthorized, &new_implementation, &Some(2u32));
}

#[test]
#[should_panic(expected = "Already approved")]
fn test_upgrade_double_approval() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    let new_implementation = BytesN::from_array(&env, &[1u8; 32]);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    let proposal_id = client.propose_upgrade(&signers.get(0).unwrap(), &new_implementation, &None);
    
    // Try to approve twice with same signer
    client.approve_upgrade(&signers.get(0).unwrap(), &proposal_id);
}

#[test]
#[should_panic(expected = "Insufficient approvals")]
fn test_upgrade_insufficient_approvals() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    let new_implementation = BytesN::from_array(&env, &[1u8; 32]);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    // Propose with only 1 signer (threshold is 2)
    let proposal_id = client.propose_upgrade(&signers.get(0).unwrap(), &new_implementation, &None);
    
    // Try to execute without enough approvals
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_id);
}

#[test]
#[should_panic(expected = "Already executed")]
fn test_upgrade_already_executed() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    let new_implementation = BytesN::from_array(&env, &[1u8; 32]);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    let proposal_id = client.propose_upgrade(&signers.get(0).unwrap(), &new_implementation, &None);
    client.approve_upgrade(&signers.get(1).unwrap(), &proposal_id);
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_id);
    
    // Try to execute again
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_id);
}

#[test]
fn test_multisig_update() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    let new_signers = create_signers(&env, 5);
    
    client.update_multisig(&admin, &new_signers, &3);
    
    let multisig = client.get_multisig_config().unwrap();
    assert_eq!(multisig.threshold, 3);
    assert_eq!(multisig.signers.len(), 5);
}

#[test]
fn test_multiple_upgrade_proposals() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    let impl_v2 = BytesN::from_array(&env, &[2u8; 32]);
    let impl_v3 = BytesN::from_array(&env, &[3u8; 32]);
    
    // Create first upgrade proposal
    let proposal_1 = client.propose_upgrade(&signers.get(0).unwrap(), &impl_v2, &Some(2u32));
    client.approve_upgrade(&signers.get(1).unwrap(), &proposal_1);
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_1);
    
    // Create second upgrade proposal
    let proposal_2 = client.propose_upgrade(&signers.get(0).unwrap(), &impl_v3, &Some(3u32));
    client.approve_upgrade(&signers.get(1).unwrap(), &proposal_2);
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_2);
    
    assert_eq!(client.get_version(), 3);
    assert_eq!(client.get_storage_version(), 3);
    assert_eq!(client.get_implementation(), impl_v3);
}

#[test]
fn test_is_paused_and_is_upgrading() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    assert!(!client.is_paused());
    assert!(!client.is_upgrading());
    
    client.pause_contract(&admin);
    assert!(client.is_paused());
    assert!(!client.is_upgrading());
    
    client.unpause_contract(&admin);
    assert!(!client.is_paused());
    assert!(!client.is_upgrading());
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_pause_unauthorized() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    let unauthorized = Address::generate(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    client.pause_contract(&unauthorized);
}

#[test]
fn test_storage_migration_flow() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let signers = create_signers(&env, 3);
    let implementation = create_dummy_hash(&env);
    
    client.initialize(&admin, &implementation, &signers, &2);
    
    // Propose upgrade with new storage version
    let new_impl = BytesN::from_array(&env, &[2u8; 32]);
    let proposal_id = client.propose_upgrade(&signers.get(0).unwrap(), &new_impl, &Some(2u32));
    client.approve_upgrade(&signers.get(1).unwrap(), &proposal_id);
    
    // Execute upgrade - this sets state to Upgrading then Active
    client.upgrade_to(&signers.get(0).unwrap(), &proposal_id);
    
    // Verify final state
    assert_eq!(client.get_storage_version(), 2);
    assert!(!client.is_upgrading());
}
