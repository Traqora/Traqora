#![cfg(test)]

use integration_tests::time::{
    advance_ledgers, advance_past, advance_time, ledgers_for, now, set_time, try_advance_ledgers,
    try_advance_past, try_advance_time, try_set_time, TimeError, DAY, HOUR, SECONDS_PER_LEDGER,
};
use soroban_sdk::{testutils::Ledger, Env};

fn env_at(timestamp: u64, sequence: u32) -> Env {
    let env = Env::default();
    env.ledger().with_mut(|li| {
        li.timestamp = timestamp;
        li.sequence_number = sequence;
    });
    env
}

#[test]
fn ledgers_for_rounds_up() {
    assert_eq!(ledgers_for(0), 0);
    assert_eq!(ledgers_for(1), 1);
    assert_eq!(ledgers_for(SECONDS_PER_LEDGER), 1);
    assert_eq!(ledgers_for(SECONDS_PER_LEDGER + 1), 2);
    assert_eq!(ledgers_for(HOUR), 720);
}

#[test]
fn advance_time_moves_timestamp_and_sequence_together() {
    let env = env_at(1_000, 10);

    assert_eq!(advance_time(&env, 12), 1_012);
    assert_eq!(now(&env), 1_012);
    assert_eq!(env.ledger().sequence(), 13); // ceil(12 / 5) = 3

    assert_eq!(advance_time(&env, 2 * DAY), 1_012 + 2 * DAY);
    assert_eq!(env.ledger().sequence(), 13 + 34_560);
}

#[test]
fn advance_time_zero_is_a_noop() {
    let env = env_at(500, 7);
    assert_eq!(advance_time(&env, 0), 500);
    assert_eq!(env.ledger().sequence(), 7);
}

#[test]
fn advance_time_preserves_other_ledger_fields() {
    let env = env_at(1_000, 1);
    env.ledger().with_mut(|li| {
        li.network_id = [7u8; 32];
        li.base_reserve = 42;
        li.min_persistent_entry_ttl = 1_234;
        li.min_temp_entry_ttl = 567;
        li.max_entry_ttl = 9_999_999;
    });
    let protocol = env.ledger().protocol_version();

    advance_time(&env, HOUR);
    advance_ledgers(&env, 3);
    set_time(&env, now(&env) + 10);
    advance_past(&env, now(&env) + 100);

    let li = env.ledger().get();
    assert_eq!(li.network_id, [7u8; 32]);
    assert_eq!(li.base_reserve, 42);
    assert_eq!(li.min_persistent_entry_ttl, 1_234);
    assert_eq!(li.min_temp_entry_ttl, 567);
    assert_eq!(li.max_entry_ttl, 9_999_999);
    assert_eq!(li.protocol_version, protocol);
}

#[test]
fn advance_ledgers_moves_time_by_ledger_close_time() {
    let env = env_at(1_000, 100);
    assert_eq!(advance_ledgers(&env, 4), 1_000 + 4 * SECONDS_PER_LEDGER);
    assert_eq!(env.ledger().sequence(), 104);
}

#[test]
fn set_time_moves_forward_to_absolute_timestamp() {
    let env = env_at(1_000, 1);
    assert_eq!(set_time(&env, 1_050), 1_050);
    assert_eq!(env.ledger().sequence(), 11);

    // Setting the current timestamp again is allowed and does not move the sequence.
    assert_eq!(set_time(&env, 1_050), 1_050);
    assert_eq!(env.ledger().sequence(), 11);
}

#[test]
fn advance_past_lands_one_second_after_deadline() {
    let env = env_at(1_000, 1);
    let deadline = 1_000 + 48 * HOUR;

    assert_eq!(advance_past(&env, deadline), deadline + 1);
    assert!(now(&env) > deadline);

    // Already past: unchanged.
    let seq = env.ledger().sequence();
    assert_eq!(advance_past(&env, deadline), deadline + 1);
    assert_eq!(advance_past(&env, 10), deadline + 1);
    assert_eq!(env.ledger().sequence(), seq);
}

#[test]
fn set_time_rejects_moving_backwards_without_changing_the_ledger() {
    let env = env_at(2_000, 5);
    assert_eq!(
        try_set_time(&env, 1_999),
        Err(TimeError::Backwards {
            current: 2_000,
            requested: 1_999
        })
    );
    assert_eq!(now(&env), 2_000);
    assert_eq!(env.ledger().sequence(), 5);
}

#[test]
#[should_panic(expected = "cannot move ledger time backwards (current 2000, requested 1000)")]
fn set_time_backwards_panics() {
    let env = env_at(2_000, 5);
    set_time(&env, 1_000);
}

#[test]
fn timestamp_overflow_is_reported_and_ledger_unchanged() {
    let env = env_at(u64::MAX - 10, 5);

    assert_eq!(try_advance_time(&env, 11), Err(TimeError::TimestampOverflow));
    assert_eq!(try_advance_ledgers(&env, 3), Err(TimeError::TimestampOverflow));
    assert_eq!(try_advance_past(&env, u64::MAX), Err(TimeError::TimestampOverflow));
    assert_eq!(now(&env), u64::MAX - 10);
    assert_eq!(env.ledger().sequence(), 5);
}

#[test]
#[should_panic(expected = "ledger timestamp overflow")]
fn advance_time_overflow_panics() {
    let env = env_at(u64::MAX, 1);
    advance_time(&env, 1);
}

#[test]
fn sequence_overflow_is_reported_and_ledger_unchanged() {
    let env = env_at(0, u32::MAX - 1);

    assert_eq!(try_advance_ledgers(&env, 2), Err(TimeError::SequenceOverflow));
    assert_eq!(
        try_advance_time(&env, 2 * SECONDS_PER_LEDGER),
        Err(TimeError::SequenceOverflow)
    );
    assert_eq!(now(&env), 0);
    assert_eq!(env.ledger().sequence(), u32::MAX - 1);

    assert_eq!(try_advance_ledgers(&env, 1), Ok(SECONDS_PER_LEDGER));
    assert_eq!(env.ledger().sequence(), u32::MAX);
}
