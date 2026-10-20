/// Points-expiry and tier-recalculation tests for the loyalty package
/// (issue #512).
///
/// The loyalty balance is the sum of the user's unexpired FIFO ledger entries,
/// so these tests drive the ledger clock directly and check the boundary
/// behaviour: a credit is still spendable one second before `expires_at` and is
/// gone at `expires_at`.
use access::{AccessControl, Role};
use soroban_sdk::{
    symbol_short,
    testutils::{Events, Ledger},
    Address, Env, Symbol, TryIntoVal, Val,
};

use integration_tests::{generate_actors, new_env, register_contracts, Actors, Contracts};

type Event = (Address, soroban_sdk::Vec<Val>, Val);

fn find_events(env: &Env, topic0: Symbol, topic1: Symbol) -> std::vec::Vec<Event> {
    let t0 = topic0.to_val().get_payload();
    let t1 = topic1.to_val().get_payload();
    env.events()
        .all()
        .iter()
        .filter(|(_, topics, _)| {
            topics.len() == 2
                && topics.get(0).unwrap().get_payload() == t0
                && topics.get(1).unwrap().get_payload() == t1
        })
        .collect()
}

/// Contract with tiers initialized and `admin` holding the Admin role, which
/// `set_expiry_window` requires.
fn setup<'a>(env: &'a Env) -> (Actors, Contracts<'a>) {
    let actors = generate_actors(env);
    let contracts = register_contracts(env);
    contracts.loyalty.init_loyalty();
    AccessControl::init_owner(env, &actors.admin);
    AccessControl::set_role(env, &actors.admin, &actors.admin, Role::Admin, true);
    (actors, contracts)
}

// ─── Expiry boundary ─────────────────────────────────────────────────────────

#[test]
fn points_survive_until_the_expiry_second_and_expire_at_it() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &100);

    contracts
        .loyalty
        .award_points(&actors.passenger, &1_000, &7);
    let entry = contracts
        .loyalty
        .get_points_ledger(&actors.passenger)
        .get(0)
        .unwrap();
    assert_eq!(entry.points, 1_000);
    assert_eq!(entry.earned_at, 0);
    assert_eq!(entry.expires_at, 100);
    assert_eq!(entry.booking_id, Some(7));

    // One second before expiry the points still count.
    env.ledger().set_timestamp(99);
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.total_points, 1_000);
    assert_eq!(
        find_events(&env, symbol_short!("points"), symbol_short!("expired")).len(),
        0
    );

    // At the expiry timestamp they are gone, and the ledger is empty.
    env.ledger().set_timestamp(100);
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.total_points, 0);
    assert_eq!(
        contracts.loyalty.get_points_ledger(&actors.passenger).len(),
        0
    );

    let expired = find_events(&env, symbol_short!("points"), symbol_short!("expired"));
    assert_eq!(expired.len(), 1);
    let (_, _, data) = &expired[0];
    let (actor, ts, points): (Address, u64, i128) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(actor, actors.passenger);
    assert_eq!(ts, 100);
    assert_eq!(points, 1_000);
}

#[test]
fn refresh_account_is_idempotent_for_a_single_expiry() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &10);
    contracts.loyalty.award_points(&actors.passenger, &500, &1);

    env.ledger().set_timestamp(10);
    contracts.loyalty.refresh_account(&actors.passenger);
    contracts.loyalty.refresh_account(&actors.passenger);
    contracts.loyalty.get_account(&actors.passenger);

    let expired = find_events(&env, symbol_short!("points"), symbol_short!("expired"));
    assert_eq!(
        expired.len(),
        1,
        "expiry must only be emitted once per expiring credit"
    );
}

#[test]
fn only_due_entries_expire() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &100);

    contracts.loyalty.award_points(&actors.passenger, &300, &1);
    env.ledger().set_timestamp(50);
    contracts.loyalty.award_points(&actors.passenger, &200, &2);

    // The first credit expires at 100, the second at 150.
    env.ledger().set_timestamp(120);
    let acct = contracts.loyalty.refresh_account(&actors.passenger);
    assert_eq!(acct.total_points, 200, "only the later credit survives");

    let expired = find_events(&env, symbol_short!("points"), symbol_short!("expired"));
    assert_eq!(expired.len(), 1);
    let (_, _, data) = &expired[0];
    let (_actor, _ts, points): (Address, u64, i128) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(points, 300);
}

#[test]
fn changing_the_window_does_not_retroactively_expire_credits() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.award_points(&actors.passenger, &400, &1);

    // Shortening the window only affects credits made from now on.
    contracts.loyalty.set_expiry_window(&actors.admin, &5);
    env.ledger().set_timestamp(10);
    let acct = contracts.loyalty.refresh_account(&actors.passenger);
    assert_eq!(acct.total_points, 400);
    assert_eq!(contracts.loyalty.get_expiry_window(), 5);
}

// ─── Redemption ──────────────────────────────────────────────────────────────

