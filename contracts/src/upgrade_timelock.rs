//! Shared 48-hour timelock for Soroban `update_current_contract_wasm` upgrades.

use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct ScheduledUpgrade {
    pub wasm_hash: BytesN<32>,
    pub scheduled_at: u64,
}

/// Delay between `schedule_upgrade` and allowed `execute_upgrade` (48 hours).
pub const TIMELOCK_SECS: u64 = 48 * 60 * 60;

pub fn get_scheduled_upgrade(env: &Env) -> Option<ScheduledUpgrade> {
    env.storage()
        .instance()
        .get(&symbol_short!("upg_pend"))
}

pub fn schedule_upgrade_authorized(env: &Env, new_wasm_hash: BytesN<32>) {
    let scheduled_at = env.ledger().timestamp();
    let record = ScheduledUpgrade {
        wasm_hash: new_wasm_hash.clone(),
        scheduled_at,
    };
    env.storage()
        .instance()
        .set(&symbol_short!("upg_pend"), &record);
    let executable_after = scheduled_at.saturating_add(TIMELOCK_SECS);
    env.events().publish(
        (Symbol::new(env, "UpgradeScheduled"),),
        (new_wasm_hash, scheduled_at, executable_after),
    );
}

pub fn execute_scheduled_upgrade(env: &Env) {
    let record = get_scheduled_upgrade(env).expect("No scheduled upgrade");
    let now = env.ledger().timestamp();
    assert!(
        now >= record.scheduled_at.saturating_add(TIMELOCK_SECS),
        "Timelock active"
    );
    let hash = record.wasm_hash.clone();
    env.deployer().update_current_contract_wasm(hash.clone());
    env.storage()
        .instance()
        .remove(&symbol_short!("upg_pend"));
    env.events()
        .publish((Symbol::new(env, "UpgradeExecuted"),), hash);
}

pub fn get_upgrade_owner(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&symbol_short!("up_owner"))
}

pub fn try_init_upgrade_owner(env: &Env, owner: Address) {
    assert!(
        get_upgrade_owner(env).is_none(),
        "Upgrade owner already set"
    );
    env.storage()
        .instance()
        .set(&symbol_short!("up_owner"), &owner);
}
