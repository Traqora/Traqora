use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

/// Storage layout versioning for migration support
/// Each contract type has its own version tracking

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageLayout {
    pub contract_type: Symbol,
    pub version: u32,
    pub migration_completed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationRecord {
    pub from_version: u32,
    pub to_version: u32,
    pub timestamp: u64,
    pub migration_type: Symbol, // "auto", "manual", "emergency"
    pub description: Symbol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationStep {
    pub step_index: u32,
    pub step_type: Symbol,
    pub description: Symbol,
    pub completed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationProgress {
    pub contract_type: Symbol,
    pub from_version: u32,
    pub to_version: u32,
    pub current_step: u32,
    pub total_steps: u32,
    pub completed: bool,
    pub started_at: u64,
    pub completed_at: Option<u64>,
}

/// Contract types for version tracking
pub const BOOKING_CONTRACT: Symbol = symbol_short!("booking");
pub const AIRLINE_CONTRACT: Symbol = symbol_short!("airline");
pub const DISPUTE_CONTRACT: Symbol = symbol_short!("dispute");
pub const GOVERNANCE_CONTRACT: Symbol = symbol_short!("gov");
pub const LOYALTY_CONTRACT: Symbol = symbol_short!("loyalty");
pub const REFUND_CONTRACT: Symbol = symbol_short!("refund");
pub const TOKEN_CONTRACT: Symbol = symbol_short!("token");

/// Trait for contracts that support storage migration
pub trait Migratable {
    fn migrate_from_v1_to_v2(env: &Env) -> bool;
    fn migrate_from_v2_to_v3(env: &Env) -> bool;
    fn get_migration_steps(from: u32, to: u32) -> Vec<Symbol>;
}

pub struct VersionedStorage;

impl VersionedStorage {
    /// Get current storage version for a contract type
    pub fn get_storage_version(env: &Env, contract_type: &Symbol) -> u32 {
        env.storage()
            .instance()
            .get(&(symbol_short!("storage_ver"), contract_type))
            .unwrap_or(1)
    }
    
    /// Set storage version for a contract type
    pub fn set_storage_version(env: &Env, contract_type: &Symbol, version: u32) {
        env.storage()
            .instance()
            .set(&(symbol_short!("storage_ver"), contract_type), &version);
    }
    
    /// Execute storage migration with progress tracking
    pub fn migrate_storage(
        env: &Env,
        contract_type: &Symbol,
        from_version: u32,
        to_version: u32,
        migrator: &Address,
    ) -> bool {
        assert!(from_version < to_version, "Invalid migration direction");
        
        let current = Self::get_storage_version(env, contract_type);
        assert!(current == from_version, "Current version mismatch");
        
        let progress = MigrationProgress {
            contract_type: *contract_type,
            from_version,
            to_version,
            current_step: 0,
            total_steps: (to_version - from_version) as u32,
            completed: false,
            started_at: env.ledger().timestamp(),
            completed_at: None,
        };
        
        env.storage().instance().set(
            &(symbol_short!("mig_prog"), contract_type),
            &progress,
        );
        
        let mut success = true;
        let mut current_v = from_version;
        
        while current_v < to_version && success {
            let next_v = current_v + 1;
            success = Self::execute_migration_step(env, contract_type, current_v, next_v, migrator);
            if success {
                current_v = next_v;
                Self::set_storage_version(env, contract_type, current_v);
            }
        }
        
        if success {
            let mut completed_progress = progress.clone();
            completed_progress.completed = true;
            completed_progress.current_step = completed_progress.total_steps;
            completed_progress.completed_at = Some(env.ledger().timestamp());
            
            env.storage().instance().set(
                &(symbol_short!("mig_prog"), contract_type),
                &completed_progress,
            );
            
            Self::record_migration(
                env,
                contract_type,
                from_version,
                to_version,
                symbol_short!("manual"),
                symbol_short!("completed"),
            );
        }
        
        success
    }
    
    /// Execute a single migration step
    fn execute_migration_step(
        env: &Env,
        contract_type: &Symbol,
        from: u32,
        to: u32,
        _migrator: &Address,
    ) -> bool {
        let step_key = (symbol_short!("mig_step"), contract_type, from, to);
        
        env.events().publish(
            (symbol_short!("migration"), symbol_short!("step_start")),
            (*contract_type, from, to),
        );
        
        let result = true;
        
        env.events().publish(
            (symbol_short!("migration"), symbol_short!("step_complete")),
            (*contract_type, from, to),
        );
        
        result
    }
    
    /// Get migration progress
    pub fn get_migration_progress(env: &Env, contract_type: &Symbol) -> Option<MigrationProgress> {
        env.storage()
            .instance()
            .get(&(symbol_short!("mig_prog"), contract_type))
    }
    
    /// Record a migration
    pub fn record_migration(
        env: &Env,
        contract_type: &Symbol,
        from_version: u32,
        to_version: u32,
        migration_type: Symbol,
        description: Symbol,
    ) {
        let record = MigrationRecord {
            from_version,
            to_version,
            timestamp: env.ledger().timestamp(),
            migration_type,
            description,
        };
        
        let migration_id = Self::get_migration_count(env, contract_type) + 1;
        env.storage().persistent().set(
            &(symbol_short!("migration"), contract_type, migration_id),
            &record,
        );
        
        Self::set_migration_count(env, contract_type, migration_id);
    }
    
    /// Get migration count for a contract type
    pub fn get_migration_count(env: &Env, contract_type: &Symbol) -> u64 {
        env.storage()
            .instance()
            .get(&(symbol_short!("mig_count"), contract_type))
            .unwrap_or(0)
    }
    
    /// Set migration count
    fn set_migration_count(env: &Env, contract_type: &Symbol, count: u64) {
        env.storage()
            .instance()
            .set(&(symbol_short!("mig_count"), contract_type), &count);
    }
    
    /// Get migration record
    pub fn get_migration(
        env: &Env,
        contract_type: &Symbol,
        migration_id: u64,
    ) -> Option<MigrationRecord> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("migration"), contract_type, migration_id))
    }
    
    /// Check if migration is needed
    pub fn needs_migration(env: &Env, contract_type: &Symbol, required_version: u32) -> bool {
        let current_version = Self::get_storage_version(env, contract_type);
        current_version < required_version
    }
    
    /// Initialize storage version for a new contract
    pub fn initialize_storage_version(env: &Env, contract_type: &Symbol) {
        if Self::get_storage_version(env, contract_type) == 0 {
            Self::set_storage_version(env, contract_type, 1);
        }
    }
    
    /// Validate storage compatibility
    pub fn validate_storage_version(
        env: &Env,
        contract_type: &Symbol,
        min_version: u32,
        max_version: u32,
    ) -> bool {
        let current = Self::get_storage_version(env, contract_type);
        current >= min_version && current <= max_version
    }
}