#[test]
fn redemption_spends_the_oldest_credit_first_and_keeps_the_rest() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &100);

    contracts.loyalty.award_points(&actors.passenger, &300, &1); // expires at 100
    env.ledger().set_timestamp(50);
    contracts.loyalty.award_points(&actors.passenger, &500, &2); // expires at 150

    let discount = contracts.loyalty.redeem_points(&actors.passenger, &200);
    assert_eq!(discount, 2);

    // The 300-point credit was split: 100 spent, 200 still pending expiry.
    let ledger = contracts.loyalty.get_points_ledger(&actors.passenger);
    assert_eq!(ledger.len(), 2);
    assert_eq!(ledger.get(0).unwrap().points, 100);
    assert_eq!(ledger.get(1).unwrap().points, 500);
    assert_eq!(
        contracts
            .loyalty
            .get_account(&actors.passenger)
            .unwrap()
            .total_points,
        600
    );

    // After the first credit's expiry only the untouched second one remains.
    env.ledger().set_timestamp(100);
    let acct = contracts.loyalty.refresh_account(&actors.passenger);
    assert_eq!(acct.total_points, 500);
}

#[test]
fn expired_points_cannot_be_redeemed() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &10);
    contracts
        .loyalty
        .award_points(&actors.passenger, &1_000, &1);

    env.ledger().set_timestamp(10);
    let result = contracts.loyalty.try_redeem_points(&actors.passenger, &500);
    assert!(result.is_err(), "expired points must not be redeemable");
}

// ─── Tier recalculation ──────────────────────────────────────────────────────

#[test]
fn tier_upgrade_and_downgrade_track_the_expiring_balance() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &100);

    // Four credits at t=0 all expire at t=100; the fifth is credited at t=50
    // and therefore expires at t=150.
    for i in 0..4u64 {
        contracts.loyalty.award_points(&actors.passenger, &300, &i);
    }
    env.ledger().set_timestamp(50);
    contracts.loyalty.award_points(&actors.passenger, &300, &4);

    // silver needs 1_000 points and 5 bookings, both now met exactly.
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.total_points, 1_500);
    assert_eq!(acct.lifetime_bookings, 5);
    assert_eq!(acct.tier, symbol_short!("silver"));

    // Expiring the four old credits drops the balance below 1_000, so the
    // account falls back to bronze even though lifetime_bookings is still 5.
    env.ledger().set_timestamp(100);
    let acct = contracts.loyalty.refresh_account(&actors.passenger);
    assert_eq!(acct.total_points, 300);
    assert_eq!(acct.tier, symbol_short!("bronze"));

    let downgrades = find_events(&env, symbol_short!("tier"), symbol_short!("downgrade"));
    assert_eq!(downgrades.len(), 1);
    let (_, _, data) = &downgrades[0];
    let (actor, _ts, tier): (Address, u64, Symbol) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(actor, actors.passenger);
    assert_eq!(tier, symbol_short!("bronze"));
}

#[test]
fn tier_boundaries_are_inclusive() {
    let env = new_env();
    let (actors, contracts) = setup(&env);

    // silver needs 1_000 points *and* 5 bookings: after 4 awards the points
    // threshold is met exactly but the booking threshold is not.
    for i in 0..4u64 {
        contracts.loyalty.award_points(&actors.passenger, &250, &i);
    }
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.total_points, 1_000);
    assert_eq!(acct.tier, symbol_short!("bronze"), "min_bookings not met");

    // The fifth award reaches both silver thresholds exactly.
    contracts.loyalty.award_points(&actors.passenger, &250, &4);
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.lifetime_bookings, 5);
    assert_eq!(acct.tier, symbol_short!("silver"));

    // gold needs 5_000 points and 20 bookings: 3_750 more points is not enough
    // to promote on its own, even though min_points is now met exactly.
    contracts
        .loyalty
        .accrue_points(&actors.passenger, &symbol_short!("TRQ"), &3_750);
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.total_points, 5_000);
    assert_eq!(
        acct.tier,
        symbol_short!("silver"),
        "gold still needs 20 bookings"
    );

    // One booking short of 20 stays on silver; the 20th promotes to gold.
    for i in 5..19u64 {
        contracts.loyalty.award_points(&actors.passenger, &1, &i);
    }
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.lifetime_bookings, 19);
    assert_eq!(acct.tier, symbol_short!("silver"));

    contracts.loyalty.award_points(&actors.passenger, &1, &19);
    let acct = contracts.loyalty.get_account(&actors.passenger).unwrap();
    assert_eq!(acct.lifetime_bookings, 20);
    assert_eq!(acct.tier, symbol_short!("gold"));

    let upgrades = find_events(&env, symbol_short!("tier"), symbol_short!("upgrade"));
    assert_eq!(upgrades.len(), 2, "silver then gold");
    assert_eq!(
        find_events(&env, symbol_short!("tier"), symbol_short!("downgrade")).len(),
        0
    );
}

#[test]
fn expired_credits_emit_a_single_aggregate_event() {
    let env = new_env();
    let (actors, contracts) = setup(&env);
    contracts.loyalty.set_expiry_window(&actors.admin, &10);

    for i in 0..3u64 {
        contracts.loyalty.award_points(&actors.passenger, &100, &i);
    }
    env.ledger().set_timestamp(10);
    contracts
        .loyalty
        .accrue_points(&actors.passenger, &symbol_short!("TRQ"), &10);

    let expired = find_events(&env, symbol_short!("points"), symbol_short!("expired"));
    assert_eq!(expired.len(), 1, "one event for the whole expiring balance");
    let (_, _, data) = &expired[0];
    let (_actor, _ts, points): (Address, u64, i128) = data.clone().try_into_val(&env).unwrap();
    assert_eq!(points, 300);
    assert_eq!(
        contracts
            .loyalty
            .get_account(&actors.passenger)
            .unwrap()
            .total_points,
        10
    );
}
