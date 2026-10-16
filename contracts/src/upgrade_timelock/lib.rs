use soroban_sdk::{Address, Env};

pub const UPGRADE_TIMELOCK_SECS: u64 = 48 * 60 * 60;

pub struct UpgradeTimelock;

impl UpgradeTimelock {
    /// Initialize the upgrade owner for contracts that do not yet have an admin role.
    pub fn init_upgrade_owner(env: &Env, owner: &Address) {
        crate::access::AccessControl::init_owner(env, owner);
    }
}
