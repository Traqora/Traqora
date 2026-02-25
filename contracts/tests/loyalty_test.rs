use soroban_sdk::Symbol;
use traqora_contracts::loyalty::LoyaltyContract;

mod common;
use common::{generate_actors, new_env, register_contracts};

#[test]
fn test_initialize_tiers_and_get_benefits() {
    let env = new_env();
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    let gold = contracts
        .loyalty
        .get_tier_benefits(&Symbol::new(&env, "gold"))
        .unwrap();
    assert_eq!(gold.points_multiplier, 150);
}

#[test]
fn test_get_or_create_account_and_award_points() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    let acct = contracts.loyalty.get_or_create_account(&actors.passenger);
    assert_eq!(acct.tier, Symbol::new(&env, "bronze"));

    let earned = contracts
        .loyalty
        .award_points(&actors.passenger, &1000, &12345);
    assert!(earned >= 1000); // bronze multiplier 1x

    let acct2 = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct2.total_points, earned);
}

#[test]
fn test_redeem_points_and_tier_upgrade() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    // Accumulate points and bookings to reach silver (min_points=1000, min_bookings=5)
    for i in 0..5 {
        contracts.loyalty.award_points(&actors.passenger, &1000, &i);
    }

    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert!(acct.total_points >= 1000);
    assert!(
        acct.tier == Symbol::new(&env, "silver")
            || acct.tier == Symbol::new(&env, "gold")
            || acct.tier == Symbol::new(&env, "platinum")
    );

    // Redeem some points
    let discount = contracts.loyalty.redeem_points(&actors.passenger, &1000);
    assert_eq!(discount, 10);
    let acct2 = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert!(acct2.total_points >= 0);
}
