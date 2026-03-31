/// Event-driven integration tests verifying the standard event schema:
/// topics: (contract_topic, action_topic)
/// data:   (actor: Address, timestamp: u64, id: u64, ...payload)
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env, IntoVal, Symbol, TryIntoVal, Val,
};

mod common;
use common::{generate_actors, initialize_token, new_env, register_contracts};

/// Collect all events matching a pair of symbol_short topics.
/// Returns a std Vec of (contract, topics, data) tuples.
fn find_events(
    env: &Env,
    topic0: soroban_sdk::Symbol,
    topic1: soroban_sdk::Symbol,
) -> std::vec::Vec<(Address, soroban_sdk::Vec<Val>, Val)> {
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

// ─── Booking Events ──────────────────────────────────────────────────────────

#[test]
fn test_booking_created_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL001"),
        &Symbol::new(&env, "JFK"),
        &Symbol::new(&env, "LAX"),
        &2_000_000_000,
        &price,
        &contracts.token.address,
    );

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("booking"),
        soroban_sdk::symbol_short!("created"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one booking:created event");

    let (_, _, data) = &events[0];
    let (actor, _ts, id, _airline, _flight, evt_price): (Address, u64, u64, Address, Symbol, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(id, booking_id, "booking_id in event should match");
    assert_eq!(evt_price, price, "price in event should match");
}

#[test]
fn test_booking_paid_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 50_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL002"),
        &Symbol::new(&env, "SFO"),
        &Symbol::new(&env, "SEA"),
        &2_000_000_000,
        &price,
        &contracts.token.address,
    );
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("booking"),
        soroban_sdk::symbol_short!("paid"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one booking:paid event");

    let (_, _, data) = &events[0];
    let (actor, _ts, id, amt): (Address, u64, u64, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(id, booking_id, "booking_id in event should match");
    assert_eq!(amt, price, "amount in event should match price");
}

#[test]
fn test_booking_released_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 75_0000000i128;
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL003"),
        &Symbol::new(&env, "ORD"),
        &Symbol::new(&env, "MIA"),
        &2_000_000_000,
        &price,
        &contracts.token.address,
    );
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    contracts.booking.release_payment_to_airline(&booking_id);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("booking"),
        soroban_sdk::symbol_short!("released"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one booking:released event");

    let (_, _, data) = &events[0];
    let (actor, _ts, id, amt): (Address, u64, u64, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.airline, "actor should be airline");
    assert_eq!(id, booking_id, "booking_id in event should match");
    assert_eq!(amt, price, "released amount should match price");
}

#[test]
fn test_booking_refunded_event() {
    let env = new_env();
    env.ledger().set_timestamp(1_700_000_000);
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 60_0000000i128;
    let departure_time = 1_705_000_000u64;

    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &Symbol::new(&env, "FL004"),
        &Symbol::new(&env, "DFW"),
        &Symbol::new(&env, "BOS"),
        &departure_time,
        &price,
        &contracts.token.address,
    );
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    contracts.booking.refund_passenger(&booking_id);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("booking"),
        soroban_sdk::symbol_short!("refunded"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one booking:refunded event");

    let (_, _, data) = &events[0];
    let (actor, _ts, id, amt): (Address, u64, u64, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(id, booking_id, "booking_id in event should match");
    assert_eq!(amt, price, "refunded amount should match price");
}

// ─── Refund Events ───────────────────────────────────────────────────────────

#[test]
fn test_refund_requested_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    let amount = 100_0000000i128;
    let request_id = contracts.refund.request_refund(
        &actors.passenger,
        &42u64,
        &amount,
        &Symbol::new(&env, "USDC"),
        &Symbol::new(&env, "cancelled"),
    );

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("refund"),
        soroban_sdk::symbol_short!("requested"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one refund:requested event");

    let (_, _, data) = &events[0];
    let (actor, _ts, rid, booking_id, amt): (Address, u64, u64, u64, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(rid, request_id, "request_id in event should match");
    assert_eq!(booking_id, 42u64, "booking_id in event should match");
    assert_eq!(amt, amount, "amount in event should match");
}

#[test]
fn test_refund_approved_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    let amount = 80_0000000i128;
    let request_id = contracts.refund.request_refund(
        &actors.passenger,
        &99u64,
        &amount,
        &Symbol::new(&env, "USDC"),
        &Symbol::new(&env, "delay"),
    );
    contracts.refund.process_refund(&actors.admin, &request_id);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("refund"),
        soroban_sdk::symbol_short!("approved"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one refund:approved event");

    let (_, _, data) = &events[0];
    let (actor, _ts, rid, _booking_id, amt): (Address, u64, u64, u64, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(rid, request_id, "request_id in event should match");
    assert_eq!(amt, amount, "amount in event should match");
}

#[test]
fn test_refund_rejected_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    let request_id = contracts.refund.request_refund(
        &actors.passenger,
        &77u64,
        &50_0000000i128,
        &Symbol::new(&env, "USDC"),
        &Symbol::new(&env, "weather"),
    );
    contracts.refund.reject_refund(
        &actors.admin,
        &request_id,
        &Symbol::new(&env, "policy"),
    );

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("refund"),
        soroban_sdk::symbol_short!("rejected"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one refund:rejected event");
}

// ─── Loyalty Events ──────────────────────────────────────────────────────────

#[test]
fn test_loyalty_init_event() {
    let env = new_env();
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("loyalty"),
        soroban_sdk::symbol_short!("init"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one loyalty:init event");
}

#[test]
fn test_loyalty_points_earned_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    let booking_amount = 500_0000000i128;
    let earned = contracts.loyalty.award_points(&actors.passenger, &booking_amount, &1u64);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("points"),
        soroban_sdk::symbol_short!("earned"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one points:earned event");

    let (_, _, data) = &events[0];
    let (actor, _ts, pts, booking_id): (Address, u64, i128, u64) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(pts, earned, "earned points in event should match return value");
    assert_eq!(booking_id, 1u64, "booking_id in event should match");
}

#[test]
fn test_loyalty_points_redeemed_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    contracts.loyalty.award_points(&actors.passenger, &1000_0000000i128, &1u64);
    let points_to_redeem = 500i128;
    let discount = contracts.loyalty.redeem_points(&actors.passenger, &points_to_redeem);

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("points"),
        soroban_sdk::symbol_short!("redeemed"),
    );
    assert_eq!(events.len(), 1, "Expected exactly one points:redeemed event");

    let (_, _, data) = &events[0];
    let (actor, _ts, pts, disc): (Address, u64, i128, i128) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
    assert_eq!(pts, points_to_redeem, "redeemed points in event should match");
    assert_eq!(disc, discount, "discount in event should match return value");
}

#[test]
fn test_loyalty_tier_upgrade_event() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    contracts.loyalty.init_loyalty();

    // Award enough points and bookings to reach silver (1000 pts, 5 bookings)
    for i in 0..5u64 {
        contracts.loyalty.award_points(&actors.passenger, &1000_0000000i128, &i);
    }

    let events = find_events(
        &env,
        soroban_sdk::symbol_short!("tier"),
        soroban_sdk::symbol_short!("upgrade"),
    );
    assert!(events.len() >= 1, "Expected at least one tier:upgrade event");

    let (_, _, data) = &events[0];
    let (actor, _ts, _tier): (Address, u64, Symbol) =
        data.clone().try_into_val(&env).expect("Event data shape mismatch");
    assert_eq!(actor, actors.passenger, "actor should be passenger");
}