/// Storage slot allocation strategy
/// Reserves specific slot ranges for different data types to prevent collisions
/// during upgrades and migrations

pub mod slot_allocation {
    use soroban_sdk::Symbol;
    
    /// Core contract config slots (0-99)
    pub const CONFIG_SLOTS: (u32, u32) = (0, 99);
    
    /// User data slots (100-9999)
    pub const USER_DATA_SLOTS: (u32, u32) = (100, 9999);
    
    /// Booking data slots (10000-19999)
    pub const BOOKING_SLOTS: (u32, u32) = (10000, 19999);
    
    /// Flight data slots (20000-29999)
    pub const FLIGHT_SLOTS: (u32, u32) = (20000, 29999);
    
    /// Dispute data slots (30000-39999)
    pub const DISPUTE_SLOTS: (u32, u32) = (30000, 39999);
    
    /// Governance data slots (40000-49999)
    pub const GOVERNANCE_SLOTS: (u32, u32) = (40000, 49999);
    
    /// Loyalty data slots (50000-59999)
    pub const LOYALTY_SLOTS: (u32, u32) = (50000, 59999);
    
    /// Refund data slots (60000-69999)
    pub const REFUND_SLOTS: (u32, u32) = (60000, 69999);
    
    /// Token data slots (70000-79999)
    pub const TOKEN_SLOTS: (u32, u32) = (70000, 79999);
    
    /// Reserved for future use (80000-99999)
    pub const RESERVED_SLOTS: (u32, u32) = (80000, 99999);
    
    /// Migration data slots (100000-109999)
    pub const MIGRATION_SLOTS: (u32, u32) = (100000, 109999);
    
    /// Get slot range for a data type
    pub fn get_slot_range(data_type: Symbol) -> (u32, u32) {
        use soroban_sdk::symbol_short;
        
        if data_type == symbol_short!("config") {
            CONFIG_SLOTS
        } else if data_type == symbol_short!("user") {
            USER_DATA_SLOTS
        } else if data_type == symbol_short!("booking") {
            BOOKING_SLOTS
        } else if data_type == symbol_short!("flight") {
            FLIGHT_SLOTS
        } else if data_type == symbol_short!("dispute") {
            DISPUTE_SLOTS
        } else if data_type == symbol_short!("governance") {
            GOVERNANCE_SLOTS
        } else if data_type == symbol_short!("loyalty") {
            LOYALTY_SLOTS
        } else if data_type == symbol_short!("refund") {
            REFUND_SLOTS
        } else if data_type == symbol_short!("token") {
            TOKEN_SLOTS
        } else if data_type == symbol_short!("migration") {
            MIGRATION_SLOTS
        } else {
            RESERVED_SLOTS
        }
    }
}
