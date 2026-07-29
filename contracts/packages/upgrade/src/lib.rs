#![cfg_attr(not(test), no_std)]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
};
use access::{AccessControl, Role};

// Upgrade module for safe contract updates with 48-hour timelock

/// Data structure for a scheduled upgrade
#[contracttype]
#[derive(Clone, Debug)]
pub struct ScheduledUpgrade {
    pub new_wasm_hash: BytesN<32>,
    pub scheduled_at: u64,
    pub executed: bool,
}

/// Storage keys for upgrade management
#[contracttype]
pub enum UpgradeDataKey {
    ScheduledUpgrade,
    UpgradeTimelock,
}

/// Upgrade storage helper
pub struct UpgradeStorage;

impl UpgradeStorage {
    /// Get the currently scheduled upgrade (if any)
    pub fn get_scheduled_upgrade(env: &Env) -> Option<ScheduledUpgrade> {
        env.storage()
            .instance()
            .get(&UpgradeDataKey::ScheduledUpgrade)
    }

    /// Set a scheduled upgrade
    pub fn set_scheduled_upgrade(env: &Env, upgrade: &ScheduledUpgrade) {
        env.storage()
            .instance()
            .set(&UpgradeDataKey::ScheduledUpgrade, upgrade);
    }

    /// Remove the scheduled upgrade
    pub fn clear_scheduled_upgrade(env: &Env) {
        env.storage()
            .instance()
            .remove(&UpgradeDataKey::ScheduledUpgrade);
    }

    /// Get the timelock duration in seconds (default 48 hours = 172800 seconds)
    pub fn get_timelock_duration(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&UpgradeDataKey::UpgradeTimelock)
            .unwrap_or(172800) // 48 hours default
    }

    /// Set custom timelock duration (in seconds)
    pub fn set_timelock_duration(env: &Env, duration: u64) {
        assert!(duration > 0, "Timelock duration must be positive");
        env.storage()
            .instance()
            .set(&UpgradeDataKey::UpgradeTimelock, &duration);
    }
}

/// Upgrade contract interface
#[contract]
pub struct UpgradeContract;

#[contractimpl]
impl UpgradeContract {
    /// Schedule a contract upgrade to a new WASM hash
    /// Only callable by admin or owner
    /// Requires waiting period (default 48 hours) before execution
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `admin` - The admin address performing the upgrade
    /// * `new_wasm_hash` - The hash of the new WASM bytecode
    ///
    /// # Events
    /// Emits "UpgradeScheduled" event with:
    /// - new_wasm_hash: The new contract hash
    /// - scheduled_at: The timestamp of scheduling
    /// - scheduled_by: The admin who scheduled the upgrade
    pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        // Verify admin authorization
        AccessControl::require_admin(&env, &admin);

        // Check if there's already a pending upgrade
        if let Some(pending) = UpgradeStorage::get_scheduled_upgrade(&env) {
            if !pending.executed {
                panic!("Upgrade already scheduled and pending execution");
            }
        }

        let current_time = env.ledger().timestamp();

        let upgrade = ScheduledUpgrade {
            new_wasm_hash: new_wasm_hash.clone(),
            scheduled_at: current_time,
            executed: false,
        };

        UpgradeStorage::set_scheduled_upgrade(&env, &upgrade);

