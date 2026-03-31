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
fn test_open_dispute_submit_counter_and_resolve_for_claimant() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, arbiter, claimant) = setup(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-001");

    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &1_000);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &400);

    let claimant_hash = BytesN::from_array(&env, &[1u8; 32]);
    let dispute_id = client.open_dispute(&booking_id, &claimant, &claimant_hash);
    assert_eq!(dispute_id, 1);

    let counter_hash = BytesN::from_array(&env, &[2u8; 32]);
    client.submit_counter_evidence(&dispute_id, &respondent, &counter_hash);

    client.resolve_dispute(&dispute_id, &arbiter, &true);

    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert!(dispute.resolved);
    assert_eq!(dispute.winner.unwrap(), claimant.clone());
    assert_eq!(token.balance(&claimant), 1_000);
    assert_eq!(token.balance(&respondent), 0);
}

#[test]
fn test_only_designated_arbiter_can_resolve() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _arbiter, claimant) = setup(&env);
    let unauthorized_arbiter = Address::generate(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-002");

    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &500);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &300);
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

    let result = std::panic::catch_unwind(|| {
        client.resolve_dispute(&dispute_id, &unauthorized_arbiter, &false);
    });
    assert!(result.is_err());
}

#[test]
fn test_resolve_for_respondent_releases_escrow_to_respondent() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, arbiter, claimant) = setup(&env);
    let respondent = Address::generate(&env);
    let booking_id = Symbol::new(&env, "BK-003");

    let asset_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token = StellarAssetClient::new(&env, &token_addr.address());
    token.mint(&claimant, &700);

    client.deposit_escrow(&booking_id, &claimant, &token_addr.address(), &250);
    let dispute_id = client.open_dispute(
        &booking_id,
        &claimant,
        &BytesN::from_array(&env, &[5u8; 32]),
    );
    client.submit_counter_evidence(
        &dispute_id,
        &respondent,
        &BytesN::from_array(&env, &[6u8; 32]),
    );
    client.resolve_dispute(&dispute_id, &arbiter, &false);

    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute.winner.unwrap(), respondent.clone());
    assert_eq!(token.balance(&respondent), 250);
}
