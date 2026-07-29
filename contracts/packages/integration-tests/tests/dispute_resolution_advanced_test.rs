#![cfg(test)]

use dispute_resolution::{DisputeResolutionContract, DisputeResolutionContractClient};
use soroban_sdk::{
    testutils::Address as _,
    token,
    Address, BytesN, Env, Symbol, Vec,
};

#[test]
fn test_assigned_arbiter_rotates_across_disputes() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let arbiters_vec = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];

    let contract_id = env.register(DisputeResolutionContract, ());
    let client = DisputeResolutionContractClient::new(&env, &contract_id);

    let mut arbiters = Vec::new(&env);
    for arbiter in arbiters_vec.iter() {
        arbiters.push_back(arbiter.clone());
    }
    client.initialize(&admin, &arbiters);

    let mut assigned = Vec::new(&env);

    for i in 0..6 {
        let claimant = Address::generate(&env);
        let respondent = Address::generate(&env);
        let booking_id = Symbol::new(&env, &format!("BK_ROT_{}", i));
        let asset_admin = Address::generate(&env);
        let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let token = token::StellarAssetClient::new(&env, &token_addr.address());
        token.mint(&claimant, &1_000);

        client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &250);
        let dispute_id = client.open_dispute(
            &booking_id,
            &claimant,
            &BytesN::from_array(&env, &[(i + 1) as u8; 32]),
        );
        client.submit_counter_evidence(
            &dispute_id,
            &respondent,
            &BytesN::from_array(&env, &[(i + 2) as u8; 32]),
        );

        let dispute = client.get_dispute(&dispute_id).unwrap();
        assigned.push_back(dispute.assigned_arbiter.unwrap());
    }

    let first = assigned.get(0).unwrap();
    let mut found_different = false;
    for arbiter in assigned.iter() {
        if arbiter != first {
            found_different = true;
        }
    }

    assert!(found_different);
}

#[test]
fn test_dispute_cannot_reopen_after_resolution() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let arbiter = Address::generate(&env);

    let contract_id = env.register(DisputeResolutionContract, ());
    let client = DisputeResolutionContractClient::new(&env, &contract_id);

    let mut arbiters = Vec::new(&env);
    arbiters.push_back(arbiter);
    client.initialize(&admin, &arbiters);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK_FINAL_1");
    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = token::StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &500);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &300);
    let dispute_id = client.open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[10u8; 32]),
    );
    client.submit_counter_evidence(
        &dispute_id,
        &respondent,
        &BytesN::from_array(&env, &[11u8; 32]),
    );

    let assigned_arbiter = client
        .get_dispute(&dispute_id)
        .unwrap()
        .assigned_arbiter
        .unwrap();
    client.resolve_dispute(&dispute_id, &assigned_arbiter, &true);

    let result = client.try_open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[12u8; 32]),
    );
    assert!(result.is_err());
}

#[test]
fn test_only_enabled_arbiters_get_assigned() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let active_arbiter = Address::generate(&env);
    let disabled_arbiter = Address::generate(&env);

    let contract_id = env.register(DisputeResolutionContract, ());
    let client = DisputeResolutionContractClient::new(&env, &contract_id);

    let mut arbiters = Vec::new(&env);
    arbiters.push_back(active_arbiter.clone());
    arbiters.push_back(disabled_arbiter.clone());
    client.initialize(&admin, &arbiters);

    client.set_arbiter(&admin, &disabled_arbiter, &false);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK_DISABLE_1");
    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = token::StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &600);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &300);
    let dispute_id = client.open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[20u8; 32]),
    );
    client.submit_counter_evidence(
        &dispute_id,
        &respondent,
        &BytesN::from_array(&env, &[21u8; 32]),
    );

    let assigned = client
        .get_dispute(&dispute_id)
        .unwrap()
        .assigned_arbiter
        .unwrap();

    assert!(assigned == active_arbiter);
}
