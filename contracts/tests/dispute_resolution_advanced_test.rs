#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, StellarAsset},
    token::StellarAssetClient,
    Address, BytesN, Env, Symbol, Vec,
};
use traqora_contracts::dispute_resolution::{
    DisputeResolutionContract, DisputeResolutionContractClient,
};

fn setup(env: &Env) -> (DisputeResolutionContractClient<'_>, Address, Address, Address) {
    let admin = Address::generate(env);
    let arbiter = Address::generate(env);
    let claimant = Address::generate(env);

    let contract_id = env.register(DisputeResolutionContract, ());
    let client = DisputeResolutionContractClient::new(env, &contract_id);

    let mut arbiters = Vec::new(env);
    arbiters.push_back(arbiter.clone());
    client.initialize(&admin, &arbiters);

    (client, admin, arbiter, claimant)
}

#[test]
fn test_arbiter_addition_and_removal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _original_arbiter, _claimant) = setup(&env);
    let new_arbiter = Address::generate(&env);

    // Add new arbiter
    client.set_arbiter(&admin, &new_arbiter, &true);

    // Verify new arbiter can resolve disputes
    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-NEW-1");
    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &1_000);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &600);
    let dispute_id = client.open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[1u8; 32]),
    );
    client.submit_counter_evidence(
        &dispute_id,
        &respondent,
        &BytesN::from_array(&env, &[2u8; 32]),
    );

    // New arbiter should be able to resolve
    client.resolve_dispute(&dispute_id, &new_arbiter, &true);
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert!(dispute.resolved);
}

#[test]
fn test_multiple_arbiters_ensure_one_can_resolve() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let arbiter1 = Address::generate(&env);
    let arbiter2 = Address::generate(&env);
    let arbiter3 = Address::generate(&env);

    let contract_id = env.register(DisputeResolutionContract, ());
    let client = DisputeResolutionContractClient::new(&env, &contract_id);

    let mut arbiters = Vec::new(&env);
    arbiters.push_back(arbiter1.clone());
    arbiters.push_back(arbiter2.clone());
    arbiters.push_back(arbiter3.clone());
    client.initialize(&admin, &arbiters);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-MULTI-1");
    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &800);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &500);
    let dispute_id = client.open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[3u8; 32]),
    );
    client.submit_counter_evidence(
        &dispute_id,
        &respondent,
        &BytesN::from_array(&env, &[4u8; 32]),
    );

    // Any arbiter should be able to resolve
    client.resolve_dispute(&dispute_id, &arbiter2, &false);
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert!(dispute.resolved);
    assert_eq!(dispute.winner.unwrap(), respondent);
}

#[test]
fn test_jury_selection_fairness_with_rotating_arbiters() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let arbiters_vec = vec![
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];

    let contract_id = env.register(DisputeResolutionContract, ());
    let client = DisputeResolutionContractClient::new(&env, &contract_id);

    let mut arbiters = Vec::new(&env);
    for arbiter in &arbiters_vec {
        arbiters.push_back(arbiter.clone());
    }
    client.initialize(&admin, &arbiters);

    // Create multiple disputes and verify different arbiters can handle them
    for i in 0..5 {
        let claimant = Address::generate(&env);
        let respondent = Address::generate(&env);
        let booking_id = Symbol::new(&env, &format!("BK-JURY-{}", i));
        let asset_admin = Address::generate(&env);
        let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let token = StellarAssetClient::new(&env, &token_addr.address());
        token.mint(&claimant, &1_000);

        client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &700);
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

        // Use different arbiter for each
        let selected_arbiter = &arbiters_vec[(i as usize) % arbiters_vec.len()];
        client.resolve_dispute(&dispute_id, selected_arbiter, &(i % 2 == 0));
        let dispute = client.get_dispute(&dispute_id).unwrap();
        assert!(dispute.resolved);
    }
}

#[test]
fn test_dispute_cannot_reopen_after_resolution() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, arbiter, claimant) = setup(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-FINAL-1");
    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
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

    client.resolve_dispute(&dispute_id, &arbiter, &true);

    // Attempt to open another dispute for same booking should fail
    let result = std::panic::catch_unwind(|| {
        client.open_dispute(
            &booking_id,
            &claimant,
            &BytesN::from_array(&env, &[12u8; 32]),
        );
    });
    assert!(result.is_err());
}

#[test]
fn test_escrow_security_unauthorized_release() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _arbiter, claimant) = setup(&env);
    let unauthorized_user = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-SEC-1");
    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &400);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &200);

    // Only arbiter should be able to resolve and release escrow
    let respondent = Address::generate(&env);
    let dispute_id = client.open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[13u8; 32]),
    );
    client.submit_counter_evidence(
        &dispute_id,
        &respondent,
        &BytesN::from_array(&env, &[14u8; 32]),
    );

    let result = std::panic::catch_unwind(|| {
        client.resolve_dispute(&dispute_id, &unauthorized_user, &true);
    });
    assert!(result.is_err());
}

#[test]
fn test_multiple_disputes_independent_resolution() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, arbiter, _claimant) = setup(&env);

    let mut dispute_ids = Vec::new();

    for i in 0..3 {
        let claimant = Address::generate(&env);
        let respondent = Address::generate(&env);
        let booking_id = Symbol::new(&env, &format!("BK-MULTI-DISP-{}", i));
        let asset_admin = Address::generate(&env);
        let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let token = StellarAssetClient::new(&env, &token_addr.address());
        token.mint(&claimant, &1_500);

        client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &800);
        let dispute_id = client.open_dispute(
            &booking_id,
            &claimant,
            &BytesN::from_array(&env, &[(i + 20) as u8; 32]),
        );
        client.submit_counter_evidence(
            &dispute_id,
            &respondent,
            &BytesN::from_array(&env, &[(i + 21) as u8; 32]),
        );
        dispute_ids.push((dispute_id, i % 2 == 0));
    }

    // Resolve each independently
    for (dispute_id, claim_wins) in dispute_ids {
        client.resolve_dispute(&dispute_id, &arbiter, &claim_wins);
        let dispute = client.get_dispute(&dispute_id).unwrap();
        assert!(dispute.resolved);
    }
}
