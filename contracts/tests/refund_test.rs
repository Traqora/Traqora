use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use traqora_contracts::refund::{RefundContract, RefundContractClient};

mod common;
use common::{new_env, generate_actors, register_contracts};

#[test]
fn test_set_policy_and_calculate_refund() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    contracts.refund.set_refund_policy(
        &actors.airline,
        &86_400,     // 24h
        &10_000,     // 100%
        &5_000,      // 50%
        &3_600,      // 1h
    );

    // Far from departure -> full refund
    let original = 100_0000000i128;
    let departure_far = env.ledger().timestamp() + 200_000;
    let amt_full = contracts
        .refund
        .calculate_refund(&actors.airline, &original, &departure_far);
    assert_eq!(amt_full, original);

    // Between windows -> partial
    let departure_mid = env.ledger().timestamp() + 10_000;
    let amt_partial = contracts
        .refund
        .calculate_refund(&actors.airline, &original, &departure_mid);
    assert_eq!(amt_partial, original / 2);

    // Within no refund window -> 0
    let departure_soon = env.ledger().timestamp() + 1_000;
    let amt_none = contracts
        .refund
        .calculate_refund(&actors.airline, &original, &departure_soon);
    assert_eq!(amt_none, 0);
}

#[test]
fn test_request_and_process_refund() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);

    let rid = contracts.refund.request_refund(
        &actors.passenger,
        &12345,
        &50_0000000i128,
        &Symbol::new(&env, "USDC"),
        &Symbol::new(&env, "cancelled"),
    );
    let r = contracts.refund.get_refund_request(&rid).unwrap();
    assert_eq!(r.status, Symbol::new(&env, "pending"));

    contracts.refund.process_refund(&actors.admin, &rid);
    let r2 = contracts.refund.get_refund_request(&rid).unwrap();
    assert_eq!(r2.status, Symbol::new(&env, "approved"));
    assert!(r2.processed_at.is_some());
}