        // Emit event
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("scheduled")),
            (new_wasm_hash, current_time, admin),
        );
    }

    /// Execute a scheduled upgrade if the timelock period has passed
    /// Only callable by admin or owner
    /// Reverts if:
    /// - No upgrade is scheduled
    /// - Timelock period hasn't elapsed
    /// - Upgrade has already been executed
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `admin` - The admin address executing the upgrade
    pub fn execute_upgrade(env: Env, admin: Address) {
        // Verify admin authorization
        AccessControl::require_admin(&env, &admin);

        let upgrade = UpgradeStorage::get_scheduled_upgrade(&env)
            .expect("No upgrade scheduled");

        // Check if already executed
        assert!(!upgrade.executed, "Upgrade already executed");

        let current_time = env.ledger().timestamp();
        let timelock_duration = UpgradeStorage::get_timelock_duration(&env);

        // Verify timelock has passed
        let time_elapsed = current_time.saturating_sub(upgrade.scheduled_at);
        assert!(
            time_elapsed >= timelock_duration,
            "Timelock period not yet elapsed"
        );

        // Mark as executed (contract implementation handles actual upgrade)
        let mut executed_upgrade = upgrade.clone();
        executed_upgrade.executed = true;
        UpgradeStorage::set_scheduled_upgrade(&env, &executed_upgrade);

        // Emit event
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("executed")),
            (executed_upgrade.new_wasm_hash, current_time, admin),
        );
    }

    /// Get the currently scheduled upgrade (if any)
    /// Can be called by anyone (read-only)
    pub fn get_scheduled_upgrade(env: Env) -> Option<ScheduledUpgrade> {
        UpgradeStorage::get_scheduled_upgrade(&env)
    }

    /// Get the current timelock duration in seconds
    /// Can be called by anyone (read-only)
    pub fn get_timelock_duration(env: Env) -> u64 {
        UpgradeStorage::get_timelock_duration(&env)
    }

    /// Set a custom timelock duration
    /// Only callable by owner
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `owner` - The owner address
    /// * `duration` - The new timelock duration in seconds
    pub fn set_timelock_duration(env: Env, owner: Address, duration: u64) {
        AccessControl::require_owner(&env, &owner);
        UpgradeStorage::set_timelock_duration(&env, duration);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("timelock")),
            (duration, owner),
        );
    }

    /// Cancel a pending upgrade
    /// Only callable by owner
    pub fn cancel_upgrade(env: Env, owner: Address) {
        AccessControl::require_owner(&env, &owner);

        let upgrade = UpgradeStorage::get_scheduled_upgrade(&env)
            .expect("No upgrade scheduled");

        assert!(!upgrade.executed, "Cannot cancel an executed upgrade");

        UpgradeStorage::clear_scheduled_upgrade(&env);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("cancelled")),
            (upgrade.new_wasm_hash, owner),
        );
    }

    /// Get time remaining until upgrade can be executed
    /// Returns 0 if timelock has passed
    pub fn get_upgrade_timelock_remaining(env: Env) -> u64 {
        if let Some(upgrade) = UpgradeStorage::get_scheduled_upgrade(&env) {
            if upgrade.executed {
                return 0;
            }

            let current_time = env.ledger().timestamp();
            let timelock_duration = UpgradeStorage::get_timelock_duration(&env);
            let time_elapsed = current_time.saturating_sub(upgrade.scheduled_at);

            if time_elapsed >= timelock_duration {
                0
            } else {
                timelock_duration - time_elapsed
            }
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;

    fn setup_test(env: &Env) -> (UpgradeContractClient, Address) {
        let contract_id = env.register_contract(None, UpgradeContract);
        let client = UpgradeContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        
        env.as_contract(&contract_id, || {
            AccessControl::init_owner(env, &admin);
            AccessControl::set_role(env, &admin, &admin, Role::Admin, true);
        });
        
        (client, admin)
    }

    #[test]
    fn test_schedule_upgrade() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_hash = BytesN::from_array(&env, &[1u8; 32]);

        // Schedule upgrade
        client.schedule_upgrade(&admin, &new_hash);

        // Verify upgrade was scheduled
        let scheduled = client.get_scheduled_upgrade().unwrap();
        assert_eq!(scheduled.new_wasm_hash, new_hash);
        assert!(!scheduled.executed);
    }

    #[test]
    #[should_panic(expected = "Timelock period not yet elapsed")]
    fn test_execute_upgrade_requires_timelock() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_hash = BytesN::from_array(&env, &[2u8; 32]);

        // Schedule upgrade
        client.schedule_upgrade(&admin, &new_hash);

        // Try to execute immediately (should fail)
        client.execute_upgrade(&admin);
    }

    #[test]
    fn test_execute_upgrade_success_after_timelock() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_hash = BytesN::from_array(&env, &[3u8; 32]);

        // Schedule upgrade at time 0
        client.schedule_upgrade(&admin, &new_hash);

        // Advance ledger by 48+ hours (172800+ seconds)
        env.ledger().set_timestamp(172801);

        // Execute upgrade (should succeed)
        client.execute_upgrade(&admin);

        // Verify upgrade was executed
        let scheduled = client.get_scheduled_upgrade().unwrap();
        assert!(scheduled.executed);
    }

    #[test]
    fn test_cancel_upgrade() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_hash = BytesN::from_array(&env, &[4u8; 32]);

        // Schedule upgrade
        client.schedule_upgrade(&admin, &new_hash);

        // Cancel upgrade
        client.cancel_upgrade(&admin);

        // Verify upgrade was cancelled
        let scheduled = client.get_scheduled_upgrade();
        assert!(scheduled.is_none());
    }

    #[test]
    #[should_panic(expected = "Upgrade already scheduled and pending execution")]
    fn test_cannot_schedule_multiple_pending_upgrades() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let hash1 = BytesN::from_array(&env, &[5u8; 32]);
        let hash2 = BytesN::from_array(&env, &[6u8; 32]);

        // Schedule first upgrade
        client.schedule_upgrade(&admin, &hash1);

        // Try to schedule second upgrade (should fail)
        client.schedule_upgrade(&admin, &hash2);
    }

    #[test]
    fn test_upgrade_timelock_remaining() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_hash = BytesN::from_array(&env, &[7u8; 32]);

        // Schedule upgrade at time 1000
        env.ledger().set_timestamp(1000);
        client.schedule_upgrade(&admin, &new_hash);

        // Check remaining time at 2000 (1000 seconds elapsed)
        env.ledger().set_timestamp(2000);
        let remaining = client.get_upgrade_timelock_remaining();
        assert_eq!(remaining, 172800 - 1000); // 48 hours - 1000 seconds

        // Check remaining time at 174800 (after timelock)
        env.ledger().set_timestamp(174800);
        let remaining = client.get_upgrade_timelock_remaining();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn test_set_custom_timelock() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_timelock = 86400; // 24 hours

        // Set custom timelock
        client.set_timelock_duration(&admin, &new_timelock);

        // Verify timelock was updated
        let duration = client.get_timelock_duration();
        assert_eq!(duration, new_timelock);
    }

    #[test]
    #[should_panic(expected = "Not an admin")]
    fn test_non_admin_cannot_schedule_upgrade() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup_test(&env);
        
        let non_admin = soroban_sdk::Address::generate(&env);
        let new_hash = BytesN::from_array(&env, &[8u8; 32]);

        // Try to schedule upgrade as non-admin (should fail)
        client.schedule_upgrade(&non_admin, &new_hash);
    }

    #[test]
    #[should_panic(expected = "Upgrade already executed")]
    fn test_cannot_execute_twice() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_test(&env);
        
        let new_hash = BytesN::from_array(&env, &[9u8; 32]);

        // Schedule and execute upgrade
        client.schedule_upgrade(&admin, &new_hash);
        env.ledger().set_timestamp(172801);
        client.execute_upgrade(&admin);

        // Try to execute again (should fail)
        client.execute_upgrade(&admin);
    }
}
